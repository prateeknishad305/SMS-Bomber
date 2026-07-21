# ============================================================
# BUILD STAGE
# ============================================================
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json yarn.lock ./
COPY tsconfig*.json ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY src ./src
COPY scripts ./scripts
COPY .env.example .env

# Build TypeScript
RUN yarn build

# ============================================================
# PRODUCTION STAGE
# ============================================================
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache tini

# Set working directory
WORKDIR /app

# Copy package files for production
COPY package*.json yarn.lock ./

# Install production dependencies only
RUN yarn install --frozen-lockfile --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/ecosystem.config.js ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3000

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/app.js"]
