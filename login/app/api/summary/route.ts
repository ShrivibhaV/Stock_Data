import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            const { rows } = await client.query<{
                latest_date: string
                total_symbols: string
                symbols_with_1d: string
                symbols_with_1w: string
                symbols_with_1m: string
                symbols_with_3m: string
            }>(`
        WITH latest AS (
          SELECT MAX(calculation_date) AS dt FROM returns_analysis
        )
        SELECT
          latest.dt::text                                  AS latest_date,
          COUNT(*)::text                                   AS total_symbols,
          COUNT(return_1d)::text                           AS symbols_with_1d,
          COUNT(return_1w)::text                           AS symbols_with_1w,
          COUNT(return_1m)::text                           AS symbols_with_1m,
          COUNT(return_3m)::text                           AS symbols_with_3m
        FROM returns_analysis, latest
        WHERE calculation_date = latest.dt
        GROUP BY latest.dt
      `)

            if (!rows.length) {
                return NextResponse.json({ latest_date: null, total_symbols: 0, symbols_with_1d: 0, symbols_with_1w: 0, symbols_with_1m: 0, symbols_with_3m: 0 })
            }

            const r = rows[0]
            return NextResponse.json({
                latest_date: r.latest_date,
                total_symbols: parseInt(r.total_symbols),
                symbols_with_1d: parseInt(r.symbols_with_1d),
                symbols_with_1w: parseInt(r.symbols_with_1w),
                symbols_with_1m: parseInt(r.symbols_with_1m),
                symbols_with_3m: parseInt(r.symbols_with_3m),
            })
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/summary] DB error:', message)
        return NextResponse.json(
            { error: 'Database connection failed', detail: message },
            { status: 500 }
        )
    }
}
