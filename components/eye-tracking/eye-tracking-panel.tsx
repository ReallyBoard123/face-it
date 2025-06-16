// components/eye-tracking/eye-tracking-panel.tsx
'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EyeTrackingSwitch } from './eye-tracking-switch';
import { GazeIndicator } from './gaze-indicator';
import { useWebGazer } from '@/hooks/use-webgazer';

export function EyeTrackingPanel() {
  const {
    isEnabled,
    isInitializing,
    isCalibrating,
    gazeData,
    startCalibration,
    nextCalibrationPoint,
    stopEyeTracking,
    getCurrentCalibrationPoint,
  } = useWebGazer();

  const handleToggleEyeTracking = async () => {
    if (isEnabled || isCalibrating) {
      stopEyeTracking();
    } else {
      await startCalibration();
    }
  };

  const currentPoint = getCurrentCalibrationPoint();

  return (
    <>
      {/* Eye Tracking Controls */}
      <div className="fixed top-4 right-4 z-40">
        <Card className="p-4 shadow-lg">
          <CardContent className="p-0 space-y-3">
            <EyeTrackingSwitch
              enabled={isEnabled}
              onToggle={handleToggleEyeTracking}
              disabled={isInitializing}
            />
            {isInitializing && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                🔄 Initializing...
              </p>
            )}
            {isCalibrating && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                🎯 Point {(currentPoint?.index || 0) + 1}/20
              </p>
            )}
            {isEnabled && (
              <p className="text-xs text-green-600 dark:text-green-400">
                ✓ Active ({gazeData.length} gaze points)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calibration Overlay */}
      {isCalibrating && currentPoint && (
        <div
          className="fixed w-6 h-6 bg-red-500 rounded-full cursor-pointer animate-pulse border-2 border-white transform -translate-x-1/2 -translate-y-1/2 z-[9999]"
          style={{
            left: `${currentPoint.x}%`,
            top: `${currentPoint.y}%`,
          }}
          onClick={nextCalibrationPoint}
        />
      )}

      {/* Gaze Indicator - Active during calibration too */}
      <GazeIndicator 
        gazeData={gazeData}
        isEnabled={isEnabled || isCalibrating}
        showTrail={true}
      />
    </>
  );
}