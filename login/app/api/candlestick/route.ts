// app/api/candlestick/route.ts
//
// Returns the last 30 trading days of OHLC-style market data
// (open, high, low, close based on distribution of stock returns that day)
// Used to draw the candlestick chart on the login page.

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface CandlePoint {
    date: string
    open: number
    high: number
    low: number
    close: number
    positive: boolean
}

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            const { rows } = await client.query<{
                date: string
                open_val: string
                high_val: string
                low_val: string
                close_val: string
            }>(`
        WITH eq_symbols AS (
          SELECT symbol FROM security WHERE code = 'EQ'
        ),
        daily_stats AS (
          SELECT
            d.trading_date                                                AS date,
            ROUND(AVG(
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 3)                                               AS avg_ret,
            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 3)                                               AS p25_ret,
            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 3)                                               AS p75_ret,
            ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 3)                                               AS p10_ret,
            ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY
              CASE
                WHEN d.prev_close > 0
                THEN (d.close_price - d.prev_close) / d.prev_close * 100
                ELSE NULL
              END
            )::NUMERIC, 3)                                               AS p90_ret
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
          p25_ret::text    AS open_val,
          p90_ret::text    AS high_val,
          p10_ret::text    AS low_val,
          avg_ret::text    AS close_val
        FROM daily_stats
        ORDER BY date ASC
        LIMIT 30
      `)

            const candles: CandlePoint[] = rows.map(r => {
                const open = parseFloat(r.open_val)
                const close = parseFloat(r.close_val)
                const high = parseFloat(r.high_val)
                const low = parseFloat(r.low_val)
                return {
                    date: r.date,
                    open,
                    high,
                    low,
                    close,
                    positive: close >= open,
                }
            })

            return NextResponse.json(candles)
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/candlestick] DB error:', message)
        return NextResponse.json([], { status: 500 })
    }
}
