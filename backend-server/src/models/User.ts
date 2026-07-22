/**
 * User Model
 * Handles user authentication, profile management, and role-based access
 */

import { pool, query } from '../config/database';
import { redis } from '../config/redis';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger';

// ============================================================
// INTERFACES
// ============================================================

export interface IUser {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    full_name: string;
    user_type: 'admin' | 'user';
    status: 'active' | 'suspended' | 'banned';
    max_devices: number;
    is_verified: boolean;
    last_login_at: Date | null;
    login_count: number;
    api_key: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}

export interface IUserCreate {
    username: string;
    email: string;
    password: string;
    full_name: string;
    user_type?: 'admin' | 'user';
    max_devices?: number;
}

export interface IUserUpdate {
    username?: string;
    email?: string;
    full_name?: string;
    password?: string;
    status?: 'active' | 'suspended' | 'banned';
    max_devices?: number;
}

// ============================================================
// USER CLASS
// ============================================================

export class User {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    full_name: string;
    user_type: 'admin' | 'user';
    status: 'active' | 'suspended' | 'banned';
    max_devices: number;
    is_verified: boolean;
    last_login_at: Date | null;
    login_count: number;
    api_key: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;

    constructor(data: IUser) {
        this.id = data.id;
        this.username = data.username;
        this.email = data.email;
        this.password_hash = data.password_hash;
        this.full_name = data.full_name;
        this.user_type = data.user_type;
        this.status = data.status;
        this.max_devices = data.max_devices;
        this.is_verified = data.is_verified;
        this.last_login_at = data.last_login_at;
        this.login_count = data.login_count;
        this.api_key = data.api_key;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.deleted_at = data.deleted_at;
    }

    // ============================================================
    // STATIC METHODS
    // ============================================================

    /**
     * Create a new user
     */
    static async create(data: IUserCreate): Promise<User> {
        const {
            username,
            email,
            password,
            full_name,
            user_type = 'user',
            max_devices = 1
        } = data;

        // Validate
        if (!username || !email || !password || !full_name) {
            throw new Error('All fields are required');
        }

        // Check if user exists
        const existing = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        if (existing.rows.length > 0) {
            throw new Error('Username or email already exists');
        }

        // Hash password
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
        const password_hash = await bcrypt.hash(password, salt);

        // Generate API key
        const api_key = User.generateApiKey();

        // Insert user
        const result = await pool.query(
            `INSERT INTO users (
                id, username, email, password_hash, full_name, user_type,
                max_devices, api_key, is_verified, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                uuidv4(),
                username.toLowerCase(),
                email.toLowerCase(),
                password_hash,
                full_name,
                user_type,
                max_devices,
                api_key,
                false,
                'active'
            ]
        );

        // Log creation
        logger.info(`👤 User created: ${username} (${email})`);

        return new User(result.rows[0]);
    }

    /**
     * Find user by ID
     */
    static async findById(id: string): Promise<User | null> {
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (result.rows.length === 0) return null;
        return new User(result.rows[0]);
    }

    /**
     * Find user by username or email
     */
    static async findByUsername(username: string): Promise<User | null> {
        const result = await pool.query(
            'SELECT * FROM users WHERE (username = $1 OR email = $1) AND deleted_at IS NULL',
            [username.toLowerCase()]
        );
        if (result.rows.length === 0) return null;
        return new User(result.rows[0]);
    }

    /**
     * Find user by API key
     */
    static async findByApiKey(apiKey: string): Promise<User | null> {
        const result = await pool.query(
            'SELECT * FROM users WHERE api_key = $1 AND deleted_at IS NULL',
            [apiKey]
        );
        if (result.rows.length === 0) return null;
        return new User(result.rows[0]);
    }

    /**
     * Get all users with pagination
     */
    static async findAll(
        page: number = 1,
        limit: number = 20,
        filters?: { status?: string; user_type?: string }
    ): Promise<{ users: User[]; total: number }> {
        const offset = (page - 1) * limit;
        let whereClause = 'deleted_at IS NULL';
        const params: any[] = [];

        if (filters?.status) {
            params.push(filters.status);
            whereClause += ` AND status = $${params.length}`;
        }
        if (filters?.user_type) {
            params.push(filters.user_type);
            whereClause += ` AND user_type = $${params.length}`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM users WHERE ${whereClause}`,
            params
        );

        params.push(limit, offset);
        const result = await pool.query(
            `SELECT * FROM users WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const users = result.rows.map((row) => new User(row));
        return {
            users,
            total: parseInt(countResult.rows[0].count, 10)
        };
    }

    // ============================================================
    // INSTANCE METHODS
    // ============================================================

    /**
     * Update user
     */
    async update(data: IUserUpdate): Promise<User> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.username !== undefined) {
            updates.push(`username = $${paramCount}`);
            values.push(data.username.toLowerCase());
            paramCount++;
        }
        if (data.email !== undefined) {
            updates.push(`email = $${paramCount}`);
            values.push(data.email.toLowerCase());
            paramCount++;
        }
        if (data.full_name !== undefined) {
            updates.push(`full_name = $${paramCount}`);
            values.push(data.full_name);
            paramCount++;
        }
        if (data.status !== undefined) {
            updates.push(`status = $${paramCount}`);
            values.push(data.status);
            paramCount++;
        }
        if (data.max_devices !== undefined) {
            updates.push(`max_devices = $${paramCount}`);
            values.push(data.max_devices);
            paramCount++;
        }
        if (data.password) {
            const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
            const password_hash = await bcrypt.hash(data.password, salt);
            updates.push(`password_hash = $${paramCount}`);
            values.push(password_hash);
            paramCount++;
        }

        if (updates.length === 0) {
            return this;
        }

        updates.push(`updated_at = NOW()`);
        values.push(this.id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')}
             WHERE id = $${paramCount} AND deleted_at IS NULL
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        // Update instance
        Object.assign(this, result.rows[0]);
        return this;
    }

    /**
     * Delete user (soft delete)
     */
    async delete(): Promise<void> {
        await pool.query(
            'UPDATE users SET deleted_at = NOW(), status = $1 WHERE id = $2',
            ['banned', this.id]
        );
        
        // Clear cache
        await this.clearCache();
        
        logger.info(`🗑️ User deleted: ${this.username} (${this.email})`);
    }

    /**
     * Verify password
     */
    async verifyPassword(password: string): Promise<boolean> {
        return bcrypt.compare(password, this.password_hash);
    }

    /**
     * Update last login
     */
    async updateLastLogin(): Promise<void> {
        await pool.query(
            'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
            [this.id]
        );
        this.last_login_at = new Date();
        this.login_count += 1;
    }

    /**
     * Generate new API key
     */
    async regenerateApiKey(): Promise<string> {
        const newKey = User.generateApiKey();
        await pool.query(
            'UPDATE users SET api_key = $1 WHERE id = $2',
            [newKey, this.id]
        );
        this.api_key = newKey;
        return newKey;
    }

    /**
     * Get user's active license
     */
    async getActiveLicense(): Promise<any | null> {
        const result = await pool.query(
            `SELECT * FROM licenses
             WHERE user_id = $1 AND is_active = true AND expiry_date > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [this.id]
        );
        return result.rows[0] || null;
    }

