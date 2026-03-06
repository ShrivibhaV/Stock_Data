const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Stock_Data',
  password: '12345',
  port: 5433,
});

async function checkDate() {
  try {
    const res = await pool.query('SELECT MAX(trading_date) as max_date FROM daily_stock_data');
    console.log('MAX_DATE_RESULT:', res.rows[0].max_date);
    const countRes = await pool.query('SELECT COUNT(*) as count FROM daily_stock_data');
    console.log('TOTAL_ROWS:', countRes.rows[0].count);
    const lastReliance = await pool.query("SELECT trading_date FROM daily_stock_data WHERE symbol = 'RELIANCE' ORDER BY trading_date DESC LIMIT 1");
    console.log('RELIANCE_LATEST:', lastReliance.rows[0] ? lastReliance.rows[0].trading_date : 'NONE');
  } catch (err) {
    console.error('DATABASE_ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

checkDate();
