// components/analysis/key-moments-display.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Zap, Trophy, Smile, Meh, Frown, ImageOff } from 'lucide-react';

export interface KeyMoment {
  timestamp: number;
  reason: string;
  faceFrame?: string | null; // Base64 image string (e.g., data:image/jpeg;base64,...)
  gameFrame?: string | null; // Base64 image string
  type: 'emotion_spike' | 'game_event';
  frameNumber?: number;
}

interface KeyMomentsDisplayProps {
  moments: KeyMoment[];
}

const getIconForReason = (reason: string, type: string) => {
  const lowerReason = reason.toLowerCase();
  if (type === 'game_event') {
    if (lowerReason.includes('level')) return <Zap className="h-5 w-5 text-yellow-500" />;
    if (lowerReason.includes('score') || lowerReason.includes('game over')) return <Trophy className="h-5 w-5 text-green-500" />;
  }
  if (type === 'emotion_spike') {
    if (lowerReason.includes('happi')) return <Smile className="h-5 w-5 text-green-400" />;
    if (lowerReason.includes('surpri')) return <Smile className="h-5 w-5 text-yellow-400" />;
    if (lowerReason.includes('sad') || lowerReason.includes('fear') || lowerReason.includes('anger') || lowerReason.includes('disgust')) return <Frown className="h-5 w-5 text-red-400" />;
    return <Meh className="h-5 w-5 text-blue-400" />;
  }
  return <AlertCircle className="h-5 w-5 text-gray-400" />;
};

export function KeyMomentsDisplay({ moments }: KeyMomentsDisplayProps) {
  if (!moments || moments.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base md:text-lg">Key Moments</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No key moments were identified for this session.</p>
        </CardContent>
      </Card>
    );
  }

  // Moments should already be sorted by timestamp by DashboardGrid if necessary
  // const sortedMoments = [...moments].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-lg">Key Moments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-4"> {/* Simple horizontal scroll */}
          <div className="flex space-x-4">
            {moments.map((moment, index) => (
              <div key={index} className="w-64 md:w-72 shrink-0"> {/* Fixed width for each card */}
                <Card className="overflow-hidden shadow-md">
                  <CardHeader className="p-3 bg-card-foreground/5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{getIconForReason(moment.reason, moment.type)}</span>
                      <div>
                        <CardTitle className="text-xs md:text-sm font-medium leading-tight line-clamp-2" title={moment.reason}>
                          {moment.reason}
                        </CardTitle>
                         <p className="text-xs text-muted-foreground mt-0.5">
                          Time: {moment.timestamp.toFixed(1)}s
                          {moment.frameNumber && ` (F: ${moment.frameNumber})`}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex flex-col text-xs">
                    {moment.faceFrame ? (
                      <div className="aspect-video bg-muted border-t">
                        <img
                          src={moment.faceFrame.startsWith('data:') ? moment.faceFrame : `data:image/jpeg;base64,${moment.faceFrame}`}
                          alt={`Face at ${moment.timestamp.toFixed(1)}s`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                       <div className="aspect-video bg-gray-200 dark:bg-gray-700 text-muted-foreground flex flex-col items-center justify-center text-center p-2 border-t">
                         <ImageOff className="h-6 w-6 mb-1" />
                         Face Not Captured
                       </div>
                    )}
                    {moment.gameFrame ? (
                       <div className="aspect-video bg-muted border-t">
                        <img
                          src={moment.gameFrame.startsWith('data:') ? moment.gameFrame : `data:image/jpeg;base64,${moment.gameFrame}`}
                          alt={`Game screen at ${moment.timestamp.toFixed(1)}s`}
                          className="w-full h-full object-contain" // object-contain might be better for game screens
                          loading="lazy"
                        />
                       </div>
                    ) : (
                      <div className="aspect-video bg-gray-200 dark:bg-gray-800 text-muted-foreground flex flex-col items-center justify-center text-center p-2 border-t">
                        <ImageOff className="h-6 w-6 mb-1" />
                        Game Screen (Not Captured)
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
        {moments.length > 3 && <p className="text-xs text-muted-foreground text-center mt-2">Scroll horizontally to see all moments.</p>}
      </CardContent>
    </Card>
  );
}