/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { pool } from '../config/database';
import { redis } from '../config/redis';

// ============================================================
// INTERFACES
// ============================================================

interface TokenPayload {
    userId: string;
    licenseId?: string;
    userType: 'admin' | 'user';
    iat?: number;
    exp?: number;
}

export interface AuthRequest extends Request {
    user: {
        id: string;
        username: string;
        userType: 'admin' | 'user';
        status: string;
    };
    userId: string;
    licenseId?: string;
}

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

/**
 * Verify JWT token and attach user to request
 */
export async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({
                error: 'Authentication required',
                message: 'No authorization header provided'
            });
            return;
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            res.status(401).json({
                error: 'Authentication required',
                message: 'Invalid authorization format'
            });
            return;
        }

        // Verify token
        let decoded: TokenPayload;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                res.status(401).json({
                    error: 'Token expired',
                    message: 'Please refresh your token'
                });
                return;
            }
            if (error.name === 'JsonWebTokenError') {
                res.status(401).json({
                    error: 'Invalid token',
                    message: 'Token signature verification failed'
                });
                return;
            }
            throw error;
        }

        // Check if token is blacklisted
        const isBlacklisted = await redis.get(`blacklist:${token}`);
        if (isBlacklisted) {
            res.status(401).json({
                error: 'Token revoked',
                message: 'This token has been revoked'
            });
            return;
        }

        // Get user from database
        const userResult = await pool.query(
            `SELECT id, username, user_type, status 
             FROM users 
             WHERE id = $1 AND status = 'active'`,
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            res.status(401).json({
                error: 'User not found',
                message: 'User does not exist or is inactive'
            });
            return;
        }

        const user = userResult.rows[0];

        // Attach user to request
        (req as AuthRequest).user = {
            id: user.id,
            username: user.username,
            userType: user.user_type,
            status: user.status
        };
        (req as AuthRequest).userId = user.id;
        (req as AuthRequest).licenseId = decoded.licenseId;

        // Log successful authentication
        logger.debug(`✅ User ${user.username} authenticated`);

        next();
    } catch (error: any) {
        logger.error('❌ Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication'
        });
    }
}

// ============================================================
// ADMIN AUTHORIZATION
// ============================================================

/**
 * Require admin role
 */
export function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const authReq = req as AuthRequest;
    if (authReq.user?.userType !== 'admin') {
        res.status(403).json({
            error: 'Forbidden',
            message: 'Admin privileges required'
        });
        return;
    }
    next();
}

// ============================================================
// ROLE-BASED AUTHORIZATION
// ============================================================

/**
 * Require specific role
 */
export function requireRole(roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;
        if (!authReq.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
            return;
        }
        if (!roles.includes(authReq.user.userType)) {
            res.status(403).json({
                error: 'Forbidden',
                message: `Required roles: ${roles.join(', ')}`
            });
            return;
        }
        next();
    };
}

// ============================================================
// LICENSE VERIFICATION
// ============================================================

/**
 * Verify user has valid license
 */
export async function verifyLicense(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.userId;

        // Check license
        const licenseResult = await pool.query(
            `SELECT id, license_key, expiry_date, max_devices, is_active 
             FROM licenses 
             WHERE user_id = $1 AND is_active = true AND expiry_date > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (licenseResult.rows.length === 0) {
            res.status(403).json({
                error: 'No active license',
                message: 'Please contact admin to activate your license'
            });
            return;
        }

        const license = licenseResult.rows[0];
        authReq.licenseId = license.id;

        // Check device limit
        const deviceCount = await pool.query(
            'SELECT COUNT(*) FROM devices WHERE license_id = $1 AND is_active = true',
            [license.id]
        );

        if (parseInt(deviceCount.rows[0].count) >= license.max_devices) {
            // Check if this device is registered
            const deviceId = req.headers['x-device-id'];
            if (deviceId) {
                const deviceCheck = await pool.query(
                    'SELECT id FROM devices WHERE license_id = $1 AND device_id = $2 AND is_active = true',
                    [license.id, deviceId]
                );
                if (deviceCheck.rows.length === 0) {
                    res.status(403).json({
                        error: 'Device limit reached',
                        message: `Maximum ${license.max_devices} devices allowed per license`
                    });
                    return;
                }
            } else {
                res.status(400).json({
                    error: 'Device ID required',
                    message: 'Please provide device ID'
                });
                return;
            }
        }

        next();
    } catch (error: any) {
        logger.error('❌ License verification error:', error);
        res.status(500).json({
            error: 'License verification failed',
            message: error.message
        });
    }
}

// ============================================================
// RATE LIMITING
// ============================================================

/**
 * Check rate limits for user
 */
export async function checkRateLimit(
    userId: string,
    type: string,
    limit: number,
    windowSeconds: number
): Promise<boolean> {
    const key = `rate:${userId}:${type}`;
    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
        return false;
    }

    if (count === 0) {
        await redis.setex(key, windowSeconds, '1');
    } else {
        await redis.incr(key);
    }

    return true;
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(
    limit: number,
    windowSeconds: number,
    type: string = 'default'
) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const authReq = req as AuthRequest;
            const userId = authReq.userId || req.ip;

            if (!userId) {
                next();
                return;
            }

            const allowed = await checkRateLimit(userId, type, limit, windowSeconds);
            if (!allowed) {
                res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: `Please wait ${windowSeconds} seconds before trying again`,
                    retryAfter: windowSeconds
                });
                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// ============================================================
// TOKEN HELPERS
// ============================================================

/**
 * Generate JWT token
 */
export function generateToken(
    userId: string,
    licenseId?: string,
    userType: string = 'user'
): string {
    const payload: TokenPayload = {
        userId,
        licenseId,
        userType: userType as 'admin' | 'user'
    };

    return jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: process.env.JWT_EXPIRY || '15m',
        issuer: process.env.JWT_ISSUER || 'sms-bomber-api',
        audience: process.env.JWT_AUDIENCE || 'sms-bomber-users'
    });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: string): string {
    return jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { userId: string } | null {
    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_REFRESH_SECRET!
        ) as { userId: string };
        return decoded;
    } catch {
        return null;
    }
}

/**
 * Blacklist token
 */
export async function blacklistToken(token: string, expirySeconds: number): Promise<void> {
    await redis.setex(`blacklist:${token}`, expirySeconds, '1');
}

export default {
    authenticate,
    requireAdmin,
    requireRole,
    verifyLicense,
    rateLimitMiddleware,
    checkRateLimit,
    generateToken,
    generateRefreshToken,
    verifyRefreshToken,
    blacklistToken
};
