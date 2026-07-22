/**
 * License Model
 * Manages user licenses, device limits, and expiration
 */

import { pool, query, transaction } from '../config/database';
import { redis } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger';
import User from './User';

// ============================================================
// INTERFACES
// ============================================================

export interface ILicense {
    id: string;
    license_key: string;
    user_id: string;
    max_devices: number;
    active_devices: number;
    start_date: Date;
    expiry_date: Date;
    max_requests_per_minute: number;
    max_requests_per_hour: number;
    max_requests_per_day: number;
    is_active: boolean;
    is_sold: boolean;
    sold_price: number | null;
    sold_at: Date | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    notes: string | null;
}

export interface ILicenseCreate {
    userId?: string;
    maxDevices?: number;
    durationDays?: number;
    maxRequestsPerMinute?: number;
    maxRequestsPerHour?: number;
    maxRequestsPerDay?: number;
    notes?: string;
}

export interface ILicenseUpdate {
    maxDevices?: number;
    expiryDate?: Date;
    isActive?: boolean;
    maxRequestsPerMinute?: number;
    maxRequestsPerHour?: number;
    maxRequestsPerDay?: number;
    notes?: string;
}

// ============================================================
// LICENSE CLASS
// ============================================================

export class License {
    id: string;
    license_key: string;
    user_id: string;
    max_devices: number;
    active_devices: number;
    start_date: Date;
    expiry_date: Date;
    max_requests_per_minute: number;
    max_requests_per_hour: number;
    max_requests_per_day: number;
    is_active: boolean;
    is_sold: boolean;
    sold_price: number | null;
    sold_at: Date | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    notes: string | null;

    constructor(data: ILicense) {
        this.id = data.id;
        this.license_key = data.license_key;
        this.user_id = data.user_id;
        this.max_devices = data.max_devices;
        this.active_devices = data.active_devices;
        this.start_date = data.start_date;
        this.expiry_date = data.expiry_date;
        this.max_requests_per_minute = data.max_requests_per_minute;
        this.max_requests_per_hour = data.max_requests_per_hour;
        this.max_requests_per_day = data.max_requests_per_day;
        this.is_active = data.is_active;
        this.is_sold = data.is_sold;
        this.sold_price = data.sold_price;
        this.sold_at = data.sold_at;
        this.created_by = data.created_by;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.notes = data.notes;
    }

    // ============================================================
    // STATIC METHODS
    // ============================================================

