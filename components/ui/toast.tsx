// components/ui/toast.tsx
'use client';

import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { CheckCircle, XCircle, AlertCircle, Info, Loader2, Zap, Server, Upload, BarChart3 } from 'lucide-react';

// Enhanced toast functions using styled sonner
export const toast = {
  success: (title: string, description?: string) => {
    return sonnerToast.success(title, {
      description,
      icon: <CheckCircle className="h-5 w-5" />,
    });
  },
  
  error: (title: string, description?: string) => {
    return sonnerToast.error(title, {
      description,
      icon: <XCircle className="h-5 w-5" />,
    });
  },
  
  warning: (title: string, description?: string) => {
    return sonnerToast.warning(title, {
      description,
      icon: <AlertCircle className="h-5 w-5" />,
    });
  },
  
  info: (title: string, description?: string) => {
    return sonnerToast.info(title, {
      description,
      icon: <Info className="h-5 w-5" />,
    });
  },
  
  loading: (title: string, description?: string) => {
    return sonnerToast.loading(title, {
      description,
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      duration: Infinity,
    });
  },

  progress: (title: string, progress: number, description?: string) => {
    const progressContent = (
      <div>
        <div>{description}</div>
        <div className="neo-toast-progress mt-2">
          <div 
            className="neo-toast-progress-bar"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <div className="neo-toast-progress-text">
          {Math.round(progress)}% COMPLETE
        </div>
      </div>
    );
    
    return sonnerToast.loading(title, {
      description: progressContent,
      icon: <BarChart3 className="h-5 w-5" />,
      duration: Infinity,
    });
  },

  serverReady: () => {
    return sonnerToast.success("BACKEND READY!", {
      description: "Cache cleared, GPU online, ready for action!",
      icon: <Server className="h-5 w-5" />,
    });
  },

  uploadStarted: (fileSize: string) => {
    return sonnerToast.loading("UPLOADING VIDEO", {
      description: `File size: ${fileSize} • Starting analysis...`,
      icon: <Upload className="h-5 w-5" />,
      duration: Infinity,
    });
  },

  analysisProgress: (progress: number, message: string, eta?: string) => {
    const progressContent = (
      <div>
        <div>{message}{eta ? ` • ETA: ${eta}` : ''}</div>
        <div className="neo-toast-progress mt-2">
          <div 
            className="neo-toast-progress-bar"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <div className="neo-toast-progress-text">
          {Math.round(progress)}% COMPLETE
        </div>
      </div>
    );
    
    return sonnerToast.loading("ANALYZING EXPRESSIONS", {
      description: progressContent,
      icon: <Zap className="h-5 w-5" />,
      duration: Infinity,
    });
  },

  dismiss: (id?: string | number) => {
    return sonnerToast.dismiss(id);
  }
};