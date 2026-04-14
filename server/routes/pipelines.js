const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// All routes receive req.user = { userId, workspaceId, email, role } from auth middleware

// GET /api/pipelines
// Returns all pipelines with entity_ids and edge_ids arrays for membership lookups
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;

    const [pipelines, entityRows, edgeRows] = await Promise.all([
      db.query(
        'SELECT * FROM pipelines WHERE workspace_id = $1 ORDER BY name',
        [workspaceId]
      ),
      db.query(
        `SELECT pe.pipeline_id, pe.entity_id
         FROM pipeline_entities pe
         JOIN pipelines p ON p.id = pe.pipeline_id
         WHERE p.workspace_id = $1`,
        [workspaceId]
      ),
      db.query(
        `SELECT pe.pipeline_id, pe.edge_id
         FROM pipeline_edges pe
         JOIN pipelines p ON p.id = pe.pipeline_id
         WHERE p.workspace_id = $1`,
        [workspaceId]
      ),
    ]);

    // Build membership maps
    const entityMap = {};
    for (const row of entityRows) {
      if (!entityMap[row.pipeline_id]) entityMap[row.pipeline_id] = [];
      entityMap[row.pipeline_id].push(row.entity_id);
    }
    const edgeMap = {};
    for (const row of edgeRows) {
      if (!edgeMap[row.pipeline_id]) edgeMap[row.pipeline_id] = [];
      edgeMap[row.pipeline_id].push(row.edge_id);
    }

    res.json(pipelines.map(p => ({
      ...deserialize(p),
      entity_ids: entityMap[p.id] ?? [],
      edge_ids:   edgeMap[p.id]   ?? [],
    })));
  } catch (err) { next(err); }
});

// GET /api/pipelines/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const pipeline = await db.queryOne(
      'SELECT * FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Not found' });

    const [entities, edges, children] = await Promise.all([
      db.query(
        `SELECT e.*
         FROM entities e
         JOIN pipeline_entities pe ON pe.entity_id = e.id
         WHERE pe.pipeline_id = $1
         ORDER BY e.name`,
        [req.params.id]
      ),
      db.query(
        `SELECT ed.*
         FROM edges ed
         JOIN pipeline_edges pe ON pe.edge_id = ed.id
         WHERE pe.pipeline_id = $1`,
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM pipelines WHERE parent_pipeline_id = $1 AND workspace_id = $2 ORDER BY name',
        [req.params.id, workspaceId]
      ),
    ]);

    res.json({
      ...deserialize(pipeline),
      entities: entities.map(e => ({ ...e, metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata })),
      edges,
      children: children.map(deserialize),
    });
  } catch (err) { next(err); }
});

// POST /api/pipelines
router.post('/', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const {
      name,
      description        = '',
      status             = 'active',
      business_owner     = '',
      tags               = [],
      last_verified      = null,
      notes              = '',
      parent_pipeline_id = null,
      pos_x              = 0,
      pos_y              = 0,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = uuidv4();
    await db.execute(
      `INSERT INTO pipelines
         (id, workspace_id, name, description, status, business_owner, tags,
          last_verified, notes, parent_pipeline_id, pos_x, pos_y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, workspaceId, name, description, status, business_owner, tags,
       last_verified, notes, parent_pipeline_id, pos_x, pos_y]
    );

    const pipeline = await db.queryOne('SELECT * FROM pipelines WHERE id = $1', [id]);
    res.status(201).json(deserialize(pipeline));
  } catch (err) { next(err); }
});

// PATCH /api/pipelines/:id
router.patch('/:id', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const current = await db.queryOne(
      'SELECT * FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!current) return res.status(404).json({ error: 'Not found' });

    const c = deserialize(current);
    const {
      name, description, status, business_owner, tags,
      last_verified, notes, parent_pipeline_id, pos_x, pos_y,
    } = req.body;

    await db.execute(
      `UPDATE pipelines SET
         name               = $1,
         description        = $2,
         status             = $3,
         business_owner     = $4,
         tags               = $5,
         last_verified      = $6,
         notes              = $7,
         parent_pipeline_id = $8,
         pos_x              = $9,
         pos_y              = $10,
         updated_at         = NOW()
       WHERE id = $11`,
      [
        name               ?? c.name,
        description        ?? c.description,
        status             ?? c.status,
        business_owner     ?? c.business_owner,
        tags               ?? c.tags,
        last_verified      !== undefined ? last_verified      : c.last_verified,
        notes              ?? c.notes,
        parent_pipeline_id !== undefined ? parent_pipeline_id : c.parent_pipeline_id,
        pos_x              ?? c.pos_x,
        pos_y              ?? c.pos_y,
        req.params.id,
      ]
    );

    const updated = await db.queryOne('SELECT * FROM pipelines WHERE id = $1', [req.params.id]);
    res.json(deserialize(updated));
  } catch (err) { next(err); }
});

// DELETE /api/pipelines/:id
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const result = await db.execute(
      'DELETE FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Pipeline membership: entities ────────────────────────────────────────────

// POST /api/pipelines/:id/entities  { entity_id }
router.post('/:id/entities', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const pipeline = await db.queryOne(
      'SELECT id FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    const { entity_id } = req.body;
    if (!entity_id) return res.status(400).json({ error: 'entity_id is required' });

    try {
      await db.execute(
        'INSERT INTO pipeline_entities (pipeline_id, entity_id) VALUES ($1, $2)',
        [req.params.id, entity_id]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Entity already in pipeline' });
      throw e;
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /api/pipelines/:id/entities/:entityId
router.delete('/:id/entities/:entityId', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const pipeline = await db.queryOne(
      'SELECT id FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    await db.execute(
      'DELETE FROM pipeline_entities WHERE pipeline_id = $1 AND entity_id = $2',
      [req.params.id, req.params.entityId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Pipeline membership: edges ───────────────────────────────────────────────

// POST /api/pipelines/:id/edges  { edge_id }
router.post('/:id/edges', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const pipeline = await db.queryOne(
      'SELECT id FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    const { edge_id } = req.body;
    if (!edge_id) return res.status(400).json({ error: 'edge_id is required' });

    try {
      await db.execute(
        'INSERT INTO pipeline_edges (pipeline_id, edge_id) VALUES ($1, $2)',
        [req.params.id, edge_id]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Edge already in pipeline' });
      throw e;
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /api/pipelines/:id/edges/:edgeId
router.delete('/:id/edges/:edgeId', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const pipeline = await db.queryOne(
      'SELECT id FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    await db.execute(
      'DELETE FROM pipeline_edges WHERE pipeline_id = $1 AND edge_id = $2',
      [req.params.id, req.params.edgeId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function deserialize(p) {
  return {
    ...p,
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

module.exports = router;
