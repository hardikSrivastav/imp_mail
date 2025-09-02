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

# Copy source code (including public directory)
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_API_BASE_URL=https://amail.hardiksrivastava.com
ARG NEXT_PUBLIC_FASTAPI_URL=https://amail.hardiksrivastava.com/ml
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_FASTAPI_URL=$NEXT_PUBLIC_FASTAPI_URL

# Verify public directory exists
RUN ls -la /app/public || echo "Public directory not found in builder stage"

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

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/package.json ./package.json

# Note: Skipping public directory copy - test if the app works without it
# If you need static assets later, you can add: COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Change ownership of all copied files to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3005

# Start the application
CMD ["pnpm", "start"]
