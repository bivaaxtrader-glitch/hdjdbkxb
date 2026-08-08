import pkg from 'pg';
const { Pool } = pkg;
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import path from 'path';
import logger from '../lib/logger.ts';

const connectionString = process.env.DATABASE_URL;
let pgPool: any = null;
let mysqlPool: mysql.Pool | null = null;
let sqliteDb: any = null;
let isPostgres = false;
let isMysql = false;

if (connectionString && !connectionString.includes('bivaax-bivaax-jxqz7u')) {
  if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    try {
      pgPool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false
        },
        connectionTimeoutMillis: 5000,
      });
      pgPool.on('error', (err: any) => {
        logger?.error?.('Unexpected error on idle pg client', err);
      });
      isPostgres = true;
      console.log('✅ Using Postgres database via DATABASE_URL');
    } catch (err) {
      console.error('Failed to initialize Postgres pool:', err);
    }
  } else if (connectionString.startsWith('mysql://')) {
    try {
      // Handle the complex password with @@@
      // If there are multiple @, the last one is usually the separator for host
      const parts = connectionString.split('@');
      const hostPart = parts.pop();
      const credentialsPart = parts.join('@').replace('mysql://', '');
      const [user, password] = credentialsPart.split(':');
      const [host, portAndDb] = hostPart!.split(':');
      const [port, database] = portAndDb ? portAndDb.split('/') : ['3306', 'mysql'];

      mysqlPool = mysql.createPool({
        host: host,
        port: parseInt(port) || 3306,
        user: user,
        password: password,
        database: database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: {
          rejectUnauthorized: false
        }
      });
      isMysql = true;
      console.log('✅ Using MySQL database via DATABASE_URL');
    } catch (err) {
      console.error('Failed to initialize MySQL pool:', err);
    }
  }
}

if (!isPostgres && !isMysql) {
  const dbPath = path.join(process.cwd(), 'database.sqlite');
  try {
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('synchronous = NORMAL');
    console.log('✅ Using local SQLite database (better-sqlite3) at', dbPath);
  } catch (err) {
    console.error('Failed to initialize SQLite database:', err);
    sqliteDb = new Database(':memory:');
    console.log('⚠️ Using in-memory SQLite database fallback');
  }
}

// Setup schema
let setupSql = `
CREATE TABLE IF NOT EXISTS users (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  nickname TEXT,
  photo_url TEXT,
  password TEXT,
  password_hash TEXT,
  real_balance NUMERIC DEFAULT 0.00,
  demo_balance NUMERIC DEFAULT 10000.00,
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
  affiliate_balance NUMERIC DEFAULT 0.00,
  total_affiliate_earnings NUMERIC DEFAULT 0.00,
  referral_count INTEGER DEFAULT 0,
  custom_affiliate_share INTEGER,
  withdrawal_otp TEXT,
  withdrawal_otp_expires_at BIGINT,
  total_live_volume NUMERIC DEFAULT 0.00,
  smart_mode_enabled INTEGER DEFAULT 0,
  smart_mode_strategy TEXT DEFAULT 'auto_25_percent',
  updated_at BIGINT,
  created_at BIGINT
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
  last_trade_at BIGINT
);

CREATE TABLE IF NOT EXISTS trades (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
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
  expiry_time BIGINT NOT NULL,
  expiration_time TEXT,
  is_demo INTEGER DEFAULT 1,
  account_type TEXT DEFAULT 'demo',
  tournament_id TEXT,
  status TEXT DEFAULT 'open',
  payout_amount NUMERIC,
  payout TEXT,
  settled_at BIGINT,
  updated_at BIGINT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS transactions (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',
  method TEXT DEFAULT 'direct',
  tx_hash TEXT,
  details TEXT,
  order_id TEXT,
  updated_at BIGINT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS login_history (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success',
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS kyc_requests (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  full_name TEXT,
  document_type TEXT,
  document_number TEXT,
  front_image TEXT,
  back_image TEXT,
  selfie_image TEXT,
  rejection_reason TEXT,
  updated_at BIGINT,
  created_at BIGINT
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
  closed_at BIGINT,
  first_response_at BIGINT,
  resolved_at BIGINT,
  updated_at BIGINT,
  created_at BIGINT
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
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS support_canned_responses (
  id TEXT PRIMARY KEY,
  shortcut TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  content TEXT NOT NULL,
  created_by TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'support_agent',
  is_online INTEGER DEFAULT 1,
  max_chats INTEGER DEFAULT 5,
  active_chats_count INTEGER DEFAULT 0,
  last_active_at BIGINT
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
  status TEXT DEFAULT 'active',
  started_at BIGINT
);

CREATE TABLE IF NOT EXISTS master_traders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  win_rate NUMERIC,
  profit NUMERIC,
  followers INTEGER
);

CREATE TABLE IF NOT EXISTS historical_candles (
  id ${isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
  market TEXT NOT NULL,
  type TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  openTime BIGINT NOT NULL,
  closeTime BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS market_type_tf_time_idx ON historical_candles (market, type, timeframe, openTime);
CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades (user_id);
CREATE INDEX IF NOT EXISTS trades_settled_at_idx ON trades (settled_at);
CREATE INDEX IF NOT EXISTS trades_status_idx ON trades (status);
`;

