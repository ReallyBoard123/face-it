# facial_expression_recognizer.py - Original Working Logic + Job Compatibility

import asyncio
import base64
import hashlib
import json
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

import cv2
import numpy as np
import pandas as pd
import torch

# Configure logging
logger = logging.getLogger(__name__)

# --- Enums and Dataclasses ---
class AnalysisType(str, Enum):
    EMOTIONS = "emotions"
    AUS = "aus"
    COMBINED = "combined"
    LANDMARKS = "landmarks"

class VisualizationStyle(str, Enum):
    TIMELINE = "timeline"
    HEATMAP = "heatmap"
    DISTRIBUTION = "distribution"

@dataclass
class AnalysisConfig:
    frame_skip: int = 30
    analysis_type: AnalysisType = AnalysisType.COMBINED
    visualization_style: VisualizationStyle = VisualizationStyle.TIMELINE
    detection_threshold: float = 0.5
    batch_size: int = 1

# --- Global variables ---
detector = None
executor = ThreadPoolExecutor(max_workers=2)
analysis_cache: Dict[str, Any] = {}
cache_timestamps: Dict[str, float] = {}
CACHE_TTL_SECONDS = 300

# --- Core Functions ---
def get_detector():
    """Lazy load the py-feat detector."""
    global detector
    if detector is None:
        try:
            from feat import Detector
            logger.info("🔧 Initializing py-feat detector...")
            detector = Detector()
            logger.info("✅ Detector initialized successfully!")
        except Exception as e:
            logger.error(f"❌ Failed to initialize py-feat detector: {e}")
            raise
    return detector

def generate_cache_key(file_content: bytes, config: AnalysisConfig) -> str:
    """Generate cache key."""
    content_sample = file_content[:1024]
    content_hash = hashlib.md5(content_sample).hexdigest()[:8]
    config_str = f"{config.frame_skip}_{config.analysis_type.value}_{config.detection_threshold}"
    return f"face_{content_hash}_{config_str}"

def clean_expired_cache():
    """Remove expired cache entries."""
    current_time = time.time()
    expired_keys = [
        key for key, timestamp in cache_timestamps.items()
        if current_time - timestamp > CACHE_TTL_SECONDS
    ]
    for key in expired_keys:
        analysis_cache.pop(key, None)
        cache_timestamps.pop(key, None)
    if expired_keys:
        logger.info(f"🧹 Cleaned {len(expired_keys)} expired cache entries")

def convert_video_sync(input_path: str, output_path: str) -> bool:
    """Video conversion using OpenCV."""
    try:
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            logger.error(f"❌ Cannot open video: {input_path}")
            return False
        
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if fps <= 0: fps = 30
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        if not out.isOpened():
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
        logger.info(f"🎬 Video conversion: {frame_num} frames processed")
        return True
        
    except Exception as e:
        logger.error(f"❌ Video conversion error: {e}")
        return False

