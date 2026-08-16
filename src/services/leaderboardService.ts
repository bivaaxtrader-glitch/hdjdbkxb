import { get, query, run } from '../db/mysql-db.ts';
import { getIO } from './socketService.ts';

export const updateLeaderboardStats = async (userId: string, tradeStatus: 'won' | 'lost' | 'draw', profit: number, volume: number, conn?: any) => {
  try {
    const stat = await get('SELECT * FROM leaderboard_stats WHERE user_id = ?', [userId], conn) as any;
    const now = Date.now();
    
    if (!stat) {
      const isWin = tradeStatus === 'won';
      const currentStreak = isWin ? 1 : (tradeStatus === 'lost' ? -1 : 0);
      const won = isWin ? 1 : 0;
      const lost = tradeStatus === 'lost' ? 1 : 0;
      const draw = tradeStatus === 'draw' ? 1 : 0;
      const roi = volume > 0 ? (profit / volume) * 100 : 0;

      await run(`
        INSERT INTO leaderboard_stats (
          user_id, total_profit, total_trades, won_trades, lost_trades, draw_trades,
          total_volume, current_streak, max_streak, roi, last_trade_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, profit, 1, won, lost, draw, volume, currentStreak, isWin ? 1 : 0, roi, now], conn);
    } else {
      let currentStreak = stat.current_streak || 0;
      let maxStreak = stat.max_streak || 0;

      if (tradeStatus === 'won') {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (tradeStatus === 'lost') {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      } else {
        currentStreak = 0; // Draw resets streak
      }

      const newVolume = (stat.total_volume || 0) + volume;
      const newProfit = (stat.total_profit || 0) + profit;
      const newRoi = newVolume > 0 ? (newProfit / newVolume) * 100 : 0;

      await run(`
        UPDATE leaderboard_stats SET 
          total_profit = total_profit + ?,
          total_trades = total_trades + 1,
          won_trades = won_trades + ?,
          lost_trades = lost_trades + ?,
          draw_trades = draw_trades + ?,
          total_volume = ?,
          current_streak = ?,
          max_streak = ?,
          roi = ?,
          last_trade_at = ?
        WHERE user_id = ?
      `, [
        profit, 
        tradeStatus === 'won' ? 1 : 0,
        tradeStatus === 'lost' ? 1 : 0,
        tradeStatus === 'draw' ? 1 : 0,
        newVolume, currentStreak, maxStreak, newRoi, now, userId
      ], conn);
    }
  } catch (err) {
    console.error('Error updating leaderboard stats:', err);
  }
};

function seedRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const fetchLeaderboards = async () => {
  let allTime: any[] = [];
  let winRate: any[] = [];
  let streaks: any[] = [];
  let daily: any[] = [];
  let weekly: any[] = [];
  let monthly: any[] = [];

  try {
    // Ensure leaderboard_stats table exists if not already
    await run(`
      CREATE TABLE IF NOT EXISTS leaderboard_stats (
        user_id TEXT PRIMARY KEY,
        total_profit NUMERIC DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        won_trades INTEGER DEFAULT 0,
        lost_trades INTEGER DEFAULT 0,
        draw_trades INTEGER DEFAULT 0,
        total_volume NUMERIC DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        max_streak INTEGER DEFAULT 0,
        roi NUMERIC DEFAULT 0,
        last_trade_at INTEGER
      )
    `).catch(() => {});

    // 1. All Time Top Profit
    try {
      allTime = await query(`
        SELECT l.user_id, 
               CAST(l.total_profit AS REAL) as total_profit, 
               l.total_trades, l.won_trades, l.lost_trades,
               CAST(u.real_balance AS REAL) as balance,
               COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
        FROM leaderboard_stats l
        JOIN users u ON l.user_id = u.uid
        WHERE l.total_profit > 0
        ORDER BY total_profit DESC
        LIMIT 100
      `) || [];
    } catch (e) {
      console.error('Error fetching allTime leaderboard:', e);
      allTime = [];
    }

    // 2. Highest Win Rate (min 10 trades)
    try {
      winRate = await query(`
        SELECT l.*, COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code,
        CAST(l.won_trades AS REAL) / CAST(l.total_trades AS REAL) * 100 as win_percentage
        FROM leaderboard_stats l
        JOIN users u ON l.user_id = u.uid
        WHERE l.total_trades >= 10
        ORDER BY win_percentage DESC
        LIMIT 100
      `) || [];
    } catch (e) {
      console.error('Error fetching winRate leaderboard:', e);
      winRate = [];
    }

    // 3. Current Max Streak
    try {
      streaks = await query(`
        SELECT l.*, COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
        FROM leaderboard_stats l
        JOIN users u ON l.user_id = u.uid
        ORDER BY CAST(l.max_streak AS INTEGER) DESC
        LIMIT 100
      `) || [];
    } catch (e) {
      console.error('Error fetching streaks leaderboard:', e);
      streaks = [];
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayTimestamp = Math.floor(startOfDay.getTime() / 1000);
    
    try {
      daily = await query(`
        SELECT t.user_id, 
               SUM(CASE WHEN t.status = 'won' THEN (CAST(COALESCE(t.payout_amount, 0) AS REAL) - CAST(t.amount AS REAL)) ELSE -CAST(t.amount AS REAL) END) as profit,
               CAST(u.real_balance AS REAL) as balance,
               COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
        FROM trades t
        JOIN users u ON t.user_id = u.uid
        WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
        AND t.settled_at >= ?
        GROUP BY t.user_id
        HAVING profit > 0
        ORDER BY profit DESC
        LIMIT 100
      `, [startOfDayTimestamp]) || [];
    } catch (e) {
      console.error('Error fetching daily leaderboard:', e);
      daily = [];
    }

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    try {
      weekly = await query(`
        SELECT t.user_id, 
               SUM(CASE WHEN t.status = 'won' THEN (CAST(COALESCE(t.payout_amount, 0) AS REAL) - CAST(t.amount AS REAL)) ELSE -CAST(t.amount AS REAL) END) as profit,
               CAST(u.real_balance AS REAL) as balance,
               COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
        FROM trades t
        JOIN users u ON t.user_id = u.uid
        WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
        AND t.settled_at >= ?
        GROUP BY t.user_id
        HAVING profit > 0
        ORDER BY profit DESC
        LIMIT 100
      `, [sevenDaysAgo]) || [];
    } catch (e) {
      console.error('Error fetching weekly leaderboard:', e);
      weekly = [];
    }

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    try {
      monthly = await query(`
        SELECT t.user_id, 
               SUM(CASE WHEN t.status = 'won' THEN (CAST(COALESCE(t.payout_amount, 0) AS REAL) - CAST(t.amount AS REAL)) ELSE -CAST(t.amount AS REAL) END) as profit,
               CAST(u.real_balance AS REAL) as balance,
               COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
        FROM trades t
        JOIN users u ON t.user_id = u.uid
        WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
        AND t.settled_at >= ?
        GROUP BY t.user_id
        HAVING profit > 0
        ORDER BY profit DESC
        LIMIT 100
      `, [thirtyDaysAgo]) || [];
    } catch (e) {
      console.error('Error fetching monthly leaderboard:', e);
      monthly = [];
    }

    const nowObj = new Date();
    const dateStr = nowObj.toISOString().split('T')[0];
    const year = nowObj.getFullYear();
    const month = nowObj.getMonth();
    const day = nowObj.getDate();
    const hour = nowObj.getHours();
    const minute = nowObj.getMinutes();

    // Current 30-minute step in the day (0 to 47)
    const currentStep = Math.floor((hour * 60 + minute) / 30);

    const fakeUsers = [
      { user_id: 'fake_1', display_name: 'CryptoKing', photo_url: '', country: 'United States', country_code: 'us', base_balance: 12450.50 },
      { user_id: 'fake_2', display_name: 'MoonWalker', photo_url: '', country: 'Brazil', country_code: 'br', base_balance: 8940.20 },
      { user_id: 'fake_3', display_name: 'TradeMaster', photo_url: '', country: 'India', country_code: 'in', base_balance: 5670.80 },
      { user_id: 'fake_4', display_name: 'BullRider', photo_url: '', country: 'Germany', country_code: 'de', base_balance: 14500.00 },
      { user_id: 'fake_5', display_name: 'BearSlayer', photo_url: '', country: 'Canada', country_code: 'ca', base_balance: 3200.50 },
      { user_id: 'fake_6', display_name: 'ProfitPro', photo_url: '', country: 'Australia', country_code: 'au', base_balance: 6780.00 },
      { user_id: 'fake_7', display_name: 'MarketWizard', photo_url: '', country: 'Japan', country_code: 'jp', base_balance: 1240.00 },
      { user_id: 'fake_8', display_name: 'ChartGuru', photo_url: '', country: 'France', country_code: 'fr', base_balance: 4500.00 },
      { user_id: 'fake_9', display_name: 'TrendHunter', photo_url: '', country: 'United Kingdom', country_code: 'gb', base_balance: 980.00 },
      { user_id: 'fake_10', display_name: 'GoldMiner', photo_url: '', country: 'South Africa', country_code: 'za', base_balance: 2340.00 },
      { user_id: 'fake_11', display_name: 'SignalSender', photo_url: '', country: 'Italy', country_code: 'it', base_balance: 5600.00 },
      { user_id: 'fake_12', display_name: 'FastTrader', photo_url: '', country: 'Spain', country_code: 'es', base_balance: 3200.00 },
      { user_id: 'fake_13', display_name: 'ScalpKing', photo_url: '', country: 'Mexico', country_code: 'mx', base_balance: 1500.00 },
      { user_id: 'fake_14', display_name: 'OptionOpener', photo_url: '', country: 'Korea', country_code: 'kr', base_balance: 850.00 },
      { user_id: 'fake_15', display_name: 'BinaryBoss', photo_url: '', country: 'Indonesia', country_code: 'id', base_balance: 450.00 },
      { user_id: 'fake_16', display_name: 'CryptoClimber', photo_url: '', country: 'Vietnam', country_code: 'vn', base_balance: 1200.00 },
      { user_id: 'fake_17', display_name: 'ForexFiend', photo_url: '', country: 'Thailand', country_code: 'th', base_balance: 500.00 },
      { user_id: 'fake_18', display_name: 'StockStar', photo_url: '', country: 'Singapore', country_code: 'sg', base_balance: 2500.00 },
      { user_id: 'fake_19', display_name: 'CoinCollector', photo_url: '', country: 'Malaysia', country_code: 'my', base_balance: 150.00 },
      { user_id: 'fake_20', display_name: 'NewbieTrader', photo_url: '', country: 'Turkey', country_code: 'tr', base_balance: 100.00 }
    ];

    // 1. Assign each user a daily random rank score so order shuffles EVERY SINGLE DAY
    const userDailyScores = fakeUsers.map(u => {
      const dailyRand = seedRandom(`daily_score_${dateStr}_${u.user_id}`);
      return {
        user: u,
        score: dailyRand()
      };
    });

    // Sort users by daily random score so rankings change every day
    userDailyScores.sort((a, b) => b.score - a.score);

    // 2. Generate EOD target and 30-minute step progression for each user
    const processedFakeUsers = userDailyScores.map((item, rank) => {
      const u = item.user;
      const userRand = seedRandom(`target_${dateStr}_${u.user_id}`);
      
      // Top rank gets ~$20,000 - $22,000 EOD profit.
      // Rank 20 gets ~$120 - $250 EOD profit.
      const maxProfit = 20000 + userRand() * 2200; // ~ $20,000 to $22,200
      const minProfit = 120 + userRand() * 130;    // ~ $120 to $250
      
      // Non-linear power curve for realistic rank spacing
      const rankRatio = (19 - rank) / 19;
      const eodTargetProfit = minProfit + Math.pow(rankRatio, 2.3) * (maxProfit - minProfit);

      // Accumulate 30-minute step weights up to currentStep (0..47)
      let totalWeight = 0;
      let accumulatedWeight = 0;
      for (let s = 0; s < 48; s++) {
        const stepRand = seedRandom(`step_${dateStr}_${u.user_id}_${s}`);
        const weight = 0.3 + stepRand() * 1.4;
        totalWeight += weight;
        if (s <= currentStep) {
          accumulatedWeight += weight;
        }
      }

      const progressRatio = accumulatedWeight / totalWeight;
      const dailyProfit = parseFloat((eodTargetProfit * progressRatio).toFixed(2));

      // Weekly & Monthly calculations scaling off EOD + historical seed
      const weekSeed = `${year}-W${Math.ceil((day + 7) / 7)}`;
      const weeklyRand = seedRandom(`weekly_${weekSeed}_${u.user_id}`);
      const weeklyProfit = parseFloat((dailyProfit * (3.5 + weeklyRand() * 2.5) + (1500 + weeklyRand() * 25000)).toFixed(2));

      const monthlyRand = seedRandom(`monthly_${year}_${month}_${u.user_id}`);
      const monthlyProfit = parseFloat((weeklyProfit * (2.8 + monthlyRand() * 2.2) + (5000 + monthlyRand() * 80000)).toFixed(2));

      const allTimeRand = seedRandom(`alltime_${u.user_id}`);
      const allTimeProfit = parseFloat((monthlyProfit * (3 + allTimeRand() * 4) + (20000 + allTimeRand() * 150000)).toFixed(2));

      const winRate = Math.min(98, Math.max(68, Math.floor(74 + (userRand() * 20))));
      const totalTrades = Math.max(12, Math.floor((dailyProfit / 150) + userRand() * 40));
      const wonTrades = Math.floor(totalTrades * (winRate / 100));
      const lostTrades = totalTrades - wonTrades;

      return {
        user_id: u.user_id,
        display_name: u.display_name,
        photo_url: u.photo_url,
        country: u.country,
        country_code: u.country_code,
        balance: u.base_balance + dailyProfit,
        total_trades: totalTrades,
        won_trades: wonTrades,
        lost_trades: lostTrades,
        win_rate: winRate,
        dailyProfit,
        weeklyProfit,
        monthlyProfit,
        allTimeProfit
      };
    });

    // Merge fake users into allTime
    const finalAllTime = [...allTime, ...processedFakeUsers.map(u => ({
      user_id: u.user_id,
      display_name: u.display_name,
      total_profit: u.allTimeProfit,
      total_trades: u.total_trades * 10,
      won_trades: u.won_trades * 10,
      lost_trades: u.lost_trades * 10,
      photo_url: u.photo_url,
      country: u.country,
      country_code: u.country_code,
      balance: u.balance,
      win_rate: u.win_rate
    }))].sort((a, b) => Number(b.total_profit) - Number(a.total_profit)).slice(0, 20);

    // Merge fake users into daily/weekly/monthly
    const dailyWithFake = [...daily, ...processedFakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: u.dailyProfit, 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: u.win_rate
    }))].sort((a, b) => Number(b.profit) - Number(a.profit)).slice(0, 20);

    const weeklyWithFake = [...weekly, ...processedFakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: u.weeklyProfit, 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: u.win_rate
    }))].sort((a, b) => Number(b.profit) - Number(a.profit)).slice(0, 20);

    const monthlyWithFake = [...monthly, ...processedFakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: u.monthlyProfit, 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: u.win_rate
    }))].sort((a, b) => Number(b.profit) - Number(a.profit)).slice(0, 20);

    return { 
      allTime: finalAllTime, 
      winRate: winRate || [], 
      streaks: streaks || [], 
      daily: dailyWithFake, 
      weekly: weeklyWithFake, 
      monthly: monthlyWithFake 
    };

  } catch (err) {
    console.error('Failed to fetch leaderboards:', err);
    return { allTime: [], winRate: [], streaks: [], daily: [], weekly: [], monthly: [] };
  }
};

export const broadcastLeaderboards = async () => {
  const data = await fetchLeaderboards();
  if (data) {
    const io = getIO();
    io.emit('leaderboard_update', data);
  }
};
