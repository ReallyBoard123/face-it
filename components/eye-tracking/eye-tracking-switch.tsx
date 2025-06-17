// components/eye-tracking/eye-tracking-switch.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useWebGazer } from '@/hooks/use-webgazer';
import { Eye, EyeOff, Target, Zap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EyeTrackingSwitchProps {
  className?: string;
}

export function EyeTrackingSwitch({ className }: EyeTrackingSwitchProps) {
  const {
    isEnabled,
    isInitializing,
    isCalibrating,
    startCalibration,
    nextCalibrationPoint,
    stopEyeTracking,
    getCurrentCalibrationPoint,
    togglePredictionPoints,
  } = useWebGazer();

  const [showPredictions, setShowPredictions] = useState(true);

  const handleToggle = useCallback(async () => {
    if (isEnabled) {
      stopEyeTracking();
    } else {
      const success = await startCalibration();
      if (!success) {
        console.error('Failed to start eye tracking');
      }
    }
  }, [isEnabled, startCalibration, stopEyeTracking]);

  const handlePredictionToggle = useCallback((checked: boolean) => {
    setShowPredictions(checked);
    togglePredictionPoints(checked);
  }, [togglePredictionPoints]);

  const calibrationPoint = getCurrentCalibrationPoint();

  return (
    <div className={cn("relative", className)}>
      {/* Main Control */}
      <Card variant={isEnabled ? "green" : isCalibrating ? "orange" : "white"} className="p-3">
        <div className="flex items-center gap-3">
          <Button
            onClick={handleToggle}
            variant={isEnabled ? "success" : isCalibrating ? "warning" : "outline"}
            size="sm"
            disabled={isInitializing}
            className="border-4 border-black"
          >
            {isInitializing ? (
              <Zap className="h-4 w-4 animate-spin" />
            ) : isEnabled ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
          
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-wider text-black">
              {isInitializing ? 'LOADING...' :
               isCalibrating ? 'CALIBRATING' :
               isEnabled ? 'EYE TRACKING ON' : 'EYE TRACKING OFF'}
            </span>
            
            {isCalibrating && (
              <span className="text-xs font-bold text-black/70 uppercase">
                POINT {(calibrationPoint?.index || 0) + 1}/20
              </span>
            )}
          </div>

          {/* Prediction Points Toggle */}
          {isEnabled && !isCalibrating && (
            <div className="flex items-center gap-2 ml-2">
              <Switch
                checked={showPredictions}
                onCheckedChange={handlePredictionToggle}
                className="data-[state=checked]:bg-green-400 border-2 border-black"
              />
              <span className="text-xs font-bold text-black uppercase">
                DOTS
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Calibration Overlay */}
      {isCalibrating && calibrationPoint && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm">
          {/* Instructions */}
          <Card variant="yellow" className="absolute top-8 left-1/2 transform -translate-x-1/2 p-4 z-60 max-w-md">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-black">
                <Target className="h-5 w-5" />
                <span className="font-black uppercase text-lg">CALIBRATION MODE</span>
                <Target className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-black uppercase">
                Click the red dot and watch your eyes!
              </p>
              <p className="text-xs font-bold text-black/70 uppercase">
                Point {calibrationPoint.index + 1} of 20
              </p>
            </div>
          </Card>

          {/* Calibration Point */}
          <button
            onClick={nextCalibrationPoint}
            className="absolute w-8 h-8 neo-pink border-4 border-black rounded-full shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#000] hover:scale-110 transition-all z-60 flex items-center justify-center"
            style={{
              left: `${calibrationPoint.x}%`,
              top: `${calibrationPoint.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="w-3 h-3 bg-black rounded-full animate-pulse" />
          </button>

          {/* Progress Bar */}
          <Card variant="cyan" className="absolute bottom-8 left-1/2 transform -translate-x-1/2 p-4 z-60">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-black" />
              <div className="w-48 h-4 border-4 border-black bg-white">
                <div 
                  className="h-full neo-green transition-all duration-300"
                  style={{ width: `${((calibrationPoint.index + 1) / 20) * 100}%` }}
                />
              </div>
              <span className="text-sm font-black text-black">
                {Math.round(((calibrationPoint.index + 1) / 20) * 100)}%
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* Status Indicator */}
      {isEnabled && !isCalibrating && (
        <div className="absolute -top-2 -right-2">
          <div className="w-4 h-4 neo-green border-2 border-black rounded-full animate-pulse" />
        </div>
      )}
    </div>
  );
}