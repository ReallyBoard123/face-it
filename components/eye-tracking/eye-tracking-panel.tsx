// components/eye-tracking/eye-tracking-panel.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalibrationOverlay } from './calibration-overlay';
import { useWebGazer } from '@/hooks/use-webgazer';
import { Eye, EyeOff, Target } from 'lucide-react';

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

  const currentPoint = getCurrentCalibrationPoint();

  return (
    <>
      <div className="fixed bottom-4 right-4 w-80 max-w-[calc(100vw-2rem)] z-40">
        <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4" />
              Eye Tracking
              {isEnabled && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isEnabled && !isCalibrating && (
              <Button
                onClick={startCalibration}
                disabled={isInitializing}
                size="sm"
                className="w-full"
              >
                {isInitializing ? (
                  <>
                    <Target className="mr-2 h-4 w-4 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Target className="mr-2 h-4 w-4" />
                    Start Calibration
                  </>
                )}
              </Button>
            )}

            {isCalibrating && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Calibrating... Click each red dot while looking at it.
                </div>
                <Button
                  onClick={nextCalibrationPoint}
                  size="sm"
                  className="w-full"
                >
                  Next Point ({currentPoint ? currentPoint.index + 1 : 0}/20)
                </Button>
              </div>
            )}

            {isEnabled && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Eye tracking active • {gazeData.length} data points
                </div>
                <Button
                  onClick={stopEyeTracking}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  Stop Tracking
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CalibrationOverlay
        isCalibrating={isCalibrating}
        currentPoint={currentPoint}
        onPointClick={nextCalibrationPoint}
      />
    </>
  );
}