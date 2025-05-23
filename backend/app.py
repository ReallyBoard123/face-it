from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import sys
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional
import uvicorn
import tempfile
import cv2
import numpy as np
import pandas as pd
import subprocess
import shutil

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
            detector = Detector()
            print("✅ Detector initialized successfully!")
            return detector
        except Exception as e:
            print(f"❌ Failed to initialize detector: {e}")
            return None
    return detector

def check_ffmpeg():
    """Check if ffmpeg is available"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False

def convert_webm_to_mp4(webm_path: str, mp4_path: str) -> bool:
    """Convert WebM video to MP4 using ffmpeg"""
    try:
        if not check_ffmpeg():
            print("⚠️ ffmpeg not found, trying OpenCV conversion...")
            return convert_with_opencv(webm_path, mp4_path)
        
        print(f"🔄 Converting WebM to MP4 using ffmpeg...")
        cmd = [
            'ffmpeg',
            '-i', webm_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-strict', 'experimental',
            '-y',  # Overwrite output file
            mp4_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ ffmpeg conversion failed: {result.stderr}")
            return False
        
        print("✅ Video converted successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Conversion error: {e}")
        return False

def convert_with_opencv(input_path: str, output_path: str) -> bool:
    """Fallback conversion using OpenCV"""
    try:
        print("🔄 Converting video using OpenCV...")
        
        # Open the input video
        cap = cv2.VideoCapture(input_path)
        
        if not cap.isOpened():
            print("❌ Failed to open input video")
            return False
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Define the codec and create VideoWriter
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)
            frame_count += 1
        
        # Release everything
        cap.release()
        out.release()
        
        print(f"✅ Converted {frame_count} frames using OpenCV")
        return frame_count > 0
        
    except Exception as e:
        print(f"❌ OpenCV conversion error: {e}")
        return False

def validate_video_file(file_path: str) -> Dict[str, Any]:
    """Validate and get information about a video file"""
    try:
        cap = cv2.VideoCapture(file_path)
        
        if not cap.isOpened():
            return {"valid": False, "error": "Cannot open video file"}
        
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Try to read a frame
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame_count == 0:
            return {"valid": False, "error": "No frames in video"}
        
        return {
            "valid": True,
            "frame_count": frame_count,
            "fps": fps,
            "width": width,
            "height": height,
            "duration": frame_count / fps if fps > 0 else 0
        }
        
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "message": "Backend server is running",
        "detector_ready": get_detector() is not None,
        "ffmpeg_available": check_ffmpeg()
    }

@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):
    """Analyze a video file for facial expressions"""
    detector = get_detector()
    if detector is None:
        raise HTTPException(status_code=500, detail="Detector not initialized")
    
    tmp_webm_path = None
    tmp_mp4_path = None
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_webm_path = tmp_file.name
        
        print(f"📁 Received file: {file.filename}")
        print(f"📏 File size: {len(content) / 1024 / 1024:.2f} MB")
        print(f"🎥 Content type: {file.content_type}")
        
        # Validate the uploaded file
        validation = validate_video_file(tmp_webm_path)
        print(f"📋 Video validation: {validation}")
        
        # Convert WebM to MP4 if needed
        if file.content_type == 'video/webm' or tmp_webm_path.endswith('.webm'):
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as mp4_file:
                tmp_mp4_path = mp4_file.name
            
            if not convert_webm_to_mp4(tmp_webm_path, tmp_mp4_path):
                # If conversion fails, try using the original file
                print("⚠️ Conversion failed, attempting with original file...")
                tmp_mp4_path = tmp_webm_path
            else:
                # Validate the converted file
                mp4_validation = validate_video_file(tmp_mp4_path)
                print(f"📋 MP4 validation: {mp4_validation}")
                
                if not mp4_validation["valid"]:
                    raise Exception(f"Converted video is invalid: {mp4_validation.get('error', 'Unknown error')}")
        else:
            tmp_mp4_path = tmp_webm_path
        
        # Analyze with py-feat
        print("🧠 Starting py-feat analysis...")
        
        try:
            # First, try with conservative settings
            results = detector.detect_video(
                tmp_mp4_path,
                skip_frames=30,  # Process every 30th frame
                face_detection_threshold=0.5,
                batch_size=1  # Process one frame at a time
            )
            
        except AttributeError:
            # If detect_video doesn't exist, use detect with data_type
            results = detector.detect(
                tmp_mp4_path,
                data_type="video",
                skip_frames=30,
                face_detection_threshold=0.5
            )
        
        print(f"✅ Analysis completed! Results type: {type(results)}")
        
        # Clean up temporary files
        if tmp_webm_path and os.path.exists(tmp_webm_path):
            os.unlink(tmp_webm_path)
        if tmp_mp4_path and tmp_mp4_path != tmp_webm_path and os.path.exists(tmp_mp4_path):
            os.unlink(tmp_mp4_path)
        
        # Process results
        if results is None:
            return {
                "status": "error",
                "message": "Analysis returned no results",
                "timestamp": datetime.now().isoformat()
            }
        
        # Handle different result types
        if hasattr(results, 'empty') and results.empty:
            return {
                "status": "success",
                "message": "No faces detected in the video",
                "data": {
                    "summary": {
                        "total_frames": 0,
                        "faces_detected": 0,
                        "average_emotions": {}
                    },
                    "frames": []
                },
                "timestamp": datetime.now().isoformat()
            }
        
        # Extract emotion data
        emotion_columns = []
        
        # Check for emotion columns (py-feat typically uses lowercase)
        standard_emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
        
        for emotion in standard_emotions:
            if emotion in results.columns:
                emotion_columns.append(emotion)
        
        # If no lowercase, check for other formats
        if not emotion_columns:
            for col in results.columns:
                col_lower = col.lower()
                if any(emotion in col_lower for emotion in standard_emotions):
                    emotion_columns.append(col)
        
        print(f"😊 Found emotion columns: {emotion_columns}")
        
        # Calculate summary statistics
        emotion_data = {}
        for col in emotion_columns:
            values = results[col].dropna()
            if len(values) > 0:
                emotion_data[col] = {
                    "mean": float(values.mean()),
                    "std": float(values.std()),
                    "min": float(values.min()),
                    "max": float(values.max())
                }
        
        # Get frame data (limit to first 100 frames for response size)
        frame_data = []
        for idx in range(min(len(results), 100)):
            row = results.iloc[idx]
            
            frame_emotions = {}
            for col in emotion_columns:
                if col in row:
                    val = row[col]
                    frame_emotions[col] = float(val) if not pd.isna(val) else 0.0
            
            frame_data.append({
                "frame": int(idx),
                "emotions": frame_emotions,
                "timestamp": idx / 30.0  # Assuming 30 fps
            })
        
        return {
            "status": "success",
            "message": f"Analysis completed successfully",
            "data": {
                "summary": {
                    "total_frames": len(results),
                    "faces_detected": len(results[results.notna().any(axis=1)]) if not results.empty else 0,
                    "emotions_detected": emotion_data,
                    "video_info": validation if validation["valid"] else {}
                },
                "frames": frame_data,
                "available_columns": list(results.columns)[:20]  # First 20 columns
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Clean up temporary files
        if tmp_webm_path and os.path.exists(tmp_webm_path):
            try:
                os.unlink(tmp_webm_path)
            except:
                pass
        if tmp_mp4_path and tmp_mp4_path != tmp_webm_path and os.path.exists(tmp_mp4_path):
            try:
                os.unlink(tmp_mp4_path)
            except:
                pass
        
        error_msg = str(e)
        print(f"❌ Analysis error: {error_msg}")
        print(f"🔍 Error type: {type(e).__name__}")
        print(f"📜 Traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"Video analysis failed: {error_msg}",
                "error_type": type(e).__name__,
                "suggestion": "Please ensure your video contains clear facial footage and try again",
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/test-pyfeat")
async def test_pyfeat():
    """Test py-feat installation and basic functionality"""
    try:
        from feat import Detector
        from feat import __version__ as feat_version
        
        # Get available AU models
        detector_test = Detector()
        
        return {
            "status": "success",
            "message": "py-feat is installed and working correctly!",
            "py_feat_version": feat_version if 'feat_version' in locals() else "Unknown",
            "detector_info": {
                "initialized": True,
                "available_emotions": ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"]
            },
            "system_info": {
                "opencv_available": "cv2" in sys.modules or cv2 is not None,
                "ffmpeg_available": check_ffmpeg()
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": f"py-feat test failed: {str(e)}",
                "error_type": type(e).__name__,
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
            "analyze": "/analyze-video"
        },
        "requirements": {
            "video_formats": ["MP4 (recommended)", "WebM (will be converted)"],
            "face_visibility": "Clear frontal view recommended",
            "lighting": "Good lighting improves detection accuracy"
        }
    }

if __name__ == "__main__":
    print("🚀 Starting Facial Expression Analysis Backend Server...")
    print("📊 Checking dependencies...")
    
    # Check py-feat
    try:
        from feat import Detector
        print("✅ py-feat successfully imported!")
    except ImportError as e:
        print(f"❌ py-feat import failed: {e}")
        print("💡 Install with: pip install py-feat")
        sys.exit(1)
    
    # Check ffmpeg
    if check_ffmpeg():
        print("✅ ffmpeg is available for video conversion")
    else:
        print("⚠️ ffmpeg not found - will use OpenCV fallback")
        print("💡 Install ffmpeg for better video conversion: sudo apt install ffmpeg")
    
    # Initialize detector on startup
    print("🔄 Pre-initializing detector...")
    get_detector()
    
    print("\n🌐 Server starting on http://localhost:8000")
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