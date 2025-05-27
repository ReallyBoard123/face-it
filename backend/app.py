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
import base64 # Added import

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
    content_sample = file_content[:1024] if len(file_content) > 1024 else file_content
    content_hash = hashlib.md5(content_sample).hexdigest()[:8]
    
    config_str = f"{config.frame_skip}_{config.analysis_type}_{config.detection_threshold}"
    # Removed timestamp from cache key to make it more stable for same file & config
    # timestamp = str(int(time.time() // 60)) 
    
    return f"{content_hash}_{config_str}"

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
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video file: {input_path}")
            return False
        
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if fps <= 0: fps = 30
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        if not out.isOpened():
            logger.error("Cannot create output video writer")
            cap.release()
            return False
        
        frame_num = 0
        while True:
            ret, frame = cap.read()
            if not ret: break
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
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, convert_video_sync, input_path, output_path)

def run_detector_sync(video_path: str, config: AnalysisConfig) -> pd.DataFrame:
    detector_instance = get_detector() # Changed variable name to avoid conflict
    detect_params = {
        "data_type": "video",
        "skip_frames": config.frame_skip,
        "face_detection_threshold": config.detection_threshold,
        "progress_bar": True,
        # "output_columns": ["time"] # Request time column from py-feat if available
    }
    logger.info(f"Running detector with params: {detect_params}")
    try:
        results = detector_instance.detect(video_path, **detect_params) # Use detector_instance
        if results is None or (hasattr(results, 'empty') and results.empty):
            raise Exception("Detector returned None or empty DataFrame - no faces detected")
        logger.info(f"Detection completed successfully: {len(results)} frames processed")
        return results
    except Exception as e:
        logger.error(f"Detector error: {e}")
        raise

def find_peaks(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    if len(values) < 3: return []
    peaks = []
    for i in range(1, len(values) - 1):
        if values[i] > threshold and values[i] > values[i-1] and values[i] > values[i+1]:
            peaks.append(i)
    return peaks[:10]

def analyze_emotions(results: pd.DataFrame) -> Dict[str, Any]:
    emotion_cols = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
    available_emotions = [col for col in emotion_cols if col in results.columns]
    if not available_emotions: return {}
    
    emotion_stats = {}
    for emotion in available_emotions:
        values = results[emotion].dropna()
        if not values.empty:
            emotion_stats[emotion] = {
                "mean": float(values.mean()),
                "std": float(values.std()) if len(values) > 1 else 0.0,
                "min": float(values.min()),
                "max": float(values.max()),
                "peaks": find_peaks(values.values),
            }
    
    emotion_data = results[available_emotions].fillna(0)
    dominant_emotions = emotion_data.idxmax(axis=1).value_counts().to_dict()
    
    return {
        "statistics": emotion_stats,
        "dominant_emotions": dominant_emotions,
        "timeline": prepare_timeline_data(results, available_emotions)
    }

def analyze_action_units(results: pd.DataFrame) -> Dict[str, Any]:
    au_cols = [col for col in results.columns if col.startswith('AU') and col[2:].replace('_', '').isdigit()]
    if not au_cols: return {}
    au_stats = {}
    for au in au_cols:
        values = results[au].dropna()
        if not values.empty:
            au_stats[au] = {
                "mean": float(values.mean()),
                "activation_rate": float((values > 0.5).mean()),
                "max_intensity": float(values.max()),
            }
    return {"statistics": au_stats, "timeline": prepare_timeline_data(results, au_cols)}

def prepare_timeline_data(results: pd.DataFrame, columns: List[str], max_frames: int = 500) -> Dict[str, List[float]]:
    # Use 'times' column if available from py-feat, otherwise use frame index
    # This function is primarily for visualization, key moments will use more precise timing.
    if results.empty: return {"timestamps": []}

    if len(results) > max_frames:
        step = len(results) // max_frames
        results_sampled = results.iloc[::step]
    else:
        results_sampled = results

    # Assuming 'times' column exists or was added based on frame index / fps
    if 'times' in results_sampled.columns:
        timeline = {"timestamps": results_sampled['times'].tolist()}
    else: # Fallback if 'times' isn't there, though it should be
        timeline = {"timestamps": list(range(len(results_sampled)))}


    for col in columns:
        if col in results_sampled.columns:
            timeline[col] = results_sampled[col].fillna(0).tolist()
    return timeline

def extract_emotional_key_moments(
    video_path: str,
    results_df: pd.DataFrame,
    fps: float,
    emotion_threshold_increase: float = 0.3
) -> List[Dict[str, Any]]:
    key_moments: List[Dict[str, Any]] = []
    emotions_to_track = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']
    
    if results_df.empty or len(results_df) < 2:
        return key_moments

    available_emotions = [col for col in emotions_to_track if col in results_df.columns]
    if not available_emotions:
        return key_moments

    # Ensure 'times' column exists or create it
    # py-feat's Fex class (used by Detector) should provide 'times' in seconds in its output DataFrame.
    # If it's named differently (e.g. 'input_times'), adjust here.
    # If 'times' is not directly available, calculate from frame index.
    # The DataFrame index from py-feat IS the frame number.
    if 'times' not in results_df.columns:
        logger.warning("'times' column not found in py-feat results. Calculating from frame index and FPS.")
        if fps <= 0: 
            logger.warning("Invalid FPS (0), defaulting to 30 for timestamp calculation.")
            fps = 30.0
        results_df_copy = results_df.copy() # Avoid SettingWithCopyWarning
        results_df_copy['times'] = results_df_copy.index / fps
    else:
        results_df_copy = results_df # Use as is if 'times' exists

    cap = None
    processed_frames_for_spikes = set() # To avoid multiple entries for the same frame if multiple emotions spike

    try:
        for i in range(1, len(results_df_copy)):
            current_frame_data = results_df_copy.iloc[i]
            previous_frame_data = results_df_copy.iloc[i-1]
            
            frame_number = int(results_df_copy.index[i]) # Original frame number from py-feat
            timestamp_sec = current_frame_data['times']

            if frame_number in processed_frames_for_spikes:
                continue

            for emotion in available_emotions:
                current_value = current_frame_data[emotion]
                previous_value = previous_frame_data[emotion]

                if pd.notna(current_value) and pd.notna(previous_value) and \
                   (current_value - previous_value > emotion_threshold_increase):
                    
                    if cap is None:
                        cap = cv2.VideoCapture(video_path)
                        if not cap.isOpened():
                            logger.error(f"Cannot open video {video_path} for key moment frame extraction.")
                            return key_moments
                    
                    cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_number)) # Seek to the original frame number
                    ret, frame_image = cap.read()
                    if ret:
                        _, buffer = cv2.imencode('.jpg', frame_image, [cv2.IMWRITE_JPEG_QUALITY, 60]) # Quality to 60
                        frame_base64 = base64.b64encode(buffer).decode('utf-8')
                        key_moments.append({
                            'timestamp': timestamp_sec,
                            'reason': f'{emotion.capitalize()} increased by {((current_value - previous_value)*100):.0f}%',
                            'faceFrame': frame_base64,
                            'type': 'emotion_spike',
                            'frameNumber': frame_number
                        })
                        processed_frames_for_spikes.add(frame_number)
                        break # Processed this frame for a spike, move to next frame in results
                    else:
                        logger.warning(f"Could not read frame {frame_number} for key moment at {timestamp_sec:.2f}s.")
                        
    except Exception as e:
        logger.error(f"Error extracting key moments: {e}", exc_info=True)
    finally:
        if cap:
            cap.release()
            
    return key_moments

