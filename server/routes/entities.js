const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { logChange } = require('../audit');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// All routes receive req.user = { userId, workspaceId, email, role } from auth middleware

// GET /api/entities?limit=N&offset=N
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const limit  = req.query.limit  ? parseInt(req.query.limit)  : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;

    let sql = 'SELECT * FROM entities WHERE workspace_id = $1 ORDER BY name';
    const params = [workspaceId];
    if (limit) { sql += ` LIMIT $2 OFFSET $3`; params.push(limit, offset); }

    const entities = await db.query(sql, params);
    res.json(entities.map(deserialize));
  } catch (err) { next(err); }
});

// GET /api/entities/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const entity = await db.queryOne(
      'SELECT * FROM entities WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!entity) return res.status(404).json({ error: 'Not found' });

    const [outgoing, incoming, changelog] = await Promise.all([
      db.query(`
        SELECT e.*, en.name AS target_name, en.type AS target_type
        FROM edges e JOIN entities en ON en.id = e.target_id
        WHERE e.source_id = $1 AND e.workspace_id = $2
      `, [req.params.id, workspaceId]),
      db.query(`
        SELECT e.*, en.name AS source_name, en.type AS source_type
        FROM edges e JOIN entities en ON en.id = e.source_id
        WHERE e.target_id = $1 AND e.workspace_id = $2
      `, [req.params.id, workspaceId]),
      db.query(
        `SELECT * FROM change_log WHERE entity_id = $1 AND workspace_id = $2 ORDER BY changed_at DESC LIMIT 50`,
        [req.params.id, workspaceId]
      ),
    ]);

    res.json({ ...deserialize(entity), outgoing, incoming, changelog });
  } catch (err) { next(err); }
});

// GET /api/entities/:id/changelog
router.get('/:id/changelog', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const changelog = await db.query(
      `SELECT * FROM change_log WHERE entity_id = $1 AND workspace_id = $2 ORDER BY changed_at DESC`,
      [req.params.id, workspaceId]
    );
    res.json(changelog);
  } catch (err) { next(err); }
});

// POST /api/entities
router.post('/', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.user;
    const { name, type, description = '', metadata = {}, pos_x = 0, pos_y = 0 } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });

    const id = uuidv4();
    await db.execute(
      `INSERT INTO entities (id, workspace_id, name, type, description, metadata, pos_x, pos_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, workspaceId, name, type, description, JSON.stringify(metadata), pos_x, pos_y]
    );
    await logChange({ workspaceId, userId, entityId: id, summary: 'Entity created' });

    const entity = await db.queryOne(
      'SELECT * FROM entities WHERE id = $1',
      [id]
    );
    res.status(201).json(deserialize(entity));
  } catch (err) { next(err); }
});

// PATCH /api/entities/:id
router.patch('/:id', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const current = await db.queryOne(
      'SELECT * FROM entities WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!current) return res.status(404).json({ error: 'Not found' });

    const c = deserialize(current);
    const { userId } = req.user;
    const { name, type, description, metadata, pos_x, pos_y } = req.body;

    const newName        = name        ?? c.name;
    const newType        = type        ?? c.type;
    const newDescription = description ?? c.description;
    const newMetadata    = metadata    ?? c.metadata;
    const newPosX        = pos_x       ?? c.pos_x;
    const newPosY        = pos_y       ?? c.pos_y;

    await db.execute(
      `UPDATE entities SET
         name = $1, type = $2, description = $3, metadata = $4,
         pos_x = $5, pos_y = $6, updated_at = NOW()
       WHERE id = $7`,
      [newName, newType, newDescription, JSON.stringify(newMetadata), newPosX, newPosY, req.params.id]
    );

    const isPosOnly = pos_x != null && name == null && type == null && description == null && metadata == null;
    if (!isPosOnly) {
      const changes = buildChangeSummary(c, { name: newName, type: newType, description: newDescription, metadata: newMetadata });
      if (changes) await logChange({ workspaceId, userId, entityId: req.params.id, summary: changes });
    }

    const updated = await db.queryOne('SELECT * FROM entities WHERE id = $1', [req.params.id]);
    res.json(deserialize(updated));
  } catch (err) { next(err); }
});

// DELETE /api/entities/:id
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const result = await db.execute(
      'DELETE FROM entities WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// --- Helpers ---

function deserialize(e) {
  return {
    ...e,
    metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata,
  };
}

const TRACKED_META_KEYS = [
  'trigger_type', 'environment', 'technical_owner', 'business_owner', 'sap_table',
  'db_schema', 'primary_key', 'is_staging', 'last_verified', 'tags',
];

function buildChangeSummary(old, next) {
  const parts = [];
  if (old.name !== next.name)               parts.push(`Name: "${old.name}" → "${next.name}"`);
  if (old.type !== next.type)               parts.push(`Type: ${old.type} → ${next.type}`);
  if (old.description !== next.description) parts.push('Description updated');
  for (const key of TRACKED_META_KEYS) {
    const ov = JSON.stringify(old.metadata?.[key] ?? null);
    const nv = JSON.stringify(next.metadata?.[key] ?? null);
    if (ov !== nv) parts.push(`${key.replace(/_/g, ' ')}: ${ov} → ${nv}`);
  }
  return parts.length ? parts.join('; ') : null;
}

module.exports = router;
