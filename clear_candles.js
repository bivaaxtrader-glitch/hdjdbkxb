import Database from 'better-sqlite3';

const db = new Database('database.sqlite');
try {
  db.prepare('DELETE FROM candles').run();
  console.log('Successfully cleared candles table.');
} catch (err) {
  console.error('Error clearing candles:', err);
} finally {
  db.close();
}
