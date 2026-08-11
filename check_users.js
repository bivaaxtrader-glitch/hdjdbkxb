import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const users = db.prepare('SELECT uid, email, real_balance, demo_balance FROM users').all();
console.log(JSON.stringify(users, null, 2));
db.close();
