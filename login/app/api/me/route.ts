// app/api/auth/me/route.ts
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const user = await getSessionUser()
        return NextResponse.json({ user: user ?? null })
    } catch {
        return NextResponse.json({ user: null })
    }
}