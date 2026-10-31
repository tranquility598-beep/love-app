/** Модели, которые затрагивает удаление аккаунта (services/userPurge.js). */
const User = require('../models/User');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const DirectMessage = require('../models/DirectMessage');
const Server = require('../models/Server');
const Notification = require('../models/Notification');
const LoginLog = require('../models/LoginLog');
const AdminSession = require('../models/AdminSession');
const AdminAuthChallenge = require('../models/AdminAuthChallenge');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const CommunityVote = require('../models/CommunityVote');
const ProfilePage = require('../models/ProfilePage');
const RiskSignal = require('../models/RiskSignal');
const PushToken = require('../models/PushToken');
const Case = require('../models/Case');
const ModerationAction = require('../models/ModerationAction');

module.exports = {
  User, Message, Channel, DirectMessage, Server, Notification, LoginLog, AdminSession,
  AdminAuthChallenge, AnalyticsEvent, CommunityVote, ProfilePage, RiskSignal, PushToken,
  // Остаются после удаления, но их файлы трогать нельзя (services/userFiles.js).
  Case, ModerationAction
};
