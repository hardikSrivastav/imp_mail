# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install runtime dependencies and build tools for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install only production dependencies and rebuild native modules
RUN npm ci --only=production && npm rebuild sqlite3

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy environment file
COPY .env ./

# Create data and logs directories
RUN mkdir -p data logs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]