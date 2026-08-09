import express from 'express';
import { get, query, run, transaction } from '../db/mysql-db.ts';
import logger from '../lib/logger.ts';
import { requireAuth, AuthRequest } from '../middleware/jwtAuth.ts';
import Big from 'big.js';

const router = express.Router();

/**
 * 1. Fetch all tournaments
 */
router.get('/tournaments', async (req, res) => {
  try {
    const tournaments = await query('SELECT * FROM tournaments ORDER BY start_time ASC') as any[];
    
    // For each tournament, get participant count
    const enriched = await Promise.all(tournaments.map(async (t) => {
      const count = await get('SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ?', [t.id]) as any;
      return {
        ...t,
        participantsCount: count?.cnt || 0,
        requirements: t.requirements ? JSON.parse(t.requirements) : null,
        isJoined: false // We'll update this if user is logged in
      };
    }));

    res.json({ success: true, tournaments: enriched });
  } catch (err: any) {
    logger.error(`Failed to fetch tournaments: ${err.message}`);
    res.status(500).json({ error: 'Failed to load tournaments' });
  }
});

/**
 * 2. Get specific tournament details & leaderboard
 */
router.get('/tournaments/:id', async (req, res) => {
  const { id } = req.params;
  const { uid } = req.query;

  try {
    const tournament = await get('SELECT * FROM tournaments WHERE id = ?', [id]) as any;
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const leaderboard = await query(
      `SELECT tp.*, u.display_name, u.photo_url 
       FROM tournament_participants tp
       JOIN users u ON tp.user_id = u.uid
       WHERE tp.tournament_id = ?
       ORDER BY tp.score DESC, tp.joined_at ASC
       LIMIT 100`,
      [id]
    ) as any[];

    const prizes = await query('SELECT * FROM tournament_prizes WHERE tournament_id = ? ORDER BY rank_from ASC', [id]);

    let isJoined = false;
    if (uid) {
      const entry = await get('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [id, uid]);
      isJoined = !!entry;
    }

    res.json({
      success: true,
      tournament: {
        ...tournament,
        requirements: tournament.requirements ? JSON.parse(tournament.requirements) : null,
        isJoined
      },
      leaderboard,
      prizes
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Join a tournament
 */
router.post('/tournaments/:id/join', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    await transaction(async (conn) => {
      // 1. Check tournament existence and status
      const tournament = await get('SELECT * FROM tournaments WHERE id = ?', [id], conn) as any;
      if (!tournament) throw new Error('Tournament not found');
      if (tournament.status !== 'scheduled' && tournament.status !== 'active') {
        throw new Error('Tournament is no longer open for joining');
      }

      // 2. Check if already joined
      const existing = await get('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [id, uid], conn);
      if (existing) throw new Error('Already joined this tournament');

      // 3. Check capacity
      if (tournament.max_players > 0) {
        const count = await get('SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ?', [id], conn) as any;
        if (count.cnt >= tournament.max_players) throw new Error('Tournament is full');
      }

      // 4. Check user balance for entry fee
      const fee = new Big(tournament.entry_fee || 0);
      if (fee.gt(0)) {
        const user = await get('SELECT real_balance FROM users WHERE uid = ?', [uid], conn) as any;
        const balance = new Big(user.real_balance || 0);
        if (balance.lt(fee)) throw new Error('Insufficient balance for entry fee');

        // Deduct fee
        const newBalance = balance.minus(fee).toFixed(2);
        await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, uid], conn);
        
        // Record transaction
        await run(
          "INSERT INTO transactions (user_id, type, amount, status, method, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uid, 'tournament_entry', fee.toString(), 'completed', 'wallet', `Entry fee for tournament: ${tournament.title}`, Date.now()],
          conn
        );
      }

      // 5. Add participant
      await run(
        'INSERT INTO tournament_participants (tournament_id, user_id, joined_at) VALUES (?, ?, ?)',
        [id, uid, Date.now()],
        conn
      );
    });

    res.json({ success: true, message: 'Successfully joined tournament' });
  } catch (err: any) {
    logger.error(`Join tournament failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Seed initial tournaments
 */
export async function seedTournaments() {
  try {
    const existing = await get('SELECT COUNT(*) as cnt FROM tournaments') as any;
    if (existing && existing.cnt > 0) return;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    const sampleTournaments = [
      {
        id: 't-daily-free',
        type: 'Daily Free',
        title: 'Daily Freebie Blast',
        description: 'Join the daily free tournament and win real cash prizes! No entry fee required.',
        banner_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=1000',
        prize_pool: 100,
        entry_fee: 0,
        min_players: 10,
        max_players: 1000,
        start_time: now + oneHour,
        end_time: now + oneDay,
        status: 'scheduled',
        is_locked: 0,
        requirements: JSON.stringify({ minBalance: 0 })
      },
      {
        id: 't-weekly-pro',
        type: 'Weekly',
        title: 'Weekly Pro Challenge',
        description: 'Compete with the best for a massive prize pool. Show your trading skills!',
        banner_url: 'https://images.unsplash.com/photo-1611974714851-48206138473c?auto=format&fit=crop&q=80&w=1000',
        prize_pool: 5000,
        entry_fee: 10,
        min_players: 50,
        max_players: 5000,
        start_time: now + (2 * oneDay),
        end_time: now + (9 * oneDay),
        status: 'scheduled',
        is_locked: 1,
        requirements: JSON.stringify({ minBalance: 100, kycRequired: true })
      },
      {
        id: 't-prestige-elite',
        type: 'Prestige',
        title: 'Elite Prestige Cup',
        description: 'The ultimate tournament for our VIP traders. High stakes, higher rewards.',
        banner_url: 'https://images.unsplash.com/photo-1633151245064-2f58ad24da4d?auto=format&fit=crop&q=80&w=1000',
        prize_pool: 25000,
        entry_fee: 100,
        min_players: 10,
        max_players: 100,
        start_time: now + (7 * oneDay),
        end_time: now + (14 * oneDay),
        status: 'scheduled',
        is_locked: 1,
        requirements: JSON.stringify({ minBalance: 1000, statusRequired: 'VIP' })
      }
    ];

    for (const t of sampleTournaments) {
      await run(
        `INSERT INTO tournaments (id, type, title, description, banner_url, prize_pool, entry_fee, min_players, max_players, start_time, end_time, status, is_locked, requirements, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.type, t.title, t.description, t.banner_url, t.prize_pool, t.entry_fee, t.min_players, t.max_players, t.start_time, t.end_time, t.status, t.is_locked, t.requirements, now]
      );
      
      // Seed some sample prizes for each
      const prizePool = t.prize_pool;
      await run('INSERT INTO tournament_prizes (tournament_id, rank_from, rank_to, prize_amount) VALUES (?, ?, ?, ?)', [t.id, 1, 1, prizePool * 0.5]);
      await run('INSERT INTO tournament_prizes (tournament_id, rank_from, rank_to, prize_amount) VALUES (?, ?, ?, ?)', [t.id, 2, 2, prizePool * 0.2]);
      await run('INSERT INTO tournament_prizes (tournament_id, rank_from, rank_to, prize_amount) VALUES (?, ?, ?, ?)', [t.id, 3, 3, prizePool * 0.1]);
    }
    
    logger.info('Tournaments seeded successfully');
  } catch (err: any) {
    logger.error(`Seeding tournaments failed: ${err.message}`);
  }
}

export default router;
