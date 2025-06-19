# app.py - Complete Multi-user Backend

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
from facial_expression_recognizer import get_detector, analyze_facial_expressions

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s:%(name)s:%(message)s'
)
logger = logging.getLogger(__name__)

# Initialize job manager
job_manager = JobManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown."""
    logger.info("🚀 Starting FaceIt Backend API v4.0.0")
    try:
        get_detector()
        logger.info("✅ py-feat detector initialized")
        await job_manager.start()
        logger.info("✅ Job manager started")
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
    
    yield
    
    logger.info("🛑 Shutting down FaceIt Backend API")
    await job_manager.stop()

# Initialize FastAPI
app = FastAPI(
    title="FaceIt Backend API",
    description="Multi-user facial expression analysis",
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
    """API overview."""
    try:
        detector_ready = get_detector() is not None
    except Exception:
        detector_ready = False
    
    return {
        "name": "FaceIt Backend API",
        "version": "4.0.0",
        "status": "running",
        "features": {
            "multi_user_support": True,
            "job_queue": True,
            "long_video_support": True
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
    """Health check."""
    try:
        detector_ready = get_detector() is not None
    except Exception:
        detector_ready = False
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "server_running": True,
        "services": {
            "facial_expression": {
                "detector_ready": detector_ready,
                "active_jobs": len(job_manager.get_active_jobs()),
                "queued_jobs": len(job_manager.get_queued_jobs())
            }
        }
    }

# NEW: Async job submission
@app.post("/analyze/submit", response_model=JobSubmissionResponse)
async def submit_video_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None)
):
    """Submit video for async analysis."""
    job_id = str(uuid.uuid4())
    if not session_id:
        session_id = str(uuid.uuid4())
    
    try:
        file_content = await file.read()
        file_size_mb = len(file_content) / (1024 * 1024)
        estimated_minutes = max(0.5, file_size_mb * 0.5)
        
        job = job_manager.create_job(
            job_id=job_id,
            session_id=session_id,
            file_content=file_content,
            filename=file.filename or "video.webm",
            content_type=file.content_type or "video/webm",
            settings=settings,
            estimated_duration=estimated_minutes
        )
        
        background_tasks.add_task(job_manager.process_job, job_id)
        
        logger.info(f"📝 Job {job_id} submitted for session {session_id}")
        
        return JobSubmissionResponse(
            job_id=job_id,
            status="queued",
            message="Video analysis job submitted successfully",
            estimated_time_minutes=estimated_minutes
        )
        
    except Exception as e:
        logger.error(f"❌ Failed to submit job {job_id}: {e}")
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})

# Job status tracking
@app.get("/analyze/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status."""
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Job not found"})
    
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

# Get results
@app.get("/analyze/result/{job_id}")
async def get_job_result(job_id: str):
    """Get job results."""
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Job not found"})
    
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error", 
                "message": f"Job not completed. Status: {job.status.value}",
                "progress": job.progress
            }
        )
    
    return JSONResponse(content=job.result)

# Legacy endpoint (works for short videos)
@app.post("/analyze/face")
async def analyze_face_legacy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None)
):
    """Legacy endpoint - submits job and waits up to 5 minutes."""
    # Submit job
    response = await submit_video_analysis(background_tasks, file, settings)
    job_id = response.job_id
    
    # Poll for completion (5 minutes max)
    for _ in range(150):  # 5 minutes / 2 seconds
        await asyncio.sleep(2)
        job = job_manager.get_job(job_id)
        
        if job and job.status == JobStatus.COMPLETED:
            return JSONResponse(content=job.result)
        elif job and job.status == JobStatus.FAILED:
            raise HTTPException(status_code=500, detail={"status": "error", "message": job.error})
    
    # Timeout - return job info for async polling
    return JSONResponse(
        status_code=202,
        content={
            "status": "processing",
            "message": "Video still processing. Use /analyze/status/{job_id} to check progress.",
            "job_id": job_id
        }
    )

# Emergency stop
@app.post("/emergency/stop")
async def emergency_stop():
    """Emergency stop all jobs."""
    stopped_jobs = []
    for job_id, job in job_manager.jobs.items():
        if job.status == JobStatus.PROCESSING:
            job.status = JobStatus.CANCELLED
            job.message = "Emergency stop"
            job.completed_at = datetime.now()
            stopped_jobs.append(job_id)
    
    logger.info(f"🛑 Emergency stop: {len(stopped_jobs)} jobs cancelled")
    return {"status": "emergency_stop_complete", "stopped_jobs": stopped_jobs}

# Job management
@app.get("/jobs/active")
async def get_active_jobs():
    """Get active jobs."""
    return {"active_jobs": job_manager.get_active_jobs()}

@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel job."""
    success = job_manager.cancel_job(job_id)
    if success:
        return {"status": "success", "message": f"Job {job_id} cancelled"}
    else:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Job not found"})

# Cache management
@app.post("/cache/clear")
async def clear_cache():
    """Clear cache."""
    try:
        from facial_expression_recognizer import analysis_cache, cache_timestamps
        cache_size = len(analysis_cache)
        analysis_cache.clear()
        cache_timestamps.clear()
        return {"status": "success", "message": f"Cache cleared. Removed {cache_size} entries."}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})

# Server ping
@app.post("/server/ping")
async def ping_server():
    """Server ping."""
    try:
        detector = get_detector()
        detector_status = detector is not None
        
        return {
            "status": "pong",
            "server_running": True,
            "detector_ready": detector_status,
            "timestamp": datetime.now().isoformat(),
            "message": "Server ready",
            "version": "4.0.0"
        }
    except Exception as e:
        logger.error(f"❌ Server ping failed: {e}")
        return {
            "status": "error",
            "server_running": True,
            "detector_ready": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")