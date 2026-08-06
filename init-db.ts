import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';

dotenv.config();

async function initDb() {
  const connection = await mysql.createConnection({
    host: process.env.SQL_HOST || 'localhost',
    user: process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'root',
    password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME || 'bivaax_trade',
    multipleStatements: true
  });

  console.log('Connected to MySQL. Initializing tables...');

  try {
    const migrationSql = readFileSync(path.join(process.cwd(), 'migration.sql'), 'utf8');
    await connection.query(migrationSql);
    console.log('Database tables created successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  } finally {
    await connection.end();
  }
}

initDb();

