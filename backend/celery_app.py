import os
from celery import Celery

# Redis URL from environment
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')

# Create Celery app
celery_app = Celery(
    'faceit_backend',
    broker=redis_url,
    backend=redis_url,
    include=['facial_expression_analyzer']
)

# Celery configuration
celery_app.conf.update(
    # Task serialization
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Task execution
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=1800,  # 30 minutes max per task
    task_soft_time_limit=1500,  # 25 minutes soft limit
    
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    result_backend_transport_options={
        'master_name': 'mymaster',
    },
    
    # Worker settings
    worker_max_tasks_per_child=50,
    worker_disable_rate_limits=True,
    
    # Beat schedule (for periodic tasks)
    beat_schedule={
        'cleanup-old-results': {
            'task': 'celery_app.cleanup_old_results',
            'schedule': 3600.0,  # Run every hour
        },
    },
)

# Optional: Add task for cleanup
@celery_app.task
def cleanup_old_results():
    """Periodic task to clean up old cached results"""
    from utils import RedisManager
    import logging
    
    logger = logging.getLogger(__name__)
    redis_manager = RedisManager()
    
    try:
        # This would implement cleanup logic for old cached results
        logger.info("Cleanup task executed")
    except Exception as e:
        logger.error(f"Cleanup task failed: {e}")

if __name__ == '__main__':
    celery_app.start()