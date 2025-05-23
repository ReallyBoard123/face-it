from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import traceback
from datetime import datetime
from typing import Dict, Any
import uvicorn

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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "message": "Backend server is running"
    }

@app.get("/test-pyfeat")
async def test_pyfeat():
    """Test py-feat installation and basic functionality"""
    try:
        # Import py-feat
        from feat import Detector
        
        # Initialize detector with basic emotions
        detector = Detector(
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
                "face_model": detector.face_model,
                "emotion_model": detector.emotion_model,
                "au_model": detector.au_model,
                "available_emotions": ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"]
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
            "recommended_setup": {
                "face_model": "retinaface",
                "landmark_model": "mobilefacenet",
                "au_model": "xgb",
                "emotion_model": "resmasknet",
                "facepose_model": "img2pose"
            },
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
        "health": "/health"
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
    
    uvicorn.run(
        "app:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="info"
    )