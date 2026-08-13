import { getIO, getActiveConnections } from './socketService.ts';
import { 
  markets_real, markets_demo, 
  history_real, history_demo, 
  currentCandles_real, currentCandles_demo,
  systemActive, globalManipulationMode,
  fetchAllRealPrices, initializeCandlesFromDB,
  initializeUserManipulation,
  saveCandleToDB_v2, TIMEFRAMES, timeframeSecondsMap,
  pruneHistoricalCandles
} from './marketService.ts';
import { markets } from '../markets.ts';
import { settleExpiredTrades, updateTradeExposureCache } from './tradeService.ts';
import { updatePair } from './otcEngine.ts';
import { liveApiService } from './liveApiService.ts';

const TICK_INTERVAL = 250;

export async function startMarketEngine() {
  console.log('🚀 Starting Market Engine...');
  
  // Initialize candles from the database asynchronously in background
  initializeCandlesFromDB().catch(err => console.error("Error initializing candles:", err));
  
  // Initialize user manipulation cache
  initializeUserManipulation().catch(err => console.error("Error initializing user manipulation:", err));

  // Initial price fetch
  fetchAllRealPrices();
  setInterval(fetchAllRealPrices, 30000); // Sync with real prices every 30 seconds

  // Settle expired trades every 3 seconds (using recursive timeout to prevent overlap)
  const runSettlement = async () => {
    if (systemActive && getActiveConnections() > 0) {
      try {
        await updateTradeExposureCache();
        await settleExpiredTrades();
      } catch (e) {
        console.error('Settlement error:', e);
      }
    }
    setTimeout(runSettlement, 3000);
  };
  runSettlement();

  // Main Ticker Loop (using recursive timeout)
  let tickCount = 0;
  const runTicker = async () => {
    if (systemActive) {
      try {
        const io = getIO();
        const marketKeys = Object.keys(markets);
        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);
        const tickDataReal: Record<string, any> = {};
        
        tickCount++;
        const isSummaryTick = tickCount % 5 === 0; // Every 1 second (5 * 200ms)

        for (const pair of marketKeys) {
          // Process REAL market continuously for all pairs
          const roomNameReal = `market_${pair}_real`;
          const realTick = updatePair(pair, 'real', nowSec);
          if (realTick) {
            io.to(roomNameReal).emit('market_tick', { pair, ...realTick });
            tickDataReal[pair] = realTick;
          }

          // Process DEMO market continuously for all pairs
          const roomNameDemo = `market_${pair}_demo`;
          const demoTick = updatePair(pair, 'demo', nowSec);
          if (demoTick) {
            io.to(roomNameDemo).emit('market_tick', { pair, ...demoTick });
          }
        }

        // Broadcast market summary (prices)
        if (Object.keys(tickDataReal).length > 0) {
          io.emit('market_ticks', tickDataReal);
        }
        if (isSummaryTick) {
          tickCount = 0;
        }
      } catch (tickErr) {
        console.error('Ticker loop error:', tickErr);
      }
    }
    setTimeout(runTicker, TICK_INTERVAL);
  };
  runTicker();
}

