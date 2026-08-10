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
  setInterval(fetchAllRealPrices, 15000); // Sync with real prices every 15 seconds

  // Start Real-time WebSocket Service
  // try {
  //   liveApiService.start();
  // } catch (e) {
  //   console.error("Live API Start Error:", e);
  // }

  // Settle expired trades every 2 seconds (using recursive timeout to prevent overlap)
  const runSettlement = async () => {
    if (systemActive) {
      try {
        await updateTradeExposureCache();
        await settleExpiredTrades();
      } catch (e) {
        console.error('Settlement error:', e);
      }
    }
    setTimeout(runSettlement, 2000);
  };
  runSettlement();

  // Main Ticker Loop (using recursive timeout)
  const runTicker = async () => {
    if (systemActive) {
      try {
        const io = getIO();
        const nowSec = Math.floor(Date.now() / 1000);
        const tickDataReal: Record<string, any> = {};

        Object.keys(markets).forEach(pair => {
          const realTick = updatePair(pair, 'real', nowSec);
          if (realTick) {
            tickDataReal[pair] = realTick;
          }
        });

        // Broadcast market states (ticks)
        io.emit('market_ticks', tickDataReal);
      } catch (tickErr) {
        console.error('Ticker loop error:', tickErr);
      }
    }
    setTimeout(runTicker, TICK_INTERVAL);
  };
  runTicker();
}

