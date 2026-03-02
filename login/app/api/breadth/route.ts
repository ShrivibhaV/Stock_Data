// app/api/breadth/route.ts
import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const client = await pool.connect()
    try {
      const { rows } = await client.query<{
        trading_date:      string
        total:             string
        gainers:           string
        losers:            string
        unchanged:         string
        avg_return_1d:     string
        advances_pct:      string
        total_turnover_cr: string
        top_gainer:        string
        top_gainer_pct:    string
        top_loser:         string
        top_loser_pct:     string
      }>(`
        WITH latest_date AS (
          SELECT MAX(trading_date) AS dt FROM daily_stock_data
        ),
        day_data AS (
          SELECT
            d.symbol,
            d.trading_date,
            d.close_price,
            d.prev_close,
            d.turnover_lacs,
            CASE
              WHEN d.prev_close > 0
              THEN ROUND(((d.close_price - d.prev_close) / d.prev_close * 100)::NUMERIC, 4)
              ELSE NULL
            END AS return_1d
          FROM daily_stock_data d
          JOIN security s ON d.symbol = s.symbol
          WHERE d.trading_date = (SELECT dt FROM latest_date)
            AND s.code = 'EQ'
            AND d.close_price IS NOT NULL
            AND d.prev_close  IS NOT NULL
            AND d.prev_close  > 0
        ),
        breadth AS (
          SELECT
            trading_date::text                                        AS trading_date,
            COUNT(*)::text                                            AS total,
            COUNT(CASE WHEN return_1d > 0  THEN 1 END)::text         AS gainers,
            COUNT(CASE WHEN return_1d < 0  THEN 1 END)::text         AS losers,
            COUNT(CASE WHEN return_1d = 0  THEN 1 END)::text         AS unchanged,
            ROUND(AVG(return_1d)::NUMERIC, 4)::text                  AS avg_return_1d,
            ROUND((
              COUNT(CASE WHEN return_1d > 0 THEN 1 END)::DECIMAL
              / NULLIF(COUNT(*), 0) * 100
            )::NUMERIC, 1)::text                                      AS advances_pct,
            ROUND((SUM(turnover_lacs) / 100)::NUMERIC, 0)::text      AS total_turnover_cr
          FROM day_data
          GROUP BY trading_date
        ),
        top_g AS (
          SELECT symbol, return_1d FROM day_data
          WHERE return_1d IS NOT NULL
          ORDER BY return_1d DESC LIMIT 1
        ),
        top_l AS (
          SELECT symbol, return_1d FROM day_data
          WHERE return_1d IS NOT NULL
          ORDER BY return_1d ASC LIMIT 1
        )
        SELECT
          b.trading_date,
          b.total, b.gainers, b.losers, b.unchanged,
          b.avg_return_1d, b.advances_pct, b.total_turnover_cr,
          g.symbol          AS top_gainer,
          g.return_1d::text AS top_gainer_pct,
          l.symbol          AS top_loser,
          l.return_1d::text AS top_loser_pct
        FROM breadth b, top_g g, top_l l
      `)

      if (!rows.length) return NextResponse.json(null)
      const r = rows[0]
      return NextResponse.json({
        trading_date:      r.trading_date,
        total:             parseInt(r.total),
        gainers:           parseInt(r.gainers),
        losers:            parseInt(r.losers),
        unchanged:         parseInt(r.unchanged),
        avg_return_1d:     parseFloat(r.avg_return_1d),
        advances_pct:      parseFloat(r.advances_pct),
        top_gainer:        r.top_gainer,
        top_gainer_pct:    parseFloat(r.top_gainer_pct),
        top_loser:         r.top_loser,
        top_loser_pct:     parseFloat(r.top_loser_pct),
        total_turnover_cr: parseFloat(r.total_turnover_cr),
      })
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/breadth] DB error:', message)
    return NextResponse.json(null, { status: 500 })
  }
}