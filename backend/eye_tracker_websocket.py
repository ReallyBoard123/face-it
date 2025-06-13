# backend/eye_tracker_websocket.py
import asyncio
import base64
import cv2
import json
import logging
import numpy as np
import os
import time
import uuid
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io

# EyeTrax imports
try:
    from eyetrax import GazeEstimator
    EYETRAX_AVAILABLE = True
except ImportError:
    EYETRAX_AVAILABLE = False
    print("EyeTrax not available. Install with: pip install eyetrax")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="EyeTrax WebSocket Integration", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CalibrationSession:
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
            self.model_path = os.path.join(model_dir, f"calibration_{self.session_id}.pkl")
            self.gaze_estimator.save_model(self.model_path)
            
            self.is_calibrated = True
            logger.info(f"Calibration completed for session {self.session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Calibration failed: {e}")
            return False

# Active sessions storage
active_sessions: Dict[str, CalibrationSession] = {}

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

@app.post("/api/calibration/start")
async def start_calibration():
    """Start a new calibration session"""
    if not EYETRAX_AVAILABLE:
        raise HTTPException(status_code=500, detail="EyeTrax not available")
    
    session_id = f"calib_{uuid.uuid4().hex[:8]}"
    session = CalibrationSession(session_id)
    session.gaze_estimator = GazeEstimator()
    active_sessions[session_id] = session
    
    logger.info(f"Started calibration session: {session_id}")
    
    return {
        "success": True,
        "session_id": session_id,
        "message": "Calibration session started. Connect via WebSocket to begin."
    }

@app.websocket("/ws/calibration/{session_id}")
async def websocket_calibration(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for calibration"""
    await websocket.accept()
    
    session = active_sessions.get(session_id)
    if not session:
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
    
    session = active_sessions.get(session_id)
    if not session or not session.is_calibrated:
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

@app.get("/api/session/{session_id}/status")
async def get_session_status(session_id: str):
    """Get session status"""
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session_id,
        "is_calibrated": session.is_calibrated,
        "calibration_points": len(session.calibration_points),
        "can_calibrate": session.can_calibrate(),
        "model_path": session.model_path
    }

@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session"""
    if session_id in active_sessions:
        del active_sessions[session_id]
        return {"message": f"Session {session_id} deleted"}
    raise HTTPException(status_code=404, detail="Session not found")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "eyetrax_available": EYETRAX_AVAILABLE,
        "active_sessions": len(active_sessions)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)