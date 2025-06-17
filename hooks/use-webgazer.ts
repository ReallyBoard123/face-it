// hooks/use-webgazer.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export interface GazeData {
  x: number;
  y: number;
  timestamp: number;
}

export function useWebGazer() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoint, setCalibrationPoint] = useState(0);
  const [gazeData, setGazeData] = useState<GazeData[]>([]);
  
  const webgazerRef = useRef<any>(null);
  
  // 20 strategic calibration points
  const calibrationPointsRef = useRef([
    [10, 10], [30, 10], [50, 10], [70, 10], [90, 10],
    [10, 25], [30, 25], [70, 25], [90, 25],
    [10, 50], [30, 50], [50, 50], [70, 50], [90, 50],
    [10, 75], [30, 75], [70, 75], [90, 75],
    [10, 90], [90, 90]
  ]);

  const initWebGazer = useCallback(async () => {
    if (webgazerRef.current) return true;
    
    setIsInitializing(true);
    
    try {
      // Load from CDN (more reliable than npm package)
      if (typeof window !== 'undefined' && !(window as any).webgazer) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load WebGazer'));
          document.head.appendChild(script);
        });
      }

      const webgazer = (window as any).webgazer;
      if (!webgazer) throw new Error('WebGazer not available');
      
      webgazerRef.current = webgazer;

      // Configure WebGazer - show prediction points from the start
      webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .showPredictionPoints(true) // Show points for immediate visual feedback
        .showVideo(false)
        .showFaceOverlay(false)
        .showFaceFeedbackBox(false)
        .saveDataAcrossSessions(false);

      // Force hide WebGazer's video elements
      setTimeout(() => {
        const videoElement = document.getElementById('webgazerVideoFeed');
        const canvasElement = document.getElementById('webgazerCanvas');
        if (videoElement) videoElement.style.display = 'none';
        if (canvasElement) canvasElement.style.display = 'none';
      }, 100);

      // Set gaze listener
      webgazer.setGazeListener(function(data: {x: number, y: number} | null, elapsedTime: number) {
        if (data == null) return;
        setGazeData(prev => [...prev.slice(-99), { 
          x: data.x,
          y: data.y,
          timestamp: elapsedTime
        }]);
      });
      
      await webgazer.begin();
      return true;
    } catch (error) {
      console.error('Failed to initialize WebGazer:', error);
      toast.error('Failed to initialize eye tracking.');
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const startCalibration = useCallback(async () => {
    const success = await initWebGazer();
    if (success) {
      // Prediction points are already enabled by default config
      setIsCalibrating(true);
      setCalibrationPoint(0);
      toast.info('Calibration started - watch the prediction dot improve as you click each red dot!');
    }
    return success;
  }, [initWebGazer]);

  const nextCalibrationPoint = useCallback(() => {
    if (calibrationPoint < 19) { // 20 points (0-19)
      setCalibrationPoint(prev => prev + 1);
    } else {
      // Calibration complete - prediction points remain visible
      setIsCalibrating(false);
      setIsEnabled(true);
      toast.success('Calibration complete! Eye tracking is now active and accurate.');
    }
  }, [calibrationPoint]);

  const getCurrentCalibrationPoint = () => {
    if (!isCalibrating) return null;
    const [x, y] = calibrationPointsRef.current[calibrationPoint];
    return { x, y, index: calibrationPoint };
  };

  const stopEyeTracking = useCallback(() => {
    if (webgazerRef.current) {
      webgazerRef.current.showPredictionPoints(false);
      webgazerRef.current.end();
      webgazerRef.current = null;
    }
    setIsEnabled(false);
    setIsCalibrating(false);
    setGazeData([]);
    toast.info('Eye tracking stopped.');
  }, []);

  const togglePredictionPoints = useCallback((show: boolean) => {
    if (webgazerRef.current && isEnabled && !isCalibrating) {
      webgazerRef.current.showPredictionPoints(show);
    }
  }, [isEnabled, isCalibrating]);

  useEffect(() => {
    return () => {
      if (webgazerRef.current) {
        webgazerRef.current.end();
      }
    };
  }, []);

  return {
    isEnabled,
    isInitializing,
    isCalibrating,
    gazeData,
    startCalibration,
    nextCalibrationPoint,
    stopEyeTracking,
    getCurrentCalibrationPoint,
    togglePredictionPoints,
  };
}