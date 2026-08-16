import axios from 'axios';
import { markets, Market } from '../markets.ts';
import db, { query, get, run } from '../db/mysql-db.ts';
import { adminDb } from '../lib/firebase-admin.ts';
import { generateSingleCandleOHLC } from './candlestickEngine.ts';

export const markets_real = JSON.parse(JSON.stringify(markets));
export const markets_demo = markets_real;

export async function loadMarketSettings() {
  const marketSettings = await query('SELECT * FROM market_settings');
  if (marketSettings && Array.isArray(marketSettings)) {
    for (const row of marketSettings) {
      if (markets_real[row.pair]) {
        markets_real[row.pair].hidden = !!row.hidden;
        if (row.payout !== undefined && row.payout !== null) {
          markets_real[row.pair].payout = row.payout;
        }
      }
      if (markets_demo[row.pair]) {
        markets_demo[row.pair].hidden = !!row.hidden;
        if (row.payout !== undefined && row.payout !== null) {
          markets_demo[row.pair].payout = row.payout;
        }
      }
    }
  }
}

export const history_real: Record<string, Record<string, any[]>> = {};
export const history_demo = history_real;

export const currentCandles_real: Record<string, Record<string, any>> = {};
export const currentCandles_demo = currentCandles_real;

export const TIMEFRAMES = [
  "1 second",
  "5 seconds",
  "10 seconds",
  "15 seconds",
  "30 seconds",
  "1 minute",
  "5 minutes",
  "15 minutes",
  "30 minutes",
  "1 hour",
  "4 hours",
  "1 day"
];

export const timeframeSecondsMap: Record<string, number> = {
  "1 second": 1,
  "5 seconds": 5,
  "10 seconds": 10,
  "15 seconds": 15,
  "30 seconds": 30,
  "1 minute": 60,
  "5 minutes": 300,
  "15 minutes": 900,
  "30 minutes": 1800,
  "1 hour": 3600,
  "4 hours": 14400,
  "1 day": 86400
};

export function saveCandleToDB(pair: string, type: 'real' | 'demo', candle: any) {
  // Backwards compatibility wrapper for the old 5s format
  saveCandleToDB_v2(pair, type, "5 seconds", {
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    openTime: candle.time,
    closeTime: candle.time + 5
  });
}

const lastSqliteWrite = new Map<string, number>();

let insertCandleStmt: any = null;
const candleBuffer: any[] = [];
let isFlushing = false;

// Background task to flush the candle buffer using a high-performance transaction
async function flushCandleBuffer() {
  if (isFlushing || candleBuffer.length === 0) return;
  isFlushing = true;
  
  try {
    if (!insertCandleStmt) {
      insertCandleStmt = db.prepare(`
        INSERT INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(market, type, timeframe, openTime) DO UPDATE SET
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          closeTime = excluded.closeTime
      `);
    }

    const batch = candleBuffer.splice(0, 1000);
    const runTx = db.transaction((rows) => {
      for (const r of rows) {
        insertCandleStmt.run(
          r.pair,
          r.type,
          r.timeframe,
          r.open,
          r.high,
          r.low,
          r.close,
          r.volume,
          r.openTime,
          r.closeTime
        );
      }
    });
    
    runTx(batch);
  } catch (err) {
    console.error('Failed to flush candle buffer:', err);
  } finally {
    isFlushing = false;
    if (candleBuffer.length > 0) {
      setImmediate(flushCandleBuffer);
    }
  }
}

// Background tasks for database flushing and pruning are disabled to maximize performance and prevent blocking.

export function saveCandleToDB_v2(pair: string, type: 'real' | 'demo', timeframe: string, candle: any) {
  try {
    // PERSISTENCE DISABLED as per user request to prevent database blocking/freezing.
    // We only maintain in-memory state now for real-time charting.
    return;
  } catch (err: any) {
    console.error(`Failed to save historical candle to DB for ${pair} (${type}) timeframe ${timeframe}:`, err.message);
  }
}

