// app/api/heatmap/route.ts
//
// Returns sector-level heatmap data for the login page.
// Groups EQ stocks by sector (security.sector).
// Falls back to return-magnitude buckets if sectors are mostly NULL.
//
// Each tile:
//   { label, count, avg_return, best_symbol, best_return, worst_return }

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface HeatmapTile {
    label: string
    count: number
    avg_return: number
    best_symbol: string
    best_return: number
    worst_return: number
}

export async function GET() {
    try {
        const client = await pool.connect()
        try {
            // ── Step 1: Try sector-based grouping ─────────────────────────────────
            const { rows: sectorRows } = await client.query<{
                label: string
                count: string
                avg_return: string
                best_symbol: string
                best_return: string
                worst_return: string
            }>(`
        WITH latest_date AS (
          SELECT MAX(trading_date) AS dt FROM daily_stock_data
        ),
        day_data AS (
          SELECT
            d.symbol,
            s.sector,
            ROUND(((d.close_price - d.prev_close) / NULLIF(d.prev_close, 0) * 100)::NUMERIC, 3) AS ret
          FROM daily_stock_data d
          JOIN security s ON d.symbol = s.symbol
          WHERE d.trading_date = (SELECT dt FROM latest_date)
            AND s.code = 'EQ'
            AND d.close_price IS NOT NULL
            AND d.prev_close  > 0
            AND s.sector IS NOT NULL
            AND s.sector <> ''
        ),
        sector_agg AS (
          SELECT
            sector                                          AS label,
            COUNT(*)                                        AS count,
            ROUND(AVG(ret)::NUMERIC, 3)                    AS avg_return,
            (ARRAY_AGG(symbol ORDER BY ret DESC))[1]       AS best_symbol,
            ROUND(MAX(ret)::NUMERIC, 3)                    AS best_return,
            ROUND(MIN(ret)::NUMERIC, 3)                    AS worst_return
          FROM day_data
          GROUP BY sector
          HAVING COUNT(*) >= 3
          ORDER BY avg_return DESC
        )
        SELECT * FROM sector_agg
        LIMIT 16
      `)

            // ── Step 2: If sectors not populated, fall back to return buckets ──────
            let tiles: HeatmapTile[]

            if (sectorRows.length >= 4) {
                // Enough real sector data
                tiles = sectorRows.map(r => ({
                    label: r.label,
                    count: parseInt(r.count),
                    avg_return: parseFloat(r.avg_return),
                    best_symbol: r.best_symbol,
                    best_return: parseFloat(r.best_return),
                    worst_return: parseFloat(r.worst_return),
                }))
            } else {
                // Fallback: group by return quintiles using readable labels
                const { rows: bucketRows } = await client.query<{
                    label: string
                    count: string
                    avg_return: string
                    best_symbol: string
                    best_return: string
                    worst_return: string
                }>(`
          WITH latest_date AS (
            SELECT MAX(trading_date) AS dt FROM daily_stock_data
          ),
          day_data AS (
            SELECT
              d.symbol,
              ROUND(((d.close_price - d.prev_close) / NULLIF(d.prev_close, 0) * 100)::NUMERIC, 3) AS ret
            FROM daily_stock_data d
            JOIN security s ON d.symbol = s.symbol
            WHERE d.trading_date = (SELECT dt FROM latest_date)
              AND s.code = 'EQ'
              AND d.close_price IS NOT NULL
              AND d.prev_close  > 0
          ),
          bucketed AS (
            SELECT
              symbol, ret,
              CASE
                WHEN ret >= 10  THEN 'Circuit Up (≥10%)'
                WHEN ret >= 5   THEN 'Strong Gainers (5–10%)'
                WHEN ret >= 2   THEN 'Moderate Gainers (2–5%)'
                WHEN ret >= 0.5 THEN 'Slight Gainers (0.5–2%)'
                WHEN ret >= -0.5 THEN 'Flat (±0.5%)'
                WHEN ret >= -2  THEN 'Slight Losers (−0.5 to −2%)'
                WHEN ret >= -5  THEN 'Moderate Losers (−2 to −5%)'
                WHEN ret >= -10 THEN 'Heavy Losers (−5 to −10%)'
                ELSE                  'Circuit Down (≤−10%)'
              END AS label,
              CASE
                WHEN ret >= 10  THEN 1
                WHEN ret >= 5   THEN 2
                WHEN ret >= 2   THEN 3
                WHEN ret >= 0.5 THEN 4
                WHEN ret >= -0.5 THEN 5
                WHEN ret >= -2  THEN 6
                WHEN ret >= -5  THEN 7
                WHEN ret >= -10 THEN 8
                ELSE                  9
              END AS bucket_order
            FROM day_data
            WHERE ret IS NOT NULL
          )
          SELECT
            label,
            COUNT(*)::text                                       AS count,
            ROUND(AVG(ret)::NUMERIC, 3)::text                   AS avg_return,
            (ARRAY_AGG(symbol ORDER BY ret DESC))[1]            AS best_symbol,
            ROUND(MAX(ret)::NUMERIC, 3)::text                   AS best_return,
            ROUND(MIN(ret)::NUMERIC, 3)::text                   AS worst_return
          FROM bucketed
          GROUP BY label, bucket_order
          HAVING COUNT(*) >= 2
          ORDER BY bucket_order ASC
        `)

                tiles = bucketRows.map(r => ({
                    label: r.label,
                    count: parseInt(r.count),
                    avg_return: parseFloat(r.avg_return),
                    best_symbol: r.best_symbol,
                    best_return: parseFloat(r.best_return),
                    worst_return: parseFloat(r.worst_return),
                }))
            }

            return NextResponse.json({ tiles, mode: sectorRows.length >= 4 ? 'sector' : 'bucket' })
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[/api/heatmap] DB error:', message)
        return NextResponse.json({ tiles: [], mode: 'error' }, { status: 500 })
    }
}
