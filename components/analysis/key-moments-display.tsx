// components/analysis/key-moments-display.tsx
import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Zap, Trophy, Smile, Meh, Frown, ImageOff, Eye, EyeOff, Target, Sparkles } from 'lucide-react';

export interface KeyMoment {
  timestamp: number;
  reason: string;
  faceFrame?: string | null;
  gameFrame?: string | null;
  type: 'emotion_spike' | 'game_event';
  frameNumber?: number;
}

interface KeyMomentsDisplayProps {
  moments: KeyMoment[];
}

const getIconForReason = (reason: string, type: string) => {
  const lowerReason = reason.toLowerCase();
  if (type === 'game_event') {
    if (lowerReason.includes('level')) return <Zap className="h-6 w-6 text-black" />;
    if (lowerReason.includes('score') || lowerReason.includes('game over')) return <Trophy className="h-6 w-6 text-black" />;
  }
  if (type === 'emotion_spike') {
    if (lowerReason.includes('happi')) return <Smile className="h-6 w-6 text-black" />;
    if (lowerReason.includes('surpri')) return <Smile className="h-6 w-6 text-black" />;
    if (lowerReason.includes('sad') || lowerReason.includes('fear') || lowerReason.includes('anger') || lowerReason.includes('disgust')) return <Frown className="h-6 w-6 text-black" />;
    return <Meh className="h-6 w-6 text-black" />;
  }
  return <AlertCircle className="h-6 w-6 text-black" />;
};

const getCardVariantForType = (type: string, reason: string) => {
  if (type === 'game_event') {
    if (reason.toLowerCase().includes('level')) return 'orange';
    if (reason.toLowerCase().includes('score')) return 'purple';
    if (reason.toLowerCase().includes('game over')) return 'pink';
    return 'cyan';
  }
  if (type === 'emotion_spike') {
    if (reason.toLowerCase().includes('happi')) return 'green';
    if (reason.toLowerCase().includes('surpri')) return 'yellow';
    if (reason.toLowerCase().includes('sad') || reason.toLowerCase().includes('fear')) return 'blue';
    if (reason.toLowerCase().includes('anger')) return 'pink';
    return 'purple';
  }
  return 'white';
};

