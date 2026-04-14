# Flowprint — Architecture Summary

Flowprint is an internal documentation tool for mapping and visualising dependencies across a data/automation estate (Power Automate flows, SQL tables, Qlik apps, SharePoint lists, APIs, SAP, and more).

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (port 5173) |
| Graph canvas | @xyflow/react (React Flow) |
| Routing | react-router-dom |
| Backend | Node.js + Express (port 3001) |
| Database | PostgreSQL (via `pg` pool) |
| Auth | JWT (HTTP-only, middleware-enforced) |
| Dev runner | `concurrently` (`npm run dev` at root) |

---

## Backend

**`server/index.js`** — Express entry point. All routes under `/api/*` require a valid JWT except `/api/auth`.

| Route | Purpose |
|---|---|
| `POST /api/auth/login` | Issue JWT |
| `/api/entities` | CRUD for documented assets |
| `/api/edges` | CRUD for directed dependency links |
| `/api/pipelines` | CRUD for pipeline containers; includes `entity_ids` and `edge_ids` membership arrays |
| `/api/changelog` | Read-only audit feed |
| `/api/entity-types` | Workspace-defined type overrides |
| `/api/admin` | User/permission management |

**`server/db.js`** — thin wrapper around `pg.Pool` exposing `query`, `queryOne`, and `execute` (returns `{changes: rowCount}`).

**`server/rbac.js`** — role-based access control with four roles (`read_only`, `user`, `admin`, `superadmin`). Permissions are resolved in priority order: user-specific override → role override → role default. Fine-grained resources cover entity/edge CRUD and report access.

**`server/audit.js`** — writes every create/update/delete to a `change_log` table (workspace-scoped, user-attributed).

**`server/schema.sql`** — full DDL (`CREATE IF NOT EXISTS` + `ALTER IF NOT EXISTS`; idempotent).

**`server/migrate_pipelines.sql`** — additive-only migration for the Pipeline feature; safe to re-run against an existing database.

---

## Database Schema (key tables)

- **`entities`** — id, name, type, description, metadata (JSONB), pos_x/pos_y, timestamps, workspace_id
- **`edges`** — id, source_id, target_id, label, workspace_id, cross_pipeline (bool); CASCADE deletes on entity removal
- **`pipelines`** — id, workspace_id, name, description, status (`active`|`inactive`|`deprecated`), business_owner, tags (TEXT[]), last_verified, notes, parent_pipeline_id (self-FK for nesting), pos_x/pos_y
- **`pipeline_entities`** — pipeline_id, entity_id (M2M junction; no FK constraint on `entities`)
- **`pipeline_edges`** — pipeline_id, edge_id (M2M junction; no FK constraint on `edges`)
- **`change_log`** — id, workspace_id, user_id, entity_id, edge_id, kind, summary, created_at
- **`workspace_permissions`** — subject_type (user/role), subject_id, resource, granted

---

## Frontend

**Routing (`App.jsx`)** — `AuthProvider` + `EntityTypesProvider` wrap the whole app. Both entities and pipelines are loaded at the root and passed down as props. All routes except `/login` are `ProtectedRoute`-guarded.

| Route | View | Description |
|---|---|---|
| `/graph` | `GraphView` | Interactive React Flow canvas; node positions persist on drag; pipeline nodes rendered in amber with drill-down mode |
| `/list` | `ListView` | Tabular browse with filtering |
| `/entity/:id` | `EntityPage` | Wiki-style detail page with incoming/outgoing dependency lists and pipeline membership editing |
| `/pipeline/:id` | `PipelinePage` | Pipeline detail page: metadata, status, sub-pipelines, member entities, member edges |
| `/reports` | `ReportView` | Schedules, recent changes, user-activity reports |
| `/print/:id` | `PrintView` | Print-optimised entity sheet (outside app shell) |
| `/admin` | `AdminPage` | User and permission management |

**`client/src/api.js`** — centralised fetch wrapper; attaches JWT from `AuthContext` to every request; includes all pipeline endpoints.

**`client/src/context/EntityTypesContext.jsx`** — merges built-in and workspace-custom type colours/labels.

---

## Key Components

| Component | Purpose |
|---|---|
| `Sidebar.jsx` | Pipelines section (top, collapsible with status badge) + Entities section (below, collapsible) |
| `PipelineModal.jsx` | Create/edit pipeline: name, description, status, business_owner, tags, last_verified, notes, parent pipeline |
| `EntityModal.jsx` | Create/edit entity; includes optional multi-select pipeline membership chips |
| `EdgeModal.jsx` | Create/edit edge; includes optional multi-select pipeline membership chips |

---

## Entity Types

Ten built-in types (extensible per workspace): API/Service, Custom, Data Source, Power App, Power Automate Flow, Qlik App, SAP, SharePoint List, SQL Stored Procedure, Azure SQL Table.

Each entity carries rich metadata: environment, trigger type, recurrence schedule, source systems, timezone, and freeform description.

---

## Pipeline Feature

Pipelines are containers that sit above entities and edges, representing end-to-end data processes.

- **Recursive nesting** — `parent_pipeline_id` self-FK allows pipelines to contain sub-pipelines; children are shown on `PipelinePage`.
- **M2M membership** — the same entity or edge can belong to multiple pipelines via junction tables.
- **Graph integration** — pipeline nodes appear on the canvas with an amber background and ▶ icon. Double-clicking drills into that pipeline; right-click context menu offers *Open* / *Explore*.
- **Drill-down mode** — filters the canvas to only entities in the selected pipeline; a banner shows a "← All" back button and an "Open" link to `PipelinePage`.
- **`GET /api/pipelines`** — response includes `entity_ids` and `edge_ids` arrays per pipeline for client-side membership checks.

---

## Key Design Decisions

- **No build-time native modules** — `pg` (pure JS) used in place of `better-sqlite3` to avoid native binary compilation issues on machines without Python/build tools.
- **Workspace isolation** — all DB queries are scoped to `workspace_id`; RBAC permissions are per-workspace.
- **Audit trail** — every mutation is logged automatically via `server/audit.js`.
- **Graph layout** — node positions are user-controlled and persisted to the DB; auto-layout (dagre) is available on demand.
- **Idempotent migrations** — `schema.sql` uses `IF NOT EXISTS` guards; `migrate_pipelines.sql` is additive-only and safe to re-run.
