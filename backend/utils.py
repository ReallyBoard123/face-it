import os
import json
import redis
import hashlib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
import uuid
import logging

logger = logging.getLogger(__name__)

class SessionManager:
    """Manages user sessions"""
    
    def __init__(self):
        self.sessions: Dict[str, dict] = {}
    
    def create_session(self) -> str:
        """Create new session"""
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            "created_at": datetime.now(),
            "status": "ready",  # ready, processing, error
            "current_job": None,
            "cache": {}
        }
        logger.info(f"Created session: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[dict]:
        """Get session by ID"""
        return self.sessions.get(session_id)
    
    def update_session(self, session_id: str, updates: dict):
        """Update session data"""
        if session_id in self.sessions:
            self.sessions[session_id].update(updates)
    
    def delete_session(self, session_id: str):
        """Delete session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Deleted session: {session_id}")
    
    def cleanup_old_sessions(self, max_age_hours: int = 24):
        """Clean up sessions older than max_age_hours"""
        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        to_delete = [
            sid for sid, session in self.sessions.items()
            if session["created_at"] < cutoff
        ]
        
        for sid in to_delete:
            self.delete_session(sid)
        
        if to_delete:
            logger.info(f"Cleaned up {len(to_delete)} old sessions")

class RedisManager:
    """Manages Redis connections and operations"""
    
    def __init__(self):
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        try:
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            # Test connection
            self.redis_client.ping()
            logger.info("✅ Redis connected successfully")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            self.redis_client = None
    
    def ping(self) -> bool:
        """Test Redis connection"""
        try:
            return self.redis_client.ping() if self.redis_client else False
        except:
            return False
    
    def get_cached_result(self, session_id: str, video_hash: str) -> Optional[dict]:
        """Get cached analysis result"""
        if not self.redis_client:
            return None
        
        try:
            cache_key = f"session:{session_id}:video:{video_hash}"
            cached_data = self.redis_client.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
        except Exception as e:
            logger.error(f"Cache retrieval error: {e}")
        
        return None
    
    def cache_result(self, session_id: str, video_hash: str, result: dict, ttl: int = 3600):
        """Cache analysis result"""
        if not self.redis_client:
            return
        
        try:
            cache_key = f"session:{session_id}:video:{video_hash}"
            self.redis_client.setex(
                cache_key, 
                ttl, 
                json.dumps(result, default=str)
            )
            logger.info(f"Cached result for session {session_id}")
        except Exception as e:
            logger.error(f"Cache storage error: {e}")
    
    def get_queue_length(self) -> int:
        """Get current queue length"""
        if not self.redis_client:
            return 0
        
        try:
            return self.redis_client.llen('celery')
        except:
            return 0
    
    def clear_session_cache(self, session_id: str):
        """Clear all cached results for a session"""
        if not self.redis_client:
            return
        
        try:
            pattern = f"session:{session_id}:*"
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
                logger.info(f"Cleared cache for session {session_id}")
        except Exception as e:
            logger.error(f"Cache clear error: {e}")
    
    def clear_all_cache(self) -> int:
        """Clear all cached results"""
        if not self.redis_client:
            return 0
        
        try:
            pattern = "session:*"
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
                logger.info(f"Cleared all cache ({len(keys)} entries)")
                return len(keys)
        except Exception as e:
            logger.error(f"Cache clear error: {e}")
        
        return 0
    
    def get_cache_info(self) -> dict:
        """Get cache information"""
        if not self.redis_client:
            return {"size": 0, "entries": [], "timestamps": {}}
        
        try:
            pattern = "session:*"
            keys = self.redis_client.keys(pattern)
            timestamps = {}
            
            for key in keys:
                try:
                    ttl = self.redis_client.ttl(key)
                    timestamps[key] = f"TTL: {ttl}s" if ttl > 0 else "No expiry"
                except:
                    timestamps[key] = "Unknown"
            
            return {
                "size": len(keys),
                "entries": keys,
                "timestamps": timestamps
            }
        except Exception as e:
            logger.error(f"Cache info error: {e}")
            return {"size": 0, "entries": [], "timestamps": {}}

def get_video_hash(video_data: bytes) -> str:
    """Generate hash for video data"""
    return hashlib.md5(video_data).hexdigest()

def safe_convert_to_python_types(obj):
    """Convert numpy/pandas types to native Python types"""
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

def get_optimal_frame_skip(video_duration: float, user_frame_skip: int) -> int:
    """Calculate optimal frame skip based on video duration and user preference"""
    # User's frame skip is the base (e.g., 30 = 1fps for 30fps video)
    base_skip = user_frame_skip
    
    # Increase frame skip for longer videos to prevent memory issues
    if video_duration > 300:  # 5+ minutes
        return base_skip * 3  # Process every 3 seconds
    elif video_duration > 180:  # 3+ minutes
        return base_skip * 2  # Process every 2 seconds
    else:
        return base_skip  # Use user preference

def estimate_processing_time(video_duration: float, frame_skip: int) -> float:
    """Estimate processing time in seconds"""
    # Rough estimate: 0.1 seconds per frame to process
    fps = 30  # Assume 30fps
    frames_to_process = (video_duration * fps) / frame_skip
    return frames_to_process * 0.1

def validate_video_file(filename: str, content_type: str, file_size: int) -> tuple[bool, str]:
    """Validate uploaded video file"""
    # Check file extension
    allowed_extensions = ['.mp4', '.webm', '.avi', '.mov']
    if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
        return False, "Unsupported file format. Use MP4, WebM, AVI, or MOV"
    
    # Check content type
    allowed_types = ['video/mp4', 'video/webm', 'video/avi', 'video/quicktime']
    if content_type not in allowed_types:
        return False, f"Invalid content type: {content_type}"
    
    # Check file size (max 200MB for cloud deployment)
    max_size = 200 * 1024 * 1024  # 200MB
    if file_size > max_size:
        return False, f"File too large. Maximum size is {max_size // (1024*1024)}MB"
    
    return True, "Valid"

def format_duration(seconds: float) -> str:
    """Format duration in human-readable format"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = seconds // 60
        secs = seconds % 60
        return f"{int(minutes)}m {int(secs)}s"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{int(hours)}h {int(minutes)}m"

def get_system_stats() -> dict:
    """Get system resource statistics"""
    try:
        import psutil
        return {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": psutil.disk_usage('/').percent
        }
    except ImportError:
        return {"error": "psutil not available"}

def cleanup_temp_files(temp_dir: str = "/tmp", max_age_hours: int = 24):
    """Clean up old temporary files"""
    import glob
    import time
    
    try:
        pattern = os.path.join(temp_dir, "tmp*")
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        deleted_count = 0
        for filepath in glob.glob(pattern):
            try:
                if current_time - os.path.getctime(filepath) > max_age_seconds:
                    os.unlink(filepath)
                    deleted_count += 1
            except OSError:
                continue
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} old temp files")
            
    except Exception as e:
        logger.error(f"Temp file cleanup error: {e}")