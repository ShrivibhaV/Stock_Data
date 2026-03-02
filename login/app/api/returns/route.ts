// app/api/returns/route.ts
import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'  // never cache — always fresh

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            // Get the latest calculation_date available
            const { rows: dateRows } = await client.query<{ latest_date: string }>(`
        SELECT MAX(calculation_date)::text AS latest_date
        FROM returns_analysis
      `)
            const latestDate = dateRows[0]?.latest_date
            if (!latestDate) {
                return NextResponse.json({ date: null, rows: [] })
            }

            // Fetch all EQ-series symbols for that date with their return columns.
            // JOIN security filters out non-equity instruments (ETFs, G-Secs,
            // derivatives) that show extreme -90%+ moves on expiry/settlement days.
            const { rows } = await client.query<{
                symbol: string
                current_price: string
                return_1d: string | null
                return_1w: string | null
                return_1m: string | null
                return_3m: string | null
                return_6m: string | null
                return_1y: string | null
            }>(`
        SELECT
          r.symbol,
          r.current_price::text,
          r.return_1d::text,
          r.return_1w::text,
          r.return_1m::text,
          r.return_3m::text,
          r.return_6m::text,
          r.return_1y::text
        FROM returns_analysis r
        JOIN security s ON r.symbol = s.symbol
        WHERE r.calculation_date = $1
          AND r.current_price IS NOT NULL
          AND s.code = 'EQ'
        ORDER BY r.symbol ASC
      `, [latestDate])

            // Parse numeric strings into floats (nulls stay null)
            const parsed = rows.map(r => ({
                symbol: r.symbol,
                current_price: parseFloat(r.current_price),
                return_1d: r.return_1d != null ? parseFloat(r.return_1d) : null,
                return_1w: r.return_1w != null ? parseFloat(r.return_1w) : null,
                return_1m: r.return_1m != null ? parseFloat(r.return_1m) : null,
                return_3m: r.return_3m != null ? parseFloat(r.return_3m) : null,
                return_6m: r.return_6m != null ? parseFloat(r.return_6m) : null,
                return_1y: r.return_1y != null ? parseFloat(r.return_1y) : null,
            }))

            return NextResponse.json({ date: latestDate, rows: parsed })
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/returns] DB error:', message)
        return NextResponse.json(
            { error: 'Database connection failed', detail: message },
            { status: 500 }
        )
    }
}