function resampleCandles(baseCandles: any[], tfSeconds: number): any[] {
  if (baseCandles.length === 0) return [];
  const resampled: any[] = [];
  let currentCandle: any = null;
  let currentBucket = null;
  
  for (const d of baseCandles) {
    const bucketTime = d.openTime - (d.openTime % tfSeconds);
    if (!currentCandle || currentBucket !== bucketTime) {
      if (currentCandle) {
        resampled.push(currentCandle);
      }
      currentBucket = bucketTime;
      currentCandle = {
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
        openTime: bucketTime,
        closeTime: bucketTime + tfSeconds
      };
    } else {
      currentCandle.high = Math.max(currentCandle.high, d.high);
      currentCandle.low = Math.min(currentCandle.low, d.low);
      currentCandle.close = d.close;
      currentCandle.volume += d.volume;
    }
  }
  if (currentCandle) {
    resampled.push(currentCandle);
  }
  return resampled;
}

export function isMarketClosedAt(pair: string, timestampSec: number): boolean {
  const isOTC = pair.includes('(OTC)') || pair.includes('Crypto IDX');
  if (isOTC) {
    return false;
  }

  const isCrypto = pair.includes('/USD') && !(
    pair.startsWith('EUR/') || pair.startsWith('GBP/') || pair.startsWith('AUD/') || 
    pair.startsWith('NZD/') || pair.startsWith('USD/') || pair.startsWith('CAD/') || 
    pair.startsWith('CHF/') || pair.startsWith('JPY/') || pair.startsWith('DKK/') || 
    pair.startsWith('SEK/') || pair.startsWith('NOK/') || pair.startsWith('PLN/') || 
    pair.startsWith('HUF/') || pair.startsWith('CZK/') || pair.startsWith('ILS/') || 
    pair.startsWith('THB/') || pair.startsWith('TRY/') || pair.startsWith('SGD/')
  );

  if (isCrypto) {
    return false;
  }

  const date = new Date(timestampSec * 1000);
  const day = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hours = date.getUTCHours();

  // Weekend closed hours: Friday 21:00 UTC to Sunday 22:00 UTC
  if (day === 6) {
    return true; // Saturday is always closed
  }
  if (day === 5 && hours >= 21) {
    return true; // Friday after 21:00 UTC is closed
  }
  if (day === 0 && hours < 22) {
    return true; // Sunday before 22:00 UTC is closed
  }

  // Specific Stock hours (e.g., Yum Brands): 13:30 to 20:00 UTC Mon-Fri
  if (pair === 'Yum Brands') {
    if (hours < 13 || hours >= 20) {
      return true;
    }
  }

  return false;
}

// Pruning logic is handled in-memory for the current session.
export async function pruneHistoricalCandles() {
  return;
}

export async function initializeCandlesFromDB() {
  console.log('📦 Initializing candle storage in-memory only (continuous flow without gaps)...');
  
  // Load persistent market settings (like hidden/visible states) from DB
  try {
    await loadMarketSettings();
    console.log('✅ Loaded persistent market settings (hidden/visible status) from database.');
  } catch (err: any) {
    console.error('Failed to load market settings on startup:', err.message);
  }
  
  const pairKeys = Object.keys(markets);
  const now = Math.floor(Date.now() / 1000);

  // Fast non-blocking initialization for each pair and type
  for (const pair of pairKeys) {
    for (const type of ['real', 'demo']) {
      await new Promise(resolve => setImmediate(resolve));
      try {
        const basePrice = markets[pair]?.price || 100;
        let volatility = (markets[pair]?.volatility || 0.0002) / basePrice;
        
        // Load active candles and history for standard timeframes instantly
        for (const tf of TIMEFRAMES) {
          const tfSeconds = timeframeSecondsMap[tf];
          const bucketTime = now - (now % tfSeconds);
          
          // Scale volatility down to perfectly match live tick random walk volatility
          const stepVol = volatility * Math.sqrt(tfSeconds) * 0.06;
          const seedCount = 200;
          const seedRows = [];
          let currentPrice = basePrice;
          
          // Generate gap-free contiguous history backwards from basePrice
          // This ensures history ends EXACTLY at basePrice across all timeframes, preventing any price gaps/news candles.
          for (let i = 0; i < seedCount; i++) {
            const time = bucketTime - ((i + 1) * tfSeconds);
            const c = generateSingleCandleOHLC(currentPrice, stepVol);
            
            // Swap open and close to reverse chronological direction
            seedRows.unshift({
              time: time,
              open: c.close,
              high: c.high,
              low: c.low,
              close: currentPrice,
              volume: Math.random() * 50 + 10,
              openTime: time,
              closeTime: time + tfSeconds
            });
            currentPrice = c.close; // Older candle close continues from next older open
          }

          if (type === 'real') {
            if (!history_real[pair]) history_real[pair] = {};
            history_real[pair][tf] = seedRows;
          } else {
            if (!history_demo[pair]) history_demo[pair] = {};
            history_demo[pair][tf] = seedRows;
          }

          // Set current active candle in memory (starts EXACTLY at previous close: basePrice)
          const currentCandles = type === 'real' ? currentCandles_real : currentCandles_demo;
          if (!currentCandles[pair]) currentCandles[pair] = {};
          currentCandles[pair][tf] = {
            open: basePrice,
            high: basePrice,
            low: basePrice,
            close: basePrice,
            volume: 10,
            openTime: bucketTime,
            closeTime: bucketTime + tfSeconds
          };

          if (tf === '5 seconds' && type === 'real') {
            markets_real[pair].price = basePrice;
          } else if (tf === '5 seconds' && type === 'demo') {
            markets_demo[pair].price = basePrice;
          }
        }
      } catch (err: any) {
        console.error(`Error loading candles for ${pair} (${type}):`, err.message);
      }
    }
  }
  console.log('✅ Candle storage initialized successfully without blocking!');
}

