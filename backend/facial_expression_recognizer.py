# facial_expression_recognizer.py - Optimized Async Video Processing

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

logger = logging.getLogger(__name__)

# --- Enums and Configuration ---
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
    batch_size: int = 4  # Increased for better GPU utilization

# --- Global State ---
detector = None
executor = ThreadPoolExecutor(max_workers=4)  # Increased workers

def get_detector():
    """Lazy load py-feat detector with GPU optimization."""
    global detector
    if detector is None:
        try:
            from feat import Detector
            logger.info("Initializing py-feat detector with GPU optimization...")
            
            # Optimize for GPU usage
            detector = Detector(
                device="cuda" if torch.cuda.is_available() else "cpu",
                face_model="retinaface", 
                landmark_model="mobilefacenet",
                au_model="xgb",
                emotion_model="resmasknet"
            )
            
            logger.info(f"✅ Detector initialized on {detector.device}")
        except Exception as e:
            logger.error(f"Failed to initialize detector: {e}")
            raise
    return detector

def generate_cache_key(file_content: bytes, config: AnalysisConfig) -> str:
    """Generate cache key with better hashing."""
    content_hash = hashlib.sha256(file_content[:2048]).hexdigest()[:12]
    config_str = f"{config.frame_skip}_{config.analysis_type.value}_{config.detection_threshold}"
    return f"face_{content_hash}_{config_str}"

def estimate_processing_time(file_size_mb: float, duration_seconds: float) -> float:
    """Estimate processing time based on file characteristics."""
    # Base time: 30 seconds per minute of video
    base_time = duration_seconds / 2.0
    
    # Add time for file size (larger files = higher resolution)
    size_factor = max(1.0, file_size_mb / 10.0)
    
    return base_time * size_factor

