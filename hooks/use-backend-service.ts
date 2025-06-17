// hooks/use-backend-service.ts
'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { backendService, type ServerStatus, type CacheStatus } from '@/lib/backend-service';

interface BackendServiceState {
  isCheckingServer: boolean;
  isClearingCache: boolean;
  serverStatus: ServerStatus | null;
  cacheStatus: CacheStatus | null;
  lastError: string | null;
}

export function useBackendService() {
  const [state, setState] = useState<BackendServiceState>({
    isCheckingServer: false,
    isClearingCache: false,
    serverStatus: null,
    cacheStatus: null,
    lastError: null,
  });

  const pingServer = useCallback(async () => {
    setState(prev => ({ ...prev, isCheckingServer: true, lastError: null }));
    
    try {
      const status = await backendService.pingServer();
      setState(prev => ({ ...prev, serverStatus: status, isCheckingServer: false }));
      
      if (status.detector_ready) {
        toast.success('✅ Server is running and ready!');
      } else {
        toast.warning('⚠️ Server running but detector not ready');
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
    setState(prev => ({ ...prev, isClearingCache: true, lastError: null }));
    
    try {
      const result = await backendService.clearCache();
      setState(prev => ({ ...prev, isClearingCache: false }));
      
      toast.success(`🧹 Cache cleared! Removed ${result.entries_removed} entries.`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cache clear failed';
      setState(prev => ({ 
        ...prev, 
        isClearingCache: false, 
        lastError: errorMessage 
      }));
      toast.error(`❌ ${errorMessage}`);
      throw error;
    }
  }, []);

  const getCacheStatus = useCallback(async () => {
    try {
      const status = await backendService.getCacheStatus();
      setState(prev => ({ ...prev, cacheStatus: status }));
      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cache status check failed';
      setState(prev => ({ ...prev, lastError: errorMessage }));
      console.warn(errorMessage);
      return null;
    }
  }, []);

  const prepareNewSession = useCallback(async () => {
    setState(prev => ({ 
      ...prev, 
      isCheckingServer: true, 
      isClearingCache: true, 
      lastError: null 
    }));
    
    try {
      toast.loading('🔄 Preparing new session...', { id: 'prepare-session' });
      
      const result = await backendService.prepareNewSession();
      
      setState(prev => ({ 
        ...prev, 
        isCheckingServer: false, 
        isClearingCache: false 
      }));
      
      if (result.serverReady && result.cacheCleared) {
        toast.success(result.message, { id: 'prepare-session' });
      } else {
        toast.error(result.message, { id: 'prepare-session' });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to prepare session';
      setState(prev => ({ 
        ...prev, 
        isCheckingServer: false, 
        isClearingCache: false, 
        lastError: errorMessage 
      }));
      
      toast.error(`❌ ${errorMessage}`, { id: 'prepare-session' });
      throw error;
    }
  }, []);

  const healthCheck = useCallback(async () => {
    try {
      const health = await backendService.healthCheck();
      console.log('Health check result:', health);
      return health;
    } catch (error) {
      console.warn('Health check failed:', error);
      return null;
    }
  }, []);

  return {
    // State
    isCheckingServer: state.isCheckingServer,
    isClearingCache: state.isClearingCache,
    serverStatus: state.serverStatus,
    cacheStatus: state.cacheStatus,
    lastError: state.lastError,
    isLoading: state.isCheckingServer || state.isClearingCache,
    
    // Actions
    pingServer,
    clearCache,
    getCacheStatus,
    prepareNewSession,
    healthCheck,
  };
}