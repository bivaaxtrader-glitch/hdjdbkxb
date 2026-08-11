import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('bivaaxtrader@gmail.com');
console.log(JSON.stringify(user, null, 2));
db.close();
