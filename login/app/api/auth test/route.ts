// app/api/auth/test/route.ts
// TEMPORARY — DELETE AFTER CONFIRMING AUTH WORKS
// Visit: http://localhost:3000/api/auth/test

import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
    const checks: Record<string, string> = {}

    // 1. DB connection
    try {
        const client = await pool.connect()
        try {
            await client.query('SELECT 1')
            checks.db_connection = 'OK'
        } finally {
            client.release()
        }
    } catch (e: unknown) {
        checks.db_connection = `FAIL: ${e instanceof Error ? e.message : e}`
    }

    // 2. pgcrypto extension
    try {
        const client = await pool.connect()
        try {
            await client.query(`SELECT crypt('test', gen_salt('bf', 4))`)
            checks.pgcrypto = 'OK'
        } finally {
            client.release()
        }
    } catch (e: unknown) {
        checks.pgcrypto = `FAIL: ${e instanceof Error ? e.message : e}`
    }

    // 3. users table
    try {
        const client = await pool.connect()
        try {
            const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM users`)
            checks.users_table = `OK — ${rows[0].cnt} users`
        } finally {
            client.release()
        }
    } catch (e: unknown) {
        checks.users_table = `FAIL: ${e instanceof Error ? e.message : e}`
    }

    // 4. sessions table
    try {
        const client = await pool.connect()
        try {
            await client.query(`SELECT COUNT(*) FROM sessions`)
            checks.sessions_table = 'OK'
        } finally {
            client.release()
        }
    } catch (e: unknown) {
        checks.sessions_table = `FAIL: ${e instanceof Error ? e.message : e}`
    }

    const allOk = Object.values(checks).every(v => v.startsWith('OK'))
    return NextResponse.json({ status: allOk ? 'ALL OK' : 'ISSUES FOUND', checks }, { status: 200 })
}