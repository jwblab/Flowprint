const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

function sign(user) {
  return jwt.sign(
    { userId: user.id, workspaceId: user.workspace_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/register — creates a new workspace + admin user
router.post('/register', async (req, res, next) => {
  try {
    const { workspaceName, email, password } = req.body;
    if (!workspaceName || !email || !password) {
      return res.status(400).json({ error: 'workspaceName, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const workspaceId = uuidv4();
    const userId = uuidv4();
    const hash = await bcrypt.hash(password, 12);

    await db.execute(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
      [workspaceId, workspaceName]
    );
    await db.execute(
      'INSERT INTO users (id, workspace_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [userId, workspaceId, email.toLowerCase().trim(), hash, 'admin']
    );

    const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [userId]);
    res.status(201).json({ token: sign(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await db.queryOne(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({ token: sign(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