export function KeyMomentsDisplay({ moments }: KeyMomentsDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  if (!moments || moments.length === 0) {
    return (
      <Card variant="yellow" className="relative">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-black">
              <Target className="h-6 w-6" />
              NO EPIC MOMENTS DETECTED!
              <Sparkles className="h-6 w-6" />
            </CardTitle>
            <Button
              onClick={toggleVisibility}
              variant="ghost"
              size="sm"
              className="border-4 border-black"
            >
              {isVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </Button>
          </div>
        </CardHeader>
        {isVisible && (
          <CardContent>
            <Card variant="white" className="p-6 text-center">
              <div className="text-lg font-black text-black uppercase tracking-wider">
                NO EPIC MOMENTS DETECTED!
              </div>
              <div className="text-sm font-bold text-black/70 uppercase mt-2">
                Play a game to capture some chaos!
              </div>
            </Card>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card variant="yellow" className="relative">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-black">
            <Target className="h-6 w-6" />
            KEY MOMENTS OF CHAOS ({moments.length})
            <Sparkles className="h-6 w-6" />
          </CardTitle>
          <Button
            onClick={toggleVisibility}
            variant="ghost"
            size="sm"
            className="border-4 border-black"
          >
            {isVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </Button>
        </div>
      </CardHeader>
      
      {isVisible && (
        <CardContent>
          <div className="overflow-x-auto pb-4">
            <div className="flex space-x-6 min-w-max">
              {moments.map((moment, index) => (
                <div key={index} className="w-80 shrink-0">
                  <Card 
                    variant={getCardVariantForType(moment.type, moment.reason)} 
                    className="overflow-hidden h-full flex flex-col"
                  >
                    <CardHeader className="p-4 border-b-4 border-black bg-black/10">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getIconForReason(moment.reason, moment.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-black leading-tight line-clamp-2 text-black uppercase tracking-wide" title={moment.reason}>
                            {moment.reason}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <Card variant="white" className="px-2 py-1">
                              <span className="text-xs font-black text-black">
                                {moment.timestamp.toFixed(1)}S
                              </span>
                            </Card>
                            {moment.frameNumber && (
                              <Card variant="white" className="px-2 py-1">
                                <span className="text-xs font-black text-black">
                                  F:{moment.frameNumber}
                                </span>
                              </Card>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="p-0 flex-1 flex flex-col">
                      {/* Face Frame */}
                      <div className="flex-1 min-h-[120px] border-b-4 border-black relative bg-gradient-to-br from-purple-300 to-pink-300">
                        {moment.faceFrame ? (
                          <Image
                            src={moment.faceFrame.startsWith('data:') ? moment.faceFrame : `data:image/jpeg;base64,${moment.faceFrame}`}
                            alt={`Face at ${moment.timestamp.toFixed(1)}s`}
                            fill
                            className="object-cover"
                            loading="lazy"
                            unoptimized
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <ImageOff className="h-8 w-8 mb-2 text-black" />
                            <span className="text-xs font-black text-black uppercase">NO FACE CAPTURE</span>
                          </div>
                        )}
                        {/* Face Label */}
                        <Card variant="cyan" className="absolute top-2 left-2 px-2 py-1">
                          <span className="text-xs font-black text-black uppercase">FACE</span>
                        </Card>
                      </div>
                      
                      {/* Game Frame */}
                      <div className="flex-1 min-h-[120px] relative bg-gradient-to-br from-cyan-300 to-green-300">
                        {moment.gameFrame ? (
                          <Image
                            src={moment.gameFrame.startsWith('data:') ? moment.gameFrame : `data:image/jpeg;base64,${moment.gameFrame}`}
                            alt={`Game screen at ${moment.timestamp.toFixed(1)}s`}
                            fill
                            className="object-contain"
                            loading="lazy"
                            unoptimized
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <ImageOff className="h-8 w-8 mb-2 text-black" />
                            <span className="text-xs font-black text-black uppercase">NO GAME CAPTURE</span>
                          </div>
                        )}
                        {/* Game Label */}
                        <Card variant="orange" className="absolute top-2 left-2 px-2 py-1">
                          <span className="text-xs font-black text-black uppercase">GAME</span>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
          
          {moments.length > 3 && (
            <Card variant="white" className="mt-4 p-3 text-center">
              <div className="text-xs font-bold text-black uppercase tracking-wider">
                💡 Scroll horizontally to see all {moments.length} epic moments! 
              </div>
            </Card>
          )}
          
          {/* Summary Stats */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card variant="green" className="p-3 text-center">
              <div className="text-lg font-black text-black">
                {moments.filter(m => m.type === 'emotion_spike').length}
              </div>
              <div className="text-xs font-bold text-black uppercase">EMOTION SPIKES</div>
            </Card>
            
            <Card variant="purple" className="p-3 text-center">
              <div className="text-lg font-black text-black">
                {moments.filter(m => m.type === 'game_event').length}
              </div>
              <div className="text-xs font-bold text-black uppercase">GAME EVENTS</div>
            </Card>
            
            <Card variant="orange" className="p-3 text-center">
              <div className="text-lg font-black text-black">
                {Math.max(...moments.map(m => m.timestamp)).toFixed(1)}S
              </div>
              <div className="text-xs font-bold text-black uppercase">LAST MOMENT</div>
            </Card>
            
            <Card variant="cyan" className="p-3 text-center">
              <div className="text-lg font-black text-black">
                {((moments.filter(m => m.faceFrame).length / moments.length) * 100).toFixed(0)}%
              </div>
              <div className="text-xs font-bold text-black uppercase">FACE CAPTURED</div>
            </Card>
          </div>
        </CardContent>
      )}
    </Card>
  );
}