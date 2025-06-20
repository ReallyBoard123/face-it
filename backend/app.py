import logging
import os
from datetime import datetime
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from utils import SessionManager, RedisManager, get_video_hash
from facial_expression_analyzer import analyze_video_task
from celery_app import celery_app

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="FaceIt Backend API",
    description="Scalable facial expression analysis with session management and queuing",
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize managers
session_manager = SessionManager()
redis_manager = RedisManager()

# WebSocket manager for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_update(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
            except:
                self.disconnect(session_id)

connection_manager = ConnectionManager()

# Routes
@app.get("/")
async def root():
    return {
        "name": "FaceIt Backend API",
        "version": "4.0.0",
        "status": "running",
        "features": {
            "session_management": True,
            "queue_system": True,
            "websocket_updates": True,
            "concurrent_users": True
        }
    }

@app.get("/health")
async def health_check():
    redis_status = redis_manager.ping()
    celery_status = celery_app.control.ping()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "redis": "connected" if redis_status else "disconnected",
            "celery": "connected" if celery_status else "disconnected",
            "active_sessions": len(session_manager.sessions),
            "queue_length": redis_manager.get_queue_length()
        }
    }

@app.post("/session/create")
async def create_session():
    """Create new user session"""
    session_id = session_manager.create_session()
    return {
        "session_id": session_id,
        "status": "created",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/session/{session_id}/status")
async def get_session_status(session_id: str):
    """Get session information"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session_id,
        "status": session["status"],
        "created_at": session["created_at"].isoformat(),
        "current_job": session.get("current_job"),
        "cached_results": len(session.get("cache", {}))
    }

@app.post("/analyze/start")
async def start_analysis(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    settings: Optional[str] = Form(None)
):
    """Start video analysis asynchronously"""
    # Validate session
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["status"] == "processing":
        raise HTTPException(status_code=409, detail="Session already processing a video")
    
    # Read and hash video
    file_content = await file.read()
    video_hash = get_video_hash(file_content)
    
    # Check cache first
    cached_result = redis_manager.get_cached_result(session_id, video_hash)
    if cached_result:
        return {
            "status": "completed",
            "message": "Results found in cache",
            "job_id": None,
            "results": cached_result
        }
    
    # Queue analysis task
    job = analyze_video_task.delay(
        session_id=session_id,
        video_data=file_content,
        filename=file.filename,
        content_type=file.content_type,
        settings=settings,
        video_hash=video_hash
    )
    
    # Update session
    session_manager.update_session(session_id, {
        "status": "processing",
        "current_job": job.id
    })
    
    return {
        "status": "queued",
        "message": "Video analysis started",
        "job_id": job.id,
        "session_id": session_id
    }

@app.get("/analyze/status/{session_id}/{job_id}")
async def get_analysis_status(session_id: str, job_id: str):
    """Get analysis progress and results"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get job status from Celery
    job = celery_app.AsyncResult(job_id)
    
    if job.state == "PENDING":
        return {
            "status": "queued",
            "message": "Analysis is queued",
            "progress": 0
        }
    elif job.state == "PROGRESS":
        return {
            "status": "processing",
            "message": job.info.get("message", "Processing video..."),
            "progress": job.info.get("progress", 0)
        }
    elif job.state == "SUCCESS":
        # Update session status
        session_manager.update_session(session_id, {
            "status": "ready",
            "current_job": None
        })
        
        return {
            "status": "completed",
            "message": "Analysis completed successfully",
            "progress": 100,
            "results": job.result
        }
    else:  # FAILURE
        session_manager.update_session(session_id, {
            "status": "error",
            "current_job": None
        })
        
        return {
            "status": "error",
            "message": f"Analysis failed: {str(job.info)}",
            "progress": 0
        }

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time updates"""
    await connection_manager.connect(websocket, session_id)
    
    try:
        while True:
            # Send periodic updates
            session = session_manager.get_session(session_id)
            if session and session.get("current_job"):
                job = celery_app.AsyncResult(session["current_job"])
                
                update = {
                    "type": "progress_update",
                    "job_id": session["current_job"],
                    "status": job.state,
                    "timestamp": datetime.now().isoformat()
                }
                
                if job.state == "PROGRESS":
                    update.update(job.info)
                elif job.state == "SUCCESS":
                    update["results"] = job.result
                
                await connection_manager.send_update(session_id, update)
            
            await websocket.receive_text()  # Keep connection alive
            
    except WebSocketDisconnect:
        connection_manager.disconnect(session_id)

@app.post("/session/{session_id}/reset")
async def reset_session(session_id: str):
    """Reset session state"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Cancel current job if running
    if session.get("current_job"):
        celery_app.control.revoke(session["current_job"], terminate=True)
    
    # Reset session
    session_manager.update_session(session_id, {
        "status": "ready",
        "current_job": None
    })
    
    return {
        "status": "success",
        "message": "Session reset successfully"
    }

@app.post("/server/ping")
async def ping_server():
    """Ping server to check if it's running and detector is ready"""
    redis_status = redis_manager.ping()
    celery_status = celery_app.control.ping()
    
    detector_ready = redis_status and bool(celery_status)
    
    return {
        "status": "running" if detector_ready else "starting",
        "server_running": True,
        "detector_ready": detector_ready,
        "timestamp": datetime.now().isoformat(),
        "message": "Server is ready" if detector_ready else "Detector is initializing"
    }

@app.post("/cache/clear")
async def clear_cache():
    """Clear all cached analysis results"""
    try:
        entries_removed = redis_manager.clear_all_cache()
        return {
            "status": "success",
            "message": "Cache cleared successfully",
            "entries_removed": entries_removed,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")

@app.get("/cache/status")
async def get_cache_status():
    """Get current cache status"""
    try:
        cache_info = redis_manager.get_cache_info()
        return {
            "cache_size": cache_info.get("size", 0),
            "cache_entries": cache_info.get("entries", []),
            "timestamps": cache_info.get("timestamps", {}),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cache status: {e}")
        return {
            "cache_size": 0,
            "cache_entries": [],
            "timestamps": {},
            "timestamp": datetime.now().isoformat()
        }

@app.get("/metrics")
async def get_metrics():
    """Get system metrics"""
    try:
        import psutil
        memory_usage = psutil.virtual_memory().percent
        cpu_usage = psutil.cpu_percent()
    except ImportError:
        memory_usage = 0
        cpu_usage = 0
    
    return {
        "active_sessions": len(session_manager.sessions),
        "processing_sessions": len([s for s in session_manager.sessions.values() if s["status"] == "processing"]),
        "queue_length": redis_manager.get_queue_length(),
        "memory_usage": memory_usage,
        "cpu_usage": cpu_usage,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    logger.info("Starting FaceIt Backend API v4.0")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)