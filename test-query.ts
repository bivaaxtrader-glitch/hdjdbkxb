import { query } from './src/db/mysql-db.ts';

const test = async () => {
    try {
        const result = await query('SELECT count(*) as count FROM trades');
        console.log("Trades count:", result);
    } catch (e) {
        console.error("Test failed:", e);
    }
};
test();
