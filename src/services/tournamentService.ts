import { get, query, run, transaction } from '../db/mysql-db.ts';
import logger from '../lib/logger.ts';
import { syncUserToFirestore } from '../lib/firebase-admin.ts';
import { mapUserForFrontend } from '../lib/user-utils.ts';
import { getIO } from './socketService.ts';
import Big from 'big.js';

/**
 * Tournament Engine
 * Handles status transitions and prize settlements
 */

export async function processTournamentTransitions() {
  const now = Date.now();
  
  try {
    // 1. Move Scheduled -> Active
    const toActivate = await query(
      "SELECT id, title FROM tournaments WHERE status = 'scheduled' AND start_time <= ?",
      [now]
    ) as any[];

    for (const t of toActivate) {
      logger.info(`Tournament [${t.title}] is now ACTIVE`);
      await run("UPDATE tournaments SET status = 'active' WHERE id = ?", [t.id]);
      getIO().emit('tournament_update', { id: t.id, status: 'active' });
    }

    // 2. Settle Ended Tournaments (Active -> Completed)
    const toSettle = await query(
      "SELECT * FROM tournaments WHERE status = 'active' AND end_time <= ?",
      [now]
    ) as any[];

    for (const t of toSettle) {
      await settleTournament(t);
    }

  } catch (err: any) {
    logger.error(`Tournament transition error: ${err.message}`);
  }
}

async function settleTournament(tournament: any) {
  logger.info(`Settling Tournament: ${tournament.title} (${tournament.id})`);
  
  try {
    await transaction(async (conn) => {
      // 1. Get Leaderboard
      const participants = await query(
        "SELECT user_id, score FROM tournament_participants WHERE tournament_id = ? ORDER BY score DESC, joined_at ASC",
        [tournament.id],
        conn
      ) as any[];

      if (participants.length === 0) {
        logger.info(`No participants for tournament ${tournament.id}. Marking as completed.`);
        await run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournament.id], conn);
        return;
      }

      // 2. Get Prizes
      const prizes = await query(
        "SELECT * FROM tournament_prizes WHERE tournament_id = ? ORDER BY rank_from ASC",
        [tournament.id],
        conn
      ) as any[];

      // 3. Distribute Prizes
      for (const p of prizes) {
        const rankFrom = p.rank_from;
        const rankTo = p.rank_to;
        const prizeAmount = p.prize_amount;

        // Find users in this rank range (1-indexed)
        const winners = participants.slice(rankFrom - 1, rankTo);

        for (const winner of winners) {
          const uid = winner.user_id;
          
          // Update user real_balance
          const user = await get("SELECT real_balance FROM users WHERE uid = ?", [uid], conn) as any;
          if (user) {
            const newBalance = new Big(user.real_balance || 0).plus(prizeAmount).toFixed(2);
            await run("UPDATE users SET real_balance = ? WHERE uid = ?", [newBalance, uid], conn);

            // Record transaction
            await run(
              "INSERT INTO transactions (user_id, type, amount, status, method, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [uid, 'prize', prizeAmount.toString(), 'completed', 'wallet', `Prize for tournament: ${tournament.title} (Rank ${participants.indexOf(winner) + 1})`, Date.now()],
              conn
            );

            // Notify User
            const updatedUser = await get("SELECT * FROM users WHERE uid = ?", [uid], conn) as any;
            const mapped = mapUserForFrontend(updatedUser);
            getIO().to(`user_${uid}`).emit('user_profile_update', mapped);
            getIO().to(`user_${uid}`).emit('notification', {
              type: 'success',
              title: 'Tournament Prize!',
              message: `Congratulations! You won ${prizeAmount} in the ${tournament.title} tournament.`
            });

            // Sync to Firestore
            syncUserToFirestore(uid, mapped).catch(e => logger.error(`Sync prize failed for ${uid}:`, e));
          }
        }
      }

      // 4. Mark Tournament as Completed
      await run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournament.id], conn);
      getIO().emit('tournament_update', { id: tournament.id, status: 'completed' });
    });
    
    logger.info(`Successfully settled tournament: ${tournament.title}`);
  } catch (err: any) {
    logger.error(`Failed to settle tournament ${tournament.id}: ${err.message}`);
  }
}

let interval: NodeJS.Timeout;

export function startTournamentEngine() {
  logger.info('🏆 Tournament Engine Started');
  // Check every minute
  interval = setInterval(processTournamentTransitions, 60000);
  // Initial check
  processTournamentTransitions();
}
