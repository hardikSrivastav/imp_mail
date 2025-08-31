# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ postgresql-dev sqlite-dev

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm install

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Install runtime dependencies and build tools for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for development)
RUN npm install

# Copy source code for development
COPY src ./src
COPY tsconfig.json ./

# Create data and logs directories
RUN mkdir -p data logs

# Expose port
EXPOSE 3000

# Start the application in development mode
CMD ["npm", "run", "dev"]

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install runtime dependencies and build tools for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install only production dependencies with timeout and retry logic
RUN npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --only=production --no-optional && \
    npm rebuild sqlite3

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file
COPY .env ./

# Create data and logs directories with proper permissions
RUN mkdir -p data logs && chmod 777 data logs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]