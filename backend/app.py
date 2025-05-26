from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
from typing import Dict, Any, List, Optional, Tuple
import tempfile
import os
import cv2
import numpy as np
import pandas as pd
from datetime import datetime
import uvicorn
from dataclasses import dataclass
from enum import Enum
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging
import hashlib
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Facial Expression Analysis API",
    description="Advanced facial expression analysis using py-feat",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums for analysis types
class AnalysisType(str, Enum):
    EMOTIONS = "emotions"
    AUS = "aus"
    COMBINED = "combined"
    LANDMARKS = "landmarks"

class VisualizationStyle(str, Enum):
    TIMELINE = "timeline"
    HEATMAP = "heatmap"
    DISTRIBUTION = "distribution"

# Configuration dataclass
@dataclass
class AnalysisConfig:
    frame_skip: int = 30
    analysis_type: AnalysisType = AnalysisType.COMBINED
    visualization_style: VisualizationStyle = VisualizationStyle.TIMELINE
    detection_threshold: float = 0.5
    batch_size: int = 1

# Global variables
detector = None
executor = ThreadPoolExecutor(max_workers=2)
analysis_cache = {}  # Simple in-memory cache with TTL
cache_timestamps = {}  # Track when cache entries were created
CACHE_TTL_SECONDS = 300  # 5 minutes TTL for cache entries

def get_detector():
    """Lazy load the detector"""
    global detector
    if detector is None:
        try:
            from feat import Detector
            logger.info("Initializing py-feat detector...")
            detector = Detector()
            logger.info("Detector initialized successfully!")
        except Exception as e:
            logger.error(f"Failed to initialize detector: {e}")
            raise
    return detector

