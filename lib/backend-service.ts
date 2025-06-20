// lib/backend-service.ts
interface ServerStatus {
  status: string;
  server_running: boolean;
  detector_ready: boolean;
  timestamp: string;
  message?: string;
  error?: string;
}

interface CacheStatus {
  cache_size: number;
  cache_entries: string[];
  timestamps: Record<string, string>;
  timestamp: string;
}

interface ClearCacheResponse {
  status: string;
  message: string;
  entries_removed: number;
  timestamp: string;
}

interface SessionResponse {
  session_id: string;
  status: string;
  timestamp: string;
}

interface AnalysisResults {
  summary?: {
    emotions?: {
      statistics?: Record<string, {
        mean: number;
        max: number;
        std?: number;
        dominant_frames?: number;
      }>;
      timeline?: {
        timestamps?: number[];
        [emotion: string]: number[] | undefined;
      };
    };
    action_units?: {
      statistics?: Record<string, {
        mean: number;
        max: number;
        activation_rate: number;
      }>;
    };
    emotional_key_moments?: Array<{
      timestamp: number;
      reason: string;
      type: string;
      frameNumber?: number;
      faceFrame?: string;
      gameFrame?: string;
    }>;
  };
  visualization_type?: string;
  metadata?: {
    filename: string;
    processed_at: string;
    detector_version: string;
    session_id: string;
  };
}

interface AnalysisSettings {
  frameSkip: number;
  analysisType: string;
  visualizationStyle: string;
  detectionThreshold: number;
  batchSize: number;
}

interface AnalysisStartResponse {
  status: string;
  message: string;
  job_id: string | null;
  session_id: string;
  results?: AnalysisResults;
}

interface AnalysisStatusResponse {
  status: string;
  message?: string;
  progress?: number;
  results?: AnalysisResults;
}

class BackendService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  }

  async pingServer(): Promise<ServerStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/server/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server ping failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to ping server:', error);
      throw new Error(`Server is not responding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clearCache(): Promise<ClearCacheResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Cache clear failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw new Error(`Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCacheStatus(): Promise<CacheStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/status`);
      
      if (!response.ok) {
        throw new Error(`Cache status failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get cache status:', error);
      throw new Error(`Failed to get cache status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      throw new Error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // NEW SESSION-BASED METHODS
  async createSession(): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/session/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error(`Session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async startAnalysis(sessionId: string, videoBlob: Blob, filename: string, settings: AnalysisSettings, screenBlob?: Blob): Promise<AnalysisStartResponse> {
    try {
      const formData = new FormData();
      formData.append('file', videoBlob, filename);
      formData.append('session_id', sessionId);
      formData.append('settings', JSON.stringify(settings));
      
      if (screenBlob) {
        formData.append('screen_file', screenBlob, 'screen-recording.webm');
      }
      
      const response = await fetch(`${this.baseUrl}/analyze/start`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || `Analysis start failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to start analysis:', error);
      throw new Error(`Analysis start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAnalysisStatus(sessionId: string, jobId: string): Promise<AnalysisStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze/status/${sessionId}/${jobId}`);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get analysis status:', error);
      throw new Error(`Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async prepareNewSession(): Promise<{ serverReady: boolean; cacheCleared: boolean; message: string }> {
    try {
      // Step 1: Ping server to ensure it's running
      console.log('Checking server status...');
      const pingResult = await this.pingServer();
      
      if (!pingResult.server_running || !pingResult.detector_ready) {
        throw new Error('Server or detector not ready. Please try again in a moment.');
      }

      // Step 2: Clear cache for fresh session
      console.log('Clearing analysis cache...');
      const clearResult = await this.clearCache();
      
      return {
        serverReady: true,
        cacheCleared: true,
        message: `Server ready! Cleared ${clearResult.entries_removed} cached entries.`
      };
    } catch (error) {
      console.error('Failed to prepare new session:', error);
      return {
        serverReady: false,
        cacheCleared: false,
        message: error instanceof Error ? error.message : 'Failed to prepare new session'
      };
    }
  }
}

// Export singleton instance
export const backendService = new BackendService();
export type { 
  ServerStatus, 
  CacheStatus, 
  ClearCacheResponse, 
  SessionResponse, 
  AnalysisStartResponse, 
  AnalysisStatusResponse,
  AnalysisResults,
  AnalysisSettings
};