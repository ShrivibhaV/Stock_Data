'use client'

import { useState } from 'react'

interface SignUpFormProps {
  onSuccess: (name: string) => void
  onSwitchToLogin: () => void
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

function PasswordStrength({ pw }: { pw: string }) {
  const score =
    (pw.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0)

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'oklch(0.62 0.23 25)', 'oklch(0.75 0.18 60)', 'oklch(0.65 0.20 145)', 'oklch(0.72 0.22 145)']

  if (!pw) return null
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= score ? colors[score] : 'oklch(0.20 0.015 240)' }} />
        ))}
      </div>
      <p className="text-[10px] font-semibold" style={{ color: colors[score] || 'transparent' }}>
        {labels[score]}
      </p>
    </div>
  )
}

export default function SignUpForm({ onSuccess, onSwitchToLogin }: SignUpFormProps) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [showPw, setShowPw] = useState(false)
  const [showCpw, setShowCpw] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) { setError('Please enter your full name.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (!agreed) { setError('Please accept the Terms & Privacy Policy.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
    onSuccess(form.fullName.trim())
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-black text-white">Create account</h3>
        <p className="text-xs text-white/40 mt-1">Join NSE Analytics · Free to get started</p>
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
        {/* Full Name */}
        <div>
          <label htmlFor="su-name" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Full Name
          </label>
          <input type="text" id="su-name" value={form.fullName}
            onChange={set('fullName')} required
            className="input-field" placeholder="Priya Sharma" autoComplete="name" />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="su-email" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Email Address
          </label>
          <input type="email" id="su-email" value={form.email}
            onChange={set('email')} required
            className="input-field" placeholder="you@example.com" autoComplete="email" />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="su-password" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Password
          </label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} id="su-password" value={form.password}
              onChange={set('password')} required
              className="input-field pr-10" placeholder="Min. 8 characters" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
              <EyeIcon open={showPw} />
            </button>
          </div>
          <PasswordStrength pw={form.password} />
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="su-cpw" className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">
            Confirm Password
          </label>
          <div className="relative">
            <input type={showCpw ? 'text' : 'password'} id="su-cpw" value={form.confirmPassword}
              onChange={set('confirmPassword')} required
              className="input-field pr-10" placeholder="Re-enter password" autoComplete="new-password" />
            <button type="button" onClick={() => setShowCpw(!showCpw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
              <EyeIcon open={showCpw} />
            </button>
          </div>
          {form.confirmPassword && form.password !== form.confirmPassword && (
            <p className="text-[10px] font-semibold mt-1" style={{ color: 'oklch(0.75 0.20 25)' }}>
              Passwords don't match
            </p>
          )}
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5">
            <input type="checkbox" id="su-terms" checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="sr-only peer" />
            <div
              onClick={() => setAgreed(!agreed)}
              className="w-4 h-4 rounded cursor-pointer transition-all flex items-center justify-center"
              style={{
                background: agreed ? 'oklch(0.72 0.22 145)' : 'oklch(0.13 0.015 235)',
                border: `1px solid ${agreed ? 'oklch(0.72 0.22 145)' : 'oklch(0.28 0.015 240)'}`
              }}>
              {agreed && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <label htmlFor="su-terms" className="text-xs text-white/45 cursor-pointer leading-relaxed"
            onClick={() => setAgreed(!agreed)}>
            I agree to the{' '}
            <span className="font-semibold" style={{ color: 'oklch(0.72 0.22 145)' }}>Terms of Service</span>
            {' '}and{' '}
            <span className="font-semibold" style={{ color: 'oklch(0.72 0.22 145)' }}>Privacy Policy</span>
          </label>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading || !agreed}
          className="w-full py-3 rounded-lg font-black text-sm text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, oklch(0.72 0.22 145), oklch(0.55 0.18 220))' }}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating account...
            </span>
            : 'Create Account →'
          }
        </button>
      </form>

      <p className="text-center text-xs text-white/35">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin}
          className="font-bold transition hover:opacity-80"
          style={{ color: 'oklch(0.72 0.22 145)' }}>
          Sign in
        </button>
      </p>
    </div>
  )
}
