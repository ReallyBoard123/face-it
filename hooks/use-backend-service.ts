// hooks/use-backend-service.ts - Updated for async jobs
'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { backendService, type ServerStatus, type CacheStatus, type JobSubmissionResponse, type JobStatusResponse } from '@/lib/backend-service';

interface BackendServiceState {
  isCheckingServer: boolean;
  isClearingCache: boolean;
  isSubmittingJob: boolean;
  serverStatus: ServerStatus | null;
  cacheStatus: CacheStatus | null;
  lastError: string | null;
}

export function useBackendService() {
  const [state, setState] = useState<BackendServiceState>({
    isCheckingServer: false,
    isClearingCache: false,
    isSubmittingJob: false,
    serverStatus: null,
    cacheStatus: null,
    lastError: null,
  });

  // Existing methods
  const pingServer = useCallback(async () => {
    setState(prev => ({ ...prev, isCheckingServer: true, lastError: null }));
    
    try {
      const status = await backendService.pingServer();
      setState(prev => ({ ...prev, serverStatus: status, isCheckingServer: false }));
      
      if (status.detector_ready) {
        toast.success('✅ Server ready!');
      } else {
        toast.warning('⚠️ Server loading...');
      }
      
      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Server check failed';
      setState(prev => ({ 
        ...prev, 
        isCheckingServer: false, 
        lastError: errorMessage 
      }));
      toast.error(`❌ ${errorMessage}`);
      throw error;
    }
  }, []);

  const clearCache = useCallback(async () => {
    setState(prev => ({ ...prev, isClearingCache: true }));
    
    try {
      const result = await backendService.clearCache();
      setState(prev => ({ ...prev, isClearingCache: false }));
      toast.success(`🧹 Cleared ${result.entries_removed} cache entries`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cache clear failed';
      setState(prev => ({ ...prev, isClearingCache: false, lastError: errorMessage }));
      toast.error(`❌ ${errorMessage}`);
      throw error;
    }
  }, []);

  // NEW: Job submission
  const submitAnalysis = useCallback(async (videoBlob: Blob, settings: any) => {
    setState(prev => ({ ...prev, isSubmittingJob: true }));
    
    try {
      const jobResponse = await backendService.submitVideoAnalysis(videoBlob, settings);
      setState(prev => ({ ...prev, isSubmittingJob: false }));
      
      toast.success(`✅ Job submitted: ${jobResponse.job_id.slice(0, 8)}...`);
      return jobResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Job submission failed';
      setState(prev => ({ ...prev, isSubmittingJob: false, lastError: errorMessage }));
      toast.error(`❌ ${errorMessage}`);
      throw error;
    }
  }, []);

  const healthCheck = useCallback(async () => {
    try {
      return await backendService.healthCheck();
    } catch (error) {
      console.warn('Health check failed:', error);
      return null;
    }
  }, []);

  const prepareNewSession = useCallback(async () => {
    setState(prev => ({ 
      ...prev, 
      isCheckingServer: true, 
      isClearingCache: true 
    }));
    
    try {
      const result = await backendService.prepareNewSession();
      setState(prev => ({ 
        ...prev, 
        isCheckingServer: false, 
        isClearingCache: false 
      }));
      
      if (result.serverReady && result.cacheCleared) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Session prep failed';
      setState(prev => ({ 
        ...prev, 
        isCheckingServer: false, 
        isClearingCache: false, 
        lastError: errorMessage 
      }));
      toast.error(`❌ ${errorMessage}`);
      throw error;
    }
  }, []);

  return {
    // State
    isCheckingServer: state.isCheckingServer,
    isClearingCache: state.isClearingCache,
    isSubmittingJob: state.isSubmittingJob,
    serverStatus: state.serverStatus,
    cacheStatus: state.cacheStatus,
    lastError: state.lastError,
    isLoading: state.isCheckingServer || state.isClearingCache || state.isSubmittingJob,
    
    // Actions
    pingServer,
    clearCache,
    submitAnalysis,
    healthCheck,
    prepareNewSession,
    
    // Direct access to service for complex operations
    backendService,
  };
}