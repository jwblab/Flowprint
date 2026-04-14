const { hasMinRole } = require('../rbac');

/**
 * Returns Express middleware that rejects requests below the minimum role.
 * Usage: router.post('/', requireRole('user'), handler)
 */
module.exports = function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (hasMinRole(req.user.role, minRole)) return next();
    res.status(403).json({ error: 'Insufficient permissions' });
  };
};
