
import WebSocket from 'ws';
import { markets_real, markets_demo } from './marketService.ts';
import { markets } from '../markets.ts';

/**
 * LiveApiService connects to external real-time data providers.
 * For Crypto: Binance WebSockets (Free, no key required)
 * For others: FMP Polling (requires key)
 */
class LiveApiService {
  private binanceWs: WebSocket | null = null;
  private binanceBlocked = false;
  private pairsToBinance: Record<string, string> = {
    'BTC/USD': 'btcusdt',
    'ETH/USD': 'ethusdt',
    'LTC/USD': 'ltcusdt',
    'SOL/USD': 'solusdt',
    'ADA/USD': 'adausdt',
    'UNI/USD': 'uniusdt',
    'LINK/USD': 'linkusdt',
    'BCH/USD': 'bchusdt',
    'AVAX/USD': 'avaxusdt',
    'DOT/USD': 'dotusdt',
    'POL/USD': 'polusdt',
    'AAVE/USD': 'aaveusdt',
    'SHIB/USD': 'shibusdt',
    'DOGE/USD': 'dogeusdt',
    'XRP/USD': 'xrpusdt',
    'CAKE/USD': 'cakeusdt',
    'FET/USD': 'fetusdt',
    'ICP/USD': 'icpusdt',
    'KSM/USD': 'ksmusdt',
    'LPT/USD': 'lptusdt',
  };

  private binanceToPair: Record<string, string> = {};

  constructor() {
    Object.entries(this.pairsToBinance).forEach(([pair, symbol]) => {
      this.binanceToPair[symbol] = pair;
    });
  }

  public start() {
    console.log('🌐 Initializing Live API Service...');
    this.connectBinance();
  }

  private connectBinance() {
    const symbols = Object.values(this.pairsToBinance);
    const streams = symbols.map(s => `${s}@ticker`).join('/');
    const url = `wss://stream.binance.us:9443/ws/${streams}`;

    console.log(`🔌 Connecting to Binance US WebSocket: ${url}`);
    
    this.binanceWs = new WebSocket(url);

    this.binanceWs.on('open', () => {
      console.log('✅ Connected to Binance US WebSocket');
    });

    this.binanceWs.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data);
        const ticker = msg.data || msg;
        if (ticker.e !== '24hrTicker') return;

        const binanceSymbol = ticker.s.toLowerCase();
        const pair = this.binanceToPair[binanceSymbol];
        const price = parseFloat(ticker.c);

        if (pair && !isNaN(price)) {
          if (markets_real[pair]) {
            markets_real[pair].targetPrice = price;
            markets_real[pair].price = price;
          }
          if (markets_demo[pair]) {
            markets_demo[pair].targetPrice = price;
            markets_demo[pair].price = price;
          }
        }
      } catch (err) {
        // ignore parse errors
      }
    });

    this.binanceWs.on('error', (err) => {
      console.warn('❌ Binance US WebSocket Error:', err.message);
    });

    this.binanceWs.on('close', () => {
      console.log('⚠️ Binance US WebSocket closed. Reconnecting in 5s...');
      setTimeout(() => this.connectBinance(), 5000);
    });
  }
}

export const liveApiService = new LiveApiService();
