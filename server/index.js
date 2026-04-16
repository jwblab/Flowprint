require('dotenv').config();
const express = require('express');
const cors = require('cors');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Public routes
app.use('/api/auth', require('./routes/auth'));

// Protected routes — all require a valid JWT
app.get('/api/workspace', auth, async (req, res, next) => {
  try {
    const db = require('./db');
    const ws = await db.queryOne('SELECT id, name FROM workspaces WHERE id = $1', [req.user.workspaceId]);
    res.json(ws);
  } catch (err) { next(err); }
});

app.use('/api/entities',  auth, require('./routes/entities'));
app.use('/api/edges',     auth, require('./routes/edges'));
app.use('/api/pipelines', auth, require('./routes/pipelines'));
app.use('/api/changelog', auth, require('./routes/changelog'));
app.use('/api/admin',        auth, require('./routes/admin'));
app.use('/api/entity-types', auth, require('./routes/entity_types'));

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Flowprint API running on http://localhost:${PORT}`);
});
