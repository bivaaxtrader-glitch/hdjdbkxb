import { getIO, getActiveConnections } from './socketService.ts';
import { 
  markets_real, markets_demo, 
  history_real, history_demo, 
  currentCandles_real, currentCandles_demo,
  systemActive, globalManipulationMode,
  fetchAllRealPrices, initializeCandlesFromDB,
  saveCandleToDB_v2, TIMEFRAMES, timeframeSecondsMap
} from './marketService.ts';
import { markets } from '../markets.ts';
import { settleExpiredTrades, updateTradeExposureCache } from './tradeService.ts';
import { updatePair } from './otcEngine.ts';
import { liveApiService } from './liveApiService.ts';

const TICK_INTERVAL = 500;

export async function startMarketEngine() {
  console.log('🚀 Starting Market Engine...');
  
  // Initialize candles from the database asynchronously in background
  initializeCandlesFromDB().catch(err => console.error("Error initializing candles:", err));
  
  // Initial price fetch
  fetchAllRealPrices();
  setInterval(fetchAllRealPrices, 15000); // Sync with real prices every 15 seconds

  // Start Real-time WebSocket Service
  // try {
  //   liveApiService.start();
  // } catch (e) {
  //   console.error("Live API Start Error:", e);
  // }

  // Settle expired trades every 2 seconds
  setInterval(async () => {
    if (!systemActive) return;
    try {
      await updateTradeExposureCache();
      await settleExpiredTrades();
    } catch (e) {
      console.error('Settlement error:', e);
    }
  }, 2000);

  // Main Ticker Loop (1000ms)
  setInterval(async () => {
    if (!systemActive) return;

    const io = getIO();
    const nowSec = Math.floor(Date.now() / 1000);

    const tickDataReal: Record<string, any> = {};
    const tickDataDemo: Record<string, any> = {};

    Object.keys(markets).forEach(pair => {
      // Update Real Market
      const realTick = updatePair(pair, 'real', nowSec);
      if (realTick) {
        tickDataReal[pair] = realTick;
      }
      
      // Update Demo Market (Independent movement)
      const demoTick = updatePair(pair, 'demo', nowSec);
      if (demoTick) {
        tickDataDemo[pair] = demoTick;
      }
    });

    // Broadcast market states (ticks) to respective rooms
    io.to('real').emit('market_ticks', tickDataReal);
    io.to('demo').emit('market_ticks', tickDataDemo);
    
    // Also broadcast real market ticks globally for public components (tickers, status cards)
    io.emit('market_ticks', tickDataReal);
  }, TICK_INTERVAL);
}

