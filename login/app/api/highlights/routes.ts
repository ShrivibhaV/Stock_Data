// app/api/highlights/route.ts
//
// Returns trust-building highlights for the login page:
//   breakouts52w  — EQ stocks at or near their 52-week high today
//   top_weekly    — top 5 EQ performers by 1W return (for rotating card)
//   trading_days  — total distinct trading dates in the database

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const client = await pool.connect()
    try {
      const { rows } = await client.query<{
        breakouts52w:  string
        trading_days:  string
      }>(`
        WITH latest AS (
          SELECT MAX(calculation_date) AS dt FROM returns_analysis
        ),
        eq_latest AS (
          SELECT r.symbol, r.current_price, r.return_1w, r.price_1y_ago
          FROM returns_analysis r
          JOIN security s ON r.symbol = s.symbol
          WHERE r.calculation_date = (SELECT dt FROM latest)
            AND s.code = 'EQ'
            AND r.current_price IS NOT NULL
        ),
        -- 52-week high breakouts: current price within 2% of 1-year high
        breakouts AS (
          SELECT COUNT(*) AS cnt
          FROM eq_latest
          WHERE price_1y_ago IS NOT NULL
            AND current_price >= price_1y_ago * 0.98
        ),
        -- Total distinct trading dates in DB
        days AS (
          SELECT COUNT(DISTINCT trading_date)::text AS cnt
          FROM daily_stock_data
        )
        SELECT
          (SELECT cnt::text FROM breakouts) AS breakouts52w,
          (SELECT cnt        FROM days)     AS trading_days
      `)

      // Top 5 weekly performers (separate query for clarity)
      const { rows: topRows } = await client.query<{
        symbol:        string
        current_price: string
        return_1w:     string
      }>(`
        SELECT r.symbol, r.current_price::text, r.return_1w::text
        FROM returns_analysis r
        JOIN security s ON r.symbol = s.symbol
        WHERE r.calculation_date = (SELECT MAX(calculation_date) FROM returns_analysis)
          AND s.code = 'EQ'
          AND r.return_1w IS NOT NULL
          AND r.current_price IS NOT NULL
          AND r.current_price > 10        -- exclude sub-penny stocks
        ORDER BY r.return_1w DESC
        LIMIT 5
      `)

      const r = rows[0]
      return NextResponse.json({
        breakouts52w:  parseInt(r?.breakouts52w ?? '0'),
        trading_days:  parseInt(r?.trading_days ?? '0'),
        top_weekly: topRows.map(t => ({
          symbol:        t.symbol,
          current_price: parseFloat(t.current_price),
          return_1w:     parseFloat(t.return_1w),
        })),
      })
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/highlights] DB error:', message)
    return NextResponse.json({
      breakouts52w: 0,
      trading_days: 0,
      top_weekly: [],
    }, { status: 500 })
  }
}