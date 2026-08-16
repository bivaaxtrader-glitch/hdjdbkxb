import { 
  markets_real, markets_demo, 
  history_real, history_demo, 
  currentCandles_real, currentCandles_demo,
  saveCandleToDB_v2, TIMEFRAMES, timeframeSecondsMap,
  isMarketClosedAt
} from './marketService.ts';
import { getIO } from './socketService.ts';
import { tradeExposureCache, manipulatedExposureCache } from './tradeService.ts';
import { globalManipulationMode } from './marketService.ts';
import { markets } from '../markets.ts';

// Dynamic Trend State Tracker for realistic, unique, cyclic market movements (like professional trading apps)
interface MarketTrend {
  currentTrend: 'up' | 'down' | 'sideways';
  trendIntensity: number;
  cycleTicksRemaining: number;
  momentum: number;
}

const marketTrendStates: Record<string, MarketTrend> = {};

export function updatePair(pair: string, type: 'real' | 'demo', now: number) {
  if (isMarketClosedAt(pair, now)) {
    return null;
  }
  const pool = type === 'real' ? markets_real : markets_demo;
  const historyPool = type === 'real' ? history_real : history_demo;
  const candlePool = type === 'real' ? currentCandles_real : currentCandles_demo;
  
  const m = pool[pair];
  if (!m) return null;

  const currentPrice = Number(m.price) || 100.00;

  // Initialize or update the cyclic trend state for this specific pair
  const trendKey = `${pair}_${type}`;
  if (!marketTrendStates[trendKey]) {
    const trends: ('up' | 'down' | 'sideways')[] = ['up', 'down', 'sideways'];
    // Use length and characters to seed different initial trends per pair
    const seedIndex = (pair.length + pair.charCodeAt(0)) % trends.length;
    marketTrendStates[trendKey] = {
      currentTrend: trends[seedIndex],
      trendIntensity: 0.15 + Math.random() * 0.35,
      cycleTicksRemaining: 40 + Math.floor(Math.random() * 120), // tick lifetime
      momentum: 0
    };
  }

  const state = marketTrendStates[trendKey];
  state.cycleTicksRemaining--;

  if (state.cycleTicksRemaining <= 0) {
    // Transition smoothly to a new market cycle
    const trends: ('up' | 'down' | 'sideways')[] = ['up', 'down', 'sideways'];
    const otherTrends = trends.filter(t => t !== state.currentTrend);
    state.currentTrend = otherTrends[Math.floor(Math.random() * otherTrends.length)];
    state.trendIntensity = 0.15 + Math.random() * 0.4;
    state.cycleTicksRemaining = 50 + Math.floor(Math.random() * 150);
  }

  // Determine market-specific volatility multipliers (Forex is stable, Cryptos/OTC are erratic/high payout)
  let volMult = 1.3;
  if (pair.includes('(OTC)')) {
    volMult = 1.85; // Rich OTC movements
  } else if (pair.includes('Crypto IDX') || pair.includes('IDX')) {
    volMult = 2.1;  // Highly volatile index
  } else if (pair.includes('/USD') && !pair.includes('EUR/') && !pair.includes('GBP/') && !pair.includes('AUD/')) {
    volMult = 1.65; // Volatile cryptos
  } else {
    volMult = 1.15; // Standard, smooth Forex ranges
  }

  // Base random price change - perfectly balanced centered around 0.5 (noise)
  const randNoise = (Math.random() - 0.5) * 2; // -1 to +1

  // Set direction based on active trend state
  let trendBias = 0;
  if (state.currentTrend === 'up') {
    trendBias = state.trendIntensity * 0.35;
  } else if (state.currentTrend === 'down') {
    trendBias = -state.trendIntensity * 0.35;
  } else {
    trendBias = (Math.random() - 0.5) * 0.08; // neutral drift
  }

  // Calculate smoothed momentum for fluid, professional candlestick movement
  state.momentum = (state.momentum * 0.94) + (trendBias * 0.06);

  // Combine lower noise and higher momentum for steady, non-jittery progression
  const rawVolatility = markets[pair]?.volatility || 0.0002;
  // Convert absolute volatility from config into a relative fractional volatility
  const baseVolatility = rawVolatility / currentPrice;
  const tickChangePercent = (randNoise * 0.35 + state.momentum * 0.65) * baseVolatility * volMult;
  
  let change = currentPrice * tickChangePercent;

  // Admin Pressure / Manipulation support
  const exposureKey = `${pair}_${type}`;
  const exposure = tradeExposureCache.get(exposureKey) || 0;
  const manipExposure = manipulatedExposureCache.get(exposureKey) || 0;
  
  let bias = 0;
  if (globalManipulationMode === 'always_loss') {
    bias = exposure > 0 ? -0.0004 : 0.0004;
  } else if (globalManipulationMode === 'always_win') {
    bias = exposure > 0 ? 0.0004 : -0.0004;
  }
  if (manipExposure !== 0) {
    bias += manipExposure > 0 ? 0.0005 : -0.0005;
  }
  if (m.pressure) {
    bias += (m.pressure / 100) * 0.0005;
  }

  let newPrice = Number((currentPrice + change + (bias * currentPrice)).toFixed(5));
  if (newPrice <= 0) newPrice = 1.00;
  m.price = newPrice;

  // Update all timeframes
  for (const tf of TIMEFRAMES) {
    const tfSeconds = timeframeSecondsMap[tf];
    const bucketTime = now - (now % tfSeconds);
    if (!candlePool[pair]) candlePool[pair] = {};
    let activeCandle = candlePool[pair][tf];

    if (!activeCandle) {
      candlePool[pair][tf] = {
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice,
        volume: Math.random() * 20 + 5,
        openTime: bucketTime,
        closeTime: bucketTime + tfSeconds
      };
      saveCandleToDB_v2(pair, type, tf, candlePool[pair][tf]);
    } else if (bucketTime > activeCandle.openTime) {
      // Completed candle
      const completed = { ...activeCandle };
      saveCandleToDB_v2(pair, type, tf, completed);

      if (!historyPool[pair]) historyPool[pair] = {};
      if (!historyPool[pair][tf]) historyPool[pair][tf] = [];
      
      const historyRow = {
        time: completed.openTime,
        open: completed.open,
        high: completed.high,
        low: completed.low,
        close: completed.close,
        volume: completed.volume,
        openTime: completed.openTime,
        closeTime: completed.closeTime
      };

      historyPool[pair][tf].push(historyRow);
      if (historyPool[pair][tf].length > 1000) historyPool[pair][tf].shift();

      try {
        getIO().to(`market_${pair}_${type}`).emit('candle_complete', { pair, timeframe: tf, candle: historyRow });
      } catch(e) {}

      // New candle starts precisely at previous close
      candlePool[pair][tf] = {
        open: completed.close,
        high: Math.max(completed.close, newPrice),
        low: Math.min(completed.close, newPrice),
        close: newPrice,
        volume: Math.random() * 20 + 5,
        openTime: bucketTime,
        closeTime: bucketTime + tfSeconds
      };
      saveCandleToDB_v2(pair, type, tf, candlePool[pair][tf]);
    } else {
      activeCandle.close = newPrice;
      activeCandle.high = Math.max(activeCandle.high, newPrice);
      activeCandle.low = Math.min(activeCandle.low, newPrice);
      activeCandle.volume += Math.random() * 2;
    }
  }

  const active5s = candlePool[pair]?.["5 seconds"];
  return {
    price: newPrice,
    time: now,
    candle: active5s ? {
      time: active5s.openTime,
      open: active5s.open,
      high: active5s.high,
      low: active5s.low,
      close: active5s.close,
      volume: active5s.volume
    } : null
  };
}
