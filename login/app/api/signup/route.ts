// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        // ── 1. Parse body ──────────────────────────────────────────────────────
        let body: { name?: string; email?: string; password?: string }
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { name, email, password } = body

        // ── 2. Validate ────────────────────────────────────────────────────────
        if (!name?.trim())
            return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
        if (!email?.trim() || !email.includes('@'))
            return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
        if (!password || password.length < 8)
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

        // ── 3. Check if email exists ───────────────────────────────────────────
        const client = await pool.connect()
        try {
            const { rows: existing } = await client.query(
                `SELECT id, provider FROM users WHERE email = LOWER($1)`,
                [email.trim()]
            )
            if (existing.length) {
                if (existing[0].provider === 'google')
                    return NextResponse.json({ error: 'This email is registered with Google. Use "Continue with Google".' }, { status: 409 })
                return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 })
            }

            // ── 4. Hash password via pgcrypto ──────────────────────────────────
            const passwordHash = await hashPassword(password)

            // ── 5. Insert user ─────────────────────────────────────────────────
            const { rows } = await client.query<{ id: string; name: string; email: string; role: string }>(
                `INSERT INTO users (name, email, password_hash, provider, is_verified)
         VALUES ($1, LOWER($2), $3, 'local', true)
         RETURNING id, name, email, role`,
                [name.trim(), email.trim(), passwordHash]
            )
            const user = rows[0]

            // ── 6. Create session cookie ───────────────────────────────────────
            const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined
            const ua = req.headers.get('user-agent') ?? undefined
            await createSession(user.id, false, ip, ua)

            return NextResponse.json({
                user: { name: user.name, email: user.email, role: user.role, avatar_url: null }
            })
        } finally {
            client.release()
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[/api/auth/signup] ERROR:', msg)

        // Surface pgcrypto missing error clearly
        if (msg.includes('crypt') || msg.includes('pgcrypto'))
            return NextResponse.json({ error: 'Database setup incomplete. Run: CREATE EXTENSION pgcrypto;' }, { status: 500 })

        return NextResponse.json({ error: `Signup failed: ${msg}` }, { status: 500 })
    }
}