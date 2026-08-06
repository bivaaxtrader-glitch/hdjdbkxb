import { get, query } from '../src/db/mysql-db.ts';

async function test() {
  try {
    const data = await query('SELECT * FROM kyc_requests');
    console.log("Data:", data);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
