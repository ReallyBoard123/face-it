# facial_expression_recognizer.py

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
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import pandas as pd
import torch  # Added torch import

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

# --- Global variables for facial expression analysis ---
detector = None
executor = ThreadPoolExecutor(max_workers=2)
analysis_cache: Dict[str, Any] = {}
cache_timestamps: Dict[str, float] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


# --- Core Functions ---

def get_detector():
    """Lazy load the py-feat detector."""
    global detector
    if detector is None:
        try:
            from feat import Detector
            logger.info("Initializing py-feat detector...")
            detector = Detector()
            logger.info("Detector initialized successfully!")
        except Exception as e:
            logger.error(f"Failed to initialize py-feat detector: {e}")
            raise
    return detector

def generate_cache_key(file_content: bytes, config: AnalysisConfig) -> str:
    """Generate a unique cache key based on file content and config."""
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
        logger.info(f"Cleaned {len(expired_keys)} expired facial analysis cache entries")

def clear_all_cache():
    """Manually clear all cache entries."""
    global analysis_cache, cache_timestamps
    
    cache_size = len(analysis_cache)
    analysis_cache.clear()
    cache_timestamps.clear()
    
    logger.info(f"Manually cleared all cache entries. Removed {cache_size} entries.")
    return cache_size

def convert_video_sync(input_path: str, output_path: str) -> bool:
    """Synchronous video conversion using ffmpeg via OpenCV."""
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
    """Asynchronous video conversion."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, convert_video_sync, input_path, output_path)

def safe_convert_to_python_types(obj):
    """Safely convert numpy/pandas types to native Python types."""
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

def run_detector_sync(file_path: str, config: AnalysisConfig) -> pd.DataFrame:
    """Synchronously run the py-feat detector on an image or video."""
    detector_instance = get_detector()
    
    # Check if file is an image by extension
    is_image = file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff'))
    
    try:
        # Disable gradients to prevent tensor issues
        with torch.no_grad():
            if is_image:
                logger.info("Processing as image")
                results = detector_instance.detect_image(file_path)
                if results is None or (hasattr(results, 'empty') and results.empty):
                    raise Exception("Detector returned None or empty DataFrame - no faces detected")
                logger.info("Image detection completed successfully")
                return results
            else:
                # Process as video
                detect_params = {
                    "skip_frames": config.frame_skip,
                    "face_detection_threshold": config.detection_threshold,
                    "progress_bar": True,
                }
                logger.info(f"Running video detector with params: {detect_params}")
                results = detector_instance.detect_video(file_path, **detect_params)
                if results is None or (hasattr(results, 'empty') and results.empty):
                    raise Exception("Detector returned None or empty DataFrame - no faces detected")
                logger.info(f"Video detection completed successfully: {len(results)} frames processed")
                return results
    except Exception as e:
        logger.error(f"Detector error: {e}")
        raise

def find_peaks(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    """Find peaks in a signal."""
    if len(values) < 3: return []
    peaks = []
    for i in range(1, len(values) - 1):
        if values[i] > threshold and values[i] > values[i-1] and values[i] > values[i+1]:
            peaks.append(i)
    return peaks[:10]

def analyze_emotions(results: pd.DataFrame) -> Dict[str, Any]:
    """Analyze emotion data from py-feat results."""
    try:
        emotion_cols = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
        available_emotions = [col for col in emotion_cols if col in results.columns]
        if not available_emotions: 
            logger.warning("No emotion columns found in results")
            return {}
        
        emotion_stats = {}
        for emotion in available_emotions:
            try:
                values = results[emotion].dropna()
                if not values.empty:
                    # Convert to numpy array first, then to native Python types
                    values_array = values.values
                    emotion_stats[emotion] = {
                        "mean": safe_convert_to_python_types(np.mean(values_array)),
                        "std": safe_convert_to_python_types(np.std(values_array)) if len(values_array) > 1 else 0.0,
                        "min": safe_convert_to_python_types(np.min(values_array)),
                        "max": safe_convert_to_python_types(np.max(values_array)),
                        "peaks": find_peaks(values_array),
                    }
            except Exception as e:
                logger.warning(f"Error processing emotion {emotion}: {e}")
                continue
        
        # Process dominant emotions safely
        try:
            emotion_data = results[available_emotions].fillna(0)
            dominant_emotions = emotion_data.idxmax(axis=1).value_counts().to_dict()
            # Convert to native Python types
            dominant_emotions = {k: safe_convert_to_python_types(v) for k, v in dominant_emotions.items()}
        except Exception as e:
            logger.warning(f"Error calculating dominant emotions: {e}")
            dominant_emotions = {}
        
        return {
            "statistics": emotion_stats,
            "dominant_emotions": dominant_emotions,
            "timeline": prepare_timeline_data(results, available_emotions)
        }
    except Exception as e:
        logger.error(f"Error in analyze_emotions: {e}")
        return {}

def analyze_action_units(results: pd.DataFrame) -> Dict[str, Any]:
    """Analyze action unit data from py-feat results."""
    try:
        au_cols = [col for col in results.columns if col.startswith('AU') and col[2:].replace('_', '').isdigit()]
        if not au_cols: 
            logger.warning("No action unit columns found in results")
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
                logger.warning(f"Error processing action unit {au}: {e}")
                continue
        
        return {"statistics": au_stats, "timeline": prepare_timeline_data(results, au_cols)}
    except Exception as e:
        logger.error(f"Error in analyze_action_units: {e}")
        return {}

def prepare_timeline_data(results: pd.DataFrame, columns: List[str], max_frames: int = 500) -> Dict[str, List[float]]:
    """Prepare data for timeline visualization with safe type conversion."""
    try:
        if results.empty: return {"timestamps": []}

        if len(results) > max_frames:
            step = len(results) // max_frames
            results_sampled = results.iloc[::step].copy()
        else:
            results_sampled = results.copy()

        timeline = {}
        
        # Handle timestamps
        if 'times' in results_sampled.columns:
            times_series = results_sampled['times']
            timeline["timestamps"] = [safe_convert_to_python_types(x) for x in times_series.tolist()]
        else:
            timeline["timestamps"] = list(range(len(results_sampled)))

        # Handle other columns
        for col in columns:
            if col in results_sampled.columns:
                try:
                    series_values = results_sampled[col].fillna(0)
                    timeline[col] = [safe_convert_to_python_types(x) for x in series_values.tolist()]
                except Exception as e:
                    logger.warning(f"Error processing column {col} for timeline: {e}")
                    timeline[col] = [0] * len(results_sampled)
        
        return timeline
    except Exception as e:
        logger.error(f"Error in prepare_timeline_data: {e}")
        return {"timestamps": []}

def extract_emotional_key_moments(
    video_path: str,
    results_df: pd.DataFrame,
    fps: float,
    emotion_threshold_increase: float = 0.3
) -> List[Dict[str, Any]]:
    """Extract key emotional moments based on spikes."""
    key_moments: List[Dict[str, Any]] = []
    
    try:
        emotions_to_track = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']
        
        if results_df.empty or len(results_df) < 2:
            return key_moments

        available_emotions = [col for col in emotions_to_track if col in results_df.columns]
        if not available_emotions:
            return key_moments

        # Create a copy to avoid modifying original
        results_df_copy = results_df.copy()
        
        if 'times' not in results_df_copy.columns:
            logger.warning("'times' column not found. Calculating from frame index and FPS.")
            if fps <= 0: fps = 30.0
            results_df_copy['times'] = results_df_copy.index / fps

        cap = None
        processed_frames_for_spikes = set()

        try:
            for i in range(1, len(results_df_copy)):
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
                            
                            if cap is None:
                                cap = cv2.VideoCapture(video_path)
                                if not cap.isOpened():
                                    return key_moments
                            
                            cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_number))
                            ret, frame_image = cap.read()
                            if ret:
                                _, buffer = cv2.imencode('.jpg', frame_image, [cv2.IMWRITE_JPEG_QUALITY, 60])
                                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                                key_moments.append({
                                    'timestamp': safe_convert_to_python_types(timestamp_sec),
                                    'reason': f'{emotion.capitalize()} increased by {((current_value - previous_value)*100):.0f}%',
                                    'faceFrame': frame_base64,
                                    'type': 'emotion_spike',
                                    'frameNumber': int(frame_number)
                                })
                                processed_frames_for_spikes.add(frame_number)
                                break
                    except Exception as e:
                        logger.warning(f"Error processing emotion {emotion} at frame {i}: {e}")
                        continue
        except Exception as e:
            logger.error(f"Error extracting key moments: {e}", exc_info=True)
        finally:
            if cap:
                cap.release()
                
    except Exception as e:
        logger.error(f"Error in extract_emotional_key_moments: {e}")
    
    return key_moments

def calculate_summary_metrics(results: pd.DataFrame, config: AnalysisConfig, video_path: str, video_fps: float) -> Dict[str, Any]:
    """Calculate summary metrics from the analysis results."""
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
        logger.error(f"Error in calculate_summary_metrics: {e}")
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

async def analyze_facial_expressions(file_content: bytes, filename: str, content_type: str, settings: Optional[str] = None):
    """
    Main logic function for facial expression analysis.
    This encapsulates the logic from the original /analyze-video endpoint.
    """
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
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Failed to parse settings ('{settings}'), using defaults: {e}")
            config = AnalysisConfig()

    cache_key = generate_cache_key(file_content, config)
    
    if cache_key in analysis_cache and (time.time() - cache_timestamps.get(cache_key, 0) < CACHE_TTL_SECONDS):
        logger.info(f"Returning cached results for key: {cache_key}")
        return analysis_cache[cache_key]

    tmp_input = None
    tmp_output = None
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(file_content)
            tmp_input = tmp.name
        
        video_path_for_analysis = tmp_input
        if content_type == 'video/webm' or (filename and filename.endswith('.webm')):
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_mp4:
                tmp_output = tmp_mp4.name
            
            if await convert_video(tmp_input, tmp_output):
                video_path_for_analysis = tmp_output
            else:
                logger.warning("Video conversion failed, using original file.")
                if tmp_output and os.path.exists(tmp_output): os.unlink(tmp_output)
                tmp_output = None

        cap_fps_check = cv2.VideoCapture(video_path_for_analysis)
        video_fps = cap_fps_check.get(cv2.CAP_PROP_FPS) or 30.0
        cap_fps_check.release()
        
        loop = asyncio.get_running_loop()
        results_df = await loop.run_in_executor(
            executor, run_detector_sync, video_path_for_analysis, config
        )
        
        if results_df is None or results_df.empty:
            raise Exception("No faces detected in video.")
        
        summary = calculate_summary_metrics(results_df, config, video_path_for_analysis, video_fps)
        
        response_data = {
            "status": "success",
            "message": f"Analysis completed. Processed {len(results_df)} data points.",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style.value,
                "metadata": {
                    "filename": filename,
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat",
                    "cache_key_prefix": cache_key[:8]
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        analysis_cache[cache_key] = response_data
        cache_timestamps[cache_key] = time.time()
        
        return response_data
        
    finally:
        if tmp_input and os.path.exists(tmp_input):
            os.unlink(tmp_input)
        if tmp_output and os.path.exists(tmp_output):
            os.unlink(tmp_output)