def calculate_summary_metrics(results: pd.DataFrame, config: AnalysisConfig, video_path_for_frames: str, video_fps: float) -> Dict[str, Any]:
    summary = {
        "total_frames": len(results),
        "faces_detected": len(results[results['FaceScore'] > config.detection_threshold]) if 'FaceScore' in results.columns else len(results),
        "processing_config": {
            "frame_skip": config.frame_skip,
            "analysis_type": config.analysis_type.value, # Use .value for Enum
            "detection_threshold": config.detection_threshold
        }
    }
    
    if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
        summary["emotions"] = analyze_emotions(results)
    
    if config.analysis_type in [AnalysisType.AUS, AnalysisType.COMBINED]:
        summary["action_units"] = analyze_action_units(results)

    # Add emotional key moments
    if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
        summary["emotional_key_moments"] = extract_emotional_key_moments(
            video_path_for_frames, results, video_fps, 0.3
        )
    else:
        summary["emotional_key_moments"] = []
    
    return summary

@app.post("/analyze-video")
async def analyze_video(
    file: UploadFile = File(...),
    settings: Optional[str] = Form(None)
):
    clean_expired_cache()
    config = AnalysisConfig()
    if settings:
        try:
            settings_dict = json.loads(settings)
            config.frame_skip = settings_dict.get('frameSkip', 30)
            config.analysis_type = AnalysisType(settings_dict.get('analysisType', 'combined'))
            config.visualization_style = VisualizationStyle(settings_dict.get('visualizationStyle', 'timeline'))
            config.detection_threshold = settings_dict.get('detectionThreshold', 0.5)
            config.batch_size = settings_dict.get('batchSize', 1)
        except (json.JSONDecodeError, ValueError) as e: # Added ValueError for Enum conversion
            logger.warning(f"Failed to parse settings ('{settings}'), using defaults: {e}")
            # Fallback to defaults if parsing/enum conversion fails
            config = AnalysisConfig()

    file_content = await file.read()
    # Ensure filename is safe for cache key generation (e.g. if it has unusual chars)
    safe_filename = hashlib.md5(file.filename.encode()).hexdigest() if file.filename else "unknownfile"
    cache_key = generate_cache_key(file_content, config, safe_filename)
    
    current_time = time.time()
    if cache_key in analysis_cache and cache_key in cache_timestamps:
        if current_time - cache_timestamps[cache_key] < CACHE_TTL_SECONDS:
            logger.info(f"Returning cached results for {cache_key}")
            return JSONResponse(content=analysis_cache[cache_key])
        else:
            analysis_cache.pop(cache_key, None)
            cache_timestamps.pop(cache_key, None)
    
    tmp_input = None
    tmp_output = None
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(file_content)
            tmp_input = tmp.name
        
        logger.info(f"Processing video: {file.filename} ({len(file_content) / 1024 / 1024:.2f} MB)")
        
        video_path_for_analysis = tmp_input # Path for py-feat and frame extraction
        if file.content_type == 'video/webm' or (file.filename and file.filename.endswith('.webm')):
            # Some systems might have issues with webm directly in OpenCV for frame count/FPS
            # Conversion to mp4 can make it more robust for py-feat as well.
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_mp4:
                tmp_output = tmp_mp4.name
            
            logger.info(f"Attempting conversion from webm ({tmp_input}) to mp4 ({tmp_output})...")
            if await convert_video(tmp_input, tmp_output):
                video_path_for_analysis = tmp_output
                logger.info("Video conversion successful, using converted mp4 for analysis.")
            else:
                logger.warning("Video conversion failed, attempting analysis with original webm file.")
                # tmp_output might not be valid, ensure it's cleaned if conversion fails
                if tmp_output and os.path.exists(tmp_output):
                    try: os.unlink(tmp_output)
                    except: pass
                tmp_output = None # Reset tmp_output if conversion failed

        # Get FPS from the video that will be analyzed for timestamps
        cap_fps_check = cv2.VideoCapture(video_path_for_analysis)
        video_fps = cap_fps_check.get(cv2.CAP_PROP_FPS)
        cap_fps_check.release()
        if video_fps == 0: 
            logger.warning("FPS from video is 0, defaulting to 30.")
            video_fps = 30.0
        
        logger.info(f"Starting fresh analysis with config: {config}")
        
        results_df = await asyncio.get_event_loop().run_in_executor(
            executor,
            run_detector_sync,
            video_path_for_analysis,
            config
        )
        
        if results_df is None or (hasattr(results_df, 'empty') and results_df.empty):
            raise Exception("No faces detected in video. Try adjusting detection threshold or ensuring good lighting.")
        
        summary = calculate_summary_metrics(results_df, config, video_path_for_analysis, video_fps)
        
        response_data = {
            "status": "success",
            "message": f"Analysis completed. Processed {len(results_df)} data points from video.",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style.value,
                "metadata": {
                    "filename": file.filename,
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat", # Consider getting actual version if possible
                    "frames_in_result": len(results_df),
                    "cache_key_prefix": cache_key[:8] 
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        if len(analysis_cache) < 20:
            analysis_cache[cache_key] = response_data
            cache_timestamps[cache_key] = current_time
            logger.info(f"Cached results with key prefix: {cache_key[:8]}...")
        else:
            logger.warning("Cache full, not caching this result")
        
        return JSONResponse(content=response_data)
        
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
        if tmp_input and os.path.exists(tmp_input):
            try: os.unlink(tmp_input)
            except Exception as e: logger.warning(f"Failed to cleanup tmp_input {tmp_input}: {e}")
        if tmp_output and os.path.exists(tmp_output): # If conversion happened and succeeded
            try: os.unlink(tmp_output)
            except Exception as e: logger.warning(f"Failed to cleanup tmp_output {tmp_output}: {e}")

@app.get("/health")
async def health_check():
    try:
        detector_instance = get_detector() # Changed variable name
        detector_ready = detector_instance is not None
    except:
        detector_ready = False
    clean_expired_cache()
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "detector_ready": detector_ready,
        "cache_size": len(analysis_cache),
        "cache_entries_keys": list(analysis_cache.keys())[:5]
    }

@app.post("/clear-cache")
async def clear_cache_endpoint(): # Renamed to avoid conflict with function name
    cache_size = len(analysis_cache)
    analysis_cache.clear()
    cache_timestamps.clear()
    logger.info(f"Cache cleared: {cache_size} entries removed")
    return {"status": "success", "message": f"Cache cleared ({cache_size} entries removed)"}

@app.get("/")
async def root():
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
    try:
        get_detector()
        logger.info("✅ Detector pre-initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize detector: {e}")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="info")