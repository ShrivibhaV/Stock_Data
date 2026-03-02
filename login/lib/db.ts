import { Pool } from 'pg'

// Global pool — reused across hot-reloads in dev
declare global {
    // eslint-disable-next-line no-var
    var __pgPool: Pool | undefined
}

function createPool(): Pool {
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        database: process.env.DB_NAME || 'Stock_Data',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 5,                 // max concurrent connections
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    })
}

// In development, reuse pool across hot-reloads to avoid exhausting connections
const pool: Pool = global.__pgPool ?? createPool()
if (process.env.NODE_ENV !== 'production') global.__pgPool = pool

export default pool
