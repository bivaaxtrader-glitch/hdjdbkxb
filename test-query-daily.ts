import { query } from './src/db/mysql-db.ts';

const test = async () => {
    try {
        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        const daily = await query(`
          SELECT t.user_id, SUM(t.payout_amount - t.amount) as profit,
          COALESCE(u.nickname, u.display_name) as display_name, u.photo_url, u.country, u.country_code
          FROM trades t
          JOIN users u ON t.user_id = u.uid
          WHERE (t.account_type = 'real' OR t.is_demo = 0) AND t.status IN ('won', 'lost', 'draw')
          AND t.settled_at >= ?
          GROUP BY t.user_id
          ORDER BY profit DESC
          LIMIT 20
        `, [oneDayAgo]);
        console.log("Daily:", daily);
    } catch (e) {
        console.error("Test failed:", e);
    }
};
test();
