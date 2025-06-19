# job_manager.py - Simple Job Queue with Timeouts

import asyncio
import logging
import os
import psutil
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

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
    estimated_duration: float = 1.0

class JobManager:
    def __init__(self, max_workers: int = 2):
        self.max_workers = max_workers
        self.jobs: Dict[str, Job] = {}
        self.active_workers = 0
        self.processing_semaphore = asyncio.Semaphore(max_workers)
        self.stats = {
            "total_submitted": 0,
            "total_completed": 0,
            "total_failed": 0,
            "total_cancelled": 0
        }
        self._cleanup_task = None
        
    async def start(self):
        """Start job manager."""
        self._cleanup_task = asyncio.create_task(self._cleanup_old_jobs())
        logger.info(f"🚀 Job manager started with {self.max_workers} workers")
        
    async def stop(self):
        """Stop job manager."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 Job manager stopped")
    
    def create_job(self, job_id: str, session_id: str, file_content: bytes, 
                   filename: str, content_type: str, settings: Optional[str] = None,
                   estimated_duration: float = 1.0) -> Job:
        """Create new job."""
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
        
        logger.info(f"📝 Created job {job_id} for session {session_id}")
        return job
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self.jobs.get(job_id)
    
    def get_active_jobs(self) -> List[Dict]:
        """Get active jobs."""
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
        """Get queued jobs."""
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
        """Cancel job."""
        job = self.jobs.get(job_id)
        if not job:
            return False
            
        if job.status in [JobStatus.QUEUED, JobStatus.PROCESSING]:
            job.status = JobStatus.CANCELLED
            job.message = "Job cancelled"
            job.completed_at = datetime.now()
            self.stats["total_cancelled"] += 1
            logger.info(f"❌ Job {job_id} cancelled")
            return True
        
        return False
    
    async def process_job(self, job_id: str):
        """Process job with timeout."""
        job = self.jobs.get(job_id)
        if not job:
            logger.error(f"❌ Job {job_id} not found")
            return
        
        async with self.processing_semaphore:
            self.active_workers += 1
            
            try:
                await self._process_job_with_timeout(job)
            finally:
                self.active_workers -= 1
    
    async def _process_job_with_timeout(self, job: Job):
        """Process job with 15-minute timeout."""
        job.status = JobStatus.PROCESSING
        job.started_at = datetime.now()
        job.message = "Processing video..."
        job.progress = 0.1
        
        logger.info(f"⚡ Started processing job {job.job_id}")
        
        try:
            async with asyncio.timeout(900):  # 15 minutes
                def progress_callback(progress: float, message: str = ""):
                    job.progress = min(0.95, max(0.1, progress))
                    job.message = message or f"Processing... {job.progress*100:.0f}%"
                
                from facial_expression_recognizer import analyze_facial_expressions_async
                result = await analyze_facial_expressions_async(
                    file_content=job.file_content,
                    filename=job.filename,
                    content_type=job.content_type,
                    settings=job.settings,
                    progress_callback=progress_callback
                )
                
                # Success
                job.status = JobStatus.COMPLETED
                job.progress = 1.0
                job.message = "Analysis completed successfully"
                job.result = result
                job.completed_at = datetime.now()
                self.stats["total_completed"] += 1
                
                processing_time = (job.completed_at - job.started_at).total_seconds() / 60.0
                logger.info(f"✅ Job {job.job_id} completed in {processing_time:.1f} minutes")
                
        except asyncio.TimeoutError:
            job.status = JobStatus.FAILED
            job.progress = 0.0
            job.error = "Job timeout - 15 minute limit exceeded"
            job.message = "Job timed out"
            job.completed_at = datetime.now()
            self.stats["total_failed"] += 1
            logger.error(f"⏰ Job {job.job_id} timed out after 15 minutes")
            
        except Exception as e:
            job.status = JobStatus.FAILED
            job.progress = 0.0
            job.error = str(e)
            job.message = f"Analysis failed: {str(e)}"
            job.completed_at = datetime.now()
            self.stats["total_failed"] += 1
            logger.error(f"❌ Job {job.job_id} failed: {e}")
    
    async def _cleanup_old_jobs(self):
        """Cleanup old jobs every 5 minutes."""
        while True:
            try:
                await asyncio.sleep(300)  # 5 minutes
                
                current_time = datetime.now()
                jobs_to_remove = []
                
                for job_id, job in self.jobs.items():
                    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                        if job.completed_at and (current_time - job.completed_at).total_seconds() > 1800:  # 30 minutes
                            jobs_to_remove.append(job_id)
                
                for job_id in jobs_to_remove:
                    del self.jobs[job_id]
                
                if jobs_to_remove:
                    logger.info(f"🧹 Cleaned up {len(jobs_to_remove)} old jobs")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Error in cleanup: {e}")
    
    def get_memory_usage(self) -> float:
        """Get memory usage in MB."""
        try:
            process = psutil.Process(os.getpid())
            return process.memory_info().rss / 1024 / 1024
        except:
            return 0.0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return {
            **self.stats,
            "active_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.PROCESSING]),
            "queued_jobs": len([j for j in self.jobs.values() if j.status == JobStatus.QUEUED]),
            "total_jobs": len(self.jobs),
            "active_workers": self.active_workers,
            "max_workers": self.max_workers
        }