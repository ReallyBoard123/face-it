// hooks/use-analysis-progress.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/components/ui/toast';

interface AnalysisProgress {
  phase: 'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  eta?: string;
  fileSize?: string;
  uploadSpeed?: string;
  framesProcessed?: number;
  totalFrames?: number;
}

export function useAnalysisProgress() {
  const [progressState, setProgressState] = useState<AnalysisProgress>({
    phase: 'idle',
    progress: 0,
    message: 'Ready to start'
  });

  const toastIdRef = useRef<string | number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const uploadStartRef = useRef<number | undefined>(undefined);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }, []);

  const calculateETA = useCallback((progress: number, startTime: number): string => {
    if (progress <= 0) return '';
    const elapsed = (Date.now() - startTime) / 1000;
    const total = elapsed / (progress / 100);
    const remaining = total - elapsed;
    return remaining > 0 ? formatTime(remaining) : '';
  }, [formatTime]);

  const startUpload = useCallback((fileSize: number) => {
    uploadStartRef.current = Date.now();
    const fileSizeStr = formatFileSize(fileSize);
    
    setProgressState({
      phase: 'uploading',
      progress: 0,
      message: 'Preparing video upload...',
      fileSize: fileSizeStr
    });

    // Dismiss any existing toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }

    toastIdRef.current = toast.uploadStarted(fileSizeStr);
  }, [formatFileSize]);

  const updateUploadProgress = useCallback((progress: number) => {
    if (uploadStartRef.current !== undefined) {
      const elapsed = (Date.now() - uploadStartRef.current) / 1000;
      const speed = progress > 0 ? formatFileSize((progress / 100) * (1024 * 1024) / elapsed) + '/s' : '';
      
      setProgressState(prev => ({
        ...prev,
        progress,
        message: `Uploading video... ${Math.round(progress)}%`,
        uploadSpeed: speed
      }));
    }
  }, [formatFileSize]);

  const startAnalysis = useCallback((sessionId: string, jobId: string) => {
    startTimeRef.current = Date.now();
    
    setProgressState({
      phase: 'queued',
      progress: 0,
      message: 'Queued for GPU processing...'
    });

    // Update toast to analysis mode
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    toastIdRef.current = toast.analysisProgress(0, 'Initializing GPU analysis...');
  }, []);

  const updateAnalysisProgress = useCallback((progress: number, message: string, framesProcessed?: number, totalFrames?: number) => {
    const eta = startTimeRef.current !== undefined ? calculateETA(progress, startTimeRef.current) : undefined;
    
    let enhancedMessage = message;
    if (framesProcessed && totalFrames) {
      enhancedMessage = `${message} • ${framesProcessed}/${totalFrames} frames`;
    }

    setProgressState(prev => ({
      ...prev,
      phase: 'processing',
      progress,
      message: enhancedMessage,
      eta,
      framesProcessed,
      totalFrames
    }));

    // Update toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    toastIdRef.current = toast.analysisProgress(progress, enhancedMessage, eta);
  }, [calculateETA]);

  const completeAnalysis = useCallback(() => {
    setProgressState({
      phase: 'completed',
      progress: 100,
      message: 'Analysis completed successfully!'
    });

    // Dismiss progress toast and show success
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    
    toast.success('ANALYSIS COMPLETE!', 'Facial expressions processed successfully');
  }, []);

  const setError = useCallback((errorMessage: string) => {
    setProgressState({
      phase: 'error',
      progress: 0,
      message: errorMessage
    });

    // Dismiss progress toast and show error
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    
    toast.error('ANALYSIS FAILED', errorMessage);
  }, []);

  const reset = useCallback(() => {
    setProgressState({
      phase: 'idle',
      progress: 0,
      message: 'Ready to start'
    });

    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = undefined;
    }
    
    startTimeRef.current = undefined;
    uploadStartRef.current = undefined;
  }, []);

  const showServerReady = useCallback(() => {
    toast.serverReady();
  }, []);

  return {
    progressState,
    startUpload,
    updateUploadProgress,
    startAnalysis,
    updateAnalysisProgress,
    completeAnalysis,
    setError,
    reset,
    showServerReady
  };
}