    /**
     * Generate a new license
     */
    static async generate(data: ILicenseCreate, adminId?: string): Promise<License> {
        const {
            userId = null,
            maxDevices = 1,
            durationDays = 30,
            maxRequestsPerMinute = 10,
            maxRequestsPerHour = 100,
            maxRequestsPerDay = 500,
            notes = null
        } = data;

        // Generate unique license key
        const licenseKey = this.generateKey();

        const now = new Date();
        const expiryDate = new Date(now);
        expiryDate.setDate(expiryDate.getDate() + durationDays);

        // Insert license
        const result = await pool.query(
            `INSERT INTO licenses (
                id, license_key, user_id, max_devices, start_date, expiry_date,
                max_requests_per_minute, max_requests_per_hour, max_requests_per_day,
                is_active, created_by, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                uuidv4(),
                licenseKey,
                userId,
                maxDevices,
                now,
                expiryDate,
                maxRequestsPerMinute,
                maxRequestsPerHour,
                maxRequestsPerDay,
                true,
                adminId,
                notes
            ]
        );

        const license = new License(result.rows[0]);

        // Cache license
        await license.cache();

        logger.info(`🔑 License generated: ${licenseKey} for user ${userId || 'unassigned'}`);

        return license;
    }

    /**
     * Find license by ID
     */
    static async findById(id: string): Promise<License | null> {
        const result = await pool.query(
            'SELECT * FROM licenses WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) return null;
        return new License(result.rows[0]);
    }

    /**
     * Find license by key
     */
    static async findByKey(licenseKey: string): Promise<License | null> {
        const result = await pool.query(
            'SELECT * FROM licenses WHERE license_key = $1',
            [licenseKey]
        );
        if (result.rows.length === 0) return null;
        return new License(result.rows[0]);
    }

    /**
     * Find user's active license
     */
    static async findActiveByUser(userId: string): Promise<License | null> {
        const result = await pool.query(
            `SELECT * FROM licenses
             WHERE user_id = $1 AND is_active = true AND expiry_date > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        if (result.rows.length === 0) return null;
        return new License(result.rows[0]);
    }

    /**
     * Get all licenses with pagination
     */
    static async findAll(
        page: number = 1,
        limit: number = 20,
        filters?: { userId?: string; isActive?: boolean; isSold?: boolean }
    ): Promise<{ licenses: License[]; total: number }> {
        const offset = (page - 1) * limit;
        let whereClause = '1=1';
        const params: any[] = [];

        if (filters?.userId) {
            params.push(filters.userId);
            whereClause += ` AND user_id = $${params.length}`;
        }
        if (filters?.isActive !== undefined) {
            params.push(filters.isActive);
            whereClause += ` AND is_active = $${params.length}`;
        }
        if (filters?.isSold !== undefined) {
            params.push(filters.isSold);
            whereClause += ` AND is_sold = $${params.length}`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM licenses WHERE ${whereClause}`,
            params
        );

        params.push(limit, offset);
        const result = await pool.query(
            `SELECT l.*, u.username, u.email
             FROM licenses l
             LEFT JOIN users u ON l.user_id = u.id
             WHERE ${whereClause}
             ORDER BY l.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const licenses = result.rows.map((row) => new License(row));
        return {
            licenses,
            total: parseInt(countResult.rows[0].count, 10)
        };
    }

    /**
     * Get licenses expiring soon
     */
    static async getExpiringSoon(days: number = 7): Promise<License[]> {
        const result = await pool.query(
            `SELECT l.*, u.username, u.email
             FROM licenses l
             LEFT JOIN users u ON l.user_id = u.id
             WHERE l.is_active = true
               AND l.expiry_date > NOW()
               AND l.expiry_date < NOW() + INTERVAL '${days} days'
             ORDER BY l.expiry_date ASC`
        );
        return result.rows.map((row) => new License(row));
    }

    /**
     * Get license statistics
     */
    static async getStats(): Promise<any> {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total_licenses,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_licenses,
                COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_licenses,
                COUNT(CASE WHEN is_sold = true THEN 1 END) as sold_licenses,
                COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as assigned_licenses,
                SUM(CASE WHEN is_active = true THEN max_devices ELSE 0 END) as total_device_slots,
                AVG(max_devices) as avg_devices_per_license
             FROM licenses`
        );
        return result.rows[0];
    }

    // ============================================================
    // INSTANCE METHODS
    // ============================================================

    /**
     * Assign license to user
     */
    async assignUser(userId: string, adminId?: string): Promise<void> {
        // Check if user already has an active license
        const existing = await License.findActiveByUser(userId);
        if (existing) {
            throw new Error('User already has an active license');
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        await pool.query(
            'UPDATE licenses SET user_id = $1, updated_at = NOW() WHERE id = $2',
            [userId, this.id]
        );

        this.user_id = userId;
        this.is_sold = true;
        this.sold_at = new Date();
        this.sold_price = 0;
        this.updated_at = new Date();

        await this.cache();

        logger.info(`🔑 License ${this.license_key} assigned to user ${user.username}`);
    }

    /**
     * Activate license
     */
    async activate(): Promise<void> {
        await pool.query(
            'UPDATE licenses SET is_active = true, updated_at = NOW() WHERE id = $1',
            [this.id]
        );
        this.is_active = true;
        this.updated_at = new Date();
        await this.cache();
    }

    /**
     * Deactivate license
     */
    async deactivate(): Promise<void> {
        await pool.query(
            'UPDATE licenses SET is_active = false, updated_at = NOW() WHERE id = $1',
            [this.id]
        );
        this.is_active = false;
        this.updated_at = new Date();
        await this.cache();
    }

    /**
     * Update license
     */
    async update(data: ILicenseUpdate): Promise<License> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.maxDevices !== undefined) {
            updates.push(`max_devices = $${paramCount}`);
            values.push(data.maxDevices);
            paramCount++;
        }
        if (data.expiryDate !== undefined) {
            updates.push(`expiry_date = $${paramCount}`);
            values.push(data.expiryDate);
            paramCount++;
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramCount}`);
            values.push(data.isActive);
            paramCount++;
        }
        if (data.maxRequestsPerMinute !== undefined) {
            updates.push(`max_requests_per_minute = $${paramCount}`);
            values.push(data.maxRequestsPerMinute);
            paramCount++;
        }
        if (data.maxRequestsPerHour !== undefined) {
            updates.push(`max_requests_per_hour = $${paramCount}`);
            values.push(data.maxRequestsPerHour);
            paramCount++;
        }
        if (data.maxRequestsPerDay !== undefined) {
            updates.push(`max_requests_per_day = $${paramCount}`);
            values.push(data.maxRequestsPerDay);
            paramCount++;
        }
        if (data.notes !== undefined) {
            updates.push(`notes = $${paramCount}`);
            values.push(data.notes);
            paramCount++;
        }

        if (updates.length === 0) {
            return this;
        }

        updates.push(`updated_at = NOW()`);
        values.push(this.id);

        const result = await pool.query(
            `UPDATE licenses SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('License not found');
        }

        Object.assign(this, result.rows[0]);
        await this.cache();

        return this;
    }

    /**
     * Mark license as sold
     */
    async markAsSold(price: number): Promise<void> {
        await pool.query(
            'UPDATE licenses SET is_sold = true, sold_price = $1, sold_at = NOW(), updated_at = NOW() WHERE id = $2',
            [price, this.id]
        );
        this.is_sold = true;
        this.sold_price = price;
        this.sold_at = new Date();
        this.updated_at = new Date();
        await this.cache();
    }

    /**
     * Check if license is valid
     */
    isValid(): boolean {
        return this.is_active && new Date() < this.expiry_date;
    }

    /**
     * Check if license is expired
     */
    isExpired(): boolean {
        return new Date() > this.expiry_date;
    }

    /**
     * Check if device limit is reached
     */
    isDeviceLimitReached(): boolean {
        return this.active_devices >= this.max_devices;
    }

    /**
     * Get remaining days
     */
    getRemainingDays(): number {
        const now = new Date();
        const diff = this.expiry_date.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    /**
     * Get user associated with license
     */
    async getUser(): Promise<User | null> {
        if (!this.user_id) return null;
        return User.findById(this.user_id);
    }

    /**
     * Get devices associated with license
     */
    async getDevices(): Promise<any[]> {
        const result = await pool.query(
            'SELECT * FROM devices WHERE license_id = $1 AND is_active = true',
            [this.id]
        );
        return result.rows;
    }

    /**
     * Get usage statistics
     */
    async getUsageStats(): Promise<any> {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total_requests,
                COUNT(CASE WHEN success = true THEN 1 END) as successful_requests,
                COUNT(CASE WHEN success = false THEN 1 END) as failed_requests,
                COUNT(DISTINCT campaign_id) as campaigns,
                MIN(created_at) as first_request,
                MAX(created_at) as last_request
             FROM sms_requests
             WHERE campaign_id IN (
                 SELECT id FROM sms_campaigns WHERE license_id = $1
             )
             AND created_at > NOW() - INTERVAL '30 days'`,
            [this.id]
        );
        return result.rows[0];
    }

