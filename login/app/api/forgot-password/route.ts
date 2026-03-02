// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { createPasswordResetToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        let body: { email?: string }
        try { body = await req.json() } catch { body = {} }

        const { email } = body
        if (!email?.trim())
            return NextResponse.json({ error: 'Email is required' }, { status: 400 })

        const client = await pool.connect()
        try {
            const { rows } = await client.query<{ id: string }>(
                `SELECT id FROM users WHERE email = LOWER($1) AND provider = 'local'`,
                [email.trim()]
            )

            // Always return success — don't reveal if email is registered
            if (!rows.length)
                return NextResponse.json({ ok: true })

            const token = await createPasswordResetToken(rows[0].id)
            const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`

            // ── TODO: Send email here ──────────────────────────────────────────
            // Install: npm install nodemailer @types/nodemailer
            // Or use Resend: npm install resend
            // For now, the reset link is printed to your terminal console:
            console.log('\n======================================================')
            console.log('PASSWORD RESET LINK (copy this into your browser):')
            console.log(resetUrl)
            console.log('======================================================\n')

            return NextResponse.json({ ok: true })
        } finally {
            client.release()
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[/api/auth/forgot-password] ERROR:', msg)
        return NextResponse.json({ ok: true }) // always succeed client-side
    }
}