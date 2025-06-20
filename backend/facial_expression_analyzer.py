import os
import cv2
import json
import tempfile
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum

from celery_app import celery_app
from utils import RedisManager, safe_convert_to_python_types

logger = logging.getLogger(__name__)

# Global detector instance
_detector = None
redis_manager = RedisManager()

class AnalysisType(Enum):
    EMOTIONS = "emotions"
    AUS = "aus"
    COMBINED = "combined"
    LANDMARKS = "landmarks"

class VisualizationStyle(Enum):
    TIMELINE = "timeline"
    HEATMAP = "heatmap"
    DISTRIBUTION = "distribution"

@dataclass
class AnalysisConfig:
    frame_skip: int = 30  # Process every Nth frame (1 fps = 30 for 30fps video)
    analysis_type: AnalysisType = AnalysisType.EMOTIONS
    visualization_style: VisualizationStyle = VisualizationStyle.TIMELINE
    detection_threshold: float = 0.5
    batch_size: int = 1

def get_detector():
    """Initialize and return the py-feat detector"""
    global _detector
    if _detector is None:
        try:
            from feat import Detector
            _detector = Detector(
                face_model="retinaface",
                landmark_model="mobilefacenet", 
                au_model="rf",
                emotion_model="resmasknet",
                facepose_model="img2pose"
            )
            logger.info("✅ py-feat detector initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize detector: {e}")
            raise
    return _detector

def convert_video_if_needed(input_path: str, content_type: str, filename: str) -> str:
    """Convert WebM to MP4 if needed"""
    if content_type == 'video/webm' or (filename and filename.endswith('.webm')):
        try:
            output_path = input_path.replace('.webm', '.mp4')
            
            cap = cv2.VideoCapture(input_path)
            if not cap.isOpened():
                logger.warning("Failed to open video for conversion, using original")
                return input_path
            
            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
            
            if not out.isOpened():
                cap.release()
                return input_path
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                out.write(frame)
            
            cap.release()
            out.release()
            
            logger.info("Video conversion completed")
            return output_path
            
        except Exception as e:
            logger.warning(f"Video conversion failed: {e}, using original")
            return input_path
    
    return input_path

def analyze_emotions(results_df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze emotional data from results"""
    if results_df.empty:
        return {}
    
    emotion_columns = [col for col in results_df.columns if any(emotion in col.lower() 
                      for emotion in ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'])]
    
    if not emotion_columns:
        return {}
    
    emotion_summary = {}
    for col in emotion_columns:
        emotion_name = col.lower().replace('_', ' ')
        emotion_summary[emotion_name] = {
            "mean": float(results_df[col].mean()),
            "max": float(results_df[col].max()),
            "std": float(results_df[col].std()),
            "dominant_frames": int((results_df[col] > 0.5).sum())
        }
    
    return emotion_summary

def analyze_action_units(results_df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze action units from results"""
    if results_df.empty:
        return {}
    
    au_columns = [col for col in results_df.columns if 'AU' in col.upper()]
    
    if not au_columns:
        return {}
    
    au_summary = {}
    for col in au_columns:
        au_summary[col] = {
            "mean": float(results_df[col].mean()),
            "max": float(results_df[col].max()),
            "activation_rate": float((results_df[col] > 0.5).mean())
        }
    
    return au_summary

def extract_emotional_key_moments(video_path: str, results_df: pd.DataFrame, 
                                 video_fps: float, threshold: float = 0.3) -> list:
    """Extract key emotional moments from the video"""
    if results_df.empty:
        return []
    
    emotion_columns = [col for col in results_df.columns if any(emotion in col.lower() 
                      for emotion in ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise'])]
    
    if not emotion_columns:
        return []
    
    key_moments = []
    
    for col in emotion_columns:
        high_emotion_frames = results_df[results_df[col] > threshold]
        
        for idx, row in high_emotion_frames.iterrows():
            timestamp = idx / video_fps if video_fps > 0 else idx
            key_moments.append({
                "timestamp": float(timestamp),
                "emotion": col.lower(),
                "intensity": float(row[col]),
                "frame": int(idx)
            })
    
    # Sort by intensity and return top moments
    key_moments.sort(key=lambda x: x["intensity"], reverse=True)
    return key_moments[:10]  # Return top 10 moments

def calculate_summary_metrics(results_df: pd.DataFrame, config: AnalysisConfig, 
                            video_path: str, video_fps: float) -> Dict[str, Any]:
    """Calculate comprehensive summary metrics"""
    try:
        summary = {
            "total_frames": int(len(results_df)),
            "faces_detected": int(len(results_df[results_df.get('FaceScore', 1) > config.detection_threshold])),
            "processing_config": {
                "frame_skip": config.frame_skip,
                "analysis_type": config.analysis_type.value,
                "detection_threshold": config.detection_threshold
            }
        }
        
        if config.analysis_type in [AnalysisType.EMOTIONS, AnalysisType.COMBINED]:
            summary["emotions"] = analyze_emotions(results_df)
            summary["emotional_key_moments"] = extract_emotional_key_moments(
                video_path, results_df, video_fps, 0.3
            )
        
        if config.analysis_type in [AnalysisType.AUS, AnalysisType.COMBINED]:
            summary["action_units"] = analyze_action_units(results_df)
        
        return summary
        
    except Exception as e:
        logger.error(f"Error calculating summary metrics: {e}")
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

def run_detector_on_video(video_path: str, config: AnalysisConfig, 
                         progress_callback=None) -> pd.DataFrame:
    """Run py-feat detector on video with progress tracking"""
    detector = get_detector()
    
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.release()
    
    # Calculate frames to process
    frames_to_process = list(range(0, total_frames, config.frame_skip))
    total_to_process = len(frames_to_process)
    
    logger.info(f"Processing {total_to_process} frames from {total_frames} total frames")
    
    # Process video
    results = detector.detect_video(
        video_path,
        skip_frames=config.frame_skip - 1,
        batch_size=config.batch_size
    )
    
    if progress_callback:
        progress_callback(100, f"Completed analysis of {len(results)} frames")
    
    return results

@celery_app.task(bind=True)
def analyze_video_task(self, session_id: str, video_data: bytes, filename: str, 
                      content_type: str, settings: Optional[str], video_hash: str):
    """Celery task for video analysis"""
    
    def update_progress(progress: int, message: str):
        """Update task progress"""
        self.update_state(
            state='PROGRESS',
            meta={'progress': progress, 'message': message}
        )
    
    tmp_input = None
    tmp_output = None
    
    try:
        # Parse settings
        config = AnalysisConfig()
        if settings:
            try:
                settings_dict = json.loads(settings)
                config = AnalysisConfig(
                    frame_skip=settings_dict.get('frameSkip', 30),
                    analysis_type=AnalysisType(settings_dict.get('analysisType', 'emotions')),
                    visualization_style=VisualizationStyle(settings_dict.get('visualizationStyle', 'timeline')),
                    detection_threshold=settings_dict.get('detectionThreshold', 0.5),
                    batch_size=settings_dict.get('batchSize', 1)
                )
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Failed to parse settings, using defaults: {e}")
        
        update_progress(10, "Preparing video file...")
        
        # Save video to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
            tmp.write(video_data)
            tmp_input = tmp.name
        
        # Convert if needed
        video_path = convert_video_if_needed(tmp_input, content_type, filename)
        if video_path != tmp_input:
            tmp_output = video_path
        
        update_progress(20, "Getting video metadata...")
        
        # Get video FPS
        cap = cv2.VideoCapture(video_path)
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        cap.release()
        
        update_progress(30, "Starting facial expression analysis...")
        
        # Run analysis
        results_df = run_detector_on_video(
            video_path, 
            config, 
            lambda p, m: update_progress(30 + (p * 0.6), m)
        )
        
        if results_df is None or results_df.empty:
            raise Exception("No faces detected in video")
        
        update_progress(95, "Calculating summary metrics...")
        
        # Calculate summary
        summary = calculate_summary_metrics(results_df, config, video_path, video_fps)
        
        # Prepare response
        response_data = {
            "status": "success",
            "message": f"Analysis completed. Processed {len(results_df)} data points.",
            "data": {
                "summary": safe_convert_to_python_types(summary),
                "visualization_type": config.visualization_style.value,
                "metadata": {
                    "filename": filename,
                    "processed_at": datetime.now().isoformat(),
                    "detector_version": "py-feat",
                    "session_id": session_id
                }
            },
            "timestamp": datetime.now().isoformat()
        }
        
        # Cache results
        redis_manager.cache_result(session_id, video_hash, response_data)
        
        update_progress(100, "Analysis completed successfully!")
        
        return response_data
        
    except Exception as e:
        logger.error(f"Video analysis failed: {e}", exc_info=True)
        raise Exception(f"Analysis failed: {str(e)}")
        
    finally:
        # Cleanup temp files
        if tmp_input and os.path.exists(tmp_input):
            os.unlink(tmp_input)
        if tmp_output and os.path.exists(tmp_output):
            os.unlink(tmp_output)