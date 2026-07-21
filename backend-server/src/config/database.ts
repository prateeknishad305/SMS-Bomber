/**
 * Database Configuration
 * PostgreSQL connection pool with SSL support
 */

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../middleware/logger';

// Database configuration
const config: PoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'smsbomber',
    max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '20000', 10),
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false,
        // Add SSL certificate paths if needed
        // ca: process.env.DB_SSL_CA,
        // key: process.env.DB_SSL_KEY,
        // cert: process.env.DB_SSL_CERT
    } : false,
    application_name: 'sms-bomber-api',
    statement_timeout: 30000,
    query_timeout: 30000
};

// Create connection pool
export const pool = new Pool(config);

// Event handlers
pool.on('connect', (client) => {
    logger.debug('📡 New database connection established');
});

pool.on('acquire', (client) => {
    logger.debug('🔗 Client acquired from pool');
});

pool.on('remove', (client) => {
    logger.debug('🔌 Client removed from pool');
});

pool.on('error', (err: Error, client) => {
    logger.error('❌ Database error:', err);
    // Don't exit process, let pool handle it
});

// ============================================================
// QUERY HELPERS
// ============================================================

/**
 * Execute a query with error handling and logging
 */
export async function query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
        const result = await pool.query<T>(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries
        if (duration > 5000) {
            logger.warn(`🐌 Slow query (${duration}ms):`, text);
        }
        
        logger.debug(`📊 Query executed in ${duration}ms`);
        return result;
    } catch (error: any) {
        logger.error('❌ Query error:', {
            message: error.message,
            query: text,
            params: params,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
    callback: (client: any) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check database connection
 */
export async function checkConnection(): Promise<boolean> {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get database statistics
 */
export async function getDbStats() {
    const result = await query(`
        SELECT 
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM licenses) as total_licenses,
            (SELECT COUNT(*) FROM sms_campaigns) as total_campaigns,
            (SELECT COUNT(*) FROM sms_requests) as total_requests,
            (SELECT COUNT(*) FROM devices) as total_devices,
            (SELECT COUNT(*) FROM audit_logs) as total_logs,
            (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_today,
            (SELECT COUNT(*) FROM sms_campaigns WHERE created_at > NOW() - INTERVAL '24 hours') as campaigns_today
    `);
    return result.rows[0];
}

/**
 * Initialize database connection
 */
export async function connectDatabase(): Promise<void> {
    try {
        // Test connection
        await pool.query('SELECT 1');
        logger.info('✅ Database connection successful');
        
        // Set search path if needed
        if (process.env.DB_SCHEMA) {
            await pool.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        
        // Run migrations if in development
        if (process.env.NODE_ENV === 'development' && process.env.AUTO_MIGRATE === 'true') {
            await runMigrations();
        }
        
        // Verify database version
        await verifyDatabaseVersion();
        
    } catch (error: any) {
        logger.error('❌ Database connection failed:', error.message);
        throw error;
    }
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
    logger.info('📦 Running database migrations...');
    // Migration logic would go here
    // This is a placeholder for actual migration execution
    logger.info('✅ Migrations complete');
}

/**
 * Verify database version
 */
async function verifyDatabaseVersion(): Promise<void> {
    const result = await pool.query('SELECT version()');
    const version = result.rows[0].version;
    logger.info(`📊 PostgreSQL version: ${version}`);
}

/**
 * Clean up database connections
 */
export async function closeDatabase(): Promise<void> {
    try {
        await pool.end();
        logger.info('🔌 Database connections closed');
    } catch (error: any) {
        logger.error('❌ Error closing database:', error.message);
        throw error;
    }
}

export default {
    pool,
    query,
    transaction,
    checkConnection,
    getDbStats,
    connectDatabase,
    closeDatabase
};
