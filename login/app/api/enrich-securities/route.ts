// app/api/enrich-securities/route.ts
//
// GET  → returns current enrichment job status
// POST → starts an enrichment job that queries Yahoo Finance for each security
//        with missing company_name or sector, then updates the DB

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// ─── In-memory job state (resets on server restart) ───────────────────────────
type JobStatus = 'idle' | 'running' | 'done' | 'error'

let jobStatus: JobStatus = 'idle'
let jobTotal = 0
let jobProcessed = 0
let jobUpdated = 0
let jobErrors = 0
let jobLog: string[] = []
let jobStartTime: string | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}`
    console.log(line)
    jobLog.push(line)
    if (jobLog.length > 1000) jobLog = jobLog.slice(-1000)
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Build the Yahoo Finance search URL for a given symbol.
 * NSE symbols in the DB are stored without suffix (e.g. "RELIANCE").
 * Yahoo Finance search works best with "RELIANCE.NS".
 * If the symbol already contains a "." we use it as-is.
 */
function buildYahooUrl(symbol: string): string {
    const query = symbol.includes('.') ? symbol : `${symbol}.NS`
    return `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=1&newsCount=0`
}

/** Fetch company name & sector from Yahoo Finance search API. Returns null if not found. */
async function fetchYahooData(symbol: string): Promise<{ companyName: string; sector: string } | null> {
    const url = buildYahooUrl(symbol)
    try {
        const res = await fetch(url, {
            headers: {
                // Mimic a browser request to avoid being blocked
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10_000), // 10-second timeout per request
        })

        if (!res.ok) {
            log(`  [WARN] ${symbol}: HTTP ${res.status}`)
            return null
        }

        const data = await res.json()
        const quotes: unknown[] = data?.quotes ?? []

        if (!Array.isArray(quotes) || quotes.length === 0) {
            log(`  [SKIP] ${symbol}: no quotes returned`)
            return null
        }

        const q = quotes[0] as Record<string, unknown>
        const companyName = typeof q.longname === 'string' ? q.longname.trim() : ''
        const sector = typeof q.industryDisp === 'string' ? q.industryDisp.trim() : ''

        if (!companyName && !sector) {
            log(`  [SKIP] ${symbol}: quotes found but longname & industryDisp both empty`)
            return null
        }

        return { companyName, sector }
    } catch (err) {
        log(`  [ERR] ${symbol}: ${err instanceof Error ? err.message : String(err)}`)
        return null
    }
}

// ─── Main enrichment job ──────────────────────────────────────────────────────

async function runEnrichmentJob() {
    jobStatus = 'running'
    jobStartTime = new Date().toISOString()
    jobLog = []
    jobProcessed = 0
    jobUpdated = 0
    jobErrors = 0

    log('Enrichment job started')

    let symbols: string[] = []
    try {
        // Only fetch symbols that are still missing at least one of the two fields
        const result = await pool.query<{ symbol: string }>(
            `SELECT symbol FROM security WHERE company_name IS NULL OR sector IS NULL ORDER BY symbol`
        )
        symbols = result.rows.map(r => r.symbol)
    } catch (err) {
        log(`[FATAL] Could not query security table: ${err instanceof Error ? err.message : String(err)}`)
        jobStatus = 'error'
        return
    }

    jobTotal = symbols.length
    log(`Found ${jobTotal} securities needing enrichment`)

    for (const symbol of symbols) {
        jobProcessed++
        log(`(${jobProcessed}/${jobTotal}) Processing ${symbol}...`)

        const data = await fetchYahooData(symbol)

        if (data) {
            // Only update fields that actually have a value from Yahoo
            const updates: string[] = []
            const values: (string | null)[] = []
            let idx = 1

            if (data.companyName) {
                updates.push(`company_name = $${idx++}`)
                values.push(data.companyName)
            }
            if (data.sector) {
                updates.push(`sector = $${idx++}`)
                values.push(data.sector)
            }

            if (updates.length > 0) {
                updates.push(`updated_at = NOW()`)
                values.push(symbol)
                try {
                    await pool.query(
                        `UPDATE security SET ${updates.join(', ')} WHERE symbol = $${idx}`,
                        values
                    )
                    log(`  [OK] ${symbol} → company="${data.companyName}" sector="${data.sector}"`)
                    jobUpdated++
                } catch (err) {
                    log(`  [DB-ERR] ${symbol}: ${err instanceof Error ? err.message : String(err)}`)
                    jobErrors++
                }
            }
        } else {
            // Yahoo returned nothing useful — leave DB unchanged
        }

        // Be polite to Yahoo Finance: 300 ms between requests
        if (jobProcessed < jobTotal) {
            await sleep(300)
        }
    }

    log(`Enrichment complete. Updated: ${jobUpdated}/${jobTotal}, Errors: ${jobErrors}`)
    jobStatus = 'done'
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
    return NextResponse.json({
        status: jobStatus,
        total: jobTotal,
        processed: jobProcessed,
        updated: jobUpdated,
        errors: jobErrors,
        startTime: jobStartTime,
        recentLog: jobLog.slice(-50),
    })
}

export async function POST() {
    if (jobStatus === 'running') {
        return NextResponse.json(
            { error: 'An enrichment job is already running. Please wait for it to finish.' },
            { status: 409 }
        )
    }

    // Fire the job and return immediately (non-blocking)
    runEnrichmentJob().catch(err => {
        log(`[UNHANDLED] ${err instanceof Error ? err.message : String(err)}`)
        jobStatus = 'error'
    })

    return NextResponse.json({ message: 'Enrichment job started' })
}
