require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate(file) {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  await pool.query(sql);
}

const file = process.argv[2] || 'schema.sql';
console.log(`Running ${file}…\n`);
migrate(file)
  .then(() => { console.log('\nDone.'); process.exit(0); })
  .catch(err => { console.error('\nFailed:', err.message); process.exit(1); });
