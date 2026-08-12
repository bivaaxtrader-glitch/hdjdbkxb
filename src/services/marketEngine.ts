import { getIO, getActiveConnections } from './socketService.ts';
import { 
  markets_real, markets_demo, 
  history_real, history_demo, 
  currentCandles_real, currentCandles_demo,
  systemActive, globalManipulationMode,
  fetchAllRealPrices, initializeCandlesFromDB,
  initializeUserManipulation,
  saveCandleToDB_v2, TIMEFRAMES, timeframeSecondsMap
} from './marketService.ts';
import { markets } from '../markets.ts';
import { settleExpiredTrades, updateTradeExposureCache } from './tradeService.ts';
import { updatePair } from './otcEngine.ts';
import { liveApiService } from './liveApiService.ts';

const TICK_INTERVAL = 200;

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
        // IDLE GUARD: If no clients are connected, sleep for 2 seconds to completely eliminate background CPU and DB load
        if (getActiveConnections() === 0) {
          setTimeout(runTicker, 2000);
          return;
        }

        const io = getIO();
        const marketKeys = Object.keys(markets);
        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);
        const tickDataReal: Record<string, any> = {};
        
        tickCount++;
        const isSummaryTick = tickCount % 5 === 0; // Every 1 second (5 * 200ms)

        for (const pair of marketKeys) {
          // Process REAL market
          const roomNameReal = `market_${pair}_real`;
          const roomReal = io.sockets.adapter.rooms.get(roomNameReal);
          const hasListenersReal = roomReal && roomReal.size > 0;

          if (hasListenersReal || isSummaryTick) {
            const realTick = updatePair(pair, 'real', nowSec);
            if (realTick) {
              if (hasListenersReal) {
                 io.to(roomNameReal).emit('market_tick', { pair, ...realTick });
              }
              if (isSummaryTick) {
                tickDataReal[pair] = realTick;
              }
            }
          }

          // Process DEMO market
          const roomNameDemo = `market_${pair}_demo`;
          const roomDemo = io.sockets.adapter.rooms.get(roomNameDemo);
          const hasListenersDemo = roomDemo && roomDemo.size > 0;

          if (hasListenersDemo || isSummaryTick) {
            const demoTick = updatePair(pair, 'demo', nowSec);
            if (demoTick && hasListenersDemo) {
               io.to(roomNameDemo).emit('market_tick', { pair, ...demoTick });
            }
          }
        }

        // Broadcast market summary (prices) less frequently to reduce global bandwidth
        if (isSummaryTick && Object.keys(tickDataReal).length > 0) {
          io.emit('market_ticks', tickDataReal);
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