const setup = async () => {
  if (isPostgres) {
    try {
      await pgPool.query(setupSql);
    } catch (err) {
      logger?.error?.('Failed to setup DB schema:', err);
    }
  } else if (isMysql) {
    try {
      // MySQL setup might need different syntax for some types, but basic CREATE TABLE usually works
      await mysqlPool!.execute(setupSql);
    } catch (err) {
      logger?.error?.('Failed to setup MySQL schema:', err);
    }
  } else {
    try {
      sqliteDb.exec(setupSql);
    } catch (err) {
      logger?.error?.('Failed to setup SQLite schema:', err);
      // If it fails because of schema mismatch, we might need to drop and recreate
      if (String(err).includes('column') || String(err).includes('table')) {
         console.warn('Attempting to fix SQLite schema by dropping historical_candles...');
         try { sqliteDb.exec('DROP TABLE IF EXISTS historical_candles;'); sqliteDb.exec(setupSql); } catch (e) {}
      }
    }
  }
};

setup();

function convertSqlParams(sql: string): string {
  if (!isPostgres) return sql;
  let paramCount = 1;
  return sql.replace(/\?/g, () => `$${paramCount++}`);
}

export async function query(sql: string, params: any[] = [], conn?: any) {
  const finalSql = convertSqlParams(sql);
  if (isPostgres) {
    const client = conn || pgPool;
    try {
      const res = await client.query(finalSql, params);
      return res.rows;
    } catch (e) {
      logger?.error?.(`Query error: ${finalSql}`, e);
      throw e;
    }
  } else if (isMysql) {
    try {
      const [rows] = await mysqlPool!.execute(sql, params);
      return rows as any[];
    } catch (e) {
      logger?.error?.(`MySQL Query error: ${sql}`, e);
      throw e;
    }
  } else {
    try {
      if (!sqliteDb || typeof sqliteDb.prepare !== 'function') {
        throw new Error(`SQLite database not initialized or invalid (type: ${typeof sqliteDb})`);
      }
      // Ensure params is an array
      const normalizedParams = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
      const rows = sqliteDb.prepare(sql).all(normalizedParams);
      return rows;
    } catch (e) {
      logger?.error?.(`SQLite Query error: ${sql}`, e);
      throw e;
    }
  }
}

export async function get(sql: string, params: any[] = [], conn?: any) {
  const finalSql = convertSqlParams(sql);
  if (isPostgres) {
    const client = conn || pgPool;
    try {
      const res = await client.query(finalSql, params);
      return res.rows[0] || null;
    } catch (e) {
      logger?.error?.(`Get query error: ${finalSql}`, e);
      throw e;
    }
  } else if (isMysql) {
    try {
      const [rows] = await mysqlPool!.execute(sql, params);
      const results = rows as any[];
      return results[0] || null;
    } catch (e) {
      logger?.error?.(`MySQL Get error: ${sql}`, e);
      throw e;
    }
  } else {
    try {
      if (!sqliteDb || typeof sqliteDb.prepare !== 'function') {
        throw new Error(`SQLite database not initialized or invalid (type: ${typeof sqliteDb})`);
      }
      // Ensure params is an array
      const normalizedParams = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
      const row = sqliteDb.prepare(sql).get(normalizedParams);
      return row || null;
    } catch (e) {
      logger?.error?.(`SQLite Get error: ${sql}`, e);
      throw e;
    }
  }
}

export async function run(sql: string, params: any[] = [], conn?: any) {
  const finalSql = convertSqlParams(sql);
  if (isPostgres) {
    const client = conn || pgPool;
    try {
      const res = await client.query(finalSql, params);
      return { changes: res.rowCount };
    } catch (e) {
      logger?.error?.(`Run query error: ${finalSql}`, e);
      throw e;
    }
  } else if (isMysql) {
    try {
      const [result] = await mysqlPool!.execute(sql, params);
      const info = result as any;
      return { changes: info.affectedRows, lastID: info.insertId };
    } catch (e) {
      logger?.error?.(`MySQL Run error: ${sql}`, e);
      throw e;
    }
  } else {
    try {
      if (!sqliteDb || typeof sqliteDb.prepare !== 'function') {
        throw new Error(`SQLite database not initialized or invalid (type: ${typeof sqliteDb})`);
      }
      // Ensure params is an array
      const normalizedParams = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
      const info = sqliteDb.prepare(sql).run(normalizedParams);
      return { changes: info.changes, lastID: info.lastInsertRowid };
    } catch (e) {
      logger?.error?.(`SQLite Run error: ${sql}`, e);
      throw e;
    }
  }
}

export async function transaction<T>(fn: (connection: any) => Promise<T>): Promise<T> {
  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else if (isMysql) {
    const connection = await mysqlPool!.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } else {
    let result: T;
    const tx = sqliteDb.transaction(async (connection: any) => {
      return await fn(connection);
    });
    // better-sqlite3 transactions are synchronous, but our fn is async
    // This is a bit tricky with better-sqlite3 which expects synchronous functions in .transaction()
    // However, we can just use manual BEGIN/COMMIT if we want async support or use the wrapper.
    // Actually, better-sqlite3's .transaction() only supports synchronous functions.
    // For async, we use manual commands.
    try {
      sqliteDb.prepare('BEGIN').run();
      result = await fn(sqliteDb);
      sqliteDb.prepare('COMMIT').run();
      return result;
    } catch (e) {
      sqliteDb.prepare('ROLLBACK').run();
      throw e;
    }
  }
}

export function checkDbStatus() {
  return {
    isPostgres,
    isMysql,
    isSqlite: !isPostgres && !isMysql,
    initialized: !!(pgPool || mysqlPool || sqliteDb)
  };
}

export { isPostgres, isMysql };
export default isPostgres ? pgPool : (isMysql ? mysqlPool : sqliteDb);


