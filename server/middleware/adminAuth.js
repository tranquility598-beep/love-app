/**
 * Middleware для разграничения доступа администраторов и модераторов.
 * Использует иерархию ролей: support < moderator < admin < founder
 */

const ROLES_ORDER = ['support', 'moderator', 'admin', 'founder'];

/**
 * Возвращает middleware, проверяющий, имеет ли пользователь роль не ниже требуемой
 * @param {string} requiredRole - Требуемая минимальная роль ('support', 'moderator', 'admin', 'founder')
 */
const checkRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Необходима авторизация' });
    }

    const userRoleIndex = ROLES_ORDER.indexOf(req.user.role);
    const requiredRoleIndex = ROLES_ORDER.indexOf(requiredRole);

    // Если у пользователя обычная роль 'user' или 'owner' сервера, они не имеют доступа к админке
    if (userRoleIndex === -1 || userRoleIndex < requiredRoleIndex) {
      return res.status(403).json({ message: 'Доступ запрещен: недостаточно прав администратора' });
    }

    next();
  };
};

module.exports = {
  checkRole,
  isSupport: checkRole('support'),
  isModerator: checkRole('moderator'),
  isAdmin: checkRole('admin'),
  isFounder: checkRole('founder')
};
