const db = require('./db');

// Role hierarchy — higher index = more access
const ROLE_ORDER = ['read_only', 'user', 'admin', 'superadmin'];

// All controllable resources and their labels (shared with frontend via /api/admin/resources)
const RESOURCES = [
  { id: 'report:schedules',       label: 'Schedules Report',       group: 'Reports' },
  { id: 'report:recent-changes',  label: 'Recent Changes Report',  group: 'Reports' },
  { id: 'report:user-activity',   label: 'User Activity Report',   group: 'Reports' },
  { id: 'entities:create',        label: 'Create Entities',        group: 'Entities' },
  { id: 'entities:edit',          label: 'Edit Entities',          group: 'Entities' },
  { id: 'entities:delete',        label: 'Delete Entities',        group: 'Entities' },
  { id: 'edges:create',           label: 'Create Edges',           group: 'Edges' },
  { id: 'edges:edit',             label: 'Edit Edges',             group: 'Edges' },
  { id: 'edges:delete',           label: 'Delete Edges',           group: 'Edges' },
];

// Default grants per role — workspace_permissions rows can override these
const ROLE_DEFAULTS = {
  superadmin: {
    'report:schedules': true, 'report:recent-changes': true, 'report:user-activity': true,
    'entities:create': true, 'entities:edit': true, 'entities:delete': true,
    'edges:create': true, 'edges:edit': true, 'edges:delete': true,
  },
  admin: {
    'report:schedules': true, 'report:recent-changes': true, 'report:user-activity': true,
    'entities:create': true, 'entities:edit': true, 'entities:delete': true,
    'edges:create': true, 'edges:edit': true, 'edges:delete': true,
  },
  user: {
    'report:schedules': true, 'report:recent-changes': true, 'report:user-activity': false,
    'entities:create': true, 'entities:edit': true, 'entities:delete': false,
    'edges:create': true, 'edges:edit': true, 'edges:delete': false,
  },
  read_only: {
    'report:schedules': true, 'report:recent-changes': true, 'report:user-activity': false,
    'entities:create': false, 'entities:edit': false, 'entities:delete': false,
    'edges:create': false, 'edges:edit': false, 'edges:delete': false,
  },
};

/**
 * Check whether the authenticated user can perform a resource action.
 * Checks user-specific override → role override → role default.
 */
async function can(req, resource) {
  const { userId, workspaceId, role } = req.user;
  if (role === 'superadmin') return true;

  // User-specific override
  const userOverride = await db.queryOne(
    `SELECT granted FROM workspace_permissions
     WHERE workspace_id = $1 AND subject_type = 'user' AND subject_id = $2 AND resource = $3`,
    [workspaceId, userId, resource]
  );
  if (userOverride !== null) return userOverride.granted;

  // Role-level override
  const roleOverride = await db.queryOne(
    `SELECT granted FROM workspace_permissions
     WHERE workspace_id = $1 AND subject_type = 'role' AND subject_id = $2 AND resource = $3`,
    [workspaceId, role, resource]
  );
  if (roleOverride !== null) return roleOverride.granted;

  // Default for this role
  return ROLE_DEFAULTS[role]?.[resource] ?? false;
}

/** Minimum role level check (ignores fine-grained overrides — use for admin-only endpoints). */
function hasMinRole(userRole, minRole) {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}

module.exports = { RESOURCES, ROLE_DEFAULTS, ROLE_ORDER, can, hasMinRole };
