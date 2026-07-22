/**
 * Redis Configuration
 * Cache, session store, and queue management
 */

import Redis from 'ioredis';
import { logger } from '../middleware/logger';

// Redis configuration
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'smsbomber:',
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 10000,
    commandTimeout: 5000,
    keepAlive: 30000,
    family: 4
};

// Create Redis client
export const redis = new Redis(redisConfig);

// Event handlers
redis.on('connect', () => {
    logger.info('🔗 Redis connecting...');
});

redis.on('ready', () => {
    logger.info('✅ Redis ready');
});

redis.on('error', (error: Error) => {
    logger.error('❌ Redis error:', error);
});

redis.on('close', () => {
    logger.warn('⚠️ Redis connection closed');
});

redis.on('reconnecting', () => {
    logger.warn('🔄 Redis reconnecting...');
});

redis.on('end', () => {
    logger.warn('🔌 Redis connection ended');
});

// ============================================================
// REDIS HELPERS
// ============================================================

/**
 * Set a value with TTL
 */
export async function setWithTTL(
    key: string,
    value: any,
    ttlSeconds: number
): Promise<void> {
    try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await redis.setex(key, ttlSeconds, serialized);
    } catch (error: any) {
        logger.error(`❌ Redis set error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Get a value
 */
export async function getValue<T = any>(key: string): Promise<T | null> {
    try {
        const value = await redis.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as T;
        }
    } catch (error: any) {
        logger.error(`❌ Redis get error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Delete a key
 */
export async function deleteKey(key: string): Promise<boolean> {
    try {
        const result = await redis.del(key);
        return result === 1;
    } catch (error: any) {
        logger.error(`❌ Redis delete error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Check if key exists
 */
export async function keyExists(key: string): Promise<boolean> {
    try {
        const result = await redis.exists(key);
        return result === 1;
    } catch (error: any) {
        logger.error(`❌ Redis exists error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Increment a counter
 */
export async function incrementCounter(key: string, by: number = 1): Promise<number> {
    try {
        return await redis.incrby(key, by);
    } catch (error: any) {
        logger.error(`❌ Redis increment error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Get TTL of a key
 */
export async function getTTL(key: string): Promise<number> {
    try {
        return await redis.ttl(key);
    } catch (error: any) {
        logger.error(`❌ Redis TTL error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Set hash field
 */
export async function setHashField(
    key: string,
    field: string,
    value: any
): Promise<void> {
    try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await redis.hset(key, field, serialized);
    } catch (error: any) {
        logger.error(`❌ Redis hset error for ${key}:${field}:`, error);
        throw error;
    }
}

/**
 * Get hash field
 */
export async function getHashField<T = any>(
    key: string,
    field: string
): Promise<T | null> {
    try {
        const value = await redis.hget(key, field);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as T;
        }
    } catch (error: any) {
        logger.error(`❌ Redis hget error for ${key}:${field}:`, error);
        throw error;
    }
}

/**
 * Get all hash fields
 */
export async function getAllHashFields<T = any>(key: string): Promise<Record<string, T>> {
    try {
        const result = await redis.hgetall(key);
        const parsed: Record<string, T> = {};
        for (const [field, value] of Object.entries(result)) {
            try {
                parsed[field] = JSON.parse(value) as T;
            } catch {
                parsed[field] = value as T;
            }
        }
        return parsed;
    } catch (error: any) {
        logger.error(`❌ Redis hgetall error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Add to set
 */
export async function addToSet(key: string, ...members: string[]): Promise<number> {
    try {
        return await redis.sadd(key, ...members);
    } catch (error: any) {
        logger.error(`❌ Redis sadd error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Check if member in set
 */
export async function isSetMember(key: string, member: string): Promise<boolean> {
    try {
        return (await redis.sismember(key, member)) === 1;
    } catch (error: any) {
        logger.error(`❌ Redis sismember error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Get all set members
 */
export async function getSetMembers(key: string): Promise<string[]> {
    try {
        return await redis.smembers(key);
    } catch (error: any) {
        logger.error(`❌ Redis smembers error for key ${key}:`, error);
        throw error;
    }
}

/**
 * Publish to channel
 */
export async function publish(channel: string, message: any): Promise<number> {
    try {
        const serialized = typeof message === 'string' ? message : JSON.stringify(message);
        return await redis.publish(channel, serialized);
    } catch (error: any) {
        logger.error(`❌ Redis publish error for channel ${channel}:`, error);
        throw error;
    }
}

/**
 * Subscribe to channel
 */
export function subscribe(channel: string, callback: (message: any) => void): void {
    const subscriber = new Redis(redisConfig);
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
        if (ch === channel) {
            try {
                const parsed = JSON.parse(message);
                callback(parsed);
            } catch {
                callback(message);
            }
        }
    });
    subscriber.on('error', (error: Error) => {
        logger.error(`❌ Redis subscriber error for channel ${channel}:`, error);
    });
}

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
    try {
        await redis.ping();
        logger.info('✅ Redis connection successful');
        
        // Set memory limit warning
        await redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
        await redis.config('SET', 'maxmemory', '256mb');
        
        // Flush database in development
        if (process.env.NODE_ENV === 'development' && process.env.REDIS_FLUSH === 'true') {
            await redis.flushdb();
            logger.info('🗑️ Redis database flushed');
        }
        
    } catch (error: any) {
        logger.error('❌ Redis connection failed:', error.message);
        throw error;
    }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
    try {
        await redis.quit();
        logger.info('🔌 Redis connection closed');
    } catch (error: any) {
        logger.error('❌ Error closing Redis:', error.message);
        throw error;
    }
}

export default {
    redis,
    setWithTTL,
    getValue,
    deleteKey,
    keyExists,
    incrementCounter,
    getTTL,
    setHashField,
    getHashField,
    getAllHashFields,
    addToSet,
    isSetMember,
    getSetMembers,
    publish,
    subscribe,
    connectRedis,
    closeRedis
};
