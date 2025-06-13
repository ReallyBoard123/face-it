// components/calibration/websocket-calibration.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, Target, CheckCircle, AlertCircle } from 'lucide-react';

interface CalibrationPoint {
  x: number;
  y: number;
  id: number;
}

interface WebSocketCalibrationProps {
  onCalibrationComplete: (sessionId: string) => void;
  onCalibrationFailed: (error: string) => void;
}

export function WebSocketCalibration({ onCalibrationComplete, onCalibrationFailed }: WebSocketCalibrationProps) {
  const [calibrationState, setCalibrationState] = useState<'setup' | 'calibrating' | 'collecting' | 'processing' | 'complete' | 'error'>('setup');
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [collectedPoints, setCollectedPoints] = useState(0);
  const [sessionId, setSessionId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [countdown, setCountdown] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // 9-point calibration grid
  const calibrationPoints: CalibrationPoint[] = [
    { x: 0.1, y: 0.1, id: 1 },   // Top-left
    { x: 0.5, y: 0.1, id: 2 },   // Top-center
    { x: 0.9, y: 0.1, id: 3 },   // Top-right
    { x: 0.1, y: 0.5, id: 4 },   // Middle-left
    { x: 0.5, y: 0.5, id: 5 },   // Center
    { x: 0.9, y: 0.5, id: 6 },   // Middle-right
    { x: 0.1, y: 0.9, id: 7 },   // Bottom-left
    { x: 0.5, y: 0.9, id: 8 },   // Bottom-center
    { x: 0.9, y: 0.9, id: 9 },   // Bottom-right
  ];

  const initializeCalibration = useCallback(async () => {
    try {
      // Start calibration session
      const response = await fetch('http://localhost:8000/eyetrax/calibration/start', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to start calibration session');
      }
      
      const data = await response.json();
      setSessionId(data.session_id);
      
      // Get camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Connect WebSocket
      const ws = new WebSocket(`ws://localhost:8000/ws/calibration/${data.session_id}`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setCalibrationState('calibrating');
        setCurrentPointIndex(0);
        startPointCollection();
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'point_added') {
          setCollectedPoints(message.point_count);
          
          // Move to next point
          if (currentPointIndex < calibrationPoints.length - 1) {
            setCurrentPointIndex(prev => prev + 1);
            startPointCollection();
          } else {
            // All points collected, finalize calibration
            setCalibrationState('processing');
            ws.send(JSON.stringify({ type: 'finalize_calibration' }));
          }
        } else if (message.type === 'point_rejected') {
          setError(message.reason);
          // Retry the same point after a brief delay
          setTimeout(() => {
            setError('');
            startPointCollection();
          }, 1000);
        } else if (message.type === 'calibration_complete') {
          setCalibrationState('complete');
          onCalibrationComplete(data.session_id);
        } else if (message.type === 'calibration_failed') {
          setCalibrationState('error');
          setError(message.error);
          onCalibrationFailed(message.error);
        }
      };
      
      ws.onerror = () => {
        setCalibrationState('error');
        setError('WebSocket connection failed');
        onCalibrationFailed('WebSocket connection failed');
      };
      
    } catch (err) {
      setCalibrationState('error');
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      onCalibrationFailed(errorMsg);
    }
  }, [currentPointIndex, onCalibrationComplete, onCalibrationFailed]);

  const startPointCollection = useCallback(() => {
    setCalibrationState('collecting');
    setCountdown(3);
    
    // Countdown before capturing
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          captureCalibrationPoint();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const captureCalibrationPoint = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    if (!videoRef.current || !canvasRef.current || !wsRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Capture frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Get image data as base64
    const frameData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Get current calibration point in screen coordinates
    const point = calibrationPoints[currentPointIndex];
    const screenX = point.x * window.screen.width;
    const screenY = point.y * window.screen.height;
    
    // Send to WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'calibration_point',
      x: screenX,
      y: screenY,
      frame: frameData
    }));
  }, [currentPointIndex]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const getCurrentPoint = () => calibrationPoints[currentPointIndex];
  const progress = (collectedPoints / calibrationPoints.length) * 100;

  return (
    <div className="w-full h-screen bg-black text-white relative overflow-hidden">
      {/* Video feed (hidden) */}
      <video ref={videoRef} autoPlay muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Setup State */}
      {calibrationState === 'setup' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Eye Tracking Calibration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Look at each calibration point when it appears. Keep your head still and look directly at the target.
              </p>
              <Button onClick={initializeCalibration} className="w-full">
                Start Calibration
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Calibration State */}
      {(calibrationState === 'calibrating' || calibrationState === 'collecting') && (
        <>
          {/* Progress indicator */}
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-black/80 rounded-lg p-4 text-center">
              <p className="text-sm mb-2">Calibration Progress</p>
              <Progress value={progress} className="w-48 mb-2" />
              <p className="text-xs text-gray-300">
                Point {currentPointIndex + 1} of {calibrationPoints.length}
              </p>
            </div>
          </div>
          
          {/* Calibration point */}
          <div
            className="absolute w-8 h-8 transform -translate-x-1/2 -translate-y-1/2 z-20"
            style={{
              left: `${getCurrentPoint().x * 100}%`,
              top: `${getCurrentPoint().y * 100}%`,
            }}
          >
            <div className="relative w-full h-full">
              {/* Outer ring */}
              <div className="absolute inset-0 border-4 border-white rounded-full animate-pulse" />
              {/* Inner dot */}
              <div className="absolute inset-2 bg-red-500 rounded-full" />
              {/* Target number */}
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-sm font-bold">
                {getCurrentPoint().id}
              </div>
            </div>
          </div>
          
          {/* Countdown */}
          {calibrationState === 'collecting' && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-30">
              <div className="text-6xl font-bold text-red-500 animate-pulse">
                {countdown}
              </div>
            </div>
          )}
          
          {/* Instructions */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-black/80 rounded-lg p-4 text-center">
              <p className="text-lg">Look at the red dot</p>
              <p className="text-sm text-gray-300 mt-1">
                {calibrationState === 'collecting' && countdown > 0 
                  ? `Capturing in ${countdown}...` 
                  : 'Focus on the target'
                }
              </p>
            </div>
          </div>
        </>
      )}
      
      {/* Processing State */}
      {calibrationState === 'processing' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-lg font-semibold">Processing Calibration...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Training the eye tracking model with {collectedPoints} points
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Complete State */}
      {calibrationState === 'complete' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card>
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold">Calibration Complete!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Eye tracking is now ready to use
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Error State */}
      {calibrationState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Calibration Failed</p>
                    <p className="text-sm">{error}</p>
                  </div>
                </AlertDescription>
              </Alert>
              <Button 
                onClick={() => {
                  cleanup();
                  setCalibrationState('setup');
                  setError('');
                  setCollectedPoints(0);
                  setCurrentPointIndex(0);
                }} 
                className="w-full mt-4"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Current error display */}
      {error && calibrationState !== 'error' && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30">
          <Alert variant="destructive" className="max-w-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {error}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}