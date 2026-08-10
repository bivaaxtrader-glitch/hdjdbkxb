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

export const fetchLeaderboards = async () => {
  try {
    // 1. All Time Top Profit
    console.log("Fetching allTime...");
    const allTime = await query(`
      SELECT l.user_id, 
             l.total_profit as total_profit, 
             l.total_trades, l.won_trades, l.lost_trades,
             u.real_balance as balance,
             COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
      FROM leaderboard_stats l
      JOIN users u ON l.user_id = u.uid
      ORDER BY total_profit DESC
      LIMIT 100
    `) || [];

    // 2. Highest Win Rate (min 10 trades)
    console.log("Fetching winRate...");
    const winRate = await query(`
      SELECT l.*, COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code,
      CAST(l.won_trades AS REAL) / l.total_trades * 100 as win_percentage
      FROM leaderboard_stats l
      JOIN users u ON l.user_id = u.uid
      WHERE l.total_trades >= 10
      ORDER BY win_percentage DESC
      LIMIT 100
    `) || [];

    // 3. Current Max Streak
    console.log("Fetching streaks...");
    const streaks = await query(`
      SELECT l.*, COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
      FROM leaderboard_stats l
      JOIN users u ON l.user_id = u.uid
      ORDER BY l.max_streak DESC
      LIMIT 100
    `) || [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayTimestamp = Math.floor(startOfDay.getTime() / 1000);
    
    console.log("Fetching daily...");
    const daily = await query(`
      SELECT t.user_id, 
             SUM(CASE WHEN t.status = 'won' THEN (t.payout_amount - t.amount) ELSE -t.amount END) as profit,
             u.real_balance as balance,
             COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
      FROM trades t
      JOIN users u ON t.user_id = u.uid
      WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
      AND t.settled_at >= ?
      GROUP BY t.user_id
      ORDER BY profit DESC
      LIMIT 100
    `, [startOfDayTimestamp]) || [];

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    console.log("Fetching weekly...");
    const weekly = await query(`
      SELECT t.user_id, 
             SUM(CASE WHEN t.status = 'won' THEN (t.payout_amount - t.amount) ELSE -t.amount END) as profit,
             u.real_balance as balance,
             COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
      FROM trades t
      JOIN users u ON t.user_id = u.uid
      WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
      AND t.settled_at >= ?
      GROUP BY t.user_id
      ORDER BY profit DESC
      LIMIT 100
    `, [sevenDaysAgo]) || [];

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    console.log("Fetching monthly...");
    const monthly = await query(`
      SELECT t.user_id, 
             SUM(CASE WHEN t.status = 'won' THEN (t.payout_amount - t.amount) ELSE -t.amount END) as profit,
             u.real_balance as balance,
             COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
      FROM trades t
      JOIN users u ON t.user_id = u.uid
      WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
      AND t.settled_at >= ?
      GROUP BY t.user_id
      ORDER BY profit DESC
      LIMIT 100
    `, [thirtyDaysAgo]) || [];

    const fakeUsers = [
      { user_id: 'fake_1', display_name: 'CryptoKing', total_profit: 224537.45, total_trades: 120, won_trades: 100, lost_trades: 20, photo_url: '', country: 'United States', country_code: 'us', balance: 12450.50 },
      { user_id: 'fake_2', display_name: 'MoonWalker', total_profit: 185429.67, total_trades: 150, won_trades: 130, lost_trades: 20, photo_url: '', country: 'Brazil', country_code: 'br', balance: 8940.20 },
      { user_id: 'fake_3', display_name: 'TradeMaster', total_profit: 142055.23, total_trades: 200, won_trades: 180, lost_trades: 20, photo_url: '', country: 'India', country_code: 'in', balance: 5670.80 },
      { user_id: 'fake_4', display_name: 'BullRider', total_profit: 112581.18, total_trades: 110, won_trades: 90, lost_trades: 20, photo_url: '', country: 'Germany', country_code: 'de', balance: 14500.00 },
      { user_id: 'fake_5', display_name: 'BearSlayer', total_profit: 89417.84, total_trades: 130, won_trades: 110, lost_trades: 20, photo_url: '', country: 'Canada', country_code: 'ca', balance: 3200.50 },
      { user_id: 'fake_6', display_name: 'ProfitPro', total_profit: 68512.39, total_trades: 90, won_trades: 80, lost_trades: 10, photo_url: '', country: 'Australia', country_code: 'au', balance: 6780.00 },
      { user_id: 'fake_7', display_name: 'MarketWizard', total_profit: 52436.71, total_trades: 100, won_trades: 85, lost_trades: 15, photo_url: '', country: 'Japan', country_code: 'jp', balance: 1240.00 },
      { user_id: 'fake_8', display_name: 'ChartGuru', total_profit: 42519.82, total_trades: 120, won_trades: 100, lost_trades: 20, photo_url: '', country: 'France', country_code: 'fr', balance: 4500.00 },
      { user_id: 'fake_9', display_name: 'TrendHunter', total_profit: 33814.95, total_trades: 110, won_trades: 95, lost_trades: 15, photo_url: '', country: 'United Kingdom', country_code: 'gb', balance: 980.00 },
      { user_id: 'fake_10', display_name: 'GoldMiner', total_profit: 26581.42, total_trades: 95, won_trades: 80, lost_trades: 15, photo_url: '', country: 'South Africa', country_code: 'za', balance: 2340.00 },
      { user_id: 'fake_11', display_name: 'SignalSender', total_profit: 21245.33, total_trades: 80, won_trades: 70, lost_trades: 10, photo_url: '', country: 'Italy', country_code: 'it', balance: 5600.00 },
      { user_id: 'fake_12', display_name: 'FastTrader', total_profit: 18419.67, total_trades: 70, won_trades: 60, lost_trades: 10, photo_url: '', country: 'Spain', country_code: 'es', balance: 3200.00 },
      { user_id: 'fake_13', display_name: 'ScalpKing', total_profit: 15632.14, total_trades: 60, won_trades: 55, lost_trades: 5, photo_url: '', country: 'Mexico', country_code: 'mx', balance: 1500.00 },
      { user_id: 'fake_14', display_name: 'OptionOpener', total_profit: 13247.58, total_trades: 50, won_trades: 45, lost_trades: 5, photo_url: '', country: 'Korea', country_code: 'kr', balance: 850.00 },
      { user_id: 'fake_15', display_name: 'BinaryBoss', total_profit: 11119.33, total_trades: 40, won_trades: 35, lost_trades: 5, photo_url: '', country: 'Indonesia', country_code: 'id', balance: 450.00 },
      { user_id: 'fake_16', display_name: 'CryptoClimber', total_profit: 9243.85, total_trades: 30, won_trades: 25, lost_trades: 5, photo_url: '', country: 'Vietnam', country_code: 'vn', balance: 1200.00 },
      { user_id: 'fake_17', display_name: 'ForexFiend', total_profit: 7418.91, total_trades: 25, won_trades: 20, lost_trades: 5, photo_url: '', country: 'Thailand', country_code: 'th', balance: 500.00 },
      { user_id: 'fake_18', display_name: 'StockStar', total_profit: 5812.44, total_trades: 20, won_trades: 15, lost_trades: 5, photo_url: '', country: 'Singapore', country_code: 'sg', balance: 2500.00 },
      { user_id: 'fake_19', display_name: 'CoinCollector', total_profit: 4419.62, total_trades: 15, won_trades: 10, lost_trades: 5, photo_url: '', country: 'Malaysia', country_code: 'my', balance: 150.00 },
      { user_id: 'fake_20', display_name: 'NewbieTrader', total_profit: 3122.87, total_trades: 5, won_trades: 3, lost_trades: 2, photo_url: '', country: 'Turkey', country_code: 'tr', balance: 100.00 }
    ];

    // Merge fake users into allTime
    const finalAllTime = [...(allTime as any[]), ...fakeUsers].map(u => ({
      ...u,
      win_rate: u.total_trades > 0 ? Math.floor((u.won_trades / u.total_trades) * 100) : (80 + Math.floor(Math.random() * 15))
    })).sort((a, b) => b.total_profit - a.total_profit).slice(0, 20);

    // Merge fake users into daily/weekly/monthly
    const dailyWithFake = [...(daily as any[]), ...fakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: parseFloat((u.total_profit * 0.12).toFixed(2)), 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: 80 + Math.floor(Math.random() * 15)
    }))].sort((a, b) => b.profit - a.profit).slice(0, 20);

    const weeklyWithFake = [...(weekly as any[]), ...fakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: parseFloat((u.total_profit * 0.45).toFixed(2)), 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: 80 + Math.floor(Math.random() * 15)
    }))].sort((a, b) => b.profit - a.profit).slice(0, 20);

    const monthlyWithFake = [...(monthly as any[]), ...fakeUsers.map(u => ({ 
      user_id: u.user_id, 
      profit: parseFloat((u.total_profit * 0.88).toFixed(2)), 
      display_name: u.display_name, 
      photo_url: u.photo_url, 
      country: u.country, 
      country_code: u.country_code,
      balance: u.balance,
      win_rate: 80 + Math.floor(Math.random() * 15)
    }))].sort((a, b) => b.profit - a.profit).slice(0, 20);

    return { allTime: finalAllTime, winRate, streaks, daily: dailyWithFake, weekly: weeklyWithFake, monthly: monthlyWithFake };

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
