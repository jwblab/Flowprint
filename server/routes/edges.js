const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { logChange } = require('../audit');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// GET /api/edges
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const edges = await db.query(
      'SELECT * FROM edges WHERE workspace_id = $1 ORDER BY created_at',
      [workspaceId]
    );
    res.json(edges);
  } catch (err) { next(err); }
});

// POST /api/edges
router.post('/', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.user;
    const { source_id, target_id, label = '' } = req.body;
    if (!source_id || !target_id) {
      return res.status(400).json({ error: 'source_id and target_id are required' });
    }
    if (source_id === target_id) {
      return res.status(400).json({ error: 'Self-loops not allowed' });
    }

    const [src, tgt] = await Promise.all([
      db.queryOne('SELECT name FROM entities WHERE id = $1 AND workspace_id = $2', [source_id, workspaceId]),
      db.queryOne('SELECT name FROM entities WHERE id = $1 AND workspace_id = $2', [target_id, workspaceId]),
    ]);
    if (!src || !tgt) return res.status(404).json({ error: 'Source or target entity not found' });

    const id = uuidv4();
    try {
      await db.execute(
        'INSERT INTO edges (id, workspace_id, source_id, target_id, label) VALUES ($1, $2, $3, $4, $5)',
        [id, workspaceId, source_id, target_id, label]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Edge already exists' });
      throw e;
    }

    const summary = label
      ? `Edge created: ${src.name} → ${tgt.name} (label: "${label}")`
      : `Edge created: ${src.name} → ${tgt.name}`;
    await logChange({ workspaceId, userId, edgeId: id, kind: 'edge', summary });

    const edge = await db.queryOne('SELECT * FROM edges WHERE id = $1', [id]);
    res.status(201).json(edge);
  } catch (err) { next(err); }
});

// PATCH /api/edges/:id
router.patch('/:id', requireRole('user'), async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.user;
    const { label } = req.body;

    const current = await db.queryOne(
      `SELECT e.*, es.name AS source_name, et.name AS target_name
       FROM edges e
       JOIN entities es ON es.id = e.source_id
       JOIN entities et ON et.id = e.target_id
       WHERE e.id = $1 AND e.workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!current) return res.status(404).json({ error: 'Not found' });

    const result = await db.execute(
      'UPDATE edges SET label = $1 WHERE id = $2 AND workspace_id = $3',
      [label ?? '', req.params.id, workspaceId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    const newLabel = label ?? '';
    const oldLabel = current.label ?? '';
    if (newLabel !== oldLabel) {
      const summary = `Edge label updated: ${current.source_name} → ${current.target_name}: "${oldLabel}" → "${newLabel}"`;
      await logChange({ workspaceId, userId, edgeId: req.params.id, kind: 'edge', summary });
    }

    const edge = await db.queryOne('SELECT * FROM edges WHERE id = $1', [req.params.id]);
    res.json(edge);
  } catch (err) { next(err); }
});

// DELETE /api/edges/:id
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.user;

    const current = await db.queryOne(
      `SELECT e.*, es.name AS source_name, et.name AS target_name
       FROM edges e
       JOIN entities es ON es.id = e.source_id
       JOIN entities et ON et.id = e.target_id
       WHERE e.id = $1 AND e.workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!current) return res.status(404).json({ error: 'Not found' });

    await db.execute(
      'DELETE FROM edges WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );

    // edge_id will be SET NULL by FK on delete — log with null edgeId intentionally
    const summary = `Edge deleted: ${current.source_name} → ${current.target_name}`;
    await logChange({ workspaceId, userId, edgeId: null, kind: 'edge', summary });

    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
