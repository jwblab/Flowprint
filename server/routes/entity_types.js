const express = require('express');
const db = require('../db');
const { hasMinRole } = require('../rbac');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (hasMinRole(req.user.role, 'admin')) return next();
  res.status(403).json({ error: 'Admin access required' });
}

// GET /api/entity-types — all custom types for this workspace
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const rows = await db.query(
      'SELECT * FROM entity_types WHERE workspace_id = $1 ORDER BY label',
      [workspaceId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/entity-types — create a new custom type (admin only)
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const { value, label, color = '#64748b' } = req.body;

    if (!value || !label) {
      return res.status(400).json({ error: 'value and label are required' });
    }
    if (!/^[a-z0-9_]+$/.test(value)) {
      return res.status(400).json({ error: 'value must contain only lowercase letters, numbers, and underscores' });
    }

    const row = await db.queryOne(
      `INSERT INTO entity_types (id, workspace_id, value, label, color)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [workspaceId, value, label, color]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A type with this value already exists' });
    }
    next(err);
  }
});

// DELETE /api/entity-types/:id — remove a custom type (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    await db.execute(
      'DELETE FROM entity_types WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
