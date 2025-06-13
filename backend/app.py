# app.py

import logging
from datetime import datetime

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Import routers and logic functions from the new modules
from eye_tracker import router as eye_tracker_router
from eye_tracker import EYETRAX_AVAILABLE
from eye_tracker import active_sessions as eye_tracking_sessions
from facial_expression_recognizer import (
    analyze_facial_expressions,
    get_detector as get_feat_detector,
    analysis_cache as face_expression_cache,
    clean_expired_cache as clean_face_cache,
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

# --- Include Routers ---
app.include_router(eye_tracker_router)

# --- Combined Endpoints ---

@app.get("/")
async def root():
    """Provides a summary of the available API features."""
    return {
        "name": "Unified Analysis API",
        "version": "3.0.0",
        "services": {
            "facial_expression_analysis": {
                "library": "py-feat",
                "status": "✅ Detector available" if get_feat_detector() else "❌ Detector not initialized",
                "docs": "/docs#/Facial%20Expression/analyze_face_endpoint_analyze_face_post",
            },
            "eye_tracking": {
                "library": "EyeTrax",
                "status": "✅ Available" if EYETRAX_AVAILABLE else "❌ Not installed",
                "docs": "/docs#/Eye%20Tracking",
            },
        },
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
        "services": {
            "facial_expression": {
                "detector_ready": feat_ready,
                "cache_size": len(face_expression_cache),
            },
            "eye_tracking": {
                "library_available": EYETRAX_AVAILABLE,
                "active_sessions": len(eye_tracking_sessions),
            },
        },
    }

# --- Service-Specific Endpoints ---

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

    if not EYETRAX_AVAILABLE:
        logger.warning("- eyetrax library not found. Eye tracking endpoints will not work.")

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="info")