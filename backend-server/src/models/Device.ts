/**
 * Device Model
 * Tracks devices registered to licenses for device-based authentication
 */

import { pool } from '../config/database';
import { redis } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger';
import License from './License';

// ============================================================
// INTERFACES
// ============================================================

export interface IDevice {
    id: string;
    license_id: string;
    device_id: string;
    device_name: string;
    device_model: string;
    os_version: string;
    app_version: string;
    ip_address: string;
    last_ping_at: Date;
    is_active: boolean;
    registered_at: Date;
    last_seen_at: Date;
}

export interface IDeviceCreate {
    licenseId: string;
    deviceId: string;
    deviceName?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    ipAddress?: string;
}

export interface IDeviceUpdate {
    deviceName?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    isActive?: boolean;
}

// ============================================================
// DEVICE CLASS
// ============================================================

export class Device {
    id: string;
    license_id: string;
    device_id: string;
    device_name: string;
    device_model: string;
    os_version: string;
    app_version: string;
    ip_address: string;
    last_ping_at: Date;
    is_active: boolean;
    registered_at: Date;
    last_seen_at: Date;

    constructor(data: IDevice) {
        this.id = data.id;
        this.license_id = data.license_id;
        this.device_id = data.device_id;
        this.device_name = data.device_name;
        this.device_model = data.device_model;
        this.os_version = data.os_version;
        this.app_version = data.app_version;
        this.ip_address = data.ip_address;
        this.last_ping_at = data.last_ping_at;
        this.is_active = data.is_active;
        this.registered_at = data.registered_at;
        this.last_seen_at = data.last_seen_at;
    }

    // ============================================================
    // STATIC METHODS
    // ============================================================

    /**
     * Register a new device
     */
    static async register(data: IDeviceCreate): Promise<Device> {
        const {
            licenseId,
            deviceId,
            deviceName = 'Unknown Device',
            deviceModel = 'Unknown Model',
            osVersion = 'Unknown OS',
            appVersion = '1.0.0',
            ipAddress = '0.0.0.0'
        } = data;

        // Check if license exists and is valid
        const license = await License.findById(licenseId);
        if (!license) {
            throw new Error('License not found');
        }
        if (!license.isValid()) {
            throw new Error('License is not valid or has expired');
        }

        // Check if device already exists
        const existing = await pool.query(
            'SELECT * FROM devices WHERE license_id = $1 AND device_id = $2',
            [licenseId, deviceId]
        );

        if (existing.rows.length > 0) {
            // Update existing device
            const device = new Device(existing.rows[0]);
            await device.update({
                deviceName,
                deviceModel,
                osVersion,
                appVersion,
                isActive: true
            });
            await device.updateLastSeen(ipAddress);
            return device;
        }

        // Check device limit
        const deviceCount = await pool.query(
            'SELECT COUNT(*) FROM devices WHERE license_id = $1 AND is_active = true',
            [licenseId]
        );

        if (parseInt(deviceCount.rows[0].count, 10) >= license.max_devices) {
            throw new Error(`Device limit reached (max ${license.max_devices} devices)`);
        }

        // Register new device
        const result = await pool.query(
            `INSERT INTO devices (
                id, license_id, device_id, device_name, device_model,
                os_version, app_version, ip_address, last_ping_at, last_seen_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                uuidv4(),
                licenseId,
                deviceId,
                deviceName,
                deviceModel,
                osVersion,
                appVersion,
                ipAddress,
                new Date(),
                new Date()
            ]
        );

        // Update active devices count
        await pool.query(
            'UPDATE licenses SET active_devices = active_devices + 1 WHERE id = $1',
            [licenseId]
        );

        const device = new Device(result.rows[0]);

        logger.info(`📱 Device registered: ${deviceId} for license ${licenseId}`);

        return device;
    }

    /**
     * Find device by ID
     */
    static async findById(id: string): Promise<Device | null> {
        const result = await pool.query(
            'SELECT * FROM devices WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) return null;
        return new Device(result.rows[0]);
    }

    /**
     * Find device by license and device ID
     */
    static async findByDeviceId(licenseId: string, deviceId: string): Promise<Device | null> {
        const result = await pool.query(
            'SELECT * FROM devices WHERE license_id = $1 AND device_id = $2',
            [licenseId, deviceId]
        );
        if (result.rows.length === 0) return null;
        return new Device(result.rows[0]);
    }

    /**
     * Get all devices for a license
     */
    static async getLicenseDevices(licenseId: string, activeOnly: boolean = true): Promise<Device[]> {
        const result = await pool.query(
            `SELECT * FROM devices
             WHERE license_id = $1
             ${activeOnly ? 'AND is_active = true' : ''}
             ORDER BY last_seen_at DESC`,
            [licenseId]
        );
        return result.rows.map((row) => new Device(row));
    }

    /**
     * Get all devices for a user
     */
    static async getUserDevices(userId: string): Promise<Device[]> {
        const result = await pool.query(
            `SELECT d.*
             FROM devices d
             JOIN licenses l ON d.license_id = l.id
             WHERE l.user_id = $1 AND d.is_active = true
             ORDER BY d.last_seen_at DESC`,
            [userId]
        );
        return result.rows.map((row) => new Device(row));
    }

    /**
     * Clean up inactive devices
     */
    static async cleanupInactive(olderThanDays: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const result = await pool.query(
            `UPDATE devices
             SET is_active = false
             WHERE is_active = true
               AND last_seen_at < $1
             RETURNING id`,
            [cutoffDate]
        );

        // Update license active devices count
        const deviceIds = result.rows.map((row) => row.id);
        if (deviceIds.length > 0) {
            await pool.query(
                `UPDATE licenses l
                 SET active_devices = (
                     SELECT COUNT(*) FROM devices d
                     WHERE d.license_id = l.id AND d.is_active = true
                 )
                 WHERE id IN (SELECT DISTINCT license_id FROM devices WHERE id = ANY($1))`,
                [deviceIds]
            );
        }

        logger.info(`🧹 Cleaned up ${deviceIds.length} inactive devices`);
        return deviceIds.length;
    }

    // ============================================================
    // INSTANCE METHODS
    // ============================================================

    /**
     * Update device info
     */
    async update(data: IDeviceUpdate): Promise<Device> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.deviceName !== undefined) {
            updates.push(`device_name = $${paramCount}`);
            values.push(data.deviceName);
            paramCount++;
        }
        if (data.deviceModel !== undefined) {
            updates.push(`device_model = $${paramCount}`);
            values.push(data.deviceModel);
            paramCount++;
        }
        if (data.osVersion !== undefined) {
            updates.push(`os_version = $${paramCount}`);
            values.push(data.osVersion);
            paramCount++;
        }
        if (data.appVersion !== undefined) {
            updates.push(`app_version = $${paramCount}`);
            values.push(data.appVersion);
            paramCount++;
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramCount}`);
            values.push(data.isActive);
            paramCount++;
        }

