// app/api/fetch-data/route.ts
//
// POST { startDate, endDate } → updates config.json, spawns Python script in background
// GET                        → returns { running, pid }

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), '..', 'config.json')
const SCRIPT_PATH = path.join(process.cwd(), '..', 'fetch_bhavcopy_data.py')

// In-memory job tracker (resets on server restart — fine for single-user project)
let runningPid: number | null = null
let jobStatus: 'idle' | 'running' | 'done' | 'error' = 'idle'
let jobLog: string[] = []
let jobStartTime: string | null = null

export async function GET() {
    // Check if the PID is still alive
    if (runningPid !== null) {
        try {
            process.kill(runningPid, 0) // signal 0 = check existence
            jobStatus = 'running'
        } catch {
            // Process no longer exists
            if (jobStatus === 'running') jobStatus = 'done'
            runningPid = null
        }
    }

    return NextResponse.json({
        running: jobStatus === 'running',
        status: jobStatus,
        pid: runningPid,
        startTime: jobStartTime,
        recentLog: jobLog.slice(-20), // last 20 log lines
    })
}

export async function POST(req: NextRequest) {
    // Don't allow a second job while one is running
    if (runningPid !== null) {
        try {
            process.kill(runningPid, 0)
            return NextResponse.json({ error: 'A fetch job is already running. Please wait for it to finish.' }, { status: 409 })
        } catch {
            runningPid = null
        }
    }

    const { startDate, endDate } = await req.json()

    // Validate dates
    const startRe = /^\d{4}-\d{2}-\d{2}$/
    if (!startDate || !endDate || !startRe.test(startDate) || !startRe.test(endDate)) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
    }
    if (new Date(startDate) > new Date(endDate)) {
        return NextResponse.json({ error: 'Start date must be before end date.' }, { status: 400 })
    }

    // Update config.json
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
        const cfg = JSON.parse(raw)
        cfg.start_date = startDate
        cfg.end_date = endDate
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
    } catch (e) {
        return NextResponse.json({ error: `Failed to update config.json: ${e}` }, { status: 500 })
    }

    // Spawn Python script in background (--scheduled = no prompts)
    jobLog = [`[${new Date().toISOString()}] Starting fetch: ${startDate} → ${endDate}`]
    jobStatus = 'running'
    jobStartTime = new Date().toISOString()

    const child = spawn('python', [SCRIPT_PATH, '--scheduled'], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.dirname(SCRIPT_PATH),
    })

    runningPid = child.pid ?? null

    child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        jobLog.push(...lines)
        if (jobLog.length > 500) jobLog = jobLog.slice(-500)
    })

    child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        jobLog.push(...lines.map(l => `[ERR] ${l}`))
        if (jobLog.length > 500) jobLog = jobLog.slice(-500)
    })

    child.on('close', (code: number | null) => {
        jobStatus = code === 0 ? 'done' : 'error'
        runningPid = null
        jobLog.push(`[${new Date().toISOString()}] Process exited with code ${code}`)
    })

    return NextResponse.json({
        message: 'Fetch job started',
        pid: runningPid,
        startDate,
        endDate,
    })
}
