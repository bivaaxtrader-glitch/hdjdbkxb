import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@${process.env.SQL_HOST}/${process.env.SQL_DB_NAME}`,
  });
  try {
    await client.connect();
    console.log('Connected successfully');
    const res = await client.query('SELECT NOW()');
    console.log('Query result:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
}

test();
