# ============================================================
# Zel-EYE: OI — FastAPI Backend Dockerfile
# ============================================================
FROM python:3.11-slim

# LibreOffice is required by the PTW PDF pipeline (DOCX → PDF conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (Docker layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# DuckDB cache directory (writable volume mount in production)
RUN mkdir -p /data
ENV DUCKDB_LOCAL_PATH=/data/master.duckdb

EXPOSE 8000

# Production: Gunicorn with Uvicorn workers
CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "2", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--graceful-timeout", "30"]
