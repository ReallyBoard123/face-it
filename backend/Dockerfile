FROM nvidia/cuda:12.1.1-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.11, Redis, and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    redis-server \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3.11 /usr/bin/python

WORKDIR /app

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create supervisor configuration for cloud deployment
RUN echo '[supervisord]\n\
nodaemon=true\n\
user=root\n\
loglevel=info\n\
\n\
[program:redis]\n\
command=redis-server --bind 0.0.0.0 --port 6379 --appendonly yes\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
priority=100\n\
\n\
[program:celery]\n\
command=celery -A celery_app worker --loglevel=info --concurrency=1 --pool=solo\n\
directory=/app\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
environment=REDIS_URL="redis://localhost:6379"\n\
priority=200\n\
\n\
[program:webapp]\n\
command=uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1 --limit-request-field-size 65536 --limit-request-line 8190\n\
directory=/app\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
environment=REDIS_URL="redis://localhost:6379"\n\
priority=300' > /etc/supervisor/conf.d/supervisord.conf

# Create startup script for hybrid deployment
RUN echo '#!/bin/bash\n\
\n\
# Check deployment mode\n\
if [ "$DEPLOYMENT_MODE" = "cloud" ]; then\n\
    echo "🚀 Starting in CLOUD mode (all services in one container)"\n\
    # Wait a moment for Redis to be ready in supervisor\n\
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf\n\
elif [ "$CELERY_WORKER" = "true" ]; then\n\
    echo "🔧 Starting as CELERY WORKER (local docker-compose mode)"\n\
    exec celery -A celery_app worker --loglevel=info --concurrency=2\n\
else\n\
    echo "🌐 Starting as WEB SERVER (local docker-compose mode)"\n\
    exec uvicorn app:app --host 0.0.0.0 --port 8000 --reload\n\
fi' > /app/start.sh && chmod +x /app/start.sh

# Set environment variables
ENV PYTHONPATH=/app
ENV REDIS_URL=redis://localhost:6379

EXPOSE 8000

CMD ["/app/start.sh"]