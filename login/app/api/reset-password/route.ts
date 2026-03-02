// app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { validateResetToken, consumeResetToken, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        let body: { token?: string; password?: string }
        try { body = await req.json() } catch { body = {} }

        const { token, password } = body

        if (!token)
            return NextResponse.json({ error: 'Reset token is missing' }, { status: 400 })
        if (!password || password.length < 8)
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

        const userId = await validateResetToken(token)
        if (!userId)
            return NextResponse.json({ error: 'This reset link is invalid or has expired. Please request a new one.' }, { status: 400 })

        const newHash = await hashPassword(password)
        const client = await pool.connect()
        try {
            await client.query(
                `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [newHash, userId]
            )
        } finally {
            client.release()
        }

        await consumeResetToken(token)
        return NextResponse.json({ ok: true })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[/api/auth/reset-password] ERROR:', msg)
        return NextResponse.json({ error: `Reset failed: ${msg}` }, { status: 500 })
    }
}