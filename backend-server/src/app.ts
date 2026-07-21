/**
 * SMS Bomber System - Main Application Entry Point
 * Complete backend server with authentication, license management, and SMS bombing
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Import configurations
import { connectDatabase, pool } from './config/database';
import { connectRedis, redis } from './config/redis';
import { configureSocket } from './config/socket';

// Import middleware
import { authenticate, requireAdmin } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';

// Import routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import licenseRoutes from './routes/licenses';
import userRoutes from './routes/users';
import smsRoutes from './routes/sms';
import statsRoutes from './routes/stats';
import deviceRoutes from './routes/devices';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Express
const app: Express = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
    },
    path: '/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req: Request) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req);
    }
}));

// Logging
app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim())
    }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiter
const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 requests per minute
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/metrics';
    }
});
app.use(globalLimiter);

// ============================================================
// HEALTH CHECK ENDPOINT
// ============================================================

app.get('/health', async (req: Request, res: Response) => {
    try {
        // Check database
        await pool.query('SELECT 1');
        
        // Check Redis
        await redis.ping();

        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services: {
                database: 'connected',
                redis: 'connected',
                api: 'running'
            }
        });
    } catch (error: any) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================================
// METRICS ENDPOINT (Prometheus)
// ============================================================

app.get('/metrics', async (req: Request, res: Response) => {
    // In production, this should be protected and authenticated
    // Simplified metrics for demonstration
    const metrics = {
        cpu: process.cpuUsage(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        requestCount: 0, // Would be tracked in middleware
        activeConnections: 0
    };
    res.json(metrics);
});

// ============================================================
// API ROUTES
// ============================================================

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);
app.use('/api/licenses', authenticate, licenseRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/sms', authenticate, smsRoutes);
app.use('/api/stats', authenticate, statsRoutes);
app.use('/api/devices', authenticate, deviceRoutes);

// ============================================================
// WEB SOCKET CONFIGURATION
// ============================================================

configureSocket(io);

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

app.use(errorHandler);

// 404 Handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// ============================================================
// SERVER STARTUP
// ============================================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
    try {
        // Connect to database
        await connectDatabase();
        logger.info('✅ Database connected successfully');

        // Connect to Redis
        await connectRedis();
        logger.info('✅ Redis connected successfully');

        // Start server
        httpServer.listen(PORT, HOST, () => {
            logger.info(`🚀 Server started on ${HOST}:${PORT}`);
            logger.info(`📡 WebSocket server ready on /socket.io`);
            logger.info(`🌐 Environment: ${process.env.NODE_ENV}`);
            logger.info(`📊 Health check: http://${HOST}:${PORT}/health`);
            logger.info(`🔒 API Gateway: ${process.env.API_URL || 'http://localhost:3000'}`);
        });

        // Graceful shutdown
        const shutdown = async () => {
            logger.info('🔄 Shutting down gracefully...');
            
            // Close WebSocket connections
            io.close(() => {
                logger.info('📡 WebSocket connections closed');
            });

            // Close HTTP server
            httpServer.close(() => {
                logger.info('🔒 HTTP server closed');
            });

            // Close database connections
            await pool.end();
            await redis.quit();
            
            logger.info('✅ Clean shutdown complete');
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error: any) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

export { app, io, httpServer };
