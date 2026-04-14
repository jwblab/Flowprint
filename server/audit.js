const { v4: uuidv4 } = require('uuid');
const db = require('./db');

/**
 * Write a row to change_log.
 * @param {object} opts
 * @param {string}      opts.workspaceId
 * @param {string|null} opts.userId      - from req.user.userId (may be null for legacy rows)
 * @param {string|null} [opts.entityId]  - set for entity-kind logs
 * @param {string|null} [opts.edgeId]    - set for edge-kind logs (nulled by DB on edge delete)
 * @param {'entity'|'edge'} [opts.kind]
 * @param {string}      opts.summary
 */
async function logChange({ workspaceId, userId, entityId = null, edgeId = null, kind = 'entity', summary }) {
  await db.execute(
    `INSERT INTO change_log (id, workspace_id, user_id, entity_id, edge_id, kind, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv4(), workspaceId, userId ?? null, entityId, edgeId, kind, summary]
  );
}

module.exports = { logChange };