export let globalManipulationMode: 'neutral' | 'always_loss' | 'always_win' = 'neutral';
export let systemActive = true;

export const userManipulationCache = new Map<string, 'neutral' | 'loss' | 'win'>();
export const setUserManipulation = (userId: string, mode: 'neutral' | 'loss' | 'win') => {
  if (mode === 'neutral') userManipulationCache.delete(userId);
  else userManipulationCache.set(userId, mode);
};

export async function initializeUserManipulation() {
  try {
    const users = await query('SELECT uid, manipulation_mode FROM users WHERE manipulation_mode != ?', ['neutral']) as any[];
    for (const u of users) {
      setUserManipulation(u.uid.toString(), u.manipulation_mode);
    }
    console.log(`📦 Initialized user manipulation for ${users.length} users`);
  } catch (err) {
    console.error('Failed to initialize user manipulation cache:', err);
  }
}

const firestoreCandleBuffer: any[] = [];
let isFlushingFirestore = false;

// Firestore Persistence for candles (Master Store)
export async function saveCandleToFirestore(pair: string, type: string, timeframe: string, candle: any) {
  // Firestore persistence disabled as per user request.
  return;
}

async function flushFirestoreCandleBuffer() {
  if (isFlushingFirestore || firestoreCandleBuffer.length === 0) return;
  isFlushingFirestore = true;
  
  try {
    const batchList = firestoreCandleBuffer.splice(0, 450);
    const batch = adminDb.batch();
    for (const item of batchList) {
      const { pair, type, timeframe, candle } = item;
      const docId = `${pair}_${type}_${timeframe}_${candle.openTime}`;
      const ref = adminDb.collection('market_candles').doc(docId);
      batch.set(ref, {
        pair,
        type,
        timeframe,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume),
        openTime: Number(candle.openTime),
        closeTime: Number(candle.closeTime),
        updatedAt: Date.now()
      }, { merge: true });
    }
    await batch.commit();
  } catch (e: any) {
    console.error('Failed to commit firestore candle batch:', e.message);
  } finally {
    isFlushingFirestore = false;
    if (firestoreCandleBuffer.length > 0) {
      setTimeout(flushFirestoreCandleBuffer, 100);
    }
  }
}

// setInterval(flushFirestoreCandleBuffer, 5000);

export function setSystemActive(active: boolean) {
  systemActive = active;
}

export function setGlobalManipulationMode(mode: 'neutral' | 'always_loss' | 'always_win') {
  globalManipulationMode = mode;
}

const priceCache: Record<string, { price: number; lastFetched: number; invalid: boolean }> = {};

export function getFMPSymbol(pair: string) {
    if (pair.includes('BTC/USD')) return 'BTCUSD';
    if (pair.includes('ETH/USD')) return 'ETHUSD';
    if (pair.includes('SOL/USD')) return 'SOLUSD';
    if (pair.includes('Crypto IDX')) return 'BTCUSD';
    return pair.replace('/', '').replace(' (OTC)', '').replace(/\s+/g, '');
}

export async function fetchAllRealPrices() {
    // API fetching disabled as per user request to make real markets simulated/erratic like OTC.
    return;
}
