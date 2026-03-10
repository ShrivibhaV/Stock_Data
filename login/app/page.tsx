'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
interface ReturnRow {
  symbol: string
  current_price: number
  return_1d: number | null
  return_1w: number | null
  return_1m: number | null
  return_3m: number | null
  return_6m: number | null
  return_1y: number | null
}

interface ReturnsResponse {
  date: string | null
  rows: ReturnRow[]
  error?: string
}

interface SummaryResponse {
  latest_date: string | null
  total_symbols: number
  symbols_with_1d: number
  symbols_with_1w: number
  symbols_with_1m: number
  symbols_with_3m: number
  error?: string
}

type Period = '1d' | '1w' | '1m' | '3m'



// ── Animated background ────────────────────────────────────────────────────
function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="dot-grid absolute inset-0" />
      <div className="absolute top-[-10%] right-[-15%] w-[500px] h-[500px] rounded-full animate-blob"
        style={{ background: 'radial-gradient(circle, oklch(0.72 0.22 145 / 0.12) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-[420px] h-[420px] rounded-full animate-blob animation-delay-2000"
        style={{ background: 'radial-gradient(circle, oklch(0.55 0.18 220 / 0.10) 0%, transparent 70%)' }} />
      <div className="absolute top-[40%] left-[30%] w-[280px] h-[280px] rounded-full animate-blob animation-delay-4000"
        style={{ background: 'radial-gradient(circle, oklch(0.72 0.22 145 / 0.07) 0%, transparent 70%)' }} />
    </div>
  )
}

// ── Ticker types ───────────────────────────────────────────────────────────
interface TickerItem {
  sym: string
  price: string
  ch: string
  pct: string
  up: boolean
  turnover: string
}

