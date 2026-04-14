require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// query    → returns all rows as an array
// queryOne → returns the first row or null
// execute  → returns { changes: rowCount }
module.exports = {
  query:    (text, params) => pool.query(text, params).then(r => r.rows),
  queryOne: (text, params) => pool.query(text, params).then(r => r.rows[0] ?? null),
  execute:  (text, params) => pool.query(text, params).then(r => ({ changes: r.rowCount })),
  pool,
};
