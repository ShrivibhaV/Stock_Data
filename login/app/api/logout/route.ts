// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        await deleteSession()
    } catch {
        // always succeed
    }
    return NextResponse.json({ ok: true })
}