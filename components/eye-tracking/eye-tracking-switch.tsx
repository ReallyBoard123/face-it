// components/eye-tracking/eye-tracking-switch.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, Crosshair } from 'lucide-react';
import { useWebGazer } from '@/hooks/use-webgazer';

interface EyeTrackingSwitchProps {
  className?: string;
}

export function EyeTrackingSwitch({ className }: EyeTrackingSwitchProps) {
  const [showGazeOverlay, setShowGazeOverlay] = useState(true);
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

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await startCalibration();
    } else {
      stopEyeTracking();
    }
  };

  const toggleGazeOverlay = () => {
    const newShowState = !showGazeOverlay;
    setShowGazeOverlay(newShowState);
    togglePredictionPoints(newShowState);
  };

  // Reset gaze overlay state when eye tracking stops
  useEffect(() => {
    if (!isEnabled && !isCalibrating) {
      setShowGazeOverlay(true); // Reset to default when stopped
    }
  }, [isEnabled, isCalibrating]);

  const calibrationPoint = getCurrentCalibrationPoint();
  const isActive = isEnabled || isCalibrating || isInitializing;

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <Switch
          id="eye-tracking"
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={isInitializing}
        />
        <Label 
          htmlFor="eye-tracking" 
          className="text-sm font-medium cursor-pointer flex items-center gap-1"
        >
          {isInitializing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isActive ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          Eye Tracking
        </Label>
      </div>

      {/* Gaze Overlay Toggle - disabled during calibration since points are helpful */}
      {isEnabled && !isCalibrating && (
        <Button
          size="sm"
          variant="outline"
          onClick={toggleGazeOverlay}
          className="h-6 text-xs px-2"
          title={showGazeOverlay ? "Hide gaze overlay" : "Show gaze overlay"}
        >
          <Crosshair className="h-3 w-3" />
          {showGazeOverlay ? 'Hide' : 'Show'} Gaze
        </Button>
      )}

      {/* Calibration Status */}
      {isCalibrating && (
        <div className="flex items-center space-x-2">
          <span className="text-xs text-muted-foreground">
            Calibrating {calibrationPoint?.index ? `${calibrationPoint.index + 1}/20` : ''}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={nextCalibrationPoint}
            className="h-6 text-xs px-2"
          >
            Next
          </Button>
        </div>
      )}

      {(isEnabled || isCalibrating) && (
        <span className="text-xs text-green-600">
          {isCalibrating ? 'Calibrating' : 'Active'}
        </span>
      )}

      {/* Calibration Overlay */}
      {isCalibrating && calibrationPoint && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div
            className="absolute w-4 h-4 bg-red-500 rounded-full animate-pulse pointer-events-auto cursor-pointer"
            style={{
              left: `${calibrationPoint.x}%`,
              top: `${calibrationPoint.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={nextCalibrationPoint}
          />
        </div>
      )}
    </div>
  );
}