        if (updates.length === 0) {
            return this;
        }

        values.push(this.id);

        const result = await pool.query(
            `UPDATE devices SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Device not found');
        }

        Object.assign(this, result.rows[0]);
        await this.cache();

        return this;
    }

    /**
     * Update last seen timestamp
     */
    async updateLastSeen(ipAddress?: string): Promise<void> {
        const updates: string[] = ['last_seen_at = NOW()'];
        const values: any[] = [this.id];
        let paramCount = 2;

        if (ipAddress) {
            updates.push(`ip_address = $${paramCount}`);
            values.push(ipAddress);
            paramCount++;
        }

        await pool.query(
            `UPDATE devices SET ${updates.join(', ')} WHERE id = $1`,
            values
        );

        this.last_seen_at = new Date();
        if (ipAddress) {
            this.ip_address = ipAddress;
        }
        await this.cache();
    }

    /**
     * Update ping timestamp
     */
    async updatePing(): Promise<void> {
        await pool.query(
            'UPDATE devices SET last_ping_at = NOW() WHERE id = $1',
            [this.id]
        );
        this.last_ping_at = new Date();
        await this.cache();
    }

    /**
     * Deactivate device
     */
    async deactivate(): Promise<void> {
        await pool.query(
            'UPDATE devices SET is_active = false WHERE id = $1',
            [this.id]
        );
        this.is_active = false;
        await this.cache();

        // Update license device count
        await pool.query(
            `UPDATE licenses
             SET active_devices = (
                 SELECT COUNT(*) FROM devices
                 WHERE license_id = $1 AND is_active = true
             )
             WHERE id = $1`,
            [this.license_id]
        );

        logger.info(`📱 Device deactivated: ${this.device_id}`);
    }

    /**
     * Get license associated with device
     */
    async getLicense(): Promise<License | null> {
        return License.findById(this.license_id);
    }

    /**
     * Check if device is online
     */
    isOnline(): boolean {
        const now = new Date();
        const diff = now.getTime() - this.last_ping_at.getTime();
        return diff < 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get device uptime
     */
    getUptime(): number {
        const now = new Date();
        const diff = now.getTime() - this.registered_at.getTime();
        return Math.floor(diff / (1000 * 60 * 60)); // Hours
    }

    // ============================================================
    // CACHE METHODS
    // ============================================================

    /**
     * Get device from cache
     */
    static async getCached(deviceId: string): Promise<Device | null> {
        const cached = await redis.get(`device:${deviceId}`);
        if (!cached) return null;
        try {
            const data = JSON.parse(cached);
            return new Device(data);
        } catch {
            return null;
        }
    }

    /**
     * Cache device
     */
    async cache(): Promise<void> {
        await redis.setex(
            `device:${this.device_id}`,
            3600, // 1 hour
            JSON.stringify(this)
        );
        await redis.setex(
            `device:id:${this.id}`,
            3600,
            JSON.stringify(this)
        );
    }

    /**
     * Clear device cache
     */
    async clearCache(): Promise<void> {
        await redis.del(`device:${this.device_id}`);
        await redis.del(`device:id:${this.id}`);
    }

    // ============================================================
    // UTILITY METHODS
    // ============================================================

    /**
     * Generate device fingerprint
     */
    static generateFingerprint(
        deviceId: string,
        deviceName: string,
        osVersion: string
    ): string {
        const raw = `${deviceId}:${deviceName}:${osVersion}`;
        return Buffer.from(raw).toString('base64');
    }

    /**
     * Validate device ID format
     */
    static validateDeviceId(deviceId: string): boolean {
        return deviceId.length > 0 && deviceId.length <= 255;
    }

    /**
     * Sanitize device data
     */
    toJSON(): Partial<IDevice> {
        const { ...device } = this;
        return device;
    }

    /**
     * Get device status text
     */
    getStatus(): 'online' | 'offline' | 'inactive' {
        if (!this.is_active) return 'inactive';
        if (this.isOnline()) return 'online';
        return 'offline';
    }
}

export default Device;
