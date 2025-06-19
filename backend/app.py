# app.py - Fixed FastAPI with Async Job System

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Optional

import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from job_manager import JobManager, JobStatus
from facial_expression_recognizer import get_detector as get_feat_detector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize job manager
job_manager = JobManager()

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup
    logger.info("Starting FaceIt Backend API v4.0.0")
    try:
        # Pre-initialize detector
        get_feat_detector()
        logger.info("✅ py-feat detector initialized successfully")
        
        # Start job manager
        await job_manager.start()
        logger.info("✅ Job manager started successfully")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down FaceIt Backend API")
    await job_manager.stop()

# Initialize FastAPI
app = FastAPI(
    title="FaceIt Backend API",
    description="High-performance facial expression analysis with async job processing",
    version="4.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Response models
class JobSubmissionResponse(BaseModel):
    job_id: str
    status: str
    message: str
    estimated_time_minutes: Optional[float] = None

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    message: str
    result: Optional[Dict] = None
    error: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

# Root endpoint
@app.get("/")
async def root():
    """API overview and health status."""
    try:
        detector_ready = get_feat_detector() is not None
    except Exception:
        detector_ready = False
    
    return {
        "name": "FaceIt Backend API",
        "version": "4.0.0",
        "status": "running",
        "features": {
            "async_processing": True,
            "job_queue": True,
            "progress_tracking": True,
            "multi_user_support": True,
            "20min_video_support": True
        },
        "services": {
            "facial_expression_analysis": {
                "library": "py-feat",
                "detector_ready": detector_ready,
                "active_jobs": len(job_manager.get_active_jobs()),
                "queue_length": len(job_manager.get_queued_jobs())
            }
        }
    }

# Health check
@app.get("/health")
async def health_check():
    """Comprehensive health check."""
    try:
        detector_ready = get_feat_detector() is not None
    except Exception as e:
        detector_ready = False
        logger.error(f"Detector health check failed: {e}")
    
    active_jobs = job_manager.get_active_jobs()
    queued_jobs = job_manager.get_queued_jobs()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "server_running": True,
        "services": {
            "facial_expression": {
                "detector_ready": detector_ready,
                "active_jobs": len(active_jobs),
                "queued_jobs": len(queued_jobs),
                "max_concurrent": job_manager.max_workers
            }
        },
        "system": {
            "memory_usage_mb": job_manager.get_memory_usage(),
            "jobs_processed_today": job_manager.get_stats()["total_completed"]
        }
    }

# Async job submission endpoint
@app.post("/analyze/submit", response_model=JobSubmissionResponse, tags=["Video Analysis"])
async def submit_video_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None)
):
    """Submit video for async analysis. Returns job_id for tracking progress."""
    # Generate job ID and session ID
    job_id = str(uuid.uuid4())
    if not session_id:
        session_id = str(uuid.uuid4())
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Estimate processing time (rough: 1 minute per MB)
        file_size_mb = len(file_content) / (1024 * 1024)
        estimated_minutes = max(0.5, file_size_mb * 0.8)  # Conservative estimate
        
        # Create job
        job = job_manager.create_job(
            job_id=job_id,
            session_id=session_id,
            file_content=file_content,
            filename=file.filename or "video.webm",
            content_type=file.content_type or "video/webm",
            settings=settings,
            estimated_duration=estimated_minutes
        )
        
        # Start processing in background
        background_tasks.add_task(job_manager.process_job, job_id)
        
        logger.info(f"Job {job_id} submitted for session {session_id}, estimated {estimated_minutes:.1f} minutes")
        
        return JobSubmissionResponse(
            job_id=job_id,
            status="queued",
            message="Video analysis job submitted successfully. Use job_id to check progress.",
            estimated_time_minutes=estimated_minutes
        )
        
    except Exception as e:
        logger.error(f"Failed to submit job {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Failed to submit job: {str(e)}"}
        )