    /**
     * Get user's devices
     */
    async getDevices(): Promise<any[]> {
        const result = await pool.query(
            `SELECT d.*, l.license_key
             FROM devices d
             JOIN licenses l ON d.license_id = l.id
             WHERE l.user_id = $1 AND d.is_active = true
             ORDER BY d.last_seen_at DESC`,
            [this.id]
        );
        return result.rows;
    }

    /**
     * Get user's campaign stats
     */
    async getStats(): Promise<any> {
        const result = await pool.query(
            `SELECT
                COUNT(DISTINCT c.id) as total_campaigns,
                SUM(c.total_requests) as total_requests,
                SUM(c.successful_requests) as successful_requests,
                SUM(c.failed_requests) as failed_requests,
                COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_campaigns
             FROM sms_campaigns c
             WHERE c.user_id = $1
             AND c.created_at > NOW() - INTERVAL '30 days'`,
            [this.id]
        );
        return result.rows[0];
    }

    // ============================================================
    // CACHE METHODS
    // ============================================================

    /**
     * Get user from cache
     */
    static async getCached(id: string): Promise<User | null> {
        const cached = await redis.get(`user:${id}`);
        if (!cached) return null;
        try {
            const data = JSON.parse(cached);
            return new User(data);
        } catch {
            return null;
        }
    }

    /**
     * Cache user
     */
    async cache(): Promise<void> {
        await redis.setex(
            `user:${this.id}`,
            3600, // 1 hour
            JSON.stringify(this)
        );
        await redis.setex(
            `user:username:${this.username}`,
            3600,
            this.id
        );
        await redis.setex(
            `user:email:${this.email}`,
            3600,
            this.id
        );
    }

    /**
     * Clear user cache
     */
    async clearCache(): Promise<void> {
        await redis.del(`user:${this.id}`);
        await redis.del(`user:username:${this.username}`);
        await redis.del(`user:email:${this.email}`);
    }

    // ============================================================
    // UTILITY METHODS
    // ============================================================

    /**
     * Generate API key
     */
    static generateApiKey(): string {
        return `sk_${uuidv4().replace(/-/g, '')}`;
    }

    /**
     * Sanitize user data (remove sensitive fields)
     */
    toJSON(): Partial<IUser> {
        const { password_hash, ...user } = this;
        return user;
    }

    /**
     * Validate user data
     */
    static validate(data: Partial<IUserCreate>): string[] {
        const errors: string[] = [];

        if (data.username && !/^[a-zA-Z0-9_]{3,30}$/.test(data.username)) {
            errors.push('Username must be 3-30 characters and contain only letters, numbers, and underscores');
        }

        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.push('Invalid email format');
        }

        if (data.password && data.password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }

        if (data.full_name && data.full_name.length < 2) {
            errors.push('Full name must be at least 2 characters');
        }

        return errors;
    }

    /**
     * Check if user has admin privileges
     */
    isAdmin(): boolean {
        return this.user_type === 'admin';
    }

    /**
     * Check if user account is active
     */
    isActive(): boolean {
        return this.status === 'active';
    }

    /**
     * Check if user account is suspended
     */
    isSuspended(): boolean {
        return this.status === 'suspended';
    }

    /**
     * Check if user account is banned
     */
    isBanned(): boolean {
        return this.status === 'banned';
    }
}

export default User;
