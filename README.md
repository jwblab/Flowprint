# Flowprint

An internal documentation tool for mapping and visualising dependencies across a data and automation estate — Power Automate flows, Azure SQL tables, Qlik apps, SharePoint lists, APIs, SAP, and more.

## Features

- **Interactive graph** — drag-and-drop canvas with persistent node positions and on-demand auto-layout
- **Pipelines** — containers representing end-to-end data processes; support recursive nesting and M2M entity/edge membership
- **Graph drill-down** — double-click a pipeline node to filter the canvas to its members
- **10 built-in entity types** — extensible per workspace with custom colours and labels
- **RBAC** — four roles (`read_only`, `user`, `admin`, `superadmin`) with per-user and per-role permission overrides
- **Audit trail** — every create/update/delete is logged to a `change_log` table
- **Reports** — recent changes, schedules, and user-activity views

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Graph canvas | @xyflow/react |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Install

```bash
npm run install:all
```

### Configure

Copy `server/.env.example` to `server/.env` and fill in the values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/flowprint
JWT_SECRET=your-long-random-secret
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Initialise the database

```bash
psql $DATABASE_URL -f server/schema.sql
```

If upgrading an existing database to add the Pipeline feature:

```bash
psql $DATABASE_URL -f server/migrate_pipelines.sql
```

Both scripts are idempotent and safe to re-run.

### Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Project Structure

```
flowprint/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/   # Sidebar, modals, graph panel
│       ├── context/      # Auth + EntityTypes providers
│       └── pages/        # GraphView, ListView, EntityPage, PipelinePage, ...
├── server/          # Express API
│   ├── routes/      # entities, edges, pipelines, auth, admin, changelog
│   ├── middleware/  # JWT auth, role enforcement
│   ├── db.js        # pg.Pool wrapper
│   ├── rbac.js      # permission resolution
│   ├── audit.js     # change_log writer
│   ├── schema.sql   # full DDL (idempotent)
│   └── migrate_pipelines.sql
└── package.json     # root — runs both services via concurrently
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of the schema, routing, RBAC logic, and design decisions.
