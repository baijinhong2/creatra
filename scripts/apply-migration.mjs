import { Pool } from 'pg';
import { readFileSync, readFileSync as readEnv } from 'fs';

// Lightweight .env.local loader (avoid extra dep).
const envText = readFileSync('.env.local', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('usage: node scripts/apply-migration.mjs <sql-file>');
  process.exit(2);
}

const sql = readFileSync(sqlFile, 'utf-8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('OK:', sqlFile);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
