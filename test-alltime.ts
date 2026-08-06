import { query } from './src/db/mysql-db.ts';

const test = async () => {
    try {
        const allTime = await query(`
          SELECT l.*, COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
          FROM leaderboard_stats l
          JOIN users u ON l.user_id = u.uid
          ORDER BY l.total_profit DESC
          LIMIT 20
        `);
        console.log("AllTime:", allTime);
    } catch (e) {
        console.error("Test failed:", e);
    }
};
test();
