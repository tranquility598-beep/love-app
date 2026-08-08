const { roleLevel, hasPermission } = require('../config/adminRoles');

const checkRole = (requiredRole) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Необходима авторизация' });
  if (roleLevel(req.user.role) < roleLevel(requiredRole)) {
    return res.status(403).json({ message: 'Недостаточно прав администратора' });
  }
  next();
};

const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Необходима авторизация' });
  if (!hasPermission(req.user.role, permission)) {
    return res.status(403).json({ message: 'Это действие недоступно для вашего ранга' });
  }
  next();
};

module.exports = {
  checkRole,
  requirePermission,
  isSupport: checkRole('support'),
  isJuniorModerator: checkRole('junior_moderator'),
  isModerator: checkRole('senior_moderator'),
  isAdmin: checkRole('junior_admin'),
  isSeniorAdmin: checkRole('senior_admin'),
  isDeputyDeveloper: checkRole('deputy_developer'),
  isFounder: checkRole('developer'),
  isDeveloper: checkRole('developer')
};
