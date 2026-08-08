const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Report = require('../models/Report');
const Case = require('../models/Case');
const { canonicalRole } = require('../config/adminRoles');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';
const apply = process.argv.includes('--apply');
const STATUS_MAP = {
  pending: 'new',
  reviewed: 'in_progress',
  resolved: 'resolved',
  dismissed: 'rejected'
};

async function planRoles() {
  const users = await User.find({ role: { $ne: 'user' } }).select('username role adminTotpEnabled').lean();
  return users.map(user => {
    const canonical = canonicalRole(user.role);
    const nextRole = canonical === 'developer' && user.username.toLowerCase() !== 'goodvexel'
      ? 'senior_admin'
      : canonical;
    return {
      id: String(user._id),
      username: user.username,
      from: user.role,
      to: nextRole,
      twoFactorReady: Boolean(user.adminTotpEnabled),
      changed: user.role !== nextRole
    };
  });
}

async function planReports() {
  const reports = await Report.find({}).lean();
  const migratedIds = new Set((await Case.find({ sourceReport: { $in: reports.map(item => item._id) } })
    .select('sourceReport').lean()).map(item => String(item.sourceReport)));
  return reports.map(report => ({
    id: String(report._id),
    status: report.status,
    alreadyMigrated: migratedIds.has(String(report._id))
  }));
}

async function applyMigration(rolePlan, reportPlan) {
  for (const item of rolePlan) {
    if (item.changed) await User.updateOne({ _id: item.id }, { $set: { role: item.to } });
  }

  const developer = await User.findOne({ username: /^goodvexel$/i });
  if (!developer) throw new Error('Защищённый аккаунт goodvexel не найден');
  await User.updateOne({ _id: developer._id }, { $set: { role: 'developer' } });

  for (const item of reportPlan.filter(entry => !entry.alreadyMigrated)) {
    const report = await Report.findById(item.id).lean();
    if (!report) continue;
    await Case.create({
      kind: 'report',
      reporter: report.reporter,
      subjectUser: report.reportedUser || undefined,
      subjectServer: report.reportedServer || undefined,
      subjectMessage: report.reportedMessage || undefined,
      title: `Жалоба: ${report.reason}`,
      description: report.description,
      status: STATUS_MAP[report.status] || 'new',
      sourceReport: report._id,
      tags: [report.reason, 'legacy-report'],
      activity: [{
        actor: null,
        action: 'migrated_from_report',
        details: { moderatorAction: report.moderatorAction || '' },
        createdAt: report.createdAt || new Date()
      }],
      createdAt: report.createdAt || new Date(),
      updatedAt: new Date()
    });
  }
}

async function run() {
  await mongoose.connect(uri, { autoIndex: false });
  const rolePlan = await planRoles();
  const reportPlan = await planReports();
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    roles: rolePlan,
    reports: {
      total: reportPlan.length,
      pendingMigration: reportPlan.filter(item => !item.alreadyMigrated).length
    }
  };
  console.log(JSON.stringify(summary, null, 2));
  if (apply) {
    await applyMigration(rolePlan, reportPlan);
    console.log('Admin v1 migration applied successfully.');
  }
}

run()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
