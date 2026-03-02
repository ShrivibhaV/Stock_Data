// app/api/ticker/route.ts
import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'   // always fresh, never cached

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            // Top 20 most traded stocks by turnover on the latest trading date
            // Joined with returns_analysis to get the 1D change
            const { rows } = await client.query<{
                symbol: string
                close_price: string
                prev_close: string
                turnover_lacs: string
            }>(`
        SELECT
          d.symbol,
          d.close_price::text,
          d.prev_close::text,
          d.turnover_lacs::text
        FROM daily_stock_data d
        WHERE d.trading_date = (
          SELECT MAX(trading_date) FROM daily_stock_data
        )
          AND d.code = 'EQ'
          AND d.turnover_lacs IS NOT NULL
          AND d.prev_close IS NOT NULL
          AND d.prev_close > 0
          AND d.close_price IS NOT NULL
        ORDER BY d.turnover_lacs DESC
        LIMIT 20
      `)

            const items = rows.map(r => {
                const close = parseFloat(r.close_price)
                const prev = parseFloat(r.prev_close)
                const change = close - prev
                const pct = (change / prev) * 100
                const up = change >= 0
                // turnover_lacs → crores (1 lac = 0.01 crore)
                const turnoverCr = (parseFloat(r.turnover_lacs) / 100).toFixed(0)

                return {
                    sym: r.symbol,
                    price: close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    ch: `${up ? '+' : ''}${change.toFixed(2)}`,
                    pct: `${up ? '+' : ''}${pct.toFixed(2)}%`,
                    up,
                    turnover: turnoverCr,
                }
            })

            return NextResponse.json(items)
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/ticker] DB error:', message)
        return NextResponse.json([], { status: 500 })
    }
}