# Job status tracking
@app.get("/analyze/status/{job_id}", response_model=JobStatusResponse, tags=["Video Analysis"])
async def get_job_status(job_id: str):
    """Get current status and progress of video analysis job."""
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"status": "error", "message": "Job not found"}
        )
    
    return JobStatusResponse(
        job_id=job_id,
        status=job.status.value,
        progress=job.progress,
        message=job.message,
        result=job.result,
        error=job.error,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None
    )

# Get results when complete
@app.get("/analyze/result/{job_id}", tags=["Video Analysis"])
async def get_job_result(job_id: str):
    """Get final results of completed video analysis."""
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"status": "error", "message": "Job not found"}
        )
    
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error", 
                "message": f"Job not completed yet. Current status: {job.status.value}",
                "progress": job.progress
            }
        )
    
    return JSONResponse(content=job.result)

# Legacy endpoint for backward compatibility
@app.post("/analyze/face", tags=["Video Analysis (Legacy)"])
async def analyze_face_legacy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None)
):
    """Legacy endpoint - submits job and waits for completion."""
    # Submit job
    response = await submit_video_analysis(background_tasks, file, settings)
    job_id = response.job_id
    
    # Poll for completion (max 5 minutes for legacy compatibility)
    max_wait_seconds = 300  # 5 minutes
    poll_interval = 2  # seconds
    
    for _ in range(max_wait_seconds // poll_interval):
        await asyncio.sleep(poll_interval)
        job = job_manager.get_job(job_id)
        
        if job and job.status == JobStatus.COMPLETED:
            return JSONResponse(content=job.result)
        elif job and job.status == JobStatus.FAILED:
            raise HTTPException(
                status_code=500,
                detail={"status": "error", "message": job.error}
            )
    
    # Timeout - return job info for async polling
    return JSONResponse(
        status_code=202,
        content={
            "status": "processing",
            "message": "Video is still processing. Use /analyze/status/{job_id} to check progress.",
            "job_id": job_id
        }
    )

# Job management endpoints
@app.get("/jobs/active", tags=["Job Management"])
async def get_active_jobs():
    """Get all currently active jobs."""
    return {"active_jobs": job_manager.get_active_jobs()}

@app.get("/jobs/queue", tags=["Job Management"])
async def get_job_queue():
    """Get current job queue status."""
    return {
        "queued_jobs": job_manager.get_queued_jobs(),
        "queue_length": len(job_manager.get_queued_jobs()),
        "processing_capacity": job_manager.max_workers
    }

@app.delete("/jobs/{job_id}", tags=["Job Management"])
async def cancel_job(job_id: str):
    """Cancel a pending or active job."""
    success = job_manager.cancel_job(job_id)
    if success:
        return {"status": "success", "message": f"Job {job_id} cancelled"}
    else:
        raise HTTPException(
            status_code=404,
            detail={"status": "error", "message": "Job not found or cannot be cancelled"}
        )

# Cache management
@app.post("/cache/clear", tags=["Cache Management"])
async def clear_cache():
    """Clear all analysis cache."""
    try:
        cleared_count = job_manager.clear_cache()
        return {
            "status": "success",
            "message": f"Cache cleared successfully. Removed {cleared_count} entries.",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Failed to clear cache: {str(e)}"}
        )

@app.get("/cache/status", tags=["Cache Management"])
async def cache_status():
    """Get current cache status."""
    return job_manager.get_cache_status()

# Server management
@app.post("/server/ping", tags=["Server Management"])
async def ping_server():
    """Ping server and check detector readiness."""
    try:
        detector = get_feat_detector()
        detector_status = detector is not None
        
        return {
            "status": "pong",
            "server_running": True,
            "detector_ready": detector_status,
            "timestamp": datetime.now().isoformat(),
            "message": "Server is running and ready for analysis",
            "version": "4.0.0"
        }
    except Exception as e:
        logger.error(f"Server ping failed: {e}")
        return {
            "status": "error",
            "server_running": True,
            "detector_ready": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# Run server
if __name__ == "__main__":
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        log_level="info",
        workers=1  # Single worker for GPU sharing
    )