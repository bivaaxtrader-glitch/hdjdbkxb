import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../lib/auth-server.ts';
import { history_real, history_demo, currentCandles_real, currentCandles_demo, markets_real, markets_demo, systemActive } from './marketService.ts';
import { get, run, query } from '../db/mysql-db.ts';
import { mapUserForFrontend } from '../lib/user-utils.ts';

import { markets } from '../markets.ts';

function getTimeSeconds(tf: string): number {
  if (!tf || typeof tf !== 'string') return 5;
  const parts = tf.split(" ");
  const val = parseInt(parts[0]);
  const unit = parts[1];
  if (!unit) return 5;
  if (unit.startsWith("second")) return val;
  if (unit.startsWith("minute")) return val * 60;
  if (unit.startsWith("hour")) return val * 3600;
  if (unit.startsWith("day")) return val * 86400;
  return 5;
}

let io: Server;
let activeConnections = 0;

export function getActiveConnections() {
  return activeConnections;
}

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    activeConnections++;
    console.log('New client connected:', socket.id, 'Total:', activeConnections);

    // Join market specific rooms
    socket.on('subscribe_market', (pair: string, type: string) => {
      socket.join(`market_${pair}_${type}`);
      socket.join(type); // 'real' or 'demo'
    });

    socket.on('unsubscribe_market', (pair: string, type: string) => {
      socket.leave(`market_${pair}_${type}`);
    });

    // User-specific room for private updates (balance, trade results)
    socket.on('authenticate', (token: string) => {
      try {
        const decoded = verifyToken(token) as any;
        if (decoded) {
          socket.data.userId = decoded.uid;
          socket.join(`user_${decoded.uid}`);
          if (decoded.is_admin || decoded.role === 'admin' || decoded.role === 'support' || decoded.role === 'supervisor') {
            socket.join('agents_room');
          }
          console.log(`User/Agent ${decoded.uid} authenticated on socket ${socket.id}`);
        }
      } catch (err) {
        console.error('Socket authentication failed:', err);
      }
    });

    // Support Chat Rooms & Real-time Events
    socket.on('join_ticket', (ticketId: string) => {
      if (ticketId) {
        socket.join(`ticket_${ticketId}`);
      }
    });

    socket.on('leave_ticket', (ticketId: string) => {
      if (ticketId) {
        socket.leave(`ticket_${ticketId}`);
      }
    });

    socket.on('typing', ({ ticketId, senderType, isTyping }) => {
      if (ticketId) {
        socket.to(`ticket_${ticketId}`).emit('typing', { senderType, isTyping });
      }
    });

    socket.on('message_status', async ({ ticketId, messageId, status }) => {
      if (ticketId && messageId) {
        if (status === 'seen') {
          try {
            await run('UPDATE ticket_messages SET is_read = 1 WHERE id = ?', [messageId]);
          } catch (err) {}
        }
        socket.to(`ticket_${ticketId}`).emit('message_status', { messageId, status });
      }
    });

    socket.on('request_initial_data', async (params: { asset: string, accountType: 'real' | 'demo', timeframe?: string, userId?: string }) => {
      const { asset, accountType, userId, timeframe } = params;
      
      // 1. Handle Room Subscriptions
      // Leave all previous market rooms to prevent data leakage and excessive bandwidth
      Array.from(socket.rooms).forEach(room => {
        if (room.startsWith('market_') || room === 'real' || room === 'demo') {
          socket.leave(room);
        }
      });
      
      // Join the new market room and the account type room
      socket.join(`market_${asset}_${accountType}`);
      socket.join(accountType);
      
      const tf = timeframe || "1 minute";
      const history = accountType === 'real' ? history_real : history_demo;
      const currentCandles = accountType === 'real' ? currentCandles_real : currentCandles_demo;
      const pool = accountType === 'real' ? markets_real : markets_demo;

      // If history for this asset/tf is empty, generate initial 200 candles so switching pairs instantly shows a full chart
      if ((!history[asset] || !history[asset][tf] || history[asset][tf].length === 0) && pool[asset]) {
        if (!history[asset]) history[asset] = {};
        const tfSecs = getTimeSeconds(tf);
        let basePrice = Number(pool[asset].price) || 100.00;
        let tTime = Math.floor(Date.now() / 1000) - (200 * tfSecs);
        const generated = [];
        
        for (let i = 0; i < 200; i++) {
          const open = basePrice;
          const change = (Math.random() - 0.49) * 0.3 * (basePrice * 0.0005);
          const close = Number((open + change).toFixed(5));
          const high = Number((Math.max(open, close) + Math.random() * 0.1 * basePrice * 0.0005).toFixed(5));
          const low = Number((Math.min(open, close) - Math.random() * 0.1 * basePrice * 0.0005).toFixed(5));
          
          generated.push({
            time: tTime,
            open,
            high,
            low,
            close,
            volume: Math.random() * 50 + 10,
            openTime: tTime,
            closeTime: tTime + tfSecs
          });
          basePrice = close;
          tTime += tfSecs;
        }
        history[asset][tf] = generated;
      }

      const allCandles = (history[asset] && history[asset][tf]) ? history[asset][tf] : [];
      const candles = allCandles;
      const currentCandle = (currentCandles[asset] && currentCandles[asset][tf]) ? {
        time: currentCandles[asset][tf].openTime,
        open: currentCandles[asset][tf].open,
        high: currentCandles[asset][tf].high,
        low: currentCandles[asset][tf].low,
        close: currentCandles[asset][tf].close,
        volume: currentCandles[asset][tf].volume
      } : null;

      socket.emit('initial_market_data', {
        markets: pool,
        systemActive,
        history: {
          [asset]: candles
        },
        currentCandles: {
          [asset]: currentCandle
        },
        activities: [],
        serverTime: Date.now()
      });

      // If userId provided and authenticated, send profile update
      if (userId || socket.data.userId) {
        const uid = userId || socket.data.userId;
        const user = await get('SELECT * FROM users WHERE uid = ?', [uid]);
        if (user) {
          socket.emit('user_profile_update', mapUserForFrontend(user));
        }
      }
    });

    socket.on('request_past_candles', async (params: { asset: string, accountType: 'real' | 'demo', timeframe: string, beforeTime: number, limit?: number }) => {
      const { asset, accountType, timeframe, beforeTime, limit = 1000 } = params;
      try {
        const pool = accountType === 'real' ? history_real : history_demo;
        const pairHistory = (pool[asset] && pool[asset][timeframe]) || [];
        
        // Filter candles where openTime < beforeTime, sorted desc (newest to oldest)
        const matchedCandles = pairHistory
          .filter((c: any) => c.openTime < beforeTime)
          .sort((a: any, b: any) => b.openTime - a.openTime);

        let formattedRows = matchedCandles.map((r: any) => ({
          time: r.openTime || r.time,
          open: parseFloat(r.open) || 0,
          high: parseFloat(r.high) || 0,
          low: parseFloat(r.low) || 0,
          close: parseFloat(r.close) || 0,
          volume: parseFloat(r.volume) || 0,
          openTime: r.openTime,
          closeTime: r.closeTime
        }));

        const generated = [];
        // If we didn't get enough candles, generate more synthetically to fulfill the "unlimited" requirement
        if (formattedRows.length < limit) {
           const needed = limit - formattedRows.length;
           const tfSecs = getTimeSeconds(timeframe);
           
           // Determine the starting point for backwards generation
           const oldestRow = formattedRows[formattedRows.length - 1];
           let lastTime = oldestRow ? oldestRow.openTime : (beforeTime - (beforeTime % tfSecs));
           
           // For gapless connection: the synthetic candle immediately preceding oldestRow 
           // must close exactly at oldestRow's open price.
           let lastClose = oldestRow ? oldestRow.open : (markets[asset]?.price || 100);

           const getPseudoRandom = (seed: number) => {
             const x = Math.sin(seed + (asset.length * 1000)) * 10000;
             return x - Math.floor(x);
           };

           let momentum = (getPseudoRandom(lastTime) - 0.5) * 2; 

           for (let i = 0; i < needed; i++) {
              lastTime -= tfSecs;
              const pr = getPseudoRandom(lastTime);
              
              // Update momentum slowly
              momentum = momentum * 0.85 + (getPseudoRandom(lastTime + 500) - 0.5) * 0.5;
              
              // Base range for the candle (relative to price)
              const assetConfig = markets[asset];
              const rawVol = assetConfig ? assetConfig.volatility : 0.0002;
              const assetPrice = assetConfig ? assetConfig.price : 100;
              const relativeVol = rawVol / assetPrice;
              const stepVol = relativeVol * Math.sqrt(tfSecs) * 0.06;
              const rangeVol = lastClose * stepVol * (0.8 + pr * 1.5);
              
              // Determine candle type
              const typeRand = getPseudoRandom(lastTime + 1000);
              const currentClose = lastClose;
              let currentOpen = lastClose;
              let high = lastClose;
              let low = lastClose;

              if (typeRand < 0.12) {
                 // Doji / Spinning Top
                 const bodySize = rangeVol * (0.05 + getPseudoRandom(lastTime + 2) * 0.15);
                 const isUp = getPseudoRandom(lastTime + 3) > 0.5;
                 currentOpen = isUp ? currentClose - bodySize : currentClose + bodySize;
                 
                 const upperWick = rangeVol * (0.1 + getPseudoRandom(lastTime + 4) * 0.4);
                 const lowerWick = rangeVol * (0.1 + getPseudoRandom(lastTime + 5) * 0.4);
                 high = Math.max(currentOpen, currentClose) + upperWick;
                 low = Math.min(currentOpen, currentClose) - lowerWick;
              } else if (typeRand < 0.35) {
                 // Strong Candle (Large body, small wicks)
                 const bodySize = rangeVol * (1.2 + getPseudoRandom(lastTime + 2) * 1.8);
                 const isUp = momentum > 0 || getPseudoRandom(lastTime + 3) > 0.65;
                 currentOpen = isUp ? currentClose - bodySize : currentClose + bodySize;
                 
                 const tinyWick = bodySize * (getPseudoRandom(lastTime + 4) * 0.05);
                 high = Math.max(currentOpen, currentClose) + tinyWick;
                 low = Math.min(currentOpen, currentClose) - tinyWick;
              } else {
                 // Standard Candle
                 const bodySize = rangeVol * (0.5 + getPseudoRandom(lastTime + 2) * 1.0);
                 const isUp = momentum > 0.15 || (momentum > -0.15 && getPseudoRandom(lastTime + 3) > 0.5);
                 currentOpen = isUp ? currentClose - bodySize : currentClose + bodySize;
                 
                 const upperWick = rangeVol * (0.2 + getPseudoRandom(lastTime + 4) * 0.4);
                 const lowerWick = rangeVol * (0.2 + getPseudoRandom(lastTime + 5) * 0.4);
                 high = Math.max(currentOpen, currentClose) + upperWick;
                 low = Math.min(currentOpen, currentClose) - lowerWick;
              }

              if (currentOpen <= 0) currentOpen = 1.0;
              if (high <= 0) high = 1.0;
              if (low <= 0) low = 1.0;
              
              generated.push({
                time: lastTime,
                open: parseFloat(currentOpen.toFixed(8)),
                high: parseFloat(high.toFixed(8)),
                low: parseFloat(low.toFixed(8)),
                close: parseFloat(currentClose.toFixed(8)),
                volume: pr * 100,
                openTime: lastTime,
                closeTime: lastTime + tfSecs
              });
              lastClose = currentOpen;
           }
        }

        const resultCandles = [...formattedRows, ...generated].reverse();

        socket.emit('past_candles_response', {
          asset,
          timeframe,
          candles: resultCandles
        });
      } catch (err) {
        console.error('Failed to fetch past candles:', err);
        socket.emit('past_candles_response', {
          asset,
          timeframe,
          candles: [],
          error: 'Failed to fetch historical candles'
        });
      }
    });

    socket.on('disconnect', () => {
      activeConnections = Math.max(0, activeConnections - 1);
      console.log('Client disconnected:', socket.id, 'Total:', activeConnections);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
