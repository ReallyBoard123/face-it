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
    PEAKS = "peaks"
    COMPARISON = "comparison"

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
analysis_cache = {}  # Simple in-memory cache

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

async def convert_video(input_path: str, output_path: str) -> bool:
    """Convert video asynchronously"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        executor, 
        _convert_video_sync, 
        input_path, 
        output_path
    )

def _convert_video_sync(input_path: str, output_path: str) -> bool:
    """Synchronous video conversion using OpenCV"""
    try:
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            return False
        
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)
        
        cap.release()
        out.release()
        return True
    except Exception as e:
        logger.error(f"Video conversion error: {e}")
        return False

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
                "std": float(values.std()),
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
    au_cols = [col for col in results.columns if col.startswith('AU') and col[2:].isdigit()]
    
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
    
    # AU co-activation patterns
    au_data = results[au_cols].fillna(0)
    co_activation = au_data.corr().to_dict()
    
    return {
        "statistics": au_stats,
        "co_activation": co_activation,
        "timeline": prepare_timeline_data(results, au_cols)
    }

def find_peaks(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    """Find peak moments in the data"""
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
    
    # Get detector
    detector = get_detector()
    
    # Generate cache key
    cache_key = f"{file.filename}_{config.frame_skip}_{config.analysis_type}"
    
    # Check cache
    if cache_key in analysis_cache:
        logger.info(f"Returning cached results for {cache_key}")
        return JSONResponse(content=analysis_cache[cache_key])
    
    tmp_input = None
    tmp_output = None
    
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_input = tmp.name
        
        logger.info(f"Processing video: {file.filename} ({len(content) / 1024 / 1024:.2f} MB)")
        
        # Convert if needed
        if file.content_type == 'video/webm':
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp_output = tmp.name
            
            if not await convert_video(tmp_input, tmp_output):
                raise Exception("Video conversion failed")
            
            video_path = tmp_output
        else:
            video_path = tmp_input
        
        # Run analysis
        logger.info(f"Starting analysis with config: {config}")
        
        # Adjust parameters based on config
        detect_params = {
            "skip_frames": config.frame_skip,
            "face_detection_threshold": config.detection_threshold,
            "batch_size": config.batch_size
        }
        
        # Run detection
        results = await asyncio.get_event_loop().run_in_executor(
            executor,
            lambda: detector.detect(
                video_path,
                data_type="video",
                **detect_params
            )
        )
        
        if results is None or (hasattr(results, 'empty') and results.empty):
            raise Exception("No faces detected in video")
        
        # Calculate comprehensive metrics
        summary = calculate_summary_metrics(results, config)
        
        # Prepare response
        response = {
            "status": "success",
            "message": f"Analysis completed successfully",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style,
                "metadata": {
                    "filename": file.filename,
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat"
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        # Cache results (with size limit)
        if len(analysis_cache) < 10:  # Simple cache size limit
            analysis_cache[cache_key] = response
        
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
                except:
                    pass

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "detector_ready": detector is not None,
        "cache_size": len(analysis_cache)
    }

@app.post("/clear-cache")
async def clear_cache():
    """Clear analysis cache"""
    analysis_cache.clear()
    return {"status": "success", "message": "Cache cleared"}

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
            "Result caching"
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