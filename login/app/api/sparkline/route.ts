// app/api/sparkline/route.ts
//
// Returns the last 30 trading days of average daily return across all
// EQ stocks — used to draw the area sparkline on the login page.
// Each point: { date: "2026-02-13", avg_return: -1.52 }

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            const { rows } = await client.query<{
                date: string
                avg_return: string
            }>(`
        WITH eq_symbols AS (
          SELECT symbol FROM security WHERE code = 'EQ'
        ),
        daily_avg AS (
          SELECT
            d.trading_date                                              AS date,
            ROUND(AVG(
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 4)                                             AS avg_return
          FROM daily_stock_data d
          JOIN eq_symbols e ON d.symbol = e.symbol
          WHERE d.close_price IS NOT NULL
            AND d.prev_close  IS NOT NULL
            AND d.prev_close  > 0
            AND d.trading_date >= (
              SELECT MAX(trading_date) - INTERVAL '45 days'
              FROM daily_stock_data
            )
          GROUP BY d.trading_date
          ORDER BY d.trading_date ASC
        )
        SELECT
          date::text,
          avg_return::text
        FROM daily_avg
        ORDER BY date ASC
        LIMIT 30
      `)

            const points = rows.map((r: { date: string; avg_return: string }) => ({
                date: r.date,
                avg_return: parseFloat(r.avg_return),
            }))

            return NextResponse.json(points)
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/sparkline] DB error:', message)
        return NextResponse.json([], { status: 500 })
    }
}
