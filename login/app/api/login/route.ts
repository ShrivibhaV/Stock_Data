// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        let body: { email?: string; password?: string; rememberMe?: boolean }
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { email, password, rememberMe } = body

        if (!email?.trim())
            return NextResponse.json({ error: 'Email is required' }, { status: 400 })
        if (!password)
            return NextResponse.json({ error: 'Password is required' }, { status: 400 })

        const client = await pool.connect()
        try {
            const { rows } = await client.query<{
                id: string; name: string; email: string; role: string
                password_hash: string; provider: string; avatar_url: string | null
            }>(
                `SELECT id, name, email, role, password_hash, provider, avatar_url
         FROM users WHERE email = LOWER($1)`,
                [email.trim()]
            )

            // Generic message — don't reveal whether email exists
            if (!rows.length)
                return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

            const user = rows[0]

            if (user.provider === 'google' || !user.password_hash)
                return NextResponse.json({ error: 'This account uses Google sign-in. Use "Continue with Google".' }, { status: 401 })

            const valid = await verifyPassword(password, user.password_hash)
            if (!valid)
                return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

            // Update last login
            await client.query(
                `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [user.id]
            )

            const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined
            const ua = req.headers.get('user-agent') ?? undefined
            await createSession(user.id, !!rememberMe, ip, ua)

            return NextResponse.json({
                user: { name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url }
            })
        } finally {
            client.release()
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[/api/auth/login] ERROR:', msg)
        return NextResponse.json({ error: `Login failed: ${msg}` }, { status: 500 })
    }
}