# eye_tracker.py

import asyncio
import base64
import io
import logging
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Form, File, UploadFile
from PIL import Image

# --- EyeTrax Imports and Availability Check ---
try:
    from eyetrax import GazeEstimator, run_9_point_calibration
    EYETRAX_AVAILABLE = True
except ImportError:
    EYETRAX_AVAILABLE = False
    print("WARNING: eyetrax library not found. Eye tracking endpoints will not function.")

logger = logging.getLogger(__name__)

# --- FastAPI Router Definition ---
router = APIRouter(
    prefix="/eyetrax",
    tags=["Eye Tracking"],
)

# --- Session Management and Data Classes ---
active_sessions: Dict[str, Any] = {}

class EyeTrackingSession:
    """Manages a single eye tracking session, including calibration."""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.gaze_estimator: Optional[GazeEstimator] = None
        self.is_calibrated: bool = False
        self.model_path: Optional[str] = None
        self.start_time = time.time()
        self.gaze_data: List[Dict[str, Any]] = []

    def add_gaze_point(self, x: float, y: float, confidence: float = 1.0):
        timestamp = time.time() - self.start_time
        self.gaze_data.append({'x': x, 'y': y, 'timestamp': timestamp, 'confidence': confidence})

# --- Helper Functions ---
def decode_base64_image(base64_string: str) -> Optional[np.ndarray]:
    """Decode base64 image to OpenCV format."""
    try:
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        return cv2.cvtColor(np.array(image.convert('RGB')), cv2.COLOR_RGB2BGR)
    except Exception as e:
        logger.error(f"Error decoding image: {e}")
        return None

# --- API Endpoints ---
@router.post("/calibration/start")
async def start_calibration():
    """Starts a new 9-point calibration session using EyeTrax."""
    if not EYETRAX_AVAILABLE:
        raise HTTPException(status_code=501, detail="EyeTrax library is not available.")
    
    session_id = f"calib_{uuid.uuid4().hex[:8]}"
    session = EyeTrackingSession(session_id)
    active_sessions[session_id] = session
    
    try:
        logger.info(f"Starting 9-point calibration for session {session_id}")
        gaze_estimator = GazeEstimator()
        
        # This function blocks and opens a window for calibration
        run_9_point_calibration(gaze_estimator)
        
        model_dir = "models"
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, f"calibration_{session_id}.pkl")
        
        gaze_estimator.save_model(model_path)
        logger.info(f"Calibration model saved to {model_path}")
        
        session.gaze_estimator = gaze_estimator
        session.is_calibrated = True
        session.model_path = model_path
        
        return {"success": True, "session_id": session_id, "message": "Calibration complete."}
    except Exception as e:
        if session_id in active_sessions:
            del active_sessions[session_id]
        logger.error(f"Calibration failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Calibration failed: {e}")

@router.post("/session/load")
async def load_model(model_path: str = Form(...)):
    """Loads an existing model into a new session."""
    if not EYETRAX_AVAILABLE:
        raise HTTPException(status_code=501, detail="EyeTrax library is not available.")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model file not found.")
        
    try:
        session_id = f"loaded_{uuid.uuid4().hex[:8]}"
        session = EyeTrackingSession(session_id)
        gaze_estimator = GazeEstimator()
        gaze_estimator.load_model(model_path)
        
        session.gaze_estimator = gaze_estimator
        session.is_calibrated = True
        session.model_path = model_path
        active_sessions[session_id] = session
        
        return {"success": True, "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.get("/session/status/{session_id}")
async def get_session_status(session_id: str):
    """Get the status of an eye tracking session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = active_sessions[session_id]
    return {
        'session_id': session_id,
        'is_calibrated': session.is_calibrated,
        'model_path': session.model_path,
        'gaze_points_collected': len(session.gaze_data),
    }

@router.post("/analyze/gaze")
async def analyze_gaze_video(session_id: str = Form(...), video: UploadFile = File(...)):
    """Analyzes a single frame for gaze estimation using a calibrated model."""
    session = active_sessions.get(session_id)
    if not session or not session.is_calibrated:
        raise HTTPException(status_code=400, detail="Session not found or not calibrated.")

    video_contents = await video.read()
    nparr = np.frombuffer(video_contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode video frame.")
    
    estimator = session.gaze_estimator
    features, blink = estimator.extract_features(frame)
    
    if features is None:
        return {"status": "error", "message": "No face detected in the frame."}
    
    x, y = estimator.predict([features])[0]
    
    return {"status": "success", "gaze": {"x": float(x), "y": float(y)}, "blink": bool(blink)}