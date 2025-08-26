# Development stage
FROM python:3.11-slim AS development

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first for better caching
COPY requirements_minimal.txt ./

# Install Python dependencies with optimizations (including dev dependencies)
RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    --index-url https://pypi.org/simple/ \
    --trusted-host pypi.org \
    -r requirements_minimal.txt

# Create directories for data persistence
RUN mkdir -p /app/data /app/models /app/logs /app/shared_data

# Create non-root user and set permissions
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Development command (will be overridden by docker-compose)
CMD ["uvicorn", "email_classifier_service:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production stage
FROM python:3.11-slim AS production

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first for better caching
COPY requirements_minimal.txt ./

# Install Python dependencies with optimizations
RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    --index-url https://pypi.org/simple/ \
    --trusted-host pypi.org \
    -r requirements_minimal.txt

# Copy application code
COPY *.py .

# Create directories for data persistence
RUN mkdir -p /app/data /app/models /app/logs /app/shared_data

# Create non-root user and set permissions
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "email_classifier_service:app", "--host", "0.0.0.0", "--port", "8000"]
