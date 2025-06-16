// components/eye-tracking/calibration-overlay.tsx
'use client';

import React from 'react';

interface CalibrationPoint {
  x: number;
  y: number;
  index: number;
}

interface CalibrationOverlayProps {
  isCalibrating: boolean;
  currentPoint: CalibrationPoint | null;
  onPointClick: () => void;
}

export function CalibrationOverlay({ 
  isCalibrating, 
  currentPoint, 
  onPointClick 
}: CalibrationOverlayProps) {
  if (!isCalibrating || !currentPoint) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div 
        className="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg cursor-pointer pointer-events-auto animate-pulse"
        style={{
          left: `${currentPoint.x}%`,
          top: `${currentPoint.y}%`,
          transform: 'translate(-50%, -50%)'
        }}
        onClick={onPointClick}
      />
      
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg">
        <p className="text-sm font-medium">
          Calibration Point {currentPoint.index + 1} of 20
        </p>
        <p className="text-xs text-gray-300">
          Click the red dot while looking at it
        </p>
      </div>
    </div>
  );
}