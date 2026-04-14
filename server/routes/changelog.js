const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/changelog?limit=N&offset=N
// Returns the global audit log for the workspace, newest first.
// Each row includes: id, kind, summary, changed_at, user_email,
//   entity_id, entity_name, entity_type (for entity-kind rows),
//   edge_id (for edge-kind rows, null if edge was deleted)
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req.user;
    const limit  = req.query.limit  ? parseInt(req.query.limit)  : 100;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;

    const rows = await db.query(
      `SELECT
         cl.id, cl.kind, cl.summary, cl.changed_at,
         cl.entity_id, cl.edge_id,
         u.email  AS user_email,
         e.name   AS entity_name,
         e.type   AS entity_type
       FROM change_log cl
       LEFT JOIN users    u ON u.id = cl.user_id
       LEFT JOIN entities e ON e.id = cl.entity_id
       WHERE cl.workspace_id = $1
       ORDER BY cl.changed_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    );

    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
