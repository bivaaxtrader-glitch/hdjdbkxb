import { query } from './src/db/mysql-db.ts';

const test = async () => {
    try {
        const trades = await query('SELECT * FROM trades');
        console.log("Trades:", trades);
    } catch (e) {
        console.error("Test failed:", e);
    }
};
test();
