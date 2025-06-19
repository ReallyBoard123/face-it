# job_manager.py - Async Job Processing Manager

import asyncio
import logging
import os
import psutil
import time
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import tempfile

from facial_expression_recognizer import analyze_facial_expressions_async

logger = logging.getLogger(__name__)

class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Job:
    job_id: str
    session_id: str
    file_content: bytes
    filename: str
    content_type: str
    settings: Optional[str] = None
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    message: str = "Job queued"
    result: Optional[Dict] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_duration: float = 1.0  # minutes

class JobManager:
    def __init__(self, max_workers: int = 3):
        self.max_workers = max_workers
        self.jobs: Dict[str, Job] = {}
        self.active_workers = 0
        self.processing_semaphore = asyncio.Semaphore(max_workers)
        self.cache: Dict[str, Any] = {}
        self.stats = {
            "total_submitted": 0,
            "total_completed": 0,
            "total_failed": 0,
            "total_cancelled": 0
        }
        self._cleanup_task = None
        
    async def start(self):
        """Start the job manager."""
        # Start cleanup task to remove old jobs
        self._cleanup_task = asyncio.create_task(self._cleanup_old_jobs())
        logger.info(f"Job manager started with {self.max_workers} workers")
        
    async def stop(self):
        """Stop the job manager."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("Job manager stopped")
    
    def create_job(self, job_id: str, session_id: str, file_content: bytes, 
                   filename: str, content_type: str, settings: Optional[str] = None,
                   estimated_duration: float = 1.0) -> Job:
        """Create a new job."""
        job = Job(
            job_id=job_id,
            session_id=session_id,
            file_content=file_content,
            filename=filename,
            content_type=content_type,
            settings=settings,
            estimated_duration=estimated_duration
        )
        
        self.jobs[job_id] = job
        self.stats["total_submitted"] += 1
        
        logger.info(f"Created job {job_id} for session {session_id}")
        return job
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self.jobs.get(job_id)
    
    def get_active_jobs(self) -> List[Dict]:
        """Get all active jobs."""
        return [
            {
                "job_id": job.job_id,
                "session_id": job.session_id,
                "status": job.status.value,
                "progress": job.progress,
                "created_at": job.created_at.isoformat()
            }
            for job in self.jobs.values()
            if job.status in [JobStatus.QUEUED, JobStatus.PROCESSING]
        ]
    
    def get_queued_jobs(self) -> List[Dict]:
        """Get all queued jobs."""
        return [
            {
                "job_id": job.job_id,
                "session_id": job.session_id,
                "estimated_duration": job.estimated_duration,
                "created_at": job.created_at.isoformat()
            }
            for job in self.jobs.values()
            if job.status == JobStatus.QUEUED
        ]
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a job if possible."""
        job = self.jobs.get(job_id)
        if not job:
            return False
            
        if job.status in [JobStatus.QUEUED]:
            job.status = JobStatus.CANCELLED
            job.message = "Job cancelled by user"
            job.completed_at = datetime.now()
            self.stats["total_cancelled"] += 1
            logger.info(f"Job {job_id} cancelled")
            return True
        
        return False
    
    async def process_job(self, job_id: str):
        """Process a single job with progress tracking."""
        job = self.jobs.get(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            return
        
        # Wait for available worker slot
        async with self.processing_semaphore:
            self.active_workers += 1
            
            try:
                await self._process_job_internal(job)
            finally:
                self.active_workers -= 1
    
    async def _process_job_internal(self, job: Job):
        """Internal job processing with error handling."""
        job.status = JobStatus.PROCESSING
        job.started_at = datetime.now()
        job.message = "Processing video..."
        job.progress = 0.1
        
        logger.info(f"Started processing job {job.job_id}")
        
        try:
            # Create progress callback
            def progress_callback(progress: float, message: str = ""):
                job.progress = min(0.95, max(0.1, progress))  # Keep between 10% and 95%
                job.message = message or f"Processing... {job.progress*100:.0f}%"
                logger.info(f"Job {job.job_id} progress: {job.progress*100:.0f}% - {job.message}")
            
            # Process the video with progress tracking
            result = await analyze_facial_expressions_async(
                file_content=job.file_content,
                filename=job.filename,
                content_type=job.content_type,
                settings=job.settings,
                progress_callback=progress_callback
            )
            
            # Job completed successfully
            job.status = JobStatus.COMPLETED
            job.progress = 1.0
            job.message = "Analysis completed successfully"
            job.result = result
            job.completed_at = datetime.now()
            self.stats["total_completed"] += 1
            
            # Calculate actual processing time
            processing_time = (job.completed_at - job.started_at).total_seconds() / 60.0
            logger.info(f"Job {job.job_id} completed in {processing_time:.1f} minutes")
            
        except Exception as e:
            # Job failed
            job.status = JobStatus.FAILED
            job.progress = 0.0
            job.error = str(e)
            job.message = f"Analysis failed: {str(e)}"
            job.completed_at = datetime.now()
            self.stats["total_failed"] += 1
            
            logger.error(f"Job {job.job_id} failed: {e}", exc_info=True)
    
    async def _cleanup_old_jobs(self):
        """Periodically cleanup old completed jobs."""
        while True:
            try:
                # Wait 10 minutes between cleanups
                await asyncio.sleep(600)
                
                current_time = datetime.now()
                jobs_to_remove = []
                
                for job_id, job in self.jobs.items():
                    # Remove completed/failed jobs older than 1 hour
                    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                        if job.completed_at and (current_time - job.completed_at).total_seconds() > 3600:
                            jobs_to_remove.append(job_id)
                
                # Remove old jobs
                for job_id in jobs_to_remove:
                    del self.jobs[job_id]
                    logger.info(f"Cleaned up old job {job_id}")
                
                if jobs_to_remove:
                    logger.info(f"Cleaned up {len(jobs_to_remove)} old jobs")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")
    
    def get_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        try:
            process = psutil.Process(os.getpid())
            return process.memory_info().rss / 1024 / 1024
        except:
            return 0.0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get job processing statistics."""
        return {
            **self.stats,
            "active_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.PROCESSING]),
            "queued_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.QUEUED]),
            "total_jobs": len(self.jobs),
            "active_workers": self.active_workers,
            "max_workers": self.max_workers
        }
    
    def clear_cache(self) -> int:
        """Clear all cached data."""
        cache_size = len(self.cache)
        self.cache.clear()
        logger.info(f"Cleared {cache_size} cache entries")
        return cache_size
    
    def get_cache_status(self) -> Dict[str, Any]:
        """Get cache status information."""
        return {
            "cache_size": len(self.cache),
            "memory_usage_mb": self.get_memory_usage(),
            "timestamp": datetime.now().isoformat()
        }