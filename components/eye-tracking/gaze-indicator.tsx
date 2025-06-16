// components/eye-tracking/gaze-indicator.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface GazeIndicatorProps {
  gazeData: Array<{x: number, y: number, timestamp: number}>;
  isEnabled: boolean;
  showTrail?: boolean;
}

export function GazeIndicator({ gazeData, isEnabled, showTrail = true }: GazeIndicatorProps) {
  const [currentGaze, setCurrentGaze] = useState<{x: number, y: number} | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (gazeData.length > 0) {
      const latest = gazeData[gazeData.length - 1];
      setCurrentGaze({ x: latest.x, y: latest.y });
    }
  }, [gazeData]);

  if (!isEnabled) return null;

  const recentPoints = showTrail ? gazeData.slice(-10) : [];

  return (
    <>
      {/* Toggle button */}
      <div className="fixed top-4 right-4 z-[9999]">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full shadow-lg transition-colors"
          title={isVisible ? "Hide gaze indicator" : "Show gaze indicator"}
        >
          {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {isVisible && (
        <>
          {/* Trail points */}
          {showTrail && recentPoints.map((point, index) => {
            const opacity = (index + 1) / recentPoints.length * 0.6;
            const size = 4 + (index / recentPoints.length) * 4;
            
            return (
              <div
                key={`trail-${point.timestamp}-${index}`}
                className="fixed pointer-events-none z-[9998] rounded-full bg-blue-400"
                style={{
                  left: `${point.x}px`,
                  top: `${point.y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  opacity,
                  transform: 'translate(-50%, -50%)',
                  transition: 'opacity 0.1s ease-out',
                }}
              />
            );
          })}

          {/* Current gaze point */}
          {currentGaze && (
            <div
              className="fixed pointer-events-none z-[9999] w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-lg animate-pulse"
              style={{
                left: `${currentGaze.x}px`,
                top: `${currentGaze.y}px`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}

          {/* Status indicator */}
          <div className="fixed bottom-4 right-4 z-[9999] bg-white dark:bg-gray-800 rounded-lg p-3 shadow-lg border">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Eye tracking active</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {gazeData.length > 0 ? `${gazeData.length} gaze points` : 'Waiting for gaze data...'}
            </div>
          </div>
        </>
      )}
    </>
  );
}