def generate_cache_key(file_content: bytes, config: AnalysisConfig, filename: str) -> str:
    """Generate a unique cache key based on file content and config"""
    # Create hash of first 1KB of file content + config for uniqueness
    content_sample = file_content[:1024] if len(file_content) > 1024 else file_content
    content_hash = hashlib.md5(content_sample).hexdigest()[:8]
    
    config_str = f"{config.frame_skip}_{config.analysis_type}_{config.detection_threshold}"
    timestamp = str(int(time.time() // 60))  # Change every minute to prevent too much caching
    
    return f"{content_hash}_{config_str}_{timestamp}"

def clean_expired_cache():
    """Remove expired cache entries"""
    current_time = time.time()
    expired_keys = [
        key for key, timestamp in cache_timestamps.items()
        if current_time - timestamp > CACHE_TTL_SECONDS
    ]
    
    for key in expired_keys:
        analysis_cache.pop(key, None)
        cache_timestamps.pop(key, None)
    
    if expired_keys:
        logger.info(f"Cleaned {len(expired_keys)} expired cache entries")

def convert_video_sync(input_path: str, output_path: str) -> bool:
    """Synchronous video conversion using ffmpeg via OpenCV"""
    try:
        # First try to read the video directly
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video file: {input_path}")
            return False
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        logger.info(f"Video info: {width}x{height}, {fps} fps, {frame_count} frames")
        
        # If fps is 0 or invalid, set a default
        if fps <= 0:
            fps = 30
            logger.warning(f"Invalid fps detected, using default: {fps}")
        
        # Use a more compatible codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        if not out.isOpened():
            logger.error("Cannot create output video writer")
            cap.release()
            return False
        
        frame_num = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)
            frame_num += 1
        
        cap.release()
        out.release()
        
        logger.info(f"Video conversion completed: {frame_num} frames processed")
        return True
        
    except Exception as e:
        logger.error(f"Video conversion error: {e}")
        return False

async def convert_video(input_path: str, output_path: str) -> bool:
    """Convert video asynchronously"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        executor, 
        convert_video_sync, 
        input_path, 
        output_path
    )

def run_detector_sync(video_path: str, config: AnalysisConfig) -> pd.DataFrame:
    """Run detector synchronously to avoid async issues"""
    detector = get_detector()
    
    # Prepare detection parameters according to py-feat documentation
    detect_params = {
        "data_type": "video",
        "skip_frames": config.frame_skip,
        "face_detection_threshold": config.detection_threshold,
        # Note: batch_size is NOT a parameter for detector.detect() according to docs
        "progress_bar": True
    }
    
    logger.info(f"Running detector with params: {detect_params}")
    
    try:
        # Run the actual detection
        results = detector.detect(video_path, **detect_params)
        
        if results is None:
            raise Exception("Detector returned None - no faces detected")
        
        if hasattr(results, 'empty') and results.empty:
            raise Exception("Detector returned empty DataFrame - no faces detected")
        
        logger.info(f"Detection completed successfully: {len(results)} frames processed")
        return results
        
    except Exception as e:
        logger.error(f"Detector error: {e}")
        raise

def analyze_emotions(results: pd.DataFrame) -> Dict[str, Any]:
    """Extract emotion analysis from results"""
    emotion_cols = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
    available_emotions = [col for col in emotion_cols if col in results.columns]
    
    if not available_emotions:
        return {}
    
    # Calculate statistics
    emotion_stats = {}
    for emotion in available_emotions:
        values = results[emotion].dropna()
        if len(values) > 0:
            emotion_stats[emotion] = {
                "mean": float(values.mean()),
                "std": float(values.std()) if len(values) > 1 else 0.0,
                "min": float(values.min()),
                "max": float(values.max()),
                "peaks": find_peaks(values.values),
            }
    
    # Find dominant emotions per frame
    emotion_data = results[available_emotions].fillna(0)
    dominant_emotions = emotion_data.idxmax(axis=1).value_counts().to_dict()
    
    return {
        "statistics": emotion_stats,
        "dominant_emotions": dominant_emotions,
        "timeline": prepare_timeline_data(results, available_emotions)
    }

def analyze_action_units(results: pd.DataFrame) -> Dict[str, Any]:
    """Extract AU analysis from results"""
    au_cols = [col for col in results.columns if col.startswith('AU') and col[2:].replace('_', '').isdigit()]
    
    if not au_cols:
        return {}
    
    # AU statistics
    au_stats = {}
    for au in au_cols:
        values = results[au].dropna()
        if len(values) > 0:
            au_stats[au] = {
                "mean": float(values.mean()),
                "activation_rate": float((values > 0.5).mean()),
                "max_intensity": float(values.max()),
            }
    
    return {
        "statistics": au_stats,
        "timeline": prepare_timeline_data(results, au_cols)
    }

def find_peaks(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    """Find peak moments in the data"""
    if len(values) < 3:
        return []
    
    peaks = []
    for i in range(1, len(values) - 1):
        if values[i] > threshold and values[i] > values[i-1] and values[i] > values[i+1]:
            peaks.append(i)
    return peaks[:10]  # Return top 10 peaks

def prepare_timeline_data(results: pd.DataFrame, columns: List[str], max_frames: int = 500) -> Dict[str, List[float]]:
    """Prepare data for timeline visualization"""
    # Downsample if too many frames
    if len(results) > max_frames:
        step = len(results) // max_frames
        results = results.iloc[::step]
    
    timeline = {"timestamps": list(range(len(results)))}
    for col in columns:
        if col in results.columns:
            timeline[col] = results[col].fillna(0).tolist()
    
    return timeline

def calculate_summary_metrics(results: pd.DataFrame, config: AnalysisConfig) -> Dict[str, Any]:
    """Calculate comprehensive summary metrics"""
    summary = {
        "total_frames": len(results),
        "faces_detected": len(results[results['FaceScore'] > config.detection_threshold]) if 'FaceScore' in results.columns else len(results),
        "processing_config": {
            "frame_skip": config.frame_skip,
            "analysis_type": config.analysis_type,
            "detection_threshold": config.detection_threshold
        }
    }
    
    # Add type-specific summaries
    if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
        summary["emotions"] = analyze_emotions(results)
    
    if config.analysis_type in [AnalysisType.AUS, AnalysisType.COMBINED]:
        summary["action_units"] = analyze_action_units(results)
    
    return summary

@app.post("/analyze-video")
async def analyze_video(
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None)
):
    """Advanced video analysis endpoint"""
    # Clean expired cache entries first
    clean_expired_cache()
    
    # Parse settings
    config = AnalysisConfig()
    if settings:
        try:
            settings_dict = json.loads(settings)
            config.frame_skip = settings_dict.get('frameSkip', 30)
            config.analysis_type = settings_dict.get('analysisType', 'combined')
            config.visualization_style = settings_dict.get('visualizationStyle', 'timeline')
            config.detection_threshold = settings_dict.get('detectionThreshold', 0.5)
            config.batch_size = settings_dict.get('batchSize', 1)
        except json.JSONDecodeError:
            logger.warning("Failed to parse settings, using defaults")
    
    # Read file content for cache key generation
    file_content = await file.read()
    cache_key = generate_cache_key(file_content, config, file.filename)
    
    # Check cache
    current_time = time.time()
    if cache_key in analysis_cache and cache_key in cache_timestamps:
        if current_time - cache_timestamps[cache_key] < CACHE_TTL_SECONDS:
            logger.info(f"Returning cached results for {cache_key}")
            return JSONResponse(content=analysis_cache[cache_key])
        else:
            # Remove expired entry
            analysis_cache.pop(cache_key, None)
            cache_timestamps.pop(cache_key, None)
    
    tmp_input = None
    tmp_output = None
    
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(file_content)
            tmp_input = tmp.name
        
        logger.info(f"Processing video: {file.filename} ({len(file_content) / 1024 / 1024:.2f} MB)")
        
        # For webm files, try to convert to mp4 for better compatibility
        video_path = tmp_input
        if file.content_type == 'video/webm' or file.filename.endswith('.webm'):
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp_output = tmp.name
            
            logger.info("Converting webm to mp4...")
            if await convert_video(tmp_input, tmp_output):
                video_path = tmp_output
                logger.info("Video conversion successful")
            else:
                logger.warning("Video conversion failed, trying original webm file")
                video_path = tmp_input
        
        logger.info(f"Starting fresh analysis with config: {config}")
        
        # Run detection in executor to avoid async issues
        results = await asyncio.get_event_loop().run_in_executor(
            executor,
            run_detector_sync,
            video_path,
            config
        )
        
        if results is None or (hasattr(results, 'empty') and results.empty):
            raise Exception("No faces detected in video. Try adjusting detection threshold or ensuring good lighting.")
        
        # Calculate comprehensive metrics
        summary = calculate_summary_metrics(results, config)
        
        # Prepare response
        response = {
            "status": "success",
            "message": f"Analysis completed successfully. Processed {len(results)} frames.",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style,
                "metadata": {
                    "filename": file.filename,
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat",
                    "frames_processed": len(results),
                    "cache_key": cache_key[:8]  # First 8 chars for debugging
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        # Cache results (with size limit)
        if len(analysis_cache) < 20:  # Increased cache size limit
            analysis_cache[cache_key] = response
            cache_timestamps[cache_key] = current_time
            logger.info(f"Cached results with key: {cache_key[:8]}...")
        else:
            logger.warning("Cache full, not caching this result")
        
        return JSONResponse(content=response)
        
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )
    finally:
        # Cleanup
        for path in [tmp_input, tmp_output]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception as cleanup_error:
                    logger.warning(f"Failed to cleanup {path}: {cleanup_error}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        detector = get_detector()
        detector_ready = detector is not None
    except:
        detector_ready = False
    
    clean_expired_cache()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "detector_ready": detector_ready,
        "cache_size": len(analysis_cache),
        "cache_entries": list(analysis_cache.keys())[:5] if analysis_cache else []  # Show first 5 cache keys
    }

@app.post("/clear-cache")
async def clear_cache():
    """Clear analysis cache"""
    cache_size = len(analysis_cache)
    analysis_cache.clear()
    cache_timestamps.clear()
    logger.info(f"Cache cleared: {cache_size} entries removed")
    return {"status": "success", "message": f"Cache cleared ({cache_size} entries removed)"}

@app.get("/")
async def root():
    """API documentation"""
    return {
        "name": "Facial Expression Analysis API",
        "version": "2.0.0",
        "endpoints": {
            "analyze": {
                "path": "/analyze-video",
                "method": "POST",
                "description": "Analyze facial expressions in video"
            },
            "health": {
                "path": "/health",
                "method": "GET",
                "description": "Check API health status"
            },
            "clear_cache": {
                "path": "/clear-cache",
                "method": "POST",
                "description": "Clear analysis cache"
            },
            "docs": {
                "path": "/docs",
                "description": "Interactive API documentation"
            }
        },
        "features": [
            "Emotion detection",
            "Action Unit analysis",
            "Facial landmark tracking",
            "Timeline visualization",
            "Peak moment detection",
            "Smart result caching with TTL",
            "Automatic cache expiration"
        ]
    }

if __name__ == "__main__":
    logger.info("Starting Facial Expression Analysis API v2.0")
    
    # Pre-initialize detector
    try:
        get_detector()
        logger.info("✅ Detector pre-initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize detector: {e}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )