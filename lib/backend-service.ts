// lib/backend-service.ts - Updated for Async Job System

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
  
  // NEW: Job interfaces
  interface JobSubmissionResponse {
    job_id: string;
    status: string;
    message: string;
    estimated_time_minutes?: number;
  }
  
  interface JobStatusResponse {
    job_id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0.0 to 1.0
    message: string;
    result?: any;
    error?: string;
    created_at: string;
    started_at?: string;
    completed_at?: string;
  }
  
  class BackendService {
    private baseUrl: string;
  
    constructor() {
      this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    }
  
    // Existing methods (unchanged)
    async pingServer(): Promise<ServerStatus> {
      const response = await fetch(`${this.baseUrl}/server/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Server ping failed: ${response.status}`);
      }
      
      return await response.json();
    }
  
    async clearCache(): Promise<ClearCacheResponse> {
      const response = await fetch(`${this.baseUrl}/cache/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Cache clear failed: ${response.status}`);
      }
      
      return await response.json();
    }
  
    async healthCheck() {
      const response = await fetch(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      return await response.json();
    }
  
    // NEW: Async job submission
    async submitVideoAnalysis(
      videoBlob: Blob, 
      settings: any, 
      sessionId?: string
    ): Promise<JobSubmissionResponse> {
      const formData = new FormData();
      formData.append('file', videoBlob, 'video.webm');
      formData.append('settings', JSON.stringify(settings));
      
      if (sessionId) {
        formData.append('session_id', sessionId);
      }
  
      const response = await fetch(`${this.baseUrl}/analyze/submit`, {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Analysis submission failed');
      }
  
      return await response.json();
    }
  
    // NEW: Job status polling
    async getJobStatus(jobId: string): Promise<JobStatusResponse> {
      const response = await fetch(`${this.baseUrl}/analyze/status/${jobId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      return await response.json();
    }
  
    // NEW: Get final results
    async getJobResult(jobId: string): Promise<any> {
      const response = await fetch(`${this.baseUrl}/analyze/result/${jobId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Failed to get results');
      }
      
      return await response.json();
    }
  
    // NEW: Cancel job
    async cancelJob(jobId: string): Promise<boolean> {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        method: 'DELETE',
      });
      
      return response.ok;
    }
  
    // NEW: Poll job until completion with progress updates
    async pollJobUntilComplete(
      jobId: string,
      onProgress?: (progress: number, message: string) => void,
      pollInterval: number = 2000,
      maxWaitMinutes: number = 30
    ): Promise<any> {
      const maxAttempts = (maxWaitMinutes * 60 * 1000) / pollInterval;
      let attempts = 0;
  
      while (attempts < maxAttempts) {
        try {
          const status = await this.getJobStatus(jobId);
          
          // Update progress callback
          if (onProgress) {
            onProgress(status.progress, status.message);
          }
          
          // Check completion
          if (status.status === 'completed') {
            return await this.getJobResult(jobId);
          }
          
          if (status.status === 'failed') {
            throw new Error(status.error || 'Job failed');
          }
          
          if (status.status === 'cancelled') {
            throw new Error('Job was cancelled');
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          
        } catch (error) {
          console.error('Polling error:', error);
          throw error;
        }
      }
      
      throw new Error('Job timeout - processing took too long');
    }
  
    // Legacy support - submit and wait (not recommended for long videos)
    async analyzeFaceLegacy(videoBlob: Blob, settings: any): Promise<any> {
      const formData = new FormData();
      formData.append('file', videoBlob, 'video.webm');
      formData.append('settings', JSON.stringify(settings));
  
      const response = await fetch(`${this.baseUrl}/analyze/face`, {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Analysis failed');
      }
  
      const result = await response.json();
      
      // Handle 202 status (still processing)
      if (response.status === 202 && result.job_id) {
        // Return job info for async polling
        return {
          ...result,
          isAsync: true
        };
      }
      
      return result;
    }
  
    async prepareNewSession(): Promise<{ 
      serverReady: boolean; 
      cacheCleared: boolean; 
      message: string 
    }> {
      try {
        console.log('Checking server status...');
        const pingResult = await this.pingServer();
        
        if (!pingResult.server_running || !pingResult.detector_ready) {
          throw new Error('Server or detector not ready');
        }
  
        console.log('Clearing analysis cache...');
        const clearResult = await this.clearCache();
        
        return {
          serverReady: true,
          cacheCleared: true,
          message: `Server ready! Cleared ${clearResult.entries_removed} cached entries.`
        };
      } catch (error) {
        return {
          serverReady: false,
          cacheCleared: false,
          message: error instanceof Error ? error.message : 'Failed to prepare session'
        };
      }
    }
  }
  
  export const backendService = new BackendService();
  export type { 
    ServerStatus, 
    CacheStatus, 
    ClearCacheResponse,
    JobSubmissionResponse,
    JobStatusResponse 
  };