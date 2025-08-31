# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies needed for building
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Install dependencies needed for development
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code for development
COPY . .

# Expose port
EXPOSE 3005

# Start the application in development mode
CMD ["pnpm", "dev"]

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install dependencies needed for runtime
RUN apk add --no-cache libc6-compat

# Add a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and production dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

# Copy public directory from source first (before switching users)
COPY public ./public

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/package.json ./package.json

# Change ownership of all copied files to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3005

# Start the application
CMD ["pnpm", "start"]
