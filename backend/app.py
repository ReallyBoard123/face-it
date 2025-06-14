# backend/app.py - Complete integration with WebSocket calibration
import asyncio
import base64
import cv2
import io
import json
import logging
import numpy as np
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

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

# EyeTrax imports
try:
    from eyetrax import GazeEstimator
    EYETRAX_AVAILABLE = True
except ImportError:
    EYETRAX_AVAILABLE = False
    print("EyeTrax not available. Install with: pip install eyetrax")

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

# WebSocket Calibration Session Class
class WebSocketCalibrationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.gaze_estimator = None
        self.calibration_points: List[Dict] = []
        self.is_calibrated = False
        self.model_path: Optional[str] = None
        self.start_time = time.time()
        
    def add_calibration_point(self, x: float, y: float, features: np.ndarray):
        """Add a calibration point with extracted features"""
        self.calibration_points.append({
            'x': x,
            'y': y,
            'features': features,
            'timestamp': time.time() - self.start_time
        })
        
    def can_calibrate(self) -> bool:
        """Check if we have enough points to calibrate"""
        return len(self.calibration_points) >= 5  # Minimum 5 points
        
    def calibrate(self) -> bool:
        """Train the gaze estimation model"""
        if not self.can_calibrate():
            return False
            
        try:
            if not self.gaze_estimator:
                self.gaze_estimator = GazeEstimator()
                
            # Prepare training data
            features_array = np.array([point['features'] for point in self.calibration_points])
            targets_array = np.array([[point['x'], point['y']] for point in self.calibration_points])
            
            # Train the model
            self.gaze_estimator.train(features_array, targets_array)
            
            # Save the model
            model_dir = "models"
            os.makedirs(model_dir, exist_ok=True)
            self.model_path = os.path.join(model_dir, f"ws_calibration_{self.session_id}.pkl")
            self.gaze_estimator.save_model(self.model_path)
            
            self.is_calibrated = True
            logger.info(f"WebSocket calibration completed for session {self.session_id}")
            return True
            
        except Exception as e:
            logger.error(f"WebSocket calibration failed: {e}")
            return False

def decode_base64_image(base64_string: str) -> Optional[np.ndarray]:
    """Decode base64 image to OpenCV format"""
    try:
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        image_rgb = np.array(image.convert('RGB'))
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        return image_bgr
    except Exception as e:
        logger.error(f"Error decoding image: {e}")
        return None

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

# --- Updated EyeTrax Calibration Endpoint ---

@app.post("/eyetrax/calibration/start")
async def start_calibration():
    """Start EyeTrax built-in calibration"""
    if not EYETRAX_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="EyeTrax library is not available"
        )
    
    session_id = f"calib_{uuid.uuid4().hex[:8]}"
    
    try:
        logger.info(f"Starting 9-point calibration for session {session_id}")
        
        # Initialize the gaze estimator
        from eyetrax import GazeEstimator, run_9_point_calibration
        gaze_estimator = GazeEstimator()
        
        # Run the built-in calibration (this opens the native window)
        run_9_point_calibration(gaze_estimator)
        
        # Save the model
        model_dir = "models"
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, f"calibration_{session_id}.pkl")
        gaze_estimator.save_model(model_path)
        
        logger.info(f"Calibration model saved to {model_path}")
        
        # Store session (using a simple dict for the original eye tracker compatibility)
        class SimpleSession:
            def __init__(self, session_id, gaze_estimator, model_path):
                self.session_id = session_id
                self.gaze_estimator = gaze_estimator
                self.is_calibrated = True
                self.model_path = model_path
        
        eye_tracking_sessions[session_id] = SimpleSession(session_id, gaze_estimator, model_path)
        
        return {
            "success": True,
            "session_id": session_id,
            "message": "Calibration completed successfully!"
        }
        
    except Exception as e:
        logger.error(f"Calibration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Calibration failed: {str(e)}"
        )

# --- WebSocket Endpoints ---

@app.websocket("/ws/calibration/{session_id}")
async def websocket_calibration(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for calibration"""
    await websocket.accept()
    
    session = eye_tracking_sessions.get(session_id)
    if not session or not isinstance(session, WebSocketCalibrationSession):
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return
    
    logger.info(f"Calibration WebSocket connected: {session_id}")
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message['type'] == 'calibration_point':
                # Extract features from the frame
                frame_data = message.get('frame')
                if not frame_data:
                    await websocket.send_json({"error": "No frame data"})
                    continue
                
                frame = decode_base64_image(frame_data)
                if frame is None:
                    await websocket.send_json({"error": "Could not decode frame"})
                    continue
                
                # Initialize estimator if needed
                if not session.gaze_estimator:
                    session.gaze_estimator = GazeEstimator()
                
                # Extract features using EyeTrax
                features, blink = session.gaze_estimator.extract_features(frame)
                
                if features is None or blink:
                    await websocket.send_json({
                        "type": "point_rejected",
                        "reason": "No face detected or blink detected"
                    })
                    continue
                
                # Add calibration point
                x, y = message.get('x'), message.get('y')
                session.add_calibration_point(x, y, features)
                
                await websocket.send_json({
                    "type": "point_added",
                    "point_count": len(session.calibration_points),
                    "can_calibrate": session.can_calibrate()
                })
                
            elif message['type'] == 'finalize_calibration':
                if session.calibrate():
                    await websocket.send_json({
                        "type": "calibration_complete",
                        "success": True,
                        "points_used": len(session.calibration_points),
                        "session_id": session_id
                    })
                else:
                    await websocket.send_json({
                        "type": "calibration_failed",
                        "error": "Could not calibrate with current points"
                    })
                    
            elif message['type'] == 'reset':
                session.calibration_points.clear()
                await websocket.send_json({
                    "type": "reset_complete",
                    "point_count": 0
                })
                
    except WebSocketDisconnect:
        logger.info(f"Calibration WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Calibration WebSocket error: {e}")
        await websocket.send_json({"error": str(e)})

@app.websocket("/ws/gaze/{session_id}")
async def websocket_gaze_tracking(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time gaze tracking"""
    await websocket.accept()
    
    session = eye_tracking_sessions.get(session_id)
    if not session or not hasattr(session, 'is_calibrated') or not session.is_calibrated:
        await websocket.send_json({"error": "Session not calibrated"})
        await websocket.close()
        return
    
    logger.info(f"Gaze tracking WebSocket connected: {session_id}")
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message['type'] == 'frame':
                frame_data = message.get('frame')
                if not frame_data:
                    continue
                
                frame = decode_base64_image(frame_data)
                if frame is None:
                    continue
                
                # Extract features and predict gaze
                features, blink = session.gaze_estimator.extract_features(frame)
                
                if features is not None and not blink:
                    predictions = session.gaze_estimator.predict([features])
                    x, y = predictions[0]
                    
                    await websocket.send_json({
                        "type": "gaze",
                        "x": float(x),
                        "y": float(y),
                        "blink": False,
                        "timestamp": time.time()
                    })
                else:
                    await websocket.send_json({
                        "type": "blink",
                        "blink": True,
                        "timestamp": time.time()
                    })
                    
    except WebSocketDisconnect:
        logger.info(f"Gaze tracking WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Gaze tracking WebSocket error: {e}")

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