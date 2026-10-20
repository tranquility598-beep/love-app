const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.FEATURE_PROFILE_PAGES_V1 = '1';
process.env.PROFILE_PAGE_HOST = '127.0.0.1';
process.env.JWT_SECRET = 'profile-views-test-secret-not-production-0001';

// The same Mongoose instance as server/models; no connection is ever opened.
const mongoose = require(require.resolve('mongoose', { paths: [path.join(__dirname, '..')] }));
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const express = require('express');
const cookieParser = require('cookie-parser');
const User = require('../models/User');
const ProfilePage = require('../models/ProfilePage');
const ProfileViewMark = require('../models/ProfileViewMark');
const { ownerTag, isOwnerVisit, rememberOwner } = require('../utils/profileViews');

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const OTHER_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0';
const pageId = new mongoose.Types.ObjectId();
const user = { _id: new mongoose.Types.ObjectId(), username: 'viewcheck', nickname: 'View', plan: 'free', createdAt: new Date('2026-01-01') };

test('recordView writes the mark first and counts only a new visitor', async t => {
  const marks = new Set();
  const pageUpdates = [];
  const realMark = ProfileViewMark.updateOne, realPage = ProfilePage.updateOne;
  t.after(() => { ProfileViewMark.updateOne = realMark; ProfilePage.updateOne = realPage; });
  ProfileViewMark.updateOne = async filter => {
    const id = `${filter.page}|${filter.day}|${filter.key}`;
    if (marks.has(id)) return { upsertedCount: 0, matchedCount: 1 };
    marks.add(id);
    return { upsertedCount: 1, matchedCount: 0 };
  };
  let buckets = [];
  ProfilePage.updateOne = async (filter, update) => {
    pageUpdates.push(update);
    const day = filter['views.daily.day'];
    if (typeof day === 'string') {
      const bucket = buckets.find(entry => entry.day === day);
      if (!bucket) return { matchedCount: 0 };
      bucket.count += 1;
      return { matchedCount: 1 };
    }
    buckets.push({ ...update.$push['views.daily'].$each[0] });
    return { matchedCount: 1 };
  };
  const page = new ProfilePage({ _id: pageId, user: user._id });

  assert.equal(await page.recordView('2026-10-18', 'visitor-a'), true);
  assert.equal(await page.recordView('2026-10-18', 'visitor-a'), false);
  assert.equal(await page.recordView('2026-10-18', 'visitor-b'), true);
  assert.deepEqual(buckets, [{ day: '2026-10-18', count: 2 }]);
  // First visitor creates the day bucket, the second only increments it.
  assert.ok(pageUpdates[1].$push);
  assert.deepEqual(pageUpdates.at(-1), { $inc: { 'views.total': 1, 'views.daily.$.count': 1 } });

  ProfileViewMark.updateOne = async () => { throw Object.assign(new Error('duplicate key'), { code: 11000 }); };
  const before = pageUpdates.length;
  assert.equal(await page.recordView('2026-10-18', 'visitor-c'), false);
  assert.equal(pageUpdates.length, before, 'a lost race must not touch the counter');
});

test('owner tag survives only for the page it was issued for', () => {
  const cookies = {};
  const res = { cookie(name, value, options) { cookies[name] = { value, options }; } };
  rememberOwner({ cookies: {} }, res, pageId);
  assert.equal(cookies.pf_owner.options.httpOnly, true);
  assert.equal(cookies.pf_owner.options.sameSite, 'lax');
  const req = { cookies: { pf_owner: cookies.pf_owner.value } };
  assert.equal(isOwnerVisit(req, pageId), true);
  assert.equal(isOwnerVisit(req, new mongoose.Types.ObjectId()), false);
  assert.equal(isOwnerVisit({ cookies: { pf_owner: 'forged-value' } }, pageId), false);
  // A second owner on the same browser keeps the first tag.
  const other = new mongoose.Types.ObjectId();
  rememberOwner(req, res, other);
  const both = { cookies: { pf_owner: cookies.pf_owner.value } };
  assert.equal(isOwnerVisit(both, pageId), true);
  assert.equal(isOwnerVisit(both, other), true);
});

test('public page counts visitors once, skips the owner and bots', async t => {
  const calls = [];
  const realUser = User.findOne, realPage = ProfilePage.findOne;
  t.after(() => { User.findOne = realUser; ProfilePage.findOne = realPage; });
  const page = new ProfilePage({ _id: pageId, user: user._id, enabled: true, displayName: 'View' });
  page.recordView = async (day, key) => { calls.push({ day, key }); return true; };
  User.findOne = () => ({ collation() { return this; }, select() { return this; }, lean: async () => user });
  ProfilePage.findOne = () => ({ populate() { return this; }, then: (resolve, reject) => Promise.resolve(page).then(resolve, reject) });

  const app = express();
  app.use(cookieParser());
  app.use(require('../middleware/profileHost'));
  app.use(require('../routes/profilePublic'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const open = async (userAgent, cookie) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/u/viewcheck`, {
      headers: { 'User-Agent': userAgent, ...(cookie ? { Cookie: cookie } : {}) }
    });
    assert.equal(response.status, 200);
    await new Promise(resolve => setImmediate(resolve));
  };

  await open(BROWSER, `pf_owner=${ownerTag(pageId)}`);
  assert.equal(calls.length, 0, 'the owner is not a view');
  await open('TelegramBot (like TwitterBot)');
  assert.equal(calls.length, 0, 'link preview crawlers are not views');
  await open(BROWSER);
  await open(BROWSER);
  await open(BROWSER);
  assert.equal(calls.length, 1, 'refreshes reach the database once');
  await open(OTHER_BROWSER);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].key, calls[1].key);
  assert.match(calls[0].day, /^\d{4}-\d{2}-\d{2}$/);
});
