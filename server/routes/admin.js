const express = require('express');
const db = require('../db');
const { RESOURCES, ROLE_DEFAULTS, ROLE_ORDER, hasMinRole } = require('../rbac');

const router = express.Router();
// All routes here already require auth (applied in index.js).
// Additional admin-level guard applied per route.

function requireAdmin(req, res, next) {
  if (hasMinRole(req.user.role, 'admin')) return next();
  res.status(403).json({ error: 'Admin access required' });
}

// ── Users ──────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const users = await db.query(
      `SELECT id, email, role, created_at FROM users WHERE workspace_id = $1 ORDER BY created_at`,
      [workspaceId]
    );
    res.json(users);
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId, userId: callerId, role: callerRole } = req.user;
    const { role: newRole } = req.body;

    if (!ROLE_ORDER.includes(newRole)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLE_ORDER.join(', ')}` });
    }

    // Only superadmins can assign the superadmin role
    if (newRole === 'superadmin' && callerRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can assign the superadmin role' });
    }

    // Can't demote yourself
    if (req.params.id === callerId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const target = await db.queryOne(
      'SELECT id, role FROM users WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Admins can't modify superadmins
    if (target.role === 'superadmin' && callerRole !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot modify a superadmin' });
    }

    await db.execute(
      'UPDATE users SET role = $1 WHERE id = $2',
      [newRole, req.params.id]
    );

    const updated = await db.queryOne(
      'SELECT id, email, role, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// ── Resources & defaults (read-only reference data) ───────────────────────

// GET /api/admin/resources
router.get('/resources', requireAdmin, (req, res) => {
  res.json({ resources: RESOURCES, defaults: ROLE_DEFAULTS });
});

// ── Permissions ────────────────────────────────────────────────────────────

// GET /api/admin/permissions?subjectType=role|user&subjectId=...
router.get('/permissions', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const { subjectType, subjectId } = req.query;

    let sql = 'SELECT * FROM workspace_permissions WHERE workspace_id = $1';
    const params = [workspaceId];
    if (subjectType) { sql += ` AND subject_type = $${params.length + 1}`; params.push(subjectType); }
    if (subjectId)   { sql += ` AND subject_id = $${params.length + 1}`;   params.push(subjectId); }
    sql += ' ORDER BY subject_type, subject_id, resource';

    const rows = await db.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/admin/permissions  — upsert a single override
// Body: { subjectType, subjectId, resource, granted }
router.put('/permissions', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const { subjectType, subjectId, resource, granted } = req.body;

    if (!['user', 'role'].includes(subjectType)) {
      return res.status(400).json({ error: 'subjectType must be "user" or "role"' });
    }
    if (typeof granted !== 'boolean') {
      return res.status(400).json({ error: 'granted must be a boolean' });
    }
    if (!RESOURCES.find(r => r.id === resource)) {
      return res.status(400).json({ error: 'Unknown resource' });
    }

    await db.execute(
      `INSERT INTO workspace_permissions (id, workspace_id, subject_type, subject_id, resource, granted)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, subject_type, subject_id, resource)
       DO UPDATE SET granted = EXCLUDED.granted`,
      [workspaceId, subjectType, subjectId, resource, granted]
    );

    const row = await db.queryOne(
      `SELECT * FROM workspace_permissions
       WHERE workspace_id = $1 AND subject_type = $2 AND subject_id = $3 AND resource = $4`,
      [workspaceId, subjectType, subjectId, resource]
    );
    res.json(row);
  } catch (err) { next(err); }
});

// DELETE /api/admin/permissions/:id  — remove override (revert to role default)
router.delete('/permissions/:id', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const result = await db.execute(
      'DELETE FROM workspace_permissions WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
