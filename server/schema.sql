-- Flowprint PostgreSQL schema
-- Run via: node migrate.js

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT        NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user', 'read_only')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entities (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  metadata      JSONB       NOT NULL DEFAULT '{}',
  pos_x         REAL        NOT NULL DEFAULT 0,
  pos_y         REAL        NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edges (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id     UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id     UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  label         TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, target_id)
);

CREATE TABLE IF NOT EXISTS change_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  entity_id     UUID        REFERENCES entities(id) ON DELETE CASCADE,
  edge_id       UUID        REFERENCES edges(id) ON DELETE SET NULL,
  kind          TEXT        NOT NULL DEFAULT 'entity' CHECK (kind IN ('entity', 'edge')),
  summary       TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fine-grained permission overrides on top of role defaults.
-- subject_type: 'user' | 'role'
-- subject_id:   user UUID  | role name ('superadmin','admin','user','read_only')
-- resource:     e.g. 'report:schedules', 'entities:delete', 'edges:create'
-- granted:      true = explicitly allow, false = explicitly deny
CREATE TABLE IF NOT EXISTS workspace_permissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_type  TEXT        NOT NULL CHECK (subject_type IN ('user', 'role')),
  subject_id    TEXT        NOT NULL,
  resource      TEXT        NOT NULL,
  granted       BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(workspace_id, subject_type, subject_id, resource)
);

CREATE TABLE IF NOT EXISTS entity_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  value         TEXT        NOT NULL,
  label         TEXT        NOT NULL,
  color         TEXT        NOT NULL DEFAULT '#64748b',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, value)
);

-- ── Pipelines ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipelines (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  status             TEXT        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'inactive', 'deprecated')),
  business_owner     TEXT        NOT NULL DEFAULT '',
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  last_verified      DATE,
  notes              TEXT        NOT NULL DEFAULT '',
  parent_pipeline_id UUID        REFERENCES pipelines(id) ON DELETE SET NULL,
  pos_x              REAL        NOT NULL DEFAULT 0,
  pos_y              REAL        NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: a pipeline contains many entities; an entity can belong to many pipelines
CREATE TABLE IF NOT EXISTS pipeline_entities (
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id)  ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES entities(id)   ON DELETE CASCADE,
  PRIMARY KEY (pipeline_id, entity_id)
);

-- Many-to-many: a pipeline contains many edges; an edge can belong to many pipelines
CREATE TABLE IF NOT EXISTS pipeline_edges (
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id)  ON DELETE CASCADE,
  edge_id      UUID NOT NULL REFERENCES edges(id)      ON DELETE CASCADE,
  PRIMARY KEY (pipeline_id, edge_id)
);

-- cross_pipeline flag: marks edges that span across pipeline boundaries
ALTER TABLE edges ADD COLUMN IF NOT EXISTS cross_pipeline BOOLEAN NOT NULL DEFAULT false;

-- Indexes for common workspace-scoped lookups
CREATE INDEX IF NOT EXISTS idx_entities_workspace         ON entities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_edges_workspace            ON edges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_changelog_entity           ON change_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_users_workspace            ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_workspace        ON pipelines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_parent           ON pipelines(parent_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_pipeline ON pipeline_entities(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_entity   ON pipeline_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_edges_pipeline    ON pipeline_edges(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_edges_edge        ON pipeline_edges(edge_id);