// ── Scrolling ticker — live data from /api/ticker ──────────────────────────
function TopTicker() {
  const [items, setItems] = useState<TickerItem[]>([])

  useEffect(() => {
    fetch('/api/ticker')
      .then(r => r.json())
      .then((data: TickerItem[]) => { if (data?.length) setItems(data) })
      .catch(() => {/* silently keep empty — ticker just won't show */ })
  }, [])

  if (items.length === 0) return null

  const doubled = [...items, ...items]
  return (
    <div className="w-full overflow-hidden border-b shrink-0"
      style={{ borderColor: 'oklch(0.20 0.015 240)', background: 'oklch(0.07 0.015 240 / 0.95)', backdropFilter: 'blur(8px)' }}>
      <div className="flex ticker-track whitespace-nowrap py-2">
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-6 text-xs font-medium shrink-0 border-r"
            style={{ borderColor: 'oklch(0.18 0.015 240)' }}>
            <span className="text-white/50 font-semibold tracking-wide">{item.sym}</span>
            <span className="text-white/85 font-mono">{item.price}</span>
            <span className={item.up ? 'gain font-bold' : 'loss font-bold'}>{item.ch}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${item.up ? 'gain-bg gain' : 'loss-bg loss'}`}>{item.pct}</span>
            <span className="text-white/25 text-[10px]">₹{item.turnover}Cr</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Market Breadth + Candlestick types ────────────────────────────────────
interface MarketBreadth {
  trading_date: string
  total: number
  gainers: number
  losers: number
  unchanged: number
  avg_return_1d: number
  advances_pct: number
  top_gainer: string
  top_gainer_pct: number
  top_loser: string
  top_loser_pct: number
  total_turnover_cr: number
}

interface HeatmapTile {
  label: string
  count: number
  avg_return: number
  best_symbol: string
  best_return: number
  worst_return: number
}

// ── Colour helper: maps avg_return to a CSS colour ─────────────────────────
// Deep green = +5%+, deep red = -5%-, grey = neutral
function heatColor(r: number): { bg: string; border: string; text: string } {
  const clamped = Math.max(-6, Math.min(6, r))
  if (clamped >= 0) {
    const t = clamped / 6              // 0 → 1
    const l = 0.18 + t * 0.28         // 0.18 dark → 0.46 bright
    const c = 0.05 + t * 0.20
    return {
      bg: `oklch(${l.toFixed(2)} ${c.toFixed(2)} 145 / 0.90)`,
      border: `oklch(${(l + 0.15).toFixed(2)} ${c.toFixed(2)} 145 / 0.60)`,
      text: t > 0.35 ? 'oklch(0.96 0.01 145)' : 'oklch(0.65 0.01 240)',
    }
  } else {
    const t = (-clamped) / 6
    const l = 0.18 + t * 0.26
    const c = 0.05 + t * 0.22
    return {
      bg: `oklch(${l.toFixed(2)} ${c.toFixed(2)} 25 / 0.90)`,
      border: `oklch(${(l + 0.15).toFixed(2)} ${c.toFixed(2)} 25 / 0.60)`,
      text: t > 0.35 ? 'oklch(0.96 0.01 25)' : 'oklch(0.65 0.01 240)',
    }
  }
}

// ── Sector Heatmap ────────────────────────────────────────────────────
function SectorHeatmap({ tiles, mode }: { tiles: HeatmapTile[]; mode: string }) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (tiles.length === 0) return (
    <div style={{ height: 120 }} className="w-full flex items-center justify-center">
      <p className="text-[10px] text-white/20">No data available</p>
    </div>
  )

  return (
    <div className="space-y-1.5">
      {/* Grid of tiles */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, 1fr)` }}>
        {tiles.map((tile, i) => {
          const col = heatColor(tile.avg_return)
          const isHovered = hovered === i
          const sign = tile.avg_return >= 0 ? '+' : ''
          // Truncate long labels
          const shortLabel = tile.label.length > 18
            ? tile.label.slice(0, 16) + '…'
            : tile.label

          return (
            <div
              key={i}
              className="rounded-md cursor-default select-none transition-all duration-150"
              style={{
                background: col.bg,
                border: `1px solid ${col.border}`,
                padding: '6px 5px 5px',
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                boxShadow: isHovered ? `0 4px 16px ${col.bg}` : 'none',
                zIndex: isHovered ? 10 : 1,
                position: 'relative',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <p className="text-[9px] font-semibold leading-tight truncate"
                style={{ color: col.text, opacity: 0.75 }}>
                {shortLabel}
              </p>
              <p className="text-xs font-black leading-tight mt-0.5"
                style={{ color: col.text }}>
                {sign}{tile.avg_return.toFixed(2)}%
              </p>
              <p className="text-[8px] mt-0.5" style={{ color: col.text, opacity: 0.55 }}>
                {tile.count} stocks
              </p>

              {/* Hover tooltip */}
              {isHovered && (
                <div
                  className="absolute z-20 bottom-full left-0 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none"
                  style={{
                    background: 'oklch(0.10 0.015 235)',
                    border: `1px solid ${col.border}`,
                    color: 'oklch(0.90 0.01 240)',
                    minWidth: 140,
                  }}
                >
                  <p className="font-black text-white text-[11px]">{tile.label}</p>
                  <p style={{ color: tile.avg_return >= 0 ? 'oklch(0.72 0.22 145)' : 'oklch(0.68 0.23 25)' }}>
                    Avg {sign}{tile.avg_return.toFixed(2)}% · {tile.count} stocks
                  </p>
                  <p className="text-white/50 mt-0.5">Best: {tile.best_symbol} {tile.best_return >= 0 ? '+' : ''}{tile.best_return.toFixed(1)}%</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5">
            {[-4, -2, 0, 2, 4].map(v => {
              const c = heatColor(v)
              return <div key={v} className="w-3 h-2 rounded-sm" style={{ background: c.bg }} />
            })}
          </div>
          <span className="text-[8px] text-white/20 ml-1">bearish → bullish</span>
        </div>
        <span className="text-[8px] text-white/20">
          {mode === 'sector' ? 'By Sector' : 'By Return Band'} · Today
        </span>
      </div>
    </div>
  )
}

// ── Breadth bar ─────────────────────────────────────────────────────────────
function BreadthBar({ gainers, losers, total }: { gainers: number; losers: number; total: number }) {
  const gPct = total > 0 ? (gainers / total) * 100 : 0
  const lPct = total > 0 ? (losers / total) * 100 : 0
  return (
    <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: 'oklch(0.15 0.015 240)' }}>
      <div className="h-full transition-all duration-1000" style={{ width: `${gPct}%`, background: 'oklch(0.72 0.22 145)' }} />
      <div className="h-full transition-all duration-1000" style={{ width: `${lPct}%`, background: 'oklch(0.62 0.23 25)' }} />
    </div>
  )
}

// ── Live market dashboard widget ────────────────────────────────────────────
function MarketDashboard() {
  const [data, setData] = useState<MarketBreadth | null>(null)
  const [tiles, setTiles] = useState<HeatmapTile[]>([])
  const [heatMode, setHeatMode] = useState('bucket')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/breadth').then(r => r.json()),
      fetch('/api/heatmap').then(r => r.json()),
    ]).then(([b, h]) => {
      if (b) setData(b)
      if (h?.tiles) { setTiles(h.tiles); setHeatMode(h.mode ?? 'bucket') }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-2xl p-4 space-y-3">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-2.5 rounded animate-pulse" style={{ background: 'oklch(0.18 0.015 240)', width: 120 }} />
            <div className="h-6 rounded animate-pulse" style={{ background: 'oklch(0.18 0.015 240)', width: 80 }} />
            <div className="h-2.5 rounded animate-pulse" style={{ background: 'oklch(0.15 0.015 240)', width: 160 }} />
          </div>
          <div className="w-14 h-14 rounded-full animate-pulse" style={{ background: 'oklch(0.18 0.015 240)' }} />
        </div>
        {/* Chart skeleton — fixed 100px height, same as loaded chart */}
        <div className="rounded-lg animate-pulse" style={{ height: 100, background: 'oklch(0.13 0.015 240)' }} />
        {/* Breadth bar skeleton */}
        <div className="h-2 rounded-full animate-pulse" style={{ background: 'oklch(0.18 0.015 240)' }} />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg animate-pulse" style={{ background: 'oklch(0.15 0.015 240)' }} />
          <div className="h-12 rounded-lg animate-pulse" style={{ background: 'oklch(0.15 0.015 240)' }} />
        </div>
      </div>
    )
  }

  if (!data) return null

  const up = data.avg_return_1d >= 0
  const dateStr = new Date(data.trading_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="glass rounded-2xl p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Market Breadth · {dateStr}</p>
          <p className="text-2xl font-black font-mono mt-0.5" style={{ color: up ? 'oklch(0.72 0.22 145)' : 'oklch(0.72 0.22 25)' }}>
            {up ? '+' : ''}{data.avg_return_1d.toFixed(2)}%
          </p>
          <p className="text-xs text-white/35 mt-0.5">Avg 1D Return · {data.total.toLocaleString()} EQ stocks</p>
        </div>
        <div className="text-right">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black"
            style={{
              background: up ? 'oklch(0.72 0.22 145 / 0.12)' : 'oklch(0.62 0.23 25 / 0.12)',
              border: `1px solid ${up ? 'oklch(0.72 0.22 145 / 0.35)' : 'oklch(0.62 0.23 25 / 0.35)'}`,
              color: up ? 'oklch(0.72 0.22 145)' : 'oklch(0.72 0.22 25)',
            }}>
            {Math.round(data.advances_pct)}%
          </div>
          <p className="text-[10px] text-white/30 mt-1">Advancing</p>
        </div>
      </div>

      {/* Heatmap */}
      {tiles.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Market Heatmap · Today</p>
            <span className="text-[10px] font-bold" style={{ color: data.avg_return_1d >= 0 ? 'oklch(0.72 0.22 145)' : 'oklch(0.68 0.23 25)' }}>
              {data.avg_return_1d >= 0 ? '▲' : '▼'} {data.avg_return_1d >= 0 ? '+' : ''}{data.avg_return_1d.toFixed(2)}% avg
            </span>
          </div>
          <SectorHeatmap tiles={tiles} mode={heatMode} />
        </div>
      )}

      {/* Breadth bar */}
      <div className="space-y-1.5">
        <BreadthBar gainers={data.gainers} losers={data.losers} total={data.total} />
        <div className="flex justify-between text-[10px] font-semibold">
          <span style={{ color: 'oklch(0.72 0.22 145)' }}>▲ {data.gainers.toLocaleString()} Up</span>
          <span className="text-white/25">{data.unchanged} Flat</span>
          <span style={{ color: 'oklch(0.72 0.22 25)' }}>▼ {data.losers.toLocaleString()} Down</span>
        </div>
      </div>

      {/* Top mover pills */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ background: 'oklch(0.72 0.22 145 / 0.08)', border: '1px solid oklch(0.72 0.22 145 / 0.20)' }}>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Top Gainer</p>
          <p className="text-sm font-black text-white truncate">{data.top_gainer}</p>
          <p className="text-xs font-bold" style={{ color: 'oklch(0.72 0.22 145)' }}>+{data.top_gainer_pct.toFixed(2)}%</p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'oklch(0.62 0.23 25 / 0.08)', border: '1px solid oklch(0.62 0.23 25 / 0.20)' }}>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Top Loser</p>
          <p className="text-sm font-black text-white truncate">{data.top_loser}</p>
          <p className="text-xs font-bold" style={{ color: 'oklch(0.72 0.22 25)' }}>{data.top_loser_pct.toFixed(2)}%</p>
        </div>
      </div>

    </div>
  )
}
// ── Loading skeleton row ───────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="grid grid-cols-3 px-5 py-3 items-center gap-2 animate-pulse">
      <div className="h-3 rounded" style={{ background: 'oklch(0.20 0.015 240)', width: '70%' }} />
      <div className="h-3 rounded ml-auto" style={{ background: 'oklch(0.18 0.015 240)', width: '60%' }} />
      <div className="h-5 rounded ml-auto" style={{ background: 'oklch(0.18 0.015 240)', width: '50%' }} />
    </div>
  )
}

