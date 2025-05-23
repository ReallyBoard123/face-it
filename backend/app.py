from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import sys
import traceback
from datetime import datetime
from typing import Dict, Any, List
import uvicorn
import tempfile
import cv2
import numpy as np
import base64
from io import BytesIO

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = FastAPI(
    title="Facial Expression Analysis API",
    description="Backend API for facial expression analysis using py-feat",
    version="1.0.0"
)

# Enable CORS for all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global detector instance
detector = None

def initialize_detector():
    """Initialize the py-feat detector"""
    global detector
    try:
        from feat import Detector
        detector = Detector(
            face_model="retinaface", 
            landmark_model="mobilefacenet", 
            au_model="xgb",
            emotion_model="resmasknet",
            facepose_model="img2pose"
        )
        return True
    except Exception as e:
        print(f"Failed to initialize detector: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Initialize detector on startup"""
    print("🚀 Initializing py-feat detector...")
    if initialize_detector():
        print("✅ Detector initialized successfully!")
    else:
        print("❌ Failed to initialize detector")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "message": "Backend server is running",
        "detector_ready": detector is not None
    }

@app.get("/test-pyfeat")
async def test_pyfeat():
    """Test py-feat installation and basic functionality"""
    try:
        # Import py-feat
        from feat import Detector
        
        # Initialize detector with basic emotions
        test_detector = Detector(
            face_model="retinaface", 
            landmark_model="mobilefacenet", 
            au_model="xgb",
            emotion_model="resmasknet",
            facepose_model="img2pose"
        )
        
        return {
            "status": "success",
            "message": "py-feat is installed and working correctly!",
            "detector_info": {
                "type": str(type(test_detector)),
                "available_emotions": ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"],
                "models_loaded": True
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"py-feat import failed: {str(e)}",
                "error_type": "ImportError",
                "timestamp": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"py-feat initialization failed: {str(e)}",
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
                "timestamp": datetime.now().isoformat()
            }
        )

@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):
    """Analyze a video file for facial expressions"""
    if detector is None:
        raise HTTPException(status_code=500, detail="Detector not initialized")
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        # Analyze the video with py-feat
        print(f"🎬 Analyzing video: {tmp_file_path}")
        results = detector.detect_video(tmp_file_path)
        
        # Clean up temporary file
        os.unlink(tmp_file_path)
        
        # Process results
        if results.empty:
            return {
                "status": "success",
                "message": "No faces detected in the video",
                "data": None,
                "timestamp": datetime.now().isoformat()
            }
        
        # Get emotion columns (they start with specific prefixes)
        emotion_columns = [col for col in results.columns if any(emotion in col.lower() for emotion in 
                          ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'])]
        
        # Calculate average emotions across all frames
        emotion_data = {}
        for col in emotion_columns:
            if col in results.columns:
                emotion_data[col] = float(results[col].mean())
        
        # Get frame-by-frame data
        frame_data = []
        for idx, row in results.iterrows():
            frame_emotions = {}
            for col in emotion_columns:
                if col in row:
                    frame_emotions[col] = float(row[col]) if not np.isnan(row[col]) else 0.0
            
            frame_data.append({
                "frame": int(idx),
                "emotions": frame_emotions,
                "confidence": float(row.get('confidence', 0.0)) if 'confidence' in row else 1.0
            })
        
        return {
            "status": "success",
            "message": f"Analysis completed! Processed {len(results)} frames",
            "data": {
                "summary": {
                    "total_frames": len(results),
                    "faces_detected": len(results[results['confidence'] > 0.5]) if 'confidence' in results.columns else len(results),
                    "average_emotions": emotion_data
                },
                "frames": frame_data,
                "columns_available": list(results.columns)
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Clean up temporary file if it exists
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except:
                pass
                
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Video analysis failed: {str(e)}",
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/detector-info")
async def detector_info():
    """Get detailed detector information"""
    try:
        from feat import Detector
        
        # Get available models
        available_models = {
            "face_models": ["retinaface", "mtcnn", "faceboxes"],
            "landmark_models": ["mobilefacenet", "pfld"],
            "au_models": ["svm", "xgb", "lgb"],
            "emotion_models": ["resmasknet", "fer"],
            "facepose_models": ["img2pose", "img2pose-c"]
        }
        
        return {
            "status": "success",
            "available_models": available_models,
            "current_setup": {
                "face_model": "retinaface",
                "landmark_model": "mobilefacenet",
                "au_model": "xgb",
                "emotion_model": "resmasknet",
                "facepose_model": "img2pose"
            },
            "detector_ready": detector is not None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Failed to get detector info: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Facial Expression Analysis API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "health": "/health",
            "test": "/test-pyfeat", 
            "analyze": "/analyze-video",
            "info": "/detector-info"
        }
    }

if __name__ == "__main__":
    print("🚀 Starting Facial Expression Analysis Backend Server...")
    print("📊 Testing py-feat installation...")
    
    # Test py-feat on startup
    try:
        from feat import Detector
        print("✅ py-feat successfully imported!")
    except ImportError as e:
        print(f"❌ py-feat import failed: {e}")
        print("💡 Try: pip install 'scipy==1.9.3' to fix compatibility")
        sys.exit(1)
    
    print("🌐 Server starting on http://localhost:8000")
    print("📚 API docs: http://localhost:8000/docs")
    print("🔗 Health check: http://localhost:8000/health")
    print("🧪 Test py-feat: http://localhost:8000/test-pyfeat")
    print("🎬 Analyze video: POST /analyze-video")
    
    uvicorn.run(
        "app:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="info"
    )