// components/eye-tracking/calibration-overlay.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Target } from 'lucide-react';

interface CalibrationPoint {
  id: number;
  x: number; // percentage
  y: number; // percentage
}

interface CalibrationOverlayProps {
  onCalibrationComplete: () => void;
  onCancel: () => void;
}

// 15 strategic points covering the screen
const CALIBRATION_POINTS: CalibrationPoint[] = [
  // Top row
  { id: 1, x: 10, y: 10 },
  { id: 2, x: 30, y: 10 },
  { id: 3, x: 50, y: 10 },
  { id: 4, x: 70, y: 10 },
  { id: 5, x: 90, y: 10 },
  
  // Middle-top row
  { id: 6, x: 20, y: 30 },
  { id: 7, x: 50, y: 30 },
  { id: 8, x: 80, y: 30 },
  
  // Center row
  { id: 9, x: 10, y: 50 },
  { id: 10, x: 50, y: 50 }, // dead center
  { id: 11, x: 90, y: 50 },
  
  // Middle-bottom row
  { id: 12, x: 25, y: 70 },
  { id: 13, x: 75, y: 70 },
  
  // Bottom row
  { id: 14, x: 20, y: 90 },
  { id: 15, x: 80, y: 90 },
];

export function CalibrationOverlay({ onCalibrationComplete, onCancel }: CalibrationOverlayProps) {
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const currentPoint = CALIBRATION_POINTS[currentPointIndex];
  const progress = (currentPointIndex / CALIBRATION_POINTS.length) * 100;

  const handlePointClick = () => {
    if (currentPointIndex < CALIBRATION_POINTS.length - 1) {
      setCurrentPointIndex(prev => prev + 1);
    } else {
      setIsComplete(true);
      setTimeout(() => {
        onCalibrationComplete();
      }, 1000);
    }
  };

  if (isComplete) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl max-w-md w-full mx-4 text-center">
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold mb-2">Calibration Complete!</h3>
          <p className="text-sm text-muted-foreground">
            Eye tracking is now active and calibrated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      {/* Calibration Point */}
      <div
        className="absolute w-12 h-12 bg-red-500 rounded-full cursor-pointer animate-pulse shadow-lg border-4 border-white transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform z-50 flex items-center justify-center"
        style={{
          left: `${currentPoint.x}%`,
          top: `${currentPoint.y}%`,
        }}
        onClick={handlePointClick}
      >
        <Target className="w-6 h-6 text-white" />
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-white text-sm font-bold">
          {currentPointIndex + 1}
        </div>
      </div>

      {/* Instructions Panel */}
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Eye Tracking Calibration
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Look at the red dot and click on it
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Point {currentPointIndex + 1} of {CALIBRATION_POINTS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Look directly at the red dot before clicking. This helps train the eye tracker.
        </p>
      </div>
    </div>
  );
}