    // ============================================================
    // CACHE METHODS
    // ============================================================

    /**
     * Get license from cache
     */
    static async getCached(licenseKey: string): Promise<License | null> {
        const cached = await redis.get(`license:key:${licenseKey}`);
        if (!cached) return null;
        try {
            const data = JSON.parse(cached);
            return new License(data);
        } catch {
            return null;
        }
    }

    /**
     * Cache license
     */
    async cache(): Promise<void> {
        await redis.setex(
            `license:key:${this.license_key}`,
            86400, // 24 hours
            JSON.stringify(this)
        );
        await redis.setex(
            `license:id:${this.id}`,
            86400,
            JSON.stringify(this)
        );
    }

    /**
     * Clear license cache
     */
    async clearCache(): Promise<void> {
        await redis.del(`license:key:${this.license_key}`);
        await redis.del(`license:id:${this.id}`);
    }

    // ============================================================
    // UTILITY METHODS
    // ============================================================

    /**
     * Generate unique license key
     */
    static generateKey(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let key = '';
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                key += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            if (i < 3) key += '-';
        }
        return key;
    }

    /**
     * Validate license key format
     */
    static validateKeyFormat(key: string): boolean {
        return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
    }

    /**
     * Sanitize license data
     */
    toJSON(): Partial<ILicense> {
        const { ...license } = this;
        return license;
    }

    /**
     * Check if license can be extended
     */
    canExtend(): boolean {
        return this.is_active && !this.isExpired();
    }
}

export default License;
