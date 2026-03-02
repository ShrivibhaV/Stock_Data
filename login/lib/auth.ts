// lib/auth.ts  — COMPLETE REWRITE
// Compatible with Next.js 14 AND 15 (handles both sync and async cookies())
// Uses pgcrypto for bcrypt (no bcrypt npm package needed)

import { createHash, randomBytes } from 'crypto'
import pool from '@/lib/db'

export const SESSION_COOKIE = 'nse_session'
export const SESSION_DURATION = 7   // days (remember-me)
export const SESSION_SHORT = 1   // day  (no remember-me)

// ── Password utilities (via pgcrypto — no npm bcrypt needed) ───────────────

export async function hashPassword(password: string): Promise<string> {
    const client = await pool.connect()
    try {
        const { rows } = await client.query<{ hash: string }>(
            `SELECT crypt($1, gen_salt('bf', 12)) AS hash`, [password]
        )
        return rows[0].hash
    } finally {
        client.release()
    }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const client = await pool.connect()
    try {
        const { rows } = await client.query<{ match: boolean }>(
            `SELECT (crypt($1, $2) = $2) AS match`, [password, hash]
        )
        return rows[0]?.match === true
    } finally {
        client.release()
    }
}

// ── Token utilities ────────────────────────────────────────────────────────

export function generateToken(): string {
    return randomBytes(48).toString('hex')
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

// ── Cookie helpers — works with Next.js 14 and 15 ─────────────────────────
// Next.js 15 made cookies() async. This wrapper handles both.

async function getCookieStore() {
    const { cookies } = await import('next/headers')
    const store = cookies()
    // Next.js 15: cookies() returns a Promise. Next.js 14: returns directly.
    if (store instanceof Promise) return await store
    return store
}

// ── Session management ─────────────────────────────────────────────────────

export async function createSession(
    userId: string,
    rememberMe: boolean,
    ipAddress?: string,
    userAgent?: string
): Promise<void> {
    const token = generateToken()
    const tokenHash = hashToken(token)
    const days = rememberMe ? SESSION_DURATION : SESSION_SHORT
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const client = await pool.connect()
    try {
        await client.query(
            `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, tokenHash, expiresAt, ipAddress ?? null, userAgent ?? null]
        )
    } finally {
        client.release()
    }

    try {
        const cookieStore = await getCookieStore()
        cookieStore.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresAt,
            path: '/',
        })
    } catch (e) {
        // Cookie setting can fail in some Next.js versions — log but don't crash
        console.error('[auth] Failed to set session cookie:', e)
    }
}

export async function getSessionUser(): Promise<{
    id: string; name: string; email: string; role: string; avatar_url: string | null
} | null> {
    try {
        const cookieStore = await getCookieStore()
        const token = cookieStore.get(SESSION_COOKIE)?.value
        if (!token) return null

        const tokenHash = hashToken(token)
        const client = await pool.connect()
        try {
            const { rows } = await client.query<{
                id: string; name: string; email: string; role: string; avatar_url: string | null
            }>(`
        SELECT u.id, u.name, u.email, u.role, u.avatar_url
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = $1
          AND s.expires_at > CURRENT_TIMESTAMP
      `, [tokenHash])

            if (!rows.length) return null

            await client.query(
                `UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
                [tokenHash]
            )
            return rows[0]
        } finally {
            client.release()
        }
    } catch {
        return null
    }
}

export async function deleteSession(): Promise<void> {
    try {
        const cookieStore = await getCookieStore()
        const token = cookieStore.get(SESSION_COOKIE)?.value
        if (!token) return

        const tokenHash = hashToken(token)
        const client = await pool.connect()
        try {
            await client.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
        } finally {
            client.release()
        }
        cookieStore.delete(SESSION_COOKIE)
    } catch {
        // ignore
    }
}

// ── Password reset ─────────────────────────────────────────────────────────

export async function createPasswordResetToken(userId: string): Promise<string> {
    const token = generateToken()
    const tokenHash = hashToken(token)
    const client = await pool.connect()
    try {
        await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId])
        await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash) VALUES ($1, $2)`,
            [userId, tokenHash]
        )
    } finally {
        client.release()
    }
    return token
}

export async function validateResetToken(token: string): Promise<string | null> {
    const tokenHash = hashToken(token)
    const client = await pool.connect()
    try {
        const { rows } = await client.query<{ user_id: string }>(
            `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1
         AND expires_at > CURRENT_TIMESTAMP
         AND used_at IS NULL`,
            [tokenHash]
        )
        return rows[0]?.user_id ?? null
    } finally {
        client.release()
    }
}

export async function consumeResetToken(token: string): Promise<void> {
    const tokenHash = hashToken(token)
    const client = await pool.connect()
    try {
        await client.query(
            `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
            [tokenHash]
        )
    } finally {
        client.release()
    }
}