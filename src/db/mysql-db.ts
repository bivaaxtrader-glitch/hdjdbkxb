import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

import logger from '../lib/logger.ts';
import { getSafeDatabase } from './sqlite-factory.ts';

const dataDir = process.env.DATA_DIR || process.cwd();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'database.sqlite');
const db = getSafeDatabase(dbPath);
export { db };

// Enable WAL mode for better concurrency and to prevent database corruption
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -2000'); // 2MB cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 30000000000'); // Maximize memory mapping for faster reads

// Ensure tables exist
db.exec(`
CREATE TABLE IF NOT EXISTS market_settings (
  pair TEXT PRIMARY KEY,
  hidden INTEGER DEFAULT 0,
  payout INTEGER DEFAULT NULL
);
`);

try {
  db.exec("ALTER TABLE market_settings ADD COLUMN payout INTEGER DEFAULT NULL");
} catch (e) {
  // column already exists
}

// Ensure tables exist
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  nickname TEXT,
  photo_url TEXT,
  password_hash TEXT,
  real_balance NUMERIC DEFAULT '0.00',
  demo_balance NUMERIC DEFAULT '10000.00',
  currency TEXT DEFAULT 'USD',
  tfa_enabled INTEGER DEFAULT 0,
  tfa_mode TEXT DEFAULT 'app',
  tfa_secret TEXT,
  is_verified INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  phone TEXT,
  country TEXT,
  country_code TEXT,
  first_name TEXT,
  last_name TEXT,
  gender TEXT,
  dob TEXT,
  status TEXT DEFAULT 'Standard',
  kyc_status TEXT DEFAULT 'unverified',
  referred_by_uid TEXT,
  referral_code TEXT,
  referral_sub_id TEXT,
  referral_type TEXT,
  affiliate_balance NUMERIC DEFAULT '0.00',
  total_affiliate_earnings NUMERIC DEFAULT '0.00',
  referral_count INTEGER DEFAULT 0,
  custom_affiliate_share INTEGER,
  withdrawal_otp TEXT,
  withdrawal_otp_expires_at INTEGER,
  total_live_volume NUMERIC DEFAULT '0.00',
  updated_at INTEGER,
  created_at INTEGER
);`);

// Add missing columns if they don't exist
try { db.exec("ALTER TABLE users ADD COLUMN first_name TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_name TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN gender TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN dob TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN smart_mode_enabled INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN smart_mode_strategy TEXT DEFAULT 'auto_25_percent';"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN manipulation_mode TEXT DEFAULT 'neutral';"); } catch (e) {}

db.exec(`
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  banner_url TEXT,
  prize_pool NUMERIC DEFAULT 0,
  entry_fee NUMERIC DEFAULT 0,
  min_players INTEGER DEFAULT 1,
  max_players INTEGER DEFAULT 0,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  status TEXT DEFAULT 'scheduled',
  is_locked INTEGER DEFAULT 0,
  requirements TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score NUMERIC DEFAULT 0,
  rank INTEGER,
  joined_at INTEGER,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL,
  rank_from INTEGER NOT NULL,
  rank_to INTEGER NOT NULL,
  prize_amount NUMERIC NOT NULL,
  prize_type TEXT DEFAULT 'fixed'
);

CREATE TABLE IF NOT EXISTS leaderboard_stats (
  user_id TEXT PRIMARY KEY,
  total_profit NUMERIC DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  won_trades INTEGER DEFAULT 0,
  lost_trades INTEGER DEFAULT 0,
  draw_trades INTEGER DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  roi NUMERIC DEFAULT 0,
  last_trade_at INTEGER
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_id TEXT,
  user_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  asset TEXT,
  amount NUMERIC NOT NULL,
  direction TEXT NOT NULL,
  type TEXT,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  duration INTEGER NOT NULL,
  time_left INTEGER,
  expiry_time INTEGER NOT NULL,
  expiration_time TEXT,
  is_demo INTEGER DEFAULT 1,
  account_type TEXT DEFAULT 'demo',
  tournament_id TEXT,
  status TEXT DEFAULT 'open',
  payout_amount NUMERIC,
  payout TEXT,
  settled_at INTEGER,
  updated_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',
  method TEXT DEFAULT 'direct',
  tx_hash TEXT,
  details TEXT,
  updated_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS kyc_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  full_name TEXT,
  document_type TEXT,
  document_number TEXT,
  front_image TEXT,
  back_image TEXT,
  selfie_image TEXT,
  rejection_reason TEXT,
  updated_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  message TEXT NOT NULL,
  last_message TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,
  assigned_agent_email TEXT,
  channel TEXT DEFAULT 'chat',
  rating INTEGER,
  rating_feedback TEXT,
  is_ai_handled INTEGER DEFAULT 1,
  closed_at INTEGER,
  first_response_at INTEGER,
  resolved_at INTEGER,
  updated_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sender_type TEXT DEFAULT 'user',
  sender_name TEXT,
  message TEXT NOT NULL,
  attachments TEXT,
  is_internal_note INTEGER DEFAULT 0,
  is_read INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS support_canned_responses (
  id TEXT PRIMARY KEY,
  shortcut TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  content TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'support_agent',
  is_online INTEGER DEFAULT 1,
  max_chats INTEGER DEFAULT 5,
  active_chats_count INTEGER DEFAULT 0,
  last_active_at INTEGER
);
CREATE TABLE IF NOT EXISTS active_copies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  master_id TEXT NOT NULL,
  master_name TEXT,
  country TEXT,
  amount NUMERIC,
  max_trade_amount NUMERIC DEFAULT 10,
  trades_limit INTEGER,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  current_profit NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  copied_trades INTEGER DEFAULT 0,
  status TEXT DEFAULT "active",
  started_at INTEGER
);

