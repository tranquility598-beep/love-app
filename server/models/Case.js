const mongoose = require('mongoose');
const crypto = require('crypto');

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 255 },
  url: { type: String, required: true },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  private: { type: Boolean, default: true }
}, { _id: true });

const noteSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, maxlength: 4000 },
  internal: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const activitySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const caseSchema = new mongoose.Schema({
  number: { type: String, unique: true, index: true },
  kind: { type: String, enum: ['report', 'bug', 'idea', 'appeal', 'support'], required: true, index: true },
  // Пусто у обращений с формы на сайте: там человек не залогинен, и связь с
  // ним держится в `contact`. У всего, что приходит из приложения, заполнено.
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // Как связаться с автором, у которого нет аккаунта.
  contact: {
    name: { type: String, default: '', maxlength: 120 },
    email: { type: String, default: '', maxlength: 254 },
    source: { type: String, default: '', maxlength: 40 }
  },
  subjectUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  subjectServer: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', default: null },
  subjectMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  moderationAction: { type: mongoose.Schema.Types.ObjectId, ref: 'ModerationAction', index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  status: {
    type: String,
    enum: ['new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'rejected', 'archived'],
    default: 'new',
    index: true
  },
  priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal', index: true },
  prioritySource: { type: String, enum: ['system', 'reporter', 'staff'], default: 'system' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  tags: { type: [String], default: [] },
  attachments: { type: [attachmentSchema], default: [] },
  diagnostics: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
  evidenceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
  notes: { type: [noteSchema], default: [] },
  activity: { type: [activitySchema], default: [] },
  sourceReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
  sourceKey: { type: String },
  public: {
    published: { type: Boolean, default: false, index: true },
    slug: { type: String, default: null },
    status: { type: String, default: 'under_review' },
    summary: { type: String, default: '', maxlength: 1000 },
    category: { type: String, default: 'other' },
    upVotes: { type: Number, default: 0 },
    downVotes: { type: Number, default: 0 },
    score: { type: Number, default: 0, index: true }
  },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });

caseSchema.pre('validate', function(next) {
  if (!this.number) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.number = `LOVE-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }
  next();
});

caseSchema.index({ kind: 1, status: 1, priority: 1, createdAt: -1 });
caseSchema.index({ 'public.published': 1, 'public.score': -1, createdAt: -1 });
caseSchema.index(
  { sourceReport: 1 },
  { unique: true, partialFilterExpression: { sourceReport: { $type: 'objectId' } } }
);
caseSchema.index(
  { sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } }
);
caseSchema.index(
  { moderationAction: 1, kind: 1 },
  { unique: true, partialFilterExpression: { moderationAction: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Case', caseSchema);
