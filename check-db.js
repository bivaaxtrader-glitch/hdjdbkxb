import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';

const resolveHost = (host) => {
  if (!host) return host;
  if (host.includes('/cloudsql/') || host.includes('/app/cloudsql/')) {
    const isAppPath = host.startsWith('/app/cloudsql/');
    const basePath = isAppPath ? '/app/cloudsql' : '/cloudsql';
    try {
      if (fs.existsSync(basePath)) {
        const dirs = fs.readdirSync(basePath);
        if (dirs.length > 0) {
          return path.join(basePath, dirs[0]);
        }
      }
    } catch (e) { }
  }
  return host;
};

const pool = new Pool({
  host: resolveHost(process.env.SQL_HOST),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  connectionTimeoutMillis: 15000,
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", res.rows.map(r => r.table_name));
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}
main();
