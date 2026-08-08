const express = require('express');
const Case = require('../models/Case');
const DevLogPost = require('../models/DevLogPost');
const CommunityVote = require('../models/CommunityVote');
const CommunityComment = require('../models/CommunityComment');
const Announcement = require('../models/Announcement');
const authMiddleware = require('../middleware/auth');
const { requireCanCommunicate } = require('../services/moderationService');
const { publishAdminUpdate } = require('../services/adminRealtime');

const router = express.Router();

router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) publishAdminUpdate('community', { method: req.method });
  });
  next();
});

function pagination(req, max = 50) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(max, Math.max(5, Number.parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function publicCase(item) {
  return {
    _id: item._id,
    number: item.number,
    kind: item.kind,
    title: item.title,
    summary: item.public.summary || item.description.slice(0, 1000),
    status: item.public.status,
    category: item.public.category,
    upVotes: item.public.upVotes,
    downVotes: item.public.downVotes,
    score: item.public.score,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

router.get('/ideas', async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req);
    const filter = { kind: 'idea', 'public.published': true };
    if (req.query.status && req.query.status !== 'all') filter['public.status'] = req.query.status;
    if (req.query.category && req.query.category !== 'all') filter['public.category'] = req.query.category;
    if (req.query.query) {
      const escaped = String(req.query.query).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: new RegExp(escaped, 'i') }, { 'public.summary': new RegExp(escaped, 'i') }];
    }
    const sort = req.query.sort === 'new' ? { createdAt: -1 } : { 'public.score': -1, createdAt: -1 };
    const [items, total] = await Promise.all([
      Case.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Case.countDocuments(filter)
    ]);
    res.json({ ideas: items.map(publicCase), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('[community] ideas:', error);
    res.status(500).json({ message: 'Не удалось загрузить идеи' });
  }
});

router.get('/ideas/top', async (req, res) => {
  const items = await Case.find({ kind: 'idea', 'public.published': true })
    .sort({ 'public.score': -1, createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ ideas: items.map(publicCase) });
});

router.put('/ideas/:id/vote', authMiddleware, requireCanCommunicate, async (req, res) => {
  try {
    const value = Number(req.body.value);
    if (![-1, 1].includes(value)) return res.status(400).json({ message: 'Голос должен быть за или против' });
    const idea = await Case.findOne({ _id: req.params.id, kind: 'idea', 'public.published': true });
    if (!idea) return res.status(404).json({ message: 'Идея не найдена' });
    await CommunityVote.findOneAndUpdate(
      { targetType: 'idea', target: idea._id, user: req.user._id },
      { value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const grouped = await CommunityVote.aggregate([
      { $match: { targetType: 'idea', target: idea._id } },
      { $group: { _id: '$value', count: { $sum: 1 } } }
    ]);
    const upVotes = grouped.find(item => item._id === 1)?.count || 0;
    const downVotes = grouped.find(item => item._id === -1)?.count || 0;
    idea.public.upVotes = upVotes;
    idea.public.downVotes = downVotes;
    idea.public.score = upVotes - downVotes;
    await idea.save();
    res.json({ vote: value, upVotes, downVotes, score: idea.public.score });
  } catch (error) {
    console.error('[community] idea vote:', error);
    res.status(500).json({ message: 'Не удалось сохранить голос' });
  }
});

router.delete('/ideas/:id/vote', authMiddleware, requireCanCommunicate, async (req, res) => {
  await CommunityVote.deleteOne({ targetType: 'idea', target: req.params.id, user: req.user._id });
  const grouped = await CommunityVote.aggregate([
    { $match: { targetType: 'idea', target: new (require('mongoose').Types.ObjectId)(req.params.id) } },
    { $group: { _id: '$value', count: { $sum: 1 } } }
  ]);
  const upVotes = grouped.find(item => item._id === 1)?.count || 0;
  const downVotes = grouped.find(item => item._id === -1)?.count || 0;
  await Case.findByIdAndUpdate(req.params.id, { 'public.upVotes': upVotes, 'public.downVotes': downVotes, 'public.score': upVotes - downVotes });
  res.json({ vote: 0, upVotes, downVotes, score: upVotes - downVotes });
});

router.get('/bugs', async (req, res) => {
  const { page, limit } = pagination(req);
  res.json({ bugs: [], pagination: { page, limit, total: 0, pages: 0 } });
});

router.get('/devlog', async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req);
    const now = new Date();
    await DevLogPost.updateMany(
      { status: 'scheduled', scheduledAt: { $lte: now } },
      { status: 'published', publishedAt: now }
    );
    const filter = { status: 'published', publishedAt: { $lte: now } };
    const [posts, total] = await Promise.all([
      DevLogPost.find(filter)
        .populate('author', 'username nickname avatar role')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit),
      DevLogPost.countDocuments(filter)
    ]);
    res.json({ posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('[community] devlog:', error);
    res.status(500).json({ message: 'Не удалось загрузить Dev Log' });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const announcements = await Announcement.find({ status: 'published' })
      .select('title content type publishedAt')
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();
    res.json({ announcements });
  } catch (error) {
    console.error('[community] announcements:', error);
    res.status(500).json({ message: 'Не удалось загрузить анонсы' });
  }
});

router.put('/devlog/:id/vote', authMiddleware, requireCanCommunicate, async (req, res) => {
  try {
    const value = Number(req.body.value);
    if (![-1, 1].includes(value)) return res.status(400).json({ message: 'Голос должен быть за или против' });
    const post = await DevLogPost.findOne({ _id: req.params.id, status: 'published' });
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    await CommunityVote.findOneAndUpdate(
      { targetType: 'devlog', target: post._id, user: req.user._id },
      { value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const grouped = await CommunityVote.aggregate([
      { $match: { targetType: 'devlog', target: post._id } },
      { $group: { _id: '$value', count: { $sum: 1 } } }
    ]);
    post.upVotes = grouped.find(item => item._id === 1)?.count || 0;
    post.downVotes = grouped.find(item => item._id === -1)?.count || 0;
    await post.save();
    req.app.get('io')?.emit('community:devlog:update', {
      postId: post._id,
      upVotes: post.upVotes,
      downVotes: post.downVotes,
      commentCount: post.commentCount
    });
    res.json({ vote: value, upVotes: post.upVotes, downVotes: post.downVotes });
  } catch (error) {
    console.error('[community] devlog vote:', error);
    res.status(500).json({ message: 'Не удалось сохранить голос' });
  }
});

router.get('/devlog/:id/comments', async (req, res) => {
  const comments = await CommunityComment.find({ post: req.params.id, status: 'active' })
    .populate('author', 'username nickname avatar role')
    .sort({ createdAt: 1 })
    .limit(500);
  res.json({ comments });
});

router.post('/devlog/:id/comments', authMiddleware, requireCanCommunicate, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Комментарий не может быть пустым' });
    const post = await DevLogPost.findOne({ _id: req.params.id, status: 'published' });
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    let parent = null;
    if (req.body.parent) parent = await CommunityComment.findOne({ _id: req.body.parent, post: post._id, status: 'active' });
    const comment = await CommunityComment.create({
      post: post._id,
      author: req.user._id,
      parent: parent?._id || null,
      body: body.slice(0, 2000)
    });
    post.commentCount = await CommunityComment.countDocuments({ post: post._id, status: 'active' });
    await post.save();
    req.app.get('io')?.emit('community:devlog:update', {
      postId: post._id,
      upVotes: post.upVotes,
      downVotes: post.downVotes,
      commentCount: post.commentCount
    });
    await comment.populate('author', 'username nickname avatar role');
    res.status(201).json({ comment });
  } catch (error) {
    console.error('[community] comment:', error);
    res.status(500).json({ message: 'Не удалось добавить комментарий' });
  }
});

module.exports = router;