CREATE TABLE IF NOT EXISTS master_traders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  win_rate NUMERIC,
  profit NUMERIC,
  followers INTEGER
);

CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair TEXT NOT NULL,
  type TEXT NOT NULL,
  time INTEGER NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS pair_type_time_idx ON candles (pair, type, time);
CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades (user_id);
CREATE INDEX IF NOT EXISTS trades_settled_at_idx ON trades (settled_at);
CREATE INDEX IF NOT EXISTS trades_status_idx ON trades (status);
CREATE INDEX IF NOT EXISTS active_copies_user_id_idx ON active_copies (user_id);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS login_history_user_id_idx ON login_history (user_id);
CREATE TABLE IF NOT EXISTS historical_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL,
  type TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  openTime INTEGER NOT NULL,
  closeTime INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS historical_candles_unique_idx ON historical_candles (market, type, timeframe, openTime);
CREATE INDEX IF NOT EXISTS historical_candles_lookup_idx ON historical_candles (market, type, timeframe, openTime DESC);
`);

// Force promote admins on startup
try {
  db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run('hasan1@gmail.com');
  db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run('hasan@gmail.com');
  logger.info("Successfully forced admin promotion on startup");
} catch (e: any) {
  logger.error("Admin promotion query failed on startup: " + e.message);
}

// Auto-migrate missing columns for support system
const addColIfMissing = (table: string, colDef: string) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  } catch (e) {
    // Column likely exists
  }
};

const addIndexIfMissing = (name: string, table: string, cols: string) => {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`);
  } catch (e) {}
};

addIndexIfMissing('trades_user_id_idx', 'trades', 'user_id');
addColIfMissing('tickets', 'user_name TEXT');
addColIfMissing('tickets', 'user_email TEXT');
addColIfMissing('tickets', "category TEXT DEFAULT 'General'");
addColIfMissing('tickets', 'assigned_agent_id TEXT');
addColIfMissing('tickets', 'assigned_agent_name TEXT');
addColIfMissing('tickets', 'assigned_agent_email TEXT');
addColIfMissing('tickets', "channel TEXT DEFAULT 'chat'");
addColIfMissing('tickets', 'rating INTEGER');
addColIfMissing('tickets', 'rating_feedback TEXT');
addColIfMissing('tickets', 'is_ai_handled INTEGER DEFAULT 1');
addColIfMissing('tickets', 'closed_at INTEGER');
addColIfMissing('tickets', 'first_response_at INTEGER');
addColIfMissing('tickets', 'resolved_at INTEGER');
addColIfMissing('users', 'nickname TEXT');
addColIfMissing('users', 'password_hash TEXT');
addColIfMissing('users', 'country_code TEXT');
addColIfMissing('users', 'referral_sub_id TEXT');
addColIfMissing('users', 'referral_type TEXT');
addColIfMissing('transactions', 'order_id TEXT');

addColIfMissing('ticket_messages', "sender_type TEXT DEFAULT 'user'");
addColIfMissing('ticket_messages', 'sender_name TEXT');
addColIfMissing('ticket_messages', 'attachments TEXT');
addColIfMissing('ticket_messages', 'is_internal_note INTEGER DEFAULT 0');
addColIfMissing('ticket_messages', 'is_read INTEGER DEFAULT 0');

// Helper to convert '?' placeholders (SQLite uses '?' so no change needed)
// However, we might need to handle some MySQL specific syntax if it exists.

const statementCache = new Map<string, any>();

class Mutex {
  private mutex = Promise.resolve();
  lock(): Promise<() => void> {
    let begin: (unlock: () => void) => void;
    this.mutex = this.mutex.then(() => new Promise(begin));
    return new Promise(res => {
      begin = (unlock: () => void) => res(unlock);
    });
  }
}

const dbMutex = new Mutex();

export async function query(sql: string, params: any[] = [], conn?: any) {
  let statement = statementCache.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    statementCache.set(sql, statement);
  }
  return statement.all(...params);
}

export async function get(sql: string, params: any[] = [], conn?: any) {
  let statement = statementCache.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    statementCache.set(sql, statement);
  }
  return statement.get(...params);
}

export async function run(sql: string, params: any[] = [], conn?: any) {
  let statement = statementCache.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    statementCache.set(sql, statement);
  }
  return statement.run(...params);
}

export async function transaction<T>(fn: (connection: any) => Promise<T>): Promise<T> {
  const unlock = await dbMutex.lock();
  const isNested = db.inTransaction;
  if (!isNested) db.prepare('BEGIN').run();
  try {
    const result = await fn(db);
    if (!isNested) db.prepare('COMMIT').run();
    return result;
  } catch (err) {
    if (!isNested) db.prepare('ROLLBACK').run();
    throw err;
  } finally {
    unlock();
  }
}

export default db;
