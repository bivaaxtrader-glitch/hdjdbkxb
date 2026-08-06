import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);
const sql = fs.readFileSync('./drizzle/0000_keen_hiroim.sql', 'utf8');
db.exec(sql);
console.log('Migration applied');
