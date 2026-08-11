import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const trades = db.prepare('SELECT id, status, amount, created_at FROM trades ORDER BY id DESC LIMIT 20').all();
console.log(JSON.stringify(trades, null, 2));
db.close();
