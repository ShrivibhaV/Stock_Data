'use client'

import { useState } from 'react'

interface LoginFormProps {
  onSuccess: (name: string) => void
  onSwitchToSignup: () => void
  onForgotPassword: () => void
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function LoginForm({ onSuccess, onSwitchToSignup, onForgotPassword }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
    // Derive display name from email (before @)
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    onSuccess(name)
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-black text-white">Welcome back</h3>
        <p className="text-xs text-white/40 mt-1">Sign in to your analytics account</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-xs font-semibold"
          style={{ background: 'oklch(0.62 0.23 25 / 0.12)', border: '1px solid oklch(0.62 0.23 25 / 0.35)', color: 'oklch(0.75 0.20 25)' }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Email Address
          </label>
          <input type="email" id="login-email" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="input-field" placeholder="you@example.com" autoComplete="email" />
        </div>

        {/* Password */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="login-password" className="text-[11px] font-bold text-white/50 uppercase tracking-widest">
              Password
            </label>
            <button type="button" onClick={onForgotPassword}
              className="text-[11px] font-semibold transition hover:opacity-80"
              style={{ color: 'oklch(0.72 0.22 145)' }}>
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} id="login-password" value={password}
              onChange={e => setPassword(e.target.value)} required
              className="input-field pr-10" placeholder="••••••••" autoComplete="current-password" />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
              <EyeIcon open={showPw} />
            </button>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-black text-sm text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Authenticating...
            </span>
            : 'Sign In →'
          }
        </button>
      </form>

      <p className="text-center text-xs text-white/35">
        New to NSE Analytics?{' '}
        <button type="button" onClick={onSwitchToSignup}
          className="font-bold transition hover:opacity-80"
          style={{ color: 'oklch(0.72 0.22 145)' }}>
          Create an account
        </button>
      </p>
    </div>
  )
}