async def convert_video_fast(input_path: str, output_path: str) -> bool:
    """Fast video conversion using ffmpeg directly."""
    try:
        import subprocess
        
        # Use ffmpeg for fast conversion with GPU acceleration if available
        cmd = [
            'ffmpeg', '-y',  # Overwrite output
            '-i', input_path,
            '-c:v', 'libx264',  # H.264 codec
            '-preset', 'fast',   # Fast encoding
            '-crf', '28',        # Reasonable quality
            '-c:a', 'aac',       # Audio codec
            output_path
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            logger.info("Fast video conversion completed")
            return True
        else:
            logger.warning(f"FFmpeg conversion failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.warning(f"Fast conversion failed, falling back: {e}")
        return False

def process_video_in_chunks(video_path: str, config: AnalysisConfig, 
                          progress_callback: Optional[Callable] = None) -> pd.DataFrame:
    """Process video in chunks to manage memory efficiently."""
    detector_instance = get_detector()
    
    # Get video info
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    
    # Calculate chunk size based on available memory
    chunk_size = min(1000, max(100, total_frames // 10))  # 100-1000 frames per chunk
    
    all_results = []
    processed_frames = 0
    
    try:
        with torch.no_grad():  # Disable gradients for inference
            for chunk_start in range(0, total_frames, chunk_size):
                chunk_end = min(chunk_start + chunk_size, total_frames)
                
                # Process chunk
                try:
                    detect_params = {
                        "skip_frames": config.frame_skip,
                        "face_detection_threshold": config.detection_threshold,
                        "start_frame": chunk_start,
                        "end_frame": chunk_end,
                        "progress_bar": False  # We handle progress ourselves
                    }
                    
                    chunk_results = detector_instance.detect_video(video_path, **detect_params)
                    
                    if chunk_results is not None and not chunk_results.empty:
                        all_results.append(chunk_results)
                    
                    processed_frames = chunk_end
                    
                    # Update progress
                    if progress_callback:
                        progress = 0.1 + (processed_frames / total_frames) * 0.8  # 10% to 90%
                        progress_callback(progress, f"Processing frames {processed_frames}/{total_frames}")
                        
                except Exception as e:
                    logger.warning(f"Failed to process chunk {chunk_start}-{chunk_end}: {e}")
                    continue
    
    except Exception as e:
        logger.error(f"Video processing failed: {e}")
        raise
    
    # Combine all results
    if all_results:
        final_results = pd.concat(all_results, ignore_index=True)
        logger.info(f"Processed {len(final_results)} total data points")
        return final_results
    else:
        raise Exception("No faces detected in video")

async def analyze_facial_expressions_async(
    file_content: bytes,
    filename: str,
    content_type: str,
    settings: Optional[str] = None,
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """
    Async facial expression analysis with progress tracking.
    Optimized for 20+ minute videos and multiple concurrent users.
    """
    # Parse configuration
    config = AnalysisConfig()
    if settings:
        try:
            settings_dict = json.loads(settings)
            config = AnalysisConfig(
                frame_skip=settings_dict.get('frameSkip', 30),
                analysis_type=AnalysisType(settings_dict.get('analysisType', 'combined')),
                visualization_style=VisualizationStyle(settings_dict.get('visualizationStyle', 'timeline')),
                detection_threshold=settings_dict.get('detectionThreshold', 0.5),
                batch_size=settings_dict.get('batchSize', 4)
            )
        except Exception as e:
            logger.warning(f"Failed to parse settings: {e}")
    
    # Progress tracking
    if progress_callback:
        progress_callback(0.05, "Initializing analysis...")
    
    tmp_input = None
    tmp_output = None
    
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(file_content)
            tmp_input = tmp.name
        
        if progress_callback:
            progress_callback(0.1, "Preparing video file...")
        
        # Convert video if needed
        video_path = tmp_input
        if content_type == 'video/webm' or filename.endswith('.webm'):
            tmp_output = tempfile.mktemp(suffix='.mp4')
            
            # Try fast conversion first
            if await convert_video_fast(tmp_input, tmp_output):
                video_path = tmp_output
            else:
                logger.info("Using original video format")
        
        # Get video metadata
        cap = cv2.VideoCapture(video_path)
        duration_seconds = cap.get(cv2.CAP_PROP_FRAME_COUNT) / (cap.get(cv2.CAP_PROP_FPS) or 30.0)
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        cap.release()
        
        if progress_callback:
            progress_callback(0.15, f"Processing {duration_seconds:.0f}s video...")
        
        # Process video in executor to avoid blocking
        loop = asyncio.get_running_loop()
        results_df = await loop.run_in_executor(
            executor, 
            process_video_in_chunks, 
            video_path, 
            config, 
            progress_callback
        )
        
        if progress_callback:
            progress_callback(0.9, "Analyzing results...")
        
        # Calculate summary metrics
        summary = await loop.run_in_executor(
            executor,
            calculate_summary_metrics,
            results_df,
            config,
            video_path,
            video_fps
        )
        
        # Prepare response
        response_data = {
            "status": "success",
            "message": f"Analysis completed. Processed {len(results_df)} data points in {duration_seconds:.1f}s video.",
            "data": {
                "summary": summary,
                "visualization_type": config.visualization_style.value,
                "metadata": {
                    "filename": filename,
                    "duration_seconds": duration_seconds,
                    "total_frames_analyzed": len(results_df),
                    "processing_fps": len(results_df) / duration_seconds if duration_seconds > 0 else 0,
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
        # Cleanup temporary files
        for path in [tmp_input, tmp_output]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception as e:
                    logger.warning(f"Failed to cleanup {path}: {e}")

def calculate_summary_metrics(results: pd.DataFrame, config: AnalysisConfig, 
                            video_path: str, video_fps: float) -> Dict[str, Any]:
    """Calculate summary metrics with memory optimization."""
    try:
        total_frames = len(results)
        faces_detected = len(results[results.get('FaceScore', 0) > config.detection_threshold])
        
        summary = {
            "total_frames": total_frames,
            "faces_detected": faces_detected,
            "face_detection_rate": faces_detected / total_frames if total_frames > 0 else 0,
            "processing_config": {
                "frame_skip": config.frame_skip,
                "analysis_type": config.analysis_type.value,
                "detection_threshold": config.detection_threshold
            }
        }
        
        # Add emotion analysis if requested
        if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
            summary["emotions"] = analyze_emotions_optimized(results)
        
        # Add action units if requested
        if config.analysis_type in [AnalysisType.AUS, AnalysisType.COMBINED]:
            summary["action_units"] = analyze_action_units_optimized(results)
        
        # Add key moments (limited for memory)
        if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
            summary["emotional_key_moments"] = extract_key_moments_optimized(
                video_path, results, video_fps, max_moments=5
            )
        else:
            summary["emotional_key_moments"] = []
        
        return summary
        
    except Exception as e:
        logger.error(f"Error calculating summary: {e}")
        return {
            "total_frames": 0,
            "faces_detected": 0,
            "face_detection_rate": 0,
            "processing_config": {
                "frame_skip": config.frame_skip,
                "analysis_type": config.analysis_type.value,
                "detection_threshold": config.detection_threshold
            },
            "emotions": {},
            "action_units": {},
            "emotional_key_moments": []
        }

def analyze_emotions_optimized(results: pd.DataFrame) -> Dict[str, Any]:
    """Optimized emotion analysis with memory efficiency."""
    emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']
    available_emotions = [col for col in emotions if col in results.columns]
    
    if not available_emotions:
        return {"dominant_emotion": "neutral", "emotion_statistics": {}}
    
    # Calculate statistics efficiently
    emotion_stats = {}
    for emotion in available_emotions:
        values = results[emotion].dropna()
        if len(values) > 0:
            emotion_stats[emotion] = {
                "mean": float(values.mean()),
                "max": float(values.max()),
                "std": float(values.std()),
                "peaks_count": len(find_peaks_optimized(values.values))
            }
    
    # Find dominant emotion
    dominant_emotion = max(emotion_stats.keys(), 
                         key=lambda e: emotion_stats[e]["mean"]) if emotion_stats else "neutral"
    
    return {
        "dominant_emotion": dominant_emotion,
        "emotion_statistics": emotion_stats
    }

def analyze_action_units_optimized(results: pd.DataFrame) -> Dict[str, Any]:
    """Optimized action unit analysis."""
    au_columns = [col for col in results.columns if col.startswith('AU')]
    
    if not au_columns:
        return {"active_action_units": [], "au_statistics": {}}
    
    au_stats = {}
    for au in au_columns:
        values = results[au].dropna()
        if len(values) > 0:
            au_stats[au] = {
                "mean": float(values.mean()),
                "activation_rate": float((values > 0.5).sum() / len(values))
            }
    
    # Find most active AUs
    active_aus = [au for au, stats in au_stats.items() 
                  if stats["activation_rate"] > 0.1]
    
    return {
        "active_action_units": active_aus[:10],  # Limit to top 10
        "au_statistics": au_stats
    }

def find_peaks_optimized(values: np.ndarray, threshold: float = 0.7) -> List[int]:
    """Memory-efficient peak detection."""
    if len(values) < 3:
        return []
    
    # Use scipy if available for better performance
    try:
        from scipy.signal import find_peaks as scipy_find_peaks
        peaks, _ = scipy_find_peaks(values, height=threshold, distance=10)
        return peaks.tolist()[:10]  # Limit to 10 peaks
    except ImportError:
        # Fallback to simple peak detection
        peaks = []
        for i in range(1, len(values) - 1):
            if (values[i] > threshold and 
                values[i] > values[i-1] and 
                values[i] > values[i+1]):
                peaks.append(i)
        return peaks[:10]

def extract_key_moments_optimized(video_path: str, results: pd.DataFrame, 
                                video_fps: float, max_moments: int = 5) -> List[Dict[str, Any]]:
    """Extract key emotional moments with memory optimization."""
    key_moments = []
    
    try:
        emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']
        available_emotions = [col for col in emotions if col in results.columns]
        
        if not available_emotions or len(results) < 2:
            return key_moments
        
        # Find significant emotion changes
        for emotion in available_emotions[:2]:  # Limit to 2 emotions for memory
            values = results[emotion].dropna()
            if len(values) < 2:
                continue
                
            # Find peaks
            peaks = find_peaks_optimized(values.values, threshold=0.6)
            
            for peak_idx in peaks[:max_moments]:  # Limit moments
                if peak_idx < len(results):
                    timestamp = peak_idx / video_fps
                    frame_number = results.index[peak_idx]
                    
                    key_moments.append({
                        'timestamp': float(timestamp),
                        'reason': f'{emotion.capitalize()} peak detected',
                        'type': 'emotion_peak',
                        'frameNumber': int(frame_number),
                        'emotion': emotion,
                        'intensity': float(values.iloc[peak_idx])
                    })
        
        # Sort by timestamp and limit total moments
        key_moments.sort(key=lambda x: x['timestamp'])
        return key_moments[:max_moments]
        
    except Exception as e:
        logger.warning(f"Error extracting key moments: {e}")
        return []

# Legacy sync function for backward compatibility
async def analyze_facial_expressions(file_content: bytes, filename: str, 
                                   content_type: str, settings: Optional[str] = None):
    """Legacy function - redirects to async version."""
    return await analyze_facial_expressions_async(file_content, filename, content_type, settings)