async def convert_video(input_path: str, output_path: str) -> bool:
    """Async video conversion."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, convert_video_sync, input_path, output_path)

def safe_convert_to_python_types(obj):
    """Convert numpy/pandas types to Python types."""
    if isinstance(obj, (np.integer, np.int_, np.int8, np.int16, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float_, np.float16, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, pd.Series):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: safe_convert_to_python_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [safe_convert_to_python_types(item) for item in obj]
    elif pd.isna(obj):
        return None
    else:
        return obj

def run_detector_sync(file_path: str, config: AnalysisConfig, progress_callback: Optional[Callable] = None) -> pd.DataFrame:
    """ORIGINAL WORKING LOGIC - Simple detector call."""
    detector_instance = get_detector()
    
    is_image = file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff'))
    
    try:
        with torch.no_grad():
            if is_image:
                logger.info("📸 Processing image")
                if progress_callback:
                    progress_callback(0.5, "Analyzing image...")
                results = detector_instance.detect_image(file_path)
                if results is None or (hasattr(results, 'empty') and results.empty):
                    raise Exception("No faces detected in image")
                logger.info("✅ Image detection completed")
                return results
            else:
                # ORIGINAL SIMPLE VIDEO PROCESSING
                detect_params = {
                    "skip_frames": config.frame_skip,
                    "face_detection_threshold": config.detection_threshold,
                    "progress_bar": True,
                }
                logger.info(f"🎬 Processing video with skip_frames={config.frame_skip}")
                if progress_callback:
                    progress_callback(0.3, "Running facial expression analysis...")
                
                # SINGLE CALL TO PY-FEAT - NO CHUNKING
                results = detector_instance.detect_video(file_path, **detect_params)
                
                if results is None or (hasattr(results, 'empty') and results.empty):
                    raise Exception("No faces detected in video")
                
                logger.info(f"✅ Video processing completed: {len(results)} frames analyzed")
                return results
                
    except Exception as e:
        logger.error(f"❌ Detector error: {e}")
        raise

def find_peaks(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    """Find peaks in signal."""
    if len(values) < 3: return []
    peaks = []
    for i in range(1, len(values) - 1):
        if values[i] > threshold and values[i] > values[i-1] and values[i] > values[i+1]:
            peaks.append(i)
    return peaks[:10]

def analyze_emotions(results: pd.DataFrame) -> Dict[str, Any]:
    """Analyze emotion data."""
    try:
        emotion_cols = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
        available_emotions = [col for col in emotion_cols if col in results.columns]
        if not available_emotions: 
            return {}
        
        emotion_stats = {}
        for emotion in available_emotions:
            try:
                values = results[emotion].dropna()
                if not values.empty:
                    values_array = values.values
                    emotion_stats[emotion] = {
                        "mean": safe_convert_to_python_types(np.mean(values_array)),
                        "std": safe_convert_to_python_types(np.std(values_array)) if len(values_array) > 1 else 0.0,
                        "min": safe_convert_to_python_types(np.min(values_array)),
                        "max": safe_convert_to_python_types(np.max(values_array)),
                        "peaks": find_peaks(values_array),
                    }
            except Exception as e:
                logger.warning(f"⚠️ Error processing emotion {emotion}: {e}")
                continue
        
        try:
            emotion_data = results[available_emotions].fillna(0)
            dominant_emotions = emotion_data.idxmax(axis=1).value_counts().to_dict()
            dominant_emotions = {k: safe_convert_to_python_types(v) for k, v in dominant_emotions.items()}
        except Exception as e:
            dominant_emotions = {}
        
        return {
            "statistics": emotion_stats,
            "dominant_emotions": dominant_emotions,
            "timeline": prepare_timeline_data(results, available_emotions)
        }
    except Exception as e:
        logger.error(f"❌ Error in analyze_emotions: {e}")
        return {}

def analyze_action_units(results: pd.DataFrame) -> Dict[str, Any]:
    """Analyze action units."""
    try:
        au_cols = [col for col in results.columns if col.startswith('AU') and col[2:].replace('_', '').isdigit()]
        if not au_cols: 
            return {}
        
        au_stats = {}
        for au in au_cols:
            try:
                values = results[au].dropna()
                if not values.empty:
                    values_array = values.values
                    au_stats[au] = {
                        "mean": safe_convert_to_python_types(np.mean(values_array)),
                        "activation_rate": safe_convert_to_python_types(np.mean(values_array > 0.5)),
                        "max_intensity": safe_convert_to_python_types(np.max(values_array)),
                    }
            except Exception as e:
                logger.warning(f"⚠️ Error processing AU {au}: {e}")
                continue
        
        return {"statistics": au_stats, "timeline": prepare_timeline_data(results, au_cols)}
    except Exception as e:
        logger.error(f"❌ Error in analyze_action_units: {e}")
        return {}

def prepare_timeline_data(results: pd.DataFrame, columns: List[str], max_frames: int = 500) -> Dict[str, List[float]]:
    """Prepare timeline data."""
    try:
        if results.empty: return {"timestamps": []}

        if len(results) > max_frames:
            step = len(results) // max_frames
            results_sampled = results.iloc[::step].copy()
        else:
            results_sampled = results.copy()

        timeline = {}
        
        if 'times' in results_sampled.columns:
            times_series = results_sampled['times']
            timeline["timestamps"] = [safe_convert_to_python_types(x) for x in times_series.tolist()]
        else:
            timeline["timestamps"] = list(range(len(results_sampled)))

        for col in columns:
            if col in results_sampled.columns:
                try:
                    series_values = results_sampled[col].fillna(0)
                    timeline[col] = [safe_convert_to_python_types(x) for x in series_values.tolist()]
                except Exception as e:
                    timeline[col] = [0] * len(results_sampled)
        
        return timeline
    except Exception as e:
        logger.error(f"❌ Error in prepare_timeline_data: {e}")
        return {"timestamps": []}

def extract_emotional_key_moments(video_path: str, results_df: pd.DataFrame, fps: float, emotion_threshold_increase: float = 0.3) -> List[Dict[str, Any]]:
    """Extract key emotional moments."""
    key_moments: List[Dict[str, Any]] = []
    
    try:
        emotions_to_track = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']
        
        if results_df.empty or len(results_df) < 2:
            return key_moments

        available_emotions = [col for col in emotions_to_track if col in results_df.columns]
        if not available_emotions:
            return key_moments

        results_df_copy = results_df.copy()
        
        if 'times' not in results_df_copy.columns:
            if fps <= 0: fps = 30.0
            results_df_copy['times'] = results_df_copy.index / fps

        cap = None
        processed_frames_for_spikes = set()

        try:
            for i in range(1, min(len(results_df_copy), 100)):  # Limit for memory
                current_frame_data = results_df_copy.iloc[i]
                previous_frame_data = results_df_copy.iloc[i-1]
                frame_number = int(results_df_copy.index[i])
                timestamp_sec = current_frame_data['times']

                if frame_number in processed_frames_for_spikes:
                    continue

                for emotion in available_emotions:
                    try:
                        current_value = current_frame_data[emotion]
                        previous_value = previous_frame_data[emotion]

                        if pd.notna(current_value) and pd.notna(previous_value) and \
                           (current_value - previous_value > emotion_threshold_increase):
                            
                            key_moments.append({
                                'timestamp': safe_convert_to_python_types(timestamp_sec),
                                'reason': f'{emotion.capitalize()} increased by {((current_value - previous_value)*100):.0f}%',
                                'type': 'emotion_spike',
                                'frameNumber': int(frame_number)
                            })
                            processed_frames_for_spikes.add(frame_number)
                            break
                    except Exception as e:
                        continue
                        
                if len(key_moments) >= 5:  # Limit key moments
                    break
                    
        except Exception as e:
            logger.error(f"❌ Error extracting key moments: {e}")
        finally:
            if cap:
                cap.release()
                
    except Exception as e:
        logger.error(f"❌ Error in extract_emotional_key_moments: {e}")
    
    return key_moments

def calculate_summary_metrics(results: pd.DataFrame, config: AnalysisConfig, video_path: str, video_fps: float) -> Dict[str, Any]:
    """Calculate summary metrics."""
    try:
        summary = {
            "total_frames": int(len(results)),
            "faces_detected": int(len(results[results['FaceScore'] > config.detection_threshold])) if 'FaceScore' in results.columns else int(len(results)),
            "processing_config": {
                "frame_skip": config.frame_skip,
                "analysis_type": config.analysis_type.value,
                "detection_threshold": config.detection_threshold
            }
        }
        
        if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
            summary["emotions"] = analyze_emotions(results)
        
        if config.analysis_type in [AnalysisType.AUS, AnalysisType.COMBINED]:
            summary["action_units"] = analyze_action_units(results)

        if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
            summary["emotional_key_moments"] = extract_emotional_key_moments(
                video_path, results, video_fps, 0.3
            )
        else:
            summary["emotional_key_moments"] = []
        
        return summary
    except Exception as e:
        logger.error(f"❌ Error in calculate_summary_metrics: {e}")
        return {
            "total_frames": 0,
            "faces_detected": 0,
            "processing_config": {
                "frame_skip": config.frame_skip,
                "analysis_type": config.analysis_type.value,
                "detection_threshold": config.detection_threshold
            },
            "emotions": {},
            "action_units": {},
            "emotional_key_moments": []
        }

# NEW: Async wrapper for job system
async def analyze_facial_expressions_async(
    file_content: bytes,
    filename: str,
    content_type: str,
    settings: Optional[str] = None,
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """Async wrapper using original logic."""
    
    config = AnalysisConfig()
    if settings:
        try:
            settings_dict = json.loads(settings)
            config = AnalysisConfig(
                frame_skip=settings_dict.get('frameSkip', 30),
                analysis_type=AnalysisType(settings_dict.get('analysisType', 'combined')),
                visualization_style=VisualizationStyle(settings_dict.get('visualizationStyle', 'timeline')),
                detection_threshold=settings_dict.get('detectionThreshold', 0.5),
                batch_size=settings_dict.get('batchSize', 1)
            )
        except Exception as e:
            logger.warning(f"⚠️ Failed to parse settings: {e}")

    if progress_callback:
        progress_callback(0.05, "Initializing analysis...")

    tmp_input = None
    tmp_output = None
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(file_content)
            tmp_input = tmp.name
        
        if progress_callback:
            progress_callback(0.1, "Preparing video...")
        
        video_path_for_analysis = tmp_input
        if content_type == 'video/webm' or (filename and filename.endswith('.webm')):
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_mp4:
                tmp_output = tmp_mp4.name
            
            if await convert_video(tmp_input, tmp_output):
                video_path_for_analysis = tmp_output
            else:
                logger.warning("⚠️ Video conversion failed, using original")

        cap_fps_check = cv2.VideoCapture(video_path_for_analysis)
        video_fps = cap_fps_check.get(cv2.CAP_PROP_FPS) or 30.0
        duration_seconds = cap_fps_check.get(cv2.CAP_PROP_FRAME_COUNT) / video_fps
        cap_fps_check.release()
        
        if progress_callback:
            progress_callback(0.15, f"Processing {duration_seconds:.0f}s video...")
        
        # Use original sync detector in executor
        loop = asyncio.get_running_loop()
        results_df = await loop.run_in_executor(
            executor, run_detector_sync, video_path_for_analysis, config, progress_callback
        )
        
        if results_df is None or results_df.empty:
            raise Exception("No faces detected in video")
        
        if progress_callback:
            progress_callback(0.9, "Calculating summary...")
        
        summary = calculate_summary_metrics(results_df, config, video_path_for_analysis, video_fps)
        
        response_data = {
            "status": "success",
            "message": f"Analysis completed. Processed {len(results_df)} data points.",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style.value,
                "metadata": {
                    "filename": filename,
                    "duration_seconds": duration_seconds,
                    "total_frames_analyzed": len(results_df),
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat",
                    "config": {
                        "frame_skip": config.frame_skip,
                        "analysis_type": config.analysis_type.value,
                        "detection_threshold": config.detection_threshold
                    }
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        if progress_callback:
            progress_callback(1.0, "Analysis complete!")
        
        return response_data
        
    finally:
        for path in [tmp_input, tmp_output]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception as e:
                    logger.warning(f"⚠️ Failed to cleanup {path}: {e}")

# Legacy sync function
async def analyze_facial_expressions(file_content: bytes, filename: str, content_type: str, settings: Optional[str] = None):
    """Legacy function for backward compatibility."""
    clean_expired_cache()
    config = AnalysisConfig()
    if settings:
        try:
            settings_dict = json.loads(settings)
            config = AnalysisConfig(
                frame_skip=settings_dict.get('frameSkip', 30),
                analysis_type=AnalysisType(settings_dict.get('analysisType', 'combined')),
                visualization_style=VisualizationStyle(settings_dict.get('visualizationStyle', 'timeline')),
                detection_threshold=settings_dict.get('detectionThreshold', 0.5),
                batch_size=settings_dict.get('batchSize', 1)
            )
        except Exception as e:
            logger.warning(f"⚠️ Failed to parse settings: {e}")

    cache_key = generate_cache_key(file_content, config)
    
    if cache_key in analysis_cache and (time.time() - cache_timestamps.get(cache_key, 0) < CACHE_TTL_SECONDS):
        logger.info(f"📦 Returning cached results for key: {cache_key}")
        return analysis_cache[cache_key]

    result = await analyze_facial_expressions_async(file_content, filename, content_type, settings)
    
    analysis_cache[cache_key] = result
    cache_timestamps[cache_key] = time.time()
    
    return result