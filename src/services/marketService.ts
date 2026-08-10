import axios from 'axios';
import { markets, Market } from '../markets.ts';
import db, { query, get, run } from '../db/mysql-db.ts';
import { adminDb } from '../lib/firebase-admin.ts';
import { generateSingleCandleOHLC } from './candlestickEngine.ts';

export const markets_real = JSON.parse(JSON.stringify(markets));
export const markets_demo = markets_real;

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

export function saveCandleToDB_v2(pair: string, type: 'real' | 'demo', timeframe: string, candle: any) {
  try {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const isCompleted = candle.closeTime <= nowSec;
    const cacheKey = `${pair}_${type}_${timeframe}`;
    const lastWrite = lastSqliteWrite.get(cacheKey) || 0;

    // ONLY save to SQLite periodically (every 5 seconds) to reduce CPU load, or if the candle just completed
    if (nowMs - lastWrite >= 5000 || isCompleted) {
      lastSqliteWrite.set(cacheKey, nowMs);
      db.prepare(`
        INSERT INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(market, type, timeframe, openTime) DO UPDATE SET
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          closeTime = excluded.closeTime
      `).run(
        pair,
        type,
        timeframe,
        Number(candle.open).toFixed(6),
        Number(candle.high).toFixed(6),
        Number(candle.low).toFixed(6),
        Number(candle.close).toFixed(6),
        Number(candle.volume).toFixed(2),
        candle.openTime,
        candle.closeTime
      );
    }

    // Save only COMPLETED candles (1m+) to Firestore to significantly reduce write quota usage.
    // Forming candles (those currently active) are kept in SQLite and memory only.
    const isMajorTimeframe = ["1 minute", "5 minutes", "15 minutes", "30 minutes", "1 hour", "4 hours", "1 day"].includes(timeframe);

    if (isMajorTimeframe && isCompleted) {
      saveCandleToFirestore(pair, type, timeframe, candle);
    }
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

export function pruneHistoricalCandles() {
  console.log('🧹 Running automated historical candles pruning...');
  try {
    const pairKeys = Object.keys(markets);
    let totalDeleted = 0;

    for (const pair of pairKeys) {
      for (const type of ['real', 'demo']) {
        for (const tf of TIMEFRAMES) {
          const limit = 1000;
          
          // Use a fast check to see if we exceed the limit
          const countResult = db.prepare('SELECT COUNT(*) as count FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ?').get(pair, type, tf) as any;
          const count = countResult ? countResult.count : 0;
          
          if (count > limit) {
            // Find the cutoff openTime of the 1000th latest candle
            const cutoffRow = db.prepare(`
              SELECT openTime FROM historical_candles 
              WHERE market = ? AND type = ? AND timeframe = ?
              ORDER BY openTime DESC
              LIMIT 1 OFFSET ?
            `).get(pair, type, tf, limit - 1) as any;
            
            if (cutoffRow) {
              const cutoff = cutoffRow.openTime;
              const result = db.prepare(`
                DELETE FROM historical_candles 
                WHERE market = ? AND type = ? AND timeframe = ? AND openTime < ?
              `).run(pair, type, tf, cutoff);
              
              totalDeleted += result.changes;
            }
          }
        }
      }
    }
    
    if (totalDeleted > 0) {
      console.log(`🧹 Automated pruning complete: Deleted ${totalDeleted} obsolete historical candles.`);
      // VACUUM removed from here as it locks the database for too long and causes 499 errors.
      // It is now run once daily in backupDatabase() instead.
    } else {
      console.log('🧹 Automated pruning complete: No obsolete candles found.');
    }
  } catch (err: any) {
    console.error('❌ Failed to prune historical candles:', err.message);
  }
}

export async function initializeCandlesFromDB() {
  console.log('📦 Initializing candle storage from database...');
  
  // 1. Create the new historical_candles table and unique index if they don't exist
  db.prepare(`
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
    )
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_candles_market_type_tf_opentime 
    ON historical_candles (market, type, timeframe, openTime)
  `).run();

  // Run initial pruning to keep database extremely compact and fast right from startup
  try {
    pruneHistoricalCandles();
  } catch (pruneErr: any) {
    console.error('Error during startup candle pruning:', pruneErr.message);
  }

  const pairKeys = Object.keys(markets);
  
  // 2. Migration, initial seeding, and gap filling
  for (const pair of pairKeys) {
    // Yield every pair to prevent long blocking
    await new Promise(resolve => setImmediate(resolve));
    for (const type of ['real']) {
      try {
        // A. Copy old 5s data from the candles table if historical_candles is empty for 5s
        const tf5sCountResult = db.prepare('SELECT COUNT(*) as count FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ?').get(pair, type, '5 seconds') as any;
        const tf5sCount = tf5sCountResult ? tf5sCountResult.count : 0;
        
        if (tf5sCount === 0) {
          // Check if old candles exist
          let oldCandles: any[] = [];
          try {
            oldCandles = db.prepare('SELECT * FROM candles WHERE pair = ? AND type = ? ORDER BY time ASC').all(pair, type) as any[];
          } catch (e) {
            // candles table might not exist or be empty
          }

          if (oldCandles.length > 0) {
            console.log(`📦 Migrating ${oldCandles.length} old 5-second candles to historical_candles for ${pair} (${type})`);
            const insertStmt = db.prepare(`
              INSERT OR IGNORE INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const runTx = db.transaction((rows) => {
              for (const r of rows) {
                insertStmt.run(
                  r.pair,
                  r.type,
                  '5 seconds',
                  r.open,
                  r.high,
                  r.low,
                  r.close,
                  r.volume,
                  r.time,
                  r.time + 5
                );
              }
            });
            runTx(oldCandles);
          } else {
            // Seed brand new initial 5s candles (200 candles to provide background efficiently)
            const basePrice = markets[pair].price || 100;
            let volatility = markets[pair].volatility || 0.0002;
            // Always convert absolute volatility to relative volatility
            volatility = volatility / basePrice;
            
            // Adjust volatility for 5-second steps instead of 100ms ticks
            // sigma * sqrt(dt) -> dt=5
            const stepVol = volatility * Math.sqrt(5);
            
            const seedCount = 200;
            const baseTime = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 5) - seedCount * 5;
            
            let currentPrice = basePrice;
            const seedRows = [];
            for (let i = 0; i < seedCount; i++) {
              const time = baseTime + i * 5;
              const isGap = Math.random() < 0.15;
              const gapDirection: 1 | -1 = Math.random() > 0.5 ? 1 : -1;

              const c = generateSingleCandleOHLC(currentPrice, stepVol, undefined, {
                isGap,
                gapDirection,
                gapSizeMultiplier: 1.5 + Math.random() * 1.5
              });
              
              const volume = Math.random() * 100 + 10;
              
              seedRows.push({
                market: pair,
                type,
                timeframe: '5 seconds',
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume,
                openTime: time,
                closeTime: time + 5
              });
              
              // Apply subtle mean-reversion pull towards basePrice to keep history realistic
              const pull = (basePrice - c.close) * 0.03;
              currentPrice = c.close + pull;
            }

            const insertStmt = db.prepare(`
              INSERT OR IGNORE INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const runTx = db.transaction((rows) => {
              for (const r of rows) {
                insertStmt.run(
                  r.market,
                  r.type,
                  r.timeframe,
                  r.open.toFixed(6),
                  r.high.toFixed(6),
                  r.low.toFixed(6),
                  r.close.toFixed(6),
                  r.volume.toFixed(2),
                  r.openTime,
                  r.closeTime
                );
              }
            });
            runTx(seedRows);
          }
        }

        // B. Generate / Seeding for all OTHER timeframes by resampling the 5s base candles
        for (const tf of TIMEFRAMES) {
          if (tf === '5 seconds') continue;
          const tfCountResult = db.prepare('SELECT COUNT(*) as count FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ?').get(pair, type, tf) as any;
          const tfCount = tfCountResult ? tfCountResult.count : 0;
          
          if (tfCount === 0) {
            const baseCandles = db.prepare('SELECT open, high, low, close, volume, openTime, closeTime FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ? ORDER BY openTime ASC').all(pair, type, '5 seconds') as any[];
            const resampled = resampleCandles(baseCandles, timeframeSecondsMap[tf]);
            
            if (resampled.length > 0) {
              const insertStmt = db.prepare(`
                INSERT OR IGNORE INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              const runTx = db.transaction((rows) => {
                for (const r of rows) {
                  insertStmt.run(
                    pair,
                    type,
                    tf,
                    Number(r.open).toFixed(6),
                    Number(r.high).toFixed(6),
                    Number(r.low).toFixed(6),
                    Number(r.close).toFixed(6),
                    Number(r.volume).toFixed(2),
                    r.openTime,
                    r.closeTime
                  );
                }
              });
              runTx(resampled);
            }
          }
        }

        // C. Gap-filling & Memory loading for EVERY timeframe
        for (const tf of TIMEFRAMES) {
          const tfSeconds = timeframeSecondsMap[tf];
          const latestCandle = db.prepare('SELECT close, openTime, closeTime FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ? ORDER BY openTime DESC LIMIT 1').get(pair, type, tf) as any;
          
          if (latestCandle) {
            const lastClose = parseFloat(latestCandle.close);
            if (tf === "5 seconds") {
              if (type === 'real') {
                markets_real[pair].price = lastClose;
              } else {
                markets_demo[pair].price = lastClose;
              }
            }

            const now = Math.floor(Date.now() / 1000);
            const currentBucket = now - (now % tfSeconds);
            
            // Limit the maximum number of candles filled at startup to prevent lag/memory issues
            const maxGapCandles = 200;
            const actualGapSeconds = currentBucket - latestCandle.closeTime;
            const requiredCandles = Math.floor(actualGapSeconds / tfSeconds);
            
            let gapTime = latestCandle.closeTime;
            if (requiredCandles > maxGapCandles) {
              gapTime = currentBucket - (maxGapCandles * tfSeconds);
              console.log(`⚠️ Gap is too large for ${pair} (${type}) ${tf} (${requiredCandles} candles). Capping to last ${maxGapCandles} candles.`);
            }

            const insertGapStmt = db.prepare(`
              INSERT OR IGNORE INTO historical_candles (market, type, timeframe, open, high, low, close, volume, openTime, closeTime)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let currentPrice = lastClose;
            let gapBatch: any[] = [];
            let totalFilled = 0;

            const basePrice = markets[pair]?.price || 100;
            let volatility = markets[pair]?.volatility || 0.0002;
            const relVolatility = volatility / basePrice;
            const stepVol = relVolatility * Math.sqrt(tfSeconds);

            const runGapTx = db.transaction((rows: any[]) => {
              for (const r of rows) {
                insertGapStmt.run(
                  r.market,
                  r.type,
                  r.timeframe,
                  Number(r.open).toFixed(6),
                  Number(r.high).toFixed(6),
                  Number(r.low).toFixed(6),
                  Number(r.close).toFixed(6),
                  Number(r.volume).toFixed(2),
                  r.openTime,
                  r.closeTime
                );
              }
            });

            const gapRowsList: any[] = [];
            while (gapTime < currentBucket) {
              if (isMarketClosedAt(pair, gapTime)) {
                gapTime += tfSeconds;
                continue;
              }
              // Generate highly realistic, volatile random-walk candles
              const isGap = Math.random() < 0.12;
              const gapDirection: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
              const c = generateSingleCandleOHLC(currentPrice, stepVol, undefined, {
                isGap,
                gapDirection,
                gapSizeMultiplier: 1.2 + Math.random() * 1.5
              });
              const volume = Math.random() * 100 + 10;

              const gapRow = {
                market: pair,
                type,
                timeframe: tf,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume,
                openTime: gapTime,
                closeTime: gapTime + tfSeconds
              };
              gapRowsList.push(gapRow);
              gapBatch.push(gapRow);

              // Apply a gentle pull towards basePrice to keep history realistic
              const pull = (basePrice - c.close) * 0.02;
              currentPrice = c.close + pull;

              gapTime += tfSeconds;
              totalFilled++;

              if (gapBatch.length >= 5000) {
                runGapTx(gapBatch);
                gapBatch = [];
              }
            }

            if (gapBatch.length > 0) {
              runGapTx(gapBatch);
            }

            // For the VERY LAST gap candle, set it to the current candle state in memory to prevent jumps
            if (gapRowsList.length > 0) {
              const lastGap = gapRowsList[gapRowsList.length - 1];
              if (!currentCandles_real[pair]) currentCandles_real[pair] = {};
              if (!currentCandles_demo[pair]) currentCandles_demo[pair] = {};
              
              const candleToSet = {
                open: lastGap.open,
                high: lastGap.high,
                low: lastGap.low,
                close: lastGap.close,
                volume: lastGap.volume,
                openTime: lastGap.openTime,
                closeTime: lastGap.closeTime
              };

              if (type === 'real') currentCandles_real[pair][tf] = candleToSet;
              else currentCandles_demo[pair][tf] = candleToSet;

              // Also update the market price to keep everything perfectly synchronized!
              if (tf === "5 seconds") {
                if (type === 'real') {
                  markets_real[pair].price = lastGap.close;
                } else {
                  markets_demo[pair].price = lastGap.close;
                }
              }
            }
          }

          // Load complete historical candles from DB up to 100,000 limit
          const rows = db.prepare(`
            SELECT openTime as time, open, high, low, close, volume, openTime, closeTime
            FROM historical_candles
            WHERE market = ? AND type = ? AND timeframe = ?
            ORDER BY openTime DESC
            LIMIT 1000
          `).all(pair, type, tf) as any[];
          
          const formattedRows = rows.map(r => ({
            time: r.time,
            open: parseFloat(r.open) || 0,
            high: parseFloat(r.high) || 0,
            low: parseFloat(r.low) || 0,
            close: parseFloat(r.close) || 0,
            volume: parseFloat(r.volume) || 0,
            openTime: r.openTime,
            closeTime: r.closeTime
          })).reverse();
          
          if (type === 'real') {
            if (!history_real[pair]) history_real[pair] = {};
            history_real[pair][tf] = formattedRows;
          } else {
            if (!history_demo[pair]) history_demo[pair] = {};
            history_demo[pair][tf] = formattedRows;
          }

          // Initialize current active candle in memory
          const now = Math.floor(Date.now() / 1000);
          const bucketTime = now - (now % tfSeconds);
          const currentCandles = type === 'real' ? currentCandles_real : currentCandles_demo;
          const currentPrice = type === 'real' ? markets_real[pair].price : markets_demo[pair].price;
          
          if (!currentCandles[pair]) currentCandles[pair] = {};

          const activeDbCandle = db.prepare('SELECT * FROM historical_candles WHERE market = ? AND type = ? AND timeframe = ? AND openTime = ?').get(pair, type, tf, bucketTime) as any;
          if (activeDbCandle) {
            currentCandles[pair][tf] = {
              open: parseFloat(activeDbCandle.open),
              high: parseFloat(activeDbCandle.high),
              low: parseFloat(activeDbCandle.low),
              close: parseFloat(activeDbCandle.close),
              volume: parseFloat(activeDbCandle.volume),
              openTime: activeDbCandle.openTime,
              closeTime: activeDbCandle.closeTime
            };
          } else {
            if (isMarketClosedAt(pair, bucketTime)) {
              continue;
            }
            currentCandles[pair][tf] = {
              open: currentPrice,
              high: currentPrice,
              low: currentPrice,
              close: currentPrice,
              volume: Math.random() * 5,
              openTime: bucketTime,
              closeTime: bucketTime + tfSeconds
            };
            saveCandleToDB_v2(pair, type as 'real' | 'demo', tf, currentCandles[pair][tf]);
          }
        }
      } catch (err: any) {
        console.error(`Error loading candles for ${pair} (${type}):`, err.message);
      }
    }
  }
  console.log('✅ Candle storage initialized successfully!');

  // Periodically prune historical candles every 1 hour (recursive timeout to prevent overlap)
  const runPruning = () => {
    try {
      pruneHistoricalCandles();
    } catch (e: any) {
      console.error('Failed to run scheduled candle pruning:', e.message);
    }
    setTimeout(runPruning, 60 * 60 * 1000);
  };
  runPruning();
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

// Firestore Persistence for candles (Master Store)
async function saveCandleToFirestore(pair: string, type: string, timeframe: string, candle: any) {
  try {
    const docId = `${pair}_${type}_${timeframe}_${candle.openTime}`;
    await adminDb.collection('market_candles').doc(docId).set({
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
  } catch (e) {
    // Silently fail if firestore unreachable to keep engine running
  }
}

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
