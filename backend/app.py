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
import pandas as pd
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

# Global detector instance - will be initialized on first use
detector = None

def get_detector():
    """Get or initialize the detector"""
    global detector
    if detector is None:
        try:
            from feat import Detector
            print("🚀 Initializing py-feat detector...")
            # Use basic initialization - modern py-feat uses different parameter names
            detector = Detector()
            print("✅ Detector initialized successfully!")
            return detector
        except Exception as e:
            print(f"❌ Failed to initialize detector: {e}")
            return None
    return detector

def initialize_detector():
    """Initialize the py-feat detector"""
    return get_detector() is not None

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "message": "Backend server is running",
        "detector_ready": get_detector() is not None
    }

@app.get("/test-pyfeat")
async def test_pyfeat():
    """Test py-feat installation and basic functionality"""
    try:
        # Import py-feat
        from feat import Detector
        
        # Initialize detector with default settings
        test_detector = Detector()
        
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
    detector = get_detector()
    if detector is None:
        raise HTTPException(status_code=500, detail="Detector not initialized")
    
    tmp_file_path = None
    
    try:
        # Save uploaded file temporarily
        file_extension = '.webm' if file.content_type == 'video/webm' else '.mp4'
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        print(f"🎬 Analyzing video: {tmp_file_path}")
        print(f"📁 File size: {len(content) / 1024 / 1024:.2f} MB")
        print(f"🎥 Content type: {file.content_type}")
        
        # Check if file exists and has content
        if not os.path.exists(tmp_file_path) or os.path.getsize(tmp_file_path) == 0:
            raise Exception("Uploaded file is empty or corrupted")
        
        # Use py-feat video analysis as shown in official documentation
        print("🧠 Starting py-feat analysis...")
        try:
            # Use the exact parameters from py-feat documentation
            results = detector.detect(
                tmp_file_path, 
                data_type="video", 
                skip_frames=24,  # Process every 24th frame for speed
                face_detection_threshold=0.5  # Lower threshold for better detection
            )
            print(f"✅ Analysis completed! Results shape: {results.shape}")
        except Exception as video_error:
            print(f"❌ Video analysis failed: {video_error}")
            print("🔄 Trying with different parameters...")
            
            # Try with more permissive settings
            try:
                results = detector.detect(
                    tmp_file_path, 
                    data_type="video", 
                    skip_frames=30,  # Skip more frames
                    face_detection_threshold=0.3  # Lower threshold
                )
                print(f"✅ Analysis completed with permissive settings! Results shape: {results.shape}")
            except Exception as second_error:
                print(f"❌ Second attempt failed: {second_error}")
                raise Exception(f"Video analysis failed after multiple attempts: {second_error}")
        
        # Clean up temporary file
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        
        # Process results
        if results is None or (hasattr(results, 'empty') and results.empty):
            return {
                "status": "success",
                "message": "No faces detected in the video. Please ensure your face is clearly visible and well-lit.",
                "data": None,
                "timestamp": datetime.now().isoformat()
            }
        
        print(f"📋 Available columns: {list(results.columns)}")
        
        # Get emotion columns - modern py-feat has standardized emotion names
        emotion_columns = []
        for col in results.columns:
            col_lower = col.lower()
            if any(emotion in col_lower for emotion in ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']):
                emotion_columns.append(col)
        
        print(f"😊 Found emotion columns: {emotion_columns}")
        
        # Calculate average emotions across all frames
        emotion_data = {}
        if emotion_columns:
            for col in emotion_columns:
                if col in results.columns:
                    values = results[col].dropna()
                    if len(values) > 0:
                        emotion_data[col] = float(values.mean())
        
        # If no emotions found, check for alternative column names
        if not emotion_data:
            print("⚠️ No emotion columns found, checking alternative names...")
            # Try standard emotion names directly
            standard_emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
            for emotion in standard_emotions:
                if emotion in results.columns:
                    values = results[emotion].dropna()
                    if len(values) > 0:
                        emotion_data[emotion] = float(values.mean())
        
        # Get frame-by-frame data
        frame_data = []
        for idx, row in results.iterrows():
            frame_emotions = {}
            if emotion_columns:
                for col in emotion_columns:
                    if col in row:
                        val = row[col]
                        frame_emotions[col] = float(val) if not pd.isna(val) else 0.0
            else:
                # Use any emotion data we found
                for emotion, value in emotion_data.items():
                    frame_emotions[emotion] = float(row.get(emotion, 0.0)) if emotion in row else value
            
            frame_data.append({
                "frame": int(idx),
                "emotions": frame_emotions,
                "confidence": float(row.get('confidence', 1.0)) if 'confidence' in row else 1.0
            })
        
        return {
            "status": "success",
            "message": f"Analysis completed! Processed {len(results)} frames with {len(emotion_data)} emotions detected",
            "data": {
                "summary": {
                    "total_frames": len(results),
                    "faces_detected": len(results),
                    "average_emotions": emotion_data
                },
                "frames": frame_data[:50],  # Limit frames for response size
                "columns_available": list(results.columns)
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Clean up temporary file if it exists
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except:
                pass
        
        error_msg = str(e)
        print(f"❌ Analysis error: {error_msg}")
        print(f"🔍 Error traceback: {traceback.format_exc()}")
                
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Video analysis failed: {error_msg}",
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/test-image-analysis")
async def test_image_analysis():
    """Test image analysis with a simple generated image"""
    try:
        detector = get_detector()
        if detector is None:
            raise HTTPException(status_code=500, detail="Detector not initialized")
        
        # Create a simple test image with a face-like pattern
        import numpy as np
        
        # Create a 640x480 RGB image
        test_image = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Add a simple face-like pattern (oval + eyes + mouth)
        center_x, center_y = 320, 240
        
        # Face oval (skin tone)
        cv2.ellipse(test_image, (center_x, center_y), (80, 100), 0, 0, 360, (220, 180, 140), -1)
        
        # Eyes
        cv2.circle(test_image, (center_x-25, center_y-20), 8, (50, 50, 50), -1)
        cv2.circle(test_image, (center_x+25, center_y-20), 8, (50, 50, 50), -1)
        
        # Mouth
        cv2.ellipse(test_image, (center_x, center_y+30), (25, 15), 0, 0, 180, (100, 50, 50), 2)
        
        print("🖼️ Testing with generated face image...")
        
        # Test with py-feat
        results = detector.detect_image([test_image])
        
        return {
            "status": "success",
            "message": "Image analysis test completed",
            "data": {
                "results_shape": str(results.shape) if hasattr(results, 'shape') else "No shape",
                "columns": list(results.columns) if hasattr(results, 'columns') else [],
                "sample_data": results.head().to_dict() if hasattr(results, 'head') else str(results)
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error", 
                "message": f"Image analysis test failed: {str(e)}",
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
        
        return {
            "status": "success",
            "message": "Modern py-feat uses default model configurations",
            "detector_info": {
                "api_version": "modern",
                "default_models": "Automatically selected by py-feat",
                "supported_emotions": ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"],
                "supported_data_types": ["image", "video"]
            },
            "detector_ready": get_detector() is not None,
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
            "test_image": "/test-image-analysis", 
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
    print("🖼️ Test image analysis: http://localhost:8000/test-image-analysis")
    print("🎬 Analyze video: POST /analyze-video")
    
    uvicorn.run(
        "app:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="info"
    )