// ── Forgot password ────────────────────────────────────────────────────────
function ResetPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="space-y-5 slide-in-up">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center glow-green-sm"
            style={{ background: 'oklch(0.72 0.22 145 / 0.15)', border: '1px solid oklch(0.72 0.22 145 / 0.4)' }}>
            <svg className="w-7 h-7 gain" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Check Your Email</h3>
          <p className="text-sm text-white/55 text-center">Reset link sent to <span className="gain font-semibold">{email}</span></p>
        </div>
        <button onClick={onBack}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white/70 hover:text-white transition"
          style={{ background: 'oklch(0.18 0.015 235)', border: '1px solid oklch(0.25 0.015 240)' }}>
          ← Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 slide-in-up">
      <div>
        <h3 className="text-2xl font-bold text-white">Forgot Password?</h3>
        <p className="text-sm text-white/50 mt-1">Enter your email to receive a reset link.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Email Address
          </label>
          <input type="email" id="reset-email" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="input-field" placeholder="you@example.com" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-white transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending...
            </span>
            : 'Send Reset Link'}
        </button>
        <button type="button" onClick={onBack}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition"
          style={{ border: '1px solid oklch(0.22 0.015 240)' }}>
          Cancel
        </button>
      </form>
    </div>
  )
}

// ── Return value cell ──────────────────────────────────────────────────────
function ReturnCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-white/20 text-xs">—</span>
  }
  const isGain = value >= 0
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-md ${isGain ? 'gain-bg gain' : 'loss-bg loss'}`}>
      {isGain ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

// ── Data Fetch Modal ─────────────────────────────────────────────────────
function DataFetchModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(oneYearAgo)
  const [endDate, setEndDate] = useState(today)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Poll status every 5s while running
  useEffect(() => {
    if (status !== 'running') return
    const iv = setInterval(async () => {
      try {
        const res = await fetch('/api/fetch-data')
        const d = await res.json()
        setStatus(d.status)
        setLog(d.recentLog ?? [])
        if (!d.running) clearInterval(iv)
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(iv)
  }, [status])

  const handleStart = async () => {
    setError(null)
    setLog([])
    setStatus('running')
    try {
      const res = await fetch('/api/fetch-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to start'); setStatus('error') }
      else setLog([`Job started (PID ${d.pid}) · ${startDate} → ${endDate}`])
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }

  const statusColor = status === 'done' ? 'oklch(0.72 0.22 145)' : status === 'error' ? 'oklch(0.62 0.23 25)' : 'oklch(0.72 0.20 60)'
  const statusIcon = status === 'done' ? '✅' : status === 'error' ? '❌' : status === 'running' ? '⏳' : '📥'
  const statusLabel = status === 'done' ? 'Done! Data fetched successfully.' : status === 'error' ? 'Error — check log below.' : status === 'running' ? 'Running in background… do not close the page.' : 'Ready to fetch'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0.04 0.01 240 / 0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: 'oklch(0.10 0.015 240)', border: '1px solid oklch(0.22 0.015 240)' }}>

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white">📥 Fetch Market Data</h2>
            <p className="text-xs text-white/40 mt-0.5">Downloads NSE bhavcopy data into your PostgreSQL database</p>
          </div>
          <button onClick={onClose} disabled={status === 'running'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition disabled:opacity-30"
            style={{ border: '1px solid oklch(0.22 0.015 240)' }}>✕</button>
        </div>

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'oklch(0.55 0.015 240)' }}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              max={endDate} disabled={status === 'running'}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white outline-none"
              style={{ background: 'oklch(0.13 0.015 235)', border: '1px solid oklch(0.22 0.015 240)' }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'oklch(0.55 0.015 240)' }}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              min={startDate} disabled={status === 'running'}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white outline-none"
              style={{ background: 'oklch(0.13 0.015 235)', border: '1px solid oklch(0.22 0.015 240)' }} />
          </div>
        </div>

        {/* Status banner */}
        {status !== 'idle' && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: `${statusColor.replace(')', ' / 0.10)')}`, border: `1px solid ${statusColor.replace(')', ' / 0.30)')}` }}>
            <span className="text-base">{statusIcon}</span>
            <p className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</p>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-xs font-semibold" style={{ color: 'oklch(0.72 0.22 25)' }}>⚠ {error}</p>}

        {/* Log output */}
        {log.length > 0 && (
          <div className="rounded-xl p-3 font-mono text-[10px] text-white/50 space-y-0.5 max-h-40 overflow-y-auto"
            style={{ background: 'oklch(0.07 0.01 240)', border: '1px solid oklch(0.15 0.015 240)' }}>
            {log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}

        {/* Warning */}
        <p className="text-[10px] text-white/25 text-center">
          ⚠ This may take hours for large date ranges. The script runs in the background — you can use the dashboard normally. Refresh the page when done.
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={status === 'running'}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white transition disabled:opacity-30"
            style={{ background: 'oklch(0.14 0.015 235)', border: '1px solid oklch(0.22 0.015 240)' }}>Cancel</button>
          <button onClick={handleStart} disabled={status === 'running'}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-60"
            style={{ background: status === 'done' ? 'oklch(0.72 0.22 145 / 0.25)' : 'linear-gradient(135deg, oklch(0.55 0.18 220), oklch(0.45 0.22 260))' }}>
            {status === 'running' ? '⏳ Running...' : status === 'done' ? '✅ Completed' : '▶ Start Fetch'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Enrich Securities Modal ──────────────────────────────────────────────────
function EnrichSecuritiesModal({ onClose }: { onClose: () => void }) {
  type EnrichStatus = 'idle' | 'running' | 'done' | 'error'
  const [status, setStatus] = useState<EnrichStatus>('idle')
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [errors, setErrors] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Poll every 2 s while running
  useEffect(() => {
    if (status !== 'running') return
    const iv = setInterval(async () => {
      try {
        const res = await fetch('/api/enrich-securities')
        const d = await res.json()
        setStatus(d.status as EnrichStatus)
        setTotal(d.total ?? 0)
        setProcessed(d.processed ?? 0)
        setUpdated(d.updated ?? 0)
        setErrors(d.errors ?? 0)
        setLog(d.recentLog ?? [])
        if (d.status !== 'running') clearInterval(iv)
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(iv)
  }, [status])

  const handleStart = async () => {
    setError(null)
    setLog([])
    setTotal(0)
    setProcessed(0)
    setUpdated(0)
    setErrors(0)
    try {
      const res = await fetch('/api/enrich-securities', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to start'); return }
      setStatus('running')
    } catch (e) {
      setError(String(e))
    }
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0
  const statusColor =
    status === 'done' ? 'oklch(0.72 0.22 145)'
      : status === 'error' ? 'oklch(0.62 0.23 25)'
        : 'oklch(0.72 0.20 60)'
  const statusLabel =
    status === 'done' ? `Done! ${updated} of ${total} securities enriched.`
      : status === 'error' ? 'Error — see log below.'
        : status === 'running' ? `Running… ${processed}/${total} (${pct}%) · ${updated} updated · ${errors} errors`
          : 'Ready to enrich company names & sectors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0.04 0.01 240 / 0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: 'oklch(0.10 0.015 240)', border: '1px solid oklch(0.22 0.015 240)' }}>

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white">🏷 Enrich Securities</h2>
            <p className="text-xs text-white/40 mt-0.5">Fetches company name &amp; sector from Yahoo Finance for all securities missing that data</p>
          </div>
          <button onClick={onClose} disabled={status === 'running'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition disabled:opacity-30"
            style={{ border: '1px solid oklch(0.22 0.015 240)' }}>✕</button>
        </div>

        {/* Status banner */}
        {status !== 'idle' && (
          <div className="rounded-xl px-4 py-3 space-y-2"
            style={{ background: `${statusColor.replace(')', ' / 0.10)')}`, border: `1px solid ${statusColor.replace(')', ' / 0.30)')}` }}>
            <p className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</p>
            {/* Progress bar */}
            {status === 'running' && total > 0 && (
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(0.20 0.015 240)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, oklch(0.72 0.20 60), oklch(0.72 0.22 145))' }} />
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && <p className="text-xs font-semibold" style={{ color: 'oklch(0.72 0.22 25)' }}>⚠ {error}</p>}

        {/* Log output */}
        {log.length > 0 && (
          <div className="rounded-xl p-3 font-mono text-[10px] text-white/50 space-y-0.5 max-h-40 overflow-y-auto"
            style={{ background: 'oklch(0.07 0.01 240)', border: '1px solid oklch(0.15 0.015 240)' }}>
            {log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}

        {/* Note */}
        <p className="text-[10px] text-white/25 text-center">
          ⚠ Only securities with missing company name or sector are queried. 300 ms delay between requests to respect Yahoo Finance rate limits.
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={status === 'running'}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white transition disabled:opacity-30"
            style={{ background: 'oklch(0.14 0.015 235)', border: '1px solid oklch(0.22 0.015 240)' }}>Cancel</button>
          <button onClick={handleStart} disabled={status === 'running'}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-60"
            style={{ background: status === 'done' ? 'oklch(0.72 0.22 145 / 0.25)' : 'linear-gradient(135deg, oklch(0.72 0.20 60), oklch(0.55 0.18 145))' }}>
            {status === 'running' ? '⏳ Running...' : status === 'done' ? '✅ Completed' : '▶ Start Enrichment'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Post-login dashboard ───────────────────────────────────────────────────
function ReturnDashboard({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [period, setPeriod] = useState<Period>('1d')
  const [data, setData] = useState<ReturnRow[]>([])
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFetch, setShowFetch] = useState(false)
  const [showEnrich, setShowEnrich] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [returnsRes, summaryRes] = await Promise.all([
        fetch('/api/returns'),
        fetch('/api/summary'),
      ])
      const returns: ReturnsResponse = await returnsRes.json()
      const sum: SummaryResponse = await summaryRes.json()

      if (returns.error) throw new Error(returns.error)
      setData(returns.rows)
      setSummary(sum)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Typed helper — avoids implicit-any from ReturnRow indexing
  const getRet = (r: ReturnRow, p: Period): number | null => {
    switch (p) {
      case '1d': return r.return_1d
      case '1w': return r.return_1w
      case '1m': return r.return_1m
      case '3m': return r.return_3m
    }
  }
  const periodRows = data.filter(r => getRet(r, period) != null)
  const sorted = [...periodRows].sort((a, b) => (getRet(b, period) ?? 0) - (getRet(a, period) ?? 0))
  const gainers = sorted.filter(r => (getRet(r, period) ?? 0) >= 0).slice(0, 5)
  const losers = [...sorted].reverse().filter(r => (getRet(r, period) ?? 0) < 0).slice(0, 5)

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'oklch(0.07 0.015 240)' }}>
      <AnimatedBackground />
      <TopTicker />
      {showFetch && <DataFetchModal onClose={() => setShowFetch(false)} />}
      {showEnrich && <EnrichSecuritiesModal onClose={() => setShowEnrich(false)} />}

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid oklch(0.18 0.015 240)', background: 'oklch(0.07 0.015 240 / 0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3v18h18M8 17l4-8 4 6 3-4" />
            </svg>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-black text-white leading-none">NSE Analytics</p>
            <p className="text-[10px] text-white/35 mt-0.5">Market Intelligence Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Market open badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'oklch(0.72 0.22 145 / 0.10)', border: '1px solid oklch(0.72 0.22 145 / 0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="gain">Live</span>
          </div>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
            {initials}
          </div>
          <span className="hidden sm:block text-sm text-white/60 max-w-[120px] truncate">{name}</span>

          {/* Enrich Securities */}
          <button onClick={() => setShowEnrich(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'oklch(0.72 0.20 60 / 0.12)', border: '1px solid oklch(0.72 0.20 60 / 0.30)', color: 'oklch(0.82 0.15 70)' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Enrich
          </button>

          {/* Fetch Data */}
          <button onClick={() => setShowFetch(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'oklch(0.55 0.18 220 / 0.15)', border: '1px solid oklch(0.55 0.18 220 / 0.35)', color: 'oklch(0.75 0.15 220)' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Fetch Data
          </button>

          {/* Sign Out */}
          <button onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white/50 hover:text-white hover:bg-white/8 transition-all"
            style={{ border: '1px solid oklch(0.22 0.015 240)' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 px-4 sm:px-6 lg:px-10 py-6 max-w-7xl mx-auto w-full">

        {/* Welcome */}
        <div className="mb-5 slide-in-up">
          <h1 className="text-2xl font-black text-white">
            Good {greeting}, <span className="shimmer-text">{name.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-xs text-white/35 mt-1">
            {summary?.latest_date
              ? `Return Analysis · Data as of ${new Date(summary.latest_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'Return Analysis · Connecting to database...'}
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            {
              label: 'Total Symbols',
              value: loading ? '—' : (summary?.total_symbols?.toLocaleString() ?? '—'),
              sub: 'NSE Equities tracked',
              gain: true,
            },
            {
              label: '1D Returns',
              value: loading ? '—' : (summary?.symbols_with_1d?.toLocaleString() ?? '—'),
              sub: 'Symbols with data',
              gain: true,
            },
            {
              label: '1M Returns',
              value: loading ? '—' : (summary?.symbols_with_1m?.toLocaleString() ?? '—'),
              sub: 'Symbols with 1M history',
              gain: true,
            },
            {
              label: '3M Returns',
              value: loading ? '—' : (summary?.symbols_with_3m?.toLocaleString() ?? '—'),
              sub: 'Symbols with 3M history',
              gain: true,
            },
          ].map((s, i) => (
            <div key={i} className="glass rounded-xl p-4 slide-in-up" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
              <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">{s.label}</p>
              <p className="text-xl font-black font-mono text-white mt-1">{s.value}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Return Analysis Table ── */}
        <div className="glass rounded-2xl overflow-hidden slide-in-up" style={{ animationDelay: '0.30s' }}>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid oklch(0.18 0.015 240)' }}>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <svg className="w-4 h-4 gain" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Return Analysis
                {!loading && data.length > 0 && (
                  <span className="text-xs font-medium text-white/30 ml-1">
                    ({data.length} symbols)
                  </span>
                )}
              </h2>
              <p className="text-xs text-white/35 mt-0.5">
                {gainers.length + losers.length > 0
                  ? `Top ${gainers.length} gainers & ${losers.length} losers — ${period.toUpperCase()} period`
                  : 'Live data from your PostgreSQL database'}
              </p>
            </div>

            {/* Period tabs */}
            <div className="flex gap-1 p-1 rounded-lg shrink-0" style={{ background: 'oklch(0.12 0.015 235)' }}>
              {(['1d', '1w', '1m', '3m'] as Period[]).map(tab => (
                <button key={tab} onClick={() => setPeriod(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${period === tab ? 'text-white' : 'text-white/35 hover:text-white/60'
                    }`}
                  style={period === tab ? {
                    background: 'linear-gradient(135deg, oklch(0.72 0.22 145 / 0.22), oklch(0.55 0.18 220 / 0.18))',
                    border: '1px solid oklch(0.72 0.22 145 / 0.35)',
                  } : {}}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
              <svg className="w-8 h-8 loss" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-white">Database Connection Failed</p>
                <p className="text-xs text-white/40 mt-1 max-w-sm">{error}</p>
                <p className="text-xs text-white/30 mt-1">Make sure PostgreSQL is running on port 5433</p>
              </div>
              <button onClick={fetchData}
                className="mt-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition"
                style={{ background: 'oklch(0.72 0.22 145 / 0.20)', border: '1px solid oklch(0.72 0.22 145 / 0.35)' }}>
                Retry
              </button>
            </div>
          )}

          {/* Content: Gainers | Losers */}
          {!error && (
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Gainers */}
              <div style={{ borderRight: '1px solid oklch(0.18 0.015 240)' }}>
                <div className="px-5 py-3 flex items-center gap-2"
                  style={{ borderBottom: '1px solid oklch(0.18 0.015 240)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: 'oklch(0.72 0.22 145)' }} />
                  <span className="text-xs font-black text-white/60 uppercase tracking-wider">Top Gainers</span>
                </div>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : gainers.length === 0
                    ? <p className="px-5 py-8 text-sm text-white/25 text-center">No gainers for this period</p>
                    : gainers.map((r, i) => (
                      <div key={i} className="grid grid-cols-3 px-5 py-3 table-row-hover items-center"
                        style={{ borderBottom: '1px solid oklch(0.14 0.015 240)' }}>
                        <span className="text-sm font-bold text-white">{r.symbol}</span>
                        <span className="text-xs font-mono text-white/50 text-right">
                          ₹{r.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="flex justify-end">
                          <ReturnCell value={getRet(r, period)} />
                        </div>
                      </div>
                    ))
                }
              </div>

              {/* Losers */}
              <div>
                <div className="px-5 py-3 flex items-center gap-2"
                  style={{ borderBottom: '1px solid oklch(0.18 0.015 240)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: 'oklch(0.62 0.23 25)' }} />
                  <span className="text-xs font-black text-white/60 uppercase tracking-wider">Top Losers</span>
                </div>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : losers.length === 0
                    ? <p className="px-5 py-8 text-sm text-white/25 text-center">No losers for this period</p>
                    : losers.map((r, i) => (
                      <div key={i} className="grid grid-cols-3 px-5 py-3 table-row-hover items-center"
                        style={{ borderBottom: '1px solid oklch(0.14 0.015 240)' }}>
                        <span className="text-sm font-bold text-white">{r.symbol}</span>
                        <span className="text-xs font-mono text-white/50 text-right">
                          ₹{r.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="flex justify-end">
                          <ReturnCell value={getRet(r, period)} />
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          )}

          {/* Footer */}
          {!error && !loading && data.length > 0 && (
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ borderTop: '1px solid oklch(0.18 0.015 240)', background: 'oklch(0.08 0.015 235 / 0.5)' }}>
              <p className="text-xs text-white/25">
                Source: <code className="text-white/40">returns_analysis</code> · {data.length} symbols loaded
              </p>
              <button onClick={fetchData}
                className="flex items-center gap-1.5 text-xs font-bold transition hover:opacity-80"
                style={{ color: 'oklch(0.72 0.22 145)' }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/15 mt-5">
          NSE Analytics · {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </main>
    </div>
  )
}

// ── Live stats types ───────────────────────────────────────────────────────
interface LoginStats {
  total: number
  gainers: number
  losers: number
  breakouts52w: number
  topWeekly: { symbol: string; return_1w: number; current_price: number } | null
  tradingDays: number
  latestDate: string | null
}

// ── Rotating featured stock ─────────────────────────────────────────────────
function FeaturedStock({ stocks }: { stocks: { symbol: string; return_1w: number; current_price: number }[] }) {
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    if (stocks.length < 2) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % stocks.length)
        setFade(true)
      }, 300)
    }, 3500)
    return () => clearInterval(t)
  }, [stocks.length])

  if (!stocks.length) return null
  const s = stocks[idx]
  const up = s.return_1w >= 0

  return (
    <div className="glass rounded-xl p-4 transition-opacity duration-300" style={{ opacity: fade ? 1 : 0 }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">🔥 Top Performer · 1W</p>
        <div className="flex gap-1">
          {stocks.map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full transition-all"
              style={{ background: i === idx ? 'oklch(0.72 0.22 145)' : 'oklch(0.25 0.015 240)' }} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-white">{s.symbol}</p>
          <p className="text-xs text-white/40 font-mono">
            ₹{s.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <span className={`text-sm font-black px-3 py-1.5 rounded-lg ${up ? 'gain-bg gain' : 'loss-bg loss'}`}>
          {up ? '+' : ''}{s.return_1w.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

// ── Live login page stats (replaces static stat pills) ─────────────────────
function LiveLoginStats() {
  const [stats, setStats] = useState<LoginStats | null>(null)
  const [topStocks, setTopStocks] = useState<{ symbol: string; return_1w: number; current_price: number }[]>([])

  useEffect(() => {
    // Fetch breadth for live market stats
    fetch('/api/breadth')
      .then(r => r.json())
      .then((b) => {
        if (!b) return
        setStats({
          total: b.total,
          gainers: b.gainers,
          losers: b.losers,
          breakouts52w: 0,   // filled by /api/highlights below
          topWeekly: null,
          tradingDays: 251, // approximate; updated below
          latestDate: b.trading_date,
        })
      })
      .catch(() => { })

    // Fetch highlights (52W breakouts + top weekly performers)
    fetch('/api/highlights')
      .then(r => r.json())
      .then((h) => {
        if (!h) return
        setStats(prev => prev ? {
          ...prev,
          breakouts52w: h.breakouts52w,
          tradingDays: h.trading_days,
        } : null)
        setTopStocks(h.top_weekly ?? [])
      })
      .catch(() => { })
  }, [])

  // ── Stat pill definitions (mix of live + fixed facts) ──
  const pills = stats ? [
    { label: 'EQ Symbols', value: stats.total.toLocaleString('en-IN'), sub: 'NSE Equities tracked' },
    { label: '52W Highs', value: stats.breakouts52w.toLocaleString(), sub: 'New highs today' },
    { label: 'Data Periods', value: '6', sub: '1D → 1Y returns' },
  ] : [
    { label: 'Symbols', value: '3,000+', sub: 'NSE Equities' },
    { label: 'Updated', value: 'Daily', sub: 'Bhavcopy feed' },
    { label: 'Periods', value: '6', sub: '1D→1Y returns' },
  ]

  return (
    <div className="space-y-3">
      {/* Rotating featured stock */}
      {topStocks.length > 0 && <FeaturedStock stocks={topStocks} />}

      {/* Live stat pills */}
      <div className="grid grid-cols-3 gap-3">
        {pills.map((s, i) => (
          <div key={i} className="glass rounded-xl p-4">
            <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">{s.label}</p>
            <p className="text-xl font-bold text-white mt-1">{s.value}</p>
            <p className="text-[11px] text-white/40">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Trust line */}
      {stats?.latestDate && (
        <p className="text-[10px] text-white/20 text-center">
          ✦ Live data · Last updated {new Date(stats.latestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · Your PostgreSQL database
        </p>
      )}
    </div>
  )
}

// ── Auth types ─────────────────────────────────────────────────────────────
type AuthMode = 'login' | 'signup' | 'reset' | 'reset_sent'

interface AuthUser {
  name: string
  email: string
  role: string
  avatar_url: string | null
}

// ── Input field component ──────────────────────────────────────────────────
function AuthInput({
  id, label, type = 'text', value, onChange, placeholder, required, hint, error
}: {
  id: string; label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string
  required?: boolean; hint?: string; error?: string
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-widest"
        style={{ color: 'oklch(0.55 0.015 240)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={isPassword ? 'current-password' : type === 'email' ? 'email' : 'off'}
          className="w-full rounded-xl px-4 py-3 text-sm font-medium text-white outline-none transition-all"
          style={{
            background: 'oklch(0.11 0.015 235)',
            border: error ? '1px solid oklch(0.62 0.23 25 / 0.7)' : '1px solid oklch(0.22 0.015 240)',
            boxShadow: error ? '0 0 0 3px oklch(0.62 0.23 25 / 0.08)' : undefined,
          }}
          onFocus={e => { e.currentTarget.style.border = '1px solid oklch(0.72 0.22 145 / 0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px oklch(0.72 0.22 145 / 0.08)' }}
          onBlur={e => { e.currentTarget.style.border = error ? '1px solid oklch(0.62 0.23 25 / 0.7)' : '1px solid oklch(0.22 0.015 240)'; e.currentTarget.style.boxShadow = '' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
            tabIndex={-1}>
            {show
              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            }
          </button>
        )}
      </div>
      {error && <p className="text-xs font-medium" style={{ color: 'oklch(0.72 0.22 25)' }}>{error}</p>}
      {hint && !error && <p className="text-xs" style={{ color: 'oklch(0.40 0.015 240)' }}>{hint}</p>}
    </div>
  )
}

// ── Password strength indicator ────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const label = ['Weak', 'Fair', 'Good', 'Strong'][score - 1] ?? 'Weak'
  const color = ['oklch(0.62 0.23 25)', 'oklch(0.75 0.20 60)', 'oklch(0.72 0.22 145)', 'oklch(0.65 0.20 160)'][score - 1] ?? 'oklch(0.62 0.23 25)'

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? color : 'oklch(0.18 0.015 240)' }} />
        ))}
      </div>
      <p className="text-[10px] font-semibold" style={{ color }}>{label} password</p>
    </div>
  )
}

// ── Submit button ──────────────────────────────────────────────────────────
function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden group"
      style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(135deg, oklch(0.65 0.22 145), oklch(0.48 0.18 220))' }} />
      <span className="relative flex items-center justify-center gap-2">
        {loading
          ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>Please wait...</>
          : children}
      </span>
    </button>
  )
}

// ── Google sign-in button ──────────────────────────────────────────────────
function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-3 disabled:opacity-60"
      style={{ background: 'oklch(0.12 0.015 235)', border: '1px solid oklch(0.22 0.015 240)', color: 'oklch(0.85 0.01 240)' }}>
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Continue with Google
    </button>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'oklch(0.18 0.015 240)' }} />
      <span className="text-xs font-medium" style={{ color: 'oklch(0.35 0.015 240)' }}>or</span>
      <div className="flex-1 h-px" style={{ background: 'oklch(0.18 0.015 240)' }} />
    </div>
  )
}

// ── Login form ─────────────────────────────────────────────────────────────
function LoginForm({ onSuccess, onSignup, onForgot }: {
  onSuccess: (user: AuthUser) => void
  onSignup: () => void
  onForgot: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // ── AUTH BYPASS — remove when real auth is ready ──
    await new Promise(r => setTimeout(r, 500)) // brief loading feel
    const displayName = email.split('@')[0].replace(/[._]/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    onSuccess({ name: displayName || 'User', email, role: 'user', avatar_url: null })
    setLoading(false)
  }

  const handleGoogle = () => {
    // ── AUTH BYPASS — remove when real auth is ready ──
    onSuccess({ name: 'Google User', email: 'user@gmail.com', role: 'user', avatar_url: null })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-white">Welcome back</h2>
        <p className="text-[10px] mt-1 px-2 py-1 rounded-md font-medium"
          style={{ background: 'oklch(0.55 0.18 220 / 0.12)', color: 'oklch(0.65 0.12 220)', border: '1px solid oklch(0.55 0.18 220 / 0.25)' }}>
          ⚡ Auth bypass active — any email/password works
        </p>
      </div>

      <GoogleButton loading={googleLoading} onClick={handleGoogle} />
      <Divider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput id="login-email" label="Email address" type="email"
          value={email} onChange={setEmail} placeholder="you@example.com" required />
        <AuthInput id="login-password" label="Password" type="password"
          value={password} onChange={setPassword} placeholder="••••••••" required />

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'oklch(0.62 0.23 25 / 0.10)', border: '1px solid oklch(0.62 0.23 25 / 0.25)', color: 'oklch(0.82 0.15 25)' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Remember me + Forgot password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div onClick={() => setRemember(r => !r)}
              className="w-4 h-4 rounded flex items-center justify-center transition-all cursor-pointer"
              style={{
                background: remember ? 'oklch(0.72 0.22 145)' : 'transparent',
                border: remember ? '1px solid oklch(0.72 0.22 145)' : '1px solid oklch(0.30 0.015 240)',
              }}>
              {remember && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>}
            </div>
            <span className="text-xs font-medium" style={{ color: 'oklch(0.50 0.015 240)' }}>Remember me</span>
          </label>
          <button type="button" onClick={onForgot}
            className="text-xs font-semibold transition hover:opacity-80"
            style={{ color: 'oklch(0.72 0.22 145)' }}>
            Forgot password?
          </button>
        </div>

        <SubmitButton loading={loading}>Sign In →</SubmitButton>
      </form>

      <p className="text-center text-xs" style={{ color: 'oklch(0.40 0.015 240)' }}>
        Don&apos;t have an account?{' '}
        <button onClick={onSignup} className="font-bold transition hover:opacity-80"
          style={{ color: 'oklch(0.72 0.22 145)' }}>
          Sign up free
        </button>
      </p>
    </div>
  )
}

// ── Sign up form ───────────────────────────────────────────────────────────
function SignupForm({ onSuccess, onLogin }: {
  onSuccess: (user: AuthUser) => void
  onLogin: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Full name required'
    if (!email.includes('@')) errs.email = 'Valid email required'
    if (password.length < 8) errs.password = 'At least 8 characters'
    if (password !== confirm) errs.confirm = 'Passwords do not match'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) return
    setLoading(true)
    // ── AUTH BYPASS — remove when real auth is ready ──
    await new Promise(r => setTimeout(r, 600))
    onSuccess({ name: name.trim() || 'New User', email, role: 'user', avatar_url: null })
    setLoading(false)
  }

  const handleGoogle = () => {
    // ── AUTH BYPASS — remove when real auth is ready ──
    onSuccess({ name: 'Google User', email: 'user@gmail.com', role: 'user', avatar_url: null })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-white">Create account</h2>
        <p className="text-[10px] mt-1 px-2 py-1 rounded-md font-medium"
          style={{ background: 'oklch(0.55 0.18 220 / 0.12)', color: 'oklch(0.65 0.12 220)', border: '1px solid oklch(0.55 0.18 220 / 0.25)' }}>
          ⚡ Auth bypass active — fill any name, email, password
        </p>
      </div>

      <GoogleButton loading={googleLoading} onClick={handleGoogle} />
      <Divider />

      <form onSubmit={handleSubmit} className="space-y-3">
        <AuthInput id="su-name" label="Full name" value={name} onChange={setName}
          placeholder="Arjun Sharma" required error={fieldErrors.name} />
        <AuthInput id="su-email" label="Email address" type="email" value={email}
          onChange={setEmail} placeholder="you@example.com" required error={fieldErrors.email} />
        <AuthInput id="su-password" label="Password" type="password" value={password}
          onChange={setPassword} placeholder="Min. 8 characters" required error={fieldErrors.password} />
        {password && <PasswordStrength password={password} />}
        <AuthInput id="su-confirm" label="Confirm password" type="password" value={confirm}
          onChange={setConfirm} placeholder="Repeat password" required error={fieldErrors.confirm} />

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'oklch(0.62 0.23 25 / 0.10)', border: '1px solid oklch(0.62 0.23 25 / 0.25)', color: 'oklch(0.82 0.15 25)' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <SubmitButton loading={loading}>Create Account →</SubmitButton>
      </form>

      <p className="text-center text-[10px]" style={{ color: 'oklch(0.35 0.015 240)' }}>
        By signing up you agree to our Terms &amp; Privacy Policy
      </p>
      <p className="text-center text-xs" style={{ color: 'oklch(0.40 0.015 240)' }}>
        Already have an account?{' '}
        <button onClick={onLogin} className="font-bold transition hover:opacity-80"
          style={{ color: 'oklch(0.72 0.22 145)' }}>
          Sign in
        </button>
      </p>
    </div>
  )
}

// ── Forgot password form ───────────────────────────────────────────────────
function ForgotForm({ onBack, onSent }: { onBack: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      onSent(email) // always succeed client-side (don't leak email existence)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-white">Reset password</h2>
        <p className="text-sm mt-1" style={{ color: 'oklch(0.45 0.015 240)' }}>
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput id="fp-email" label="Email address" type="email"
          value={email} onChange={setEmail} placeholder="you@example.com" required />

        {error && (
          <p className="text-xs font-medium" style={{ color: 'oklch(0.72 0.22 25)' }}>{error}</p>
        )}

        <SubmitButton loading={loading}>Send Reset Link</SubmitButton>
      </form>

      <button onClick={onBack}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition"
        style={{ color: 'oklch(0.45 0.015 240)', border: '1px solid oklch(0.18 0.015 240)' }}>
        ← Back to Sign In
      </button>
    </div>
  )
}

// ── Reset sent confirmation ────────────────────────────────────────────────
function ResetSentScreen({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'oklch(0.72 0.22 145 / 0.12)', border: '1px solid oklch(0.72 0.22 145 / 0.30)' }}>
          <svg className="w-8 h-8" style={{ color: 'oklch(0.72 0.22 145)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Check your inbox</h3>
          <p className="text-sm mt-1.5" style={{ color: 'oklch(0.45 0.015 240)' }}>
            Reset link sent to
          </p>
          <p className="text-sm font-bold mt-0.5" style={{ color: 'oklch(0.72 0.22 145)' }}>{email}</p>
        </div>
        <p className="text-xs max-w-xs" style={{ color: 'oklch(0.38 0.015 240)' }}>
          Link expires in 1 hour. Check your spam folder if you don&apos;t see it.
        </p>
      </div>
      <button onClick={onBack}
        className="w-full py-3 rounded-xl text-sm font-semibold transition"
        style={{ background: 'oklch(0.12 0.015 235)', border: '1px solid oklch(0.22 0.015 240)', color: 'oklch(0.60 0.015 240)' }}>
        ← Back to Sign In
      </button>
    </div>
  )
}

// ── Login / Signup page ────────────────────────────────────────────────────
export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mounted, setMounted] = useState(false)
  const [checking, setChecking] = useState(true)
  const [resetEmail, setResetEmail] = useState('')

  useEffect(() => {
    setMounted(true)
    // Check for existing session on page load
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.user) setUser(d.user) })
      .catch(() => { })
      .finally(() => setChecking(false))
  }, [])

  if (!mounted) return null

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'oklch(0.07 0.015 240)' }}>
        <svg className="w-6 h-6 animate-spin" style={{ color: 'oklch(0.72 0.22 145)' }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (user) {
    return <ReturnDashboard name={user.name} onLogout={async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setAuthMode('login')
    }} />
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'oklch(0.07 0.015 240)' }}>
      <AnimatedBackground />
      <TopTicker />

      <div className="relative z-10 flex-1 flex items-start justify-center px-4 py-4">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-start">

          {/* ── Left: branding panel ── */}
          <div className="hidden lg:flex flex-col gap-4 fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3v18h18M8 17l4-8 4 6 3-4" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-black text-white tracking-tight">NSE Analytics</p>
                <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: 'oklch(0.38 0.015 240)' }}>
                  Market Intelligence
                </p>
              </div>
            </div>

            <div>
              <h1 className="text-3xl xl:text-4xl font-black text-white leading-tight">
                Decode the <span className="shimmer-text">Market&apos;s</span> Next Move.
              </h1>
            </div>

            {/* Live market breadth dashboard */}
            <MarketDashboard />

            {/* Live DB stat pills + featured stock — hidden to keep layout compact */}
          </div>

          {/* ── Right: auth card ── */}
          <div className="w-full max-w-md mx-auto slide-in-up">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3v18h18M8 17l4-8 4 6 3-4" />
                </svg>
              </div>
              <p className="text-base font-black text-white">NSE Analytics</p>
            </div>

            {/* Auth card */}
            <div className="rounded-2xl p-7 shadow-2xl"
              style={{ background: 'oklch(0.09 0.015 235)', border: '1px solid oklch(0.16 0.015 240)' }}>

              {/* Tab switcher — only on login/signup */}
              {(authMode === 'login' || authMode === 'signup') && (
                <div className="flex gap-1 p-1 rounded-xl mb-6"
                  style={{ background: 'oklch(0.07 0.015 235)' }}>
                  {(['login', 'signup'] as const).map(m => (
                    <button key={m} onClick={() => setAuthMode(m)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${authMode === m ? 'text-white' : 'hover:text-white/55'}`}
                      style={{
                        color: authMode === m ? 'white' : 'oklch(0.35 0.015 240)',
                        ...(authMode === m ? {
                          background: 'linear-gradient(135deg, oklch(0.72 0.22 145 / 0.20), oklch(0.55 0.18 220 / 0.15))',
                          border: '1px solid oklch(0.72 0.22 145 / 0.30)',
                        } : {}),
                      }}>
                      {m === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                </div>
              )}

              {/* Form switching */}
              {authMode === 'login' && (
                <LoginForm
                  onSuccess={u => setUser(u)}
                  onSignup={() => setAuthMode('signup')}
                  onForgot={() => setAuthMode('reset')}
                />
              )}
              {authMode === 'signup' && (
                <SignupForm
                  onSuccess={u => setUser(u)}
                  onLogin={() => setAuthMode('login')}
                />
              )}
              {authMode === 'reset' && (
                <ForgotForm
                  onBack={() => setAuthMode('login')}
                  onSent={email => { setResetEmail(email); setAuthMode('reset_sent') }}
                />
              )}
              {authMode === 'reset_sent' && (
                <ResetSentScreen
                  email={resetEmail}
                  onBack={() => setAuthMode('login')}
                />
              )}
            </div>

            <p className="text-center text-xs mt-4" style={{ color: 'oklch(0.28 0.015 240)' }}>
              By continuing you agree to our Terms &amp; Privacy Policy
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

