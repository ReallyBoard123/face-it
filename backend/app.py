# app.py - Add these new endpoints to your existing app.py

import logging
from datetime import datetime

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Import routers and logic functions from the new modules
from facial_expression_recognizer import (
    analyze_facial_expressions,
    get_detector as get_feat_detector,
    analysis_cache as face_expression_cache,
    cache_timestamps as face_cache_timestamps,
    clean_expired_cache as clean_face_cache,
    clear_all_cache,  # New function we'll add
)

# --- Basic Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Unified Analysis API",
    description="Combines facial expression analysis (py-feat) and eye tracking (EyeTrax).",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Existing endpoints (root, health, analyze/face) ---

@app.get("/")
async def root():
    """Provides a summary of the available API features."""
    return {
        "name": "Unified Analysis API",
        "version": "3.0.0",
        "status": "running",
        "services": {
            "facial_expression_analysis": {
                "library": "py-feat",
                "status": "✅ Detector available" if get_feat_detector() else "❌ Detector not initialized",
                "cache_entries": len(face_expression_cache),
                "docs": "/docs#/Facial%20Expression/analyze_face_endpoint_analyze_face_post",
            }
        }
    }

@app.get("/health")
async def health_check():
    """Provides a detailed health check of all services."""
    try:
        feat_detector = get_feat_detector()
        feat_ready = feat_detector is not None
    except Exception:
        feat_ready = False

    clean_face_cache() # Periodically clean the cache on health checks

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "server_running": True,
        "services": {
            "facial_expression": {
                "detector_ready": feat_ready,
                "cache_size": len(face_expression_cache),
            }
        }
    }

# --- NEW CACHE MANAGEMENT ENDPOINTS ---

@app.post("/cache/clear", tags=["Cache Management"])
async def clear_cache():
    """
    Manually clear all analysis cache.
    Useful when starting a new session to ensure fresh analysis.
    """
    try:
        cache_size_before = len(face_expression_cache)
        clear_all_cache()
        
        logger.info(f"Cache manually cleared. Removed {cache_size_before} entries.")
        
        return {
            "status": "success",
            "message": f"Cache cleared successfully. Removed {cache_size_before} entries.",
            "entries_removed": cache_size_before,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Failed to clear cache: {str(e)}"}
        )

@app.get("/cache/status", tags=["Cache Management"])
async def cache_status():
    """
    Get current cache status and statistics.
    """
    return {
        "cache_size": len(face_expression_cache),
        "cache_entries": list(face_expression_cache.keys()),
        "timestamps": {k: datetime.fromtimestamp(v).isoformat() for k, v in face_cache_timestamps.items()},
        "timestamp": datetime.now().isoformat()
    }

@app.post("/server/ping", tags=["Server Management"])
async def ping_server():
    """
    Simple ping endpoint to verify server is running and responsive.
    Also ensures the detector is ready.
    """
    try:
        # Ensure detector is initialized
        detector = get_feat_detector()
        detector_status = detector is not None
        
        return {
            "status": "pong",
            "server_running": True,
            "detector_ready": detector_status,
            "timestamp": datetime.now().isoformat(),
            "message": "Server is running and ready for analysis"
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

# --- Existing analyze/face endpoint ---
@app.post("/analyze/face", tags=["Facial Expression"])
async def analyze_face_endpoint(
    file: UploadFile = File(...),
    settings: str | None = Form(None)
):
    """
    Analyzes a video for facial expressions, emotions, and action units.
    This endpoint uses the py-feat library.
    """
    try:
        file_content = await file.read()
        results = await analyze_facial_expressions(
            file_content=file_content,
            filename=file.filename,
            content_type=file.content_type,
            settings=settings,
        )
        return JSONResponse(content=results)
    except Exception as e:
        logger.error(f"Facial analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": str(e)},
        )

# --- Server Startup ---
if __name__ == "__main__":
    logger.info("Starting Unified Analysis API v3.0")
    
    # Pre-initialize the detector on startup for faster first requests
    try:
        get_feat_detector()
        logger.info("✅ py-feat detector pre-initialized successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to initialize py-feat detector on startup: {e}")

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="info")