// components/recording/session-status.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Play, Monitor, Zap, Target, AlertTriangle, Sparkles, Clock } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

type GameFlowState = "idle" | "permissions_pending" | "permissions_denied" | "ready_to_start" | "game_active_recording" | "website_browsing_recording" | "analyzing" | "results_ready";

interface SessionStatusProps {
  flowState: GameFlowState;
  countdown: number;
  isScreenRecording: boolean;
  websiteTabRef: React.MutableRefObject<Window | null>;
  errorMessage: string | null;
  onRequestPermissions: () => void;
  onStartSession: () => void;
  onStopWebsiteBrowsing: () => void;
  onNewSession: () => void;
  getSessionTitle: () => string;
}

export function SessionStatus({
  flowState,
  countdown,
  isScreenRecording,
  websiteTabRef,
  errorMessage,
  onRequestPermissions,
  onStartSession,
  onStopWebsiteBrowsing,
  onNewSession,
  getSessionTitle,
}: SessionStatusProps) {
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(cooldown);
  
  // Keep the ref in sync with state
  useEffect(() => {
    cooldownRef.current = cooldown;
  }, [cooldown]);

  useEffect(() => {
    if (flowState !== 'results_ready') {
      // Reset cooldown when not in results_ready state
      if (cooldownRef.current > 0) {
        setCooldown(0);
      }
      return;
    }
    
    // Set initial cooldown when entering results_ready
    setCooldown(10);
    
    // Set up the countdown timer
    const timer = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Clean up the interval when component unmounts or flowState changes
    return () => clearInterval(timer);
  }, [flowState]); // Only depend on flowState
  const formatTime = (seconds: number) => {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  if (errorMessage) {
    return (
      <Card variant="pink" className="mt-4 p-4">
        <div className="flex items-center gap-3 text-black">
          <AlertTriangle className="h-6 w-6" />
          <div>
            <div className="font-black uppercase text-lg">ERROR DETECTED!</div>
            <div className="font-bold text-sm">{errorMessage}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (flowState === "permissions_pending") {
    return (
      <Card variant="yellow" className="mt-4 p-6 text-center neo-pulse">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-black" />
        <div className="font-black uppercase text-lg text-black">REQUESTING PERMISSIONS...</div>
      </Card>
    );
  }

  if (flowState === "permissions_denied") {
    return (
      <Button 
        onClick={onRequestPermissions} 
        variant="warning"
        size="xl"
        className="mt-4 w-full"
      >
        <Zap className="mr-3 h-6 w-6" />
        GRANT PERMISSIONS NOW!
      </Button>
    );
  }

  if (flowState === "ready_to_start") {
    return (
      <Button 
        onClick={onStartSession} 
        variant="success"
        size="xl" 
        className="mt-6 w-full"
      >
        <Play className="mr-3 h-6 w-6" />
        START {getSessionTitle().toUpperCase()}!
      </Button>
    );
  }

  if (flowState === "game_active_recording") {
    return (
      <Card variant="pink" className="mt-4 p-6 text-center neo-pulse">
        <div className="flex items-center justify-center text-black mb-3">
          <Loader2 className="h-6 w-6 mr-3 animate-spin" />
          <span className="font-black text-xl uppercase">RECORDING CHAOS!</span>
        </div>
        
        <div className="text-4xl font-black font-mono text-black mb-2">
          {formatTime(countdown)}
        </div>
        
        <div className="text-sm font-bold text-black/80 uppercase tracking-wider mb-4">
          FOCUS ON THE GAME!
        </div>
        
        {isScreenRecording && (
          <Card variant="cyan" className="p-3 inline-block">
            <div className="flex items-center text-black font-bold text-xs uppercase">
              <Monitor className="h-4 w-4 mr-2" />
              SCREEN CAPTURE ACTIVE
            </div>
          </Card>
        )}
      </Card>
    );
  }

  if (flowState === "website_browsing_recording") {
    return (
      <Card variant="cyan" className="mt-4 p-6 text-center neo-pulse">
        <div className="flex items-center justify-center text-black mb-4">
          <Loader2 className="h-6 w-6 mr-3 animate-spin" />
          <span className="font-black text-xl uppercase">RECORDING WEB SURF!</span>
        </div>
        
        <div className="space-y-4">
          <div className="text-sm font-bold text-black uppercase tracking-wide">
            Browse the website in the new tab
          </div>
          
          <div className="text-xs font-bold text-black/70 uppercase">
            {websiteTabRef.current ? "Close the tab when finished" : "Click 'STOP' when finished browsing"}
          </div>
          
          {isScreenRecording && (
            <Card variant="green" className="p-3 inline-block mb-4">
              <div className="flex items-center text-black font-bold text-xs uppercase">
                <Monitor className="h-4 w-4 mr-2" />
                SCREEN CAPTURE ACTIVE
              </div>
            </Card>
          )}
          
          <Button 
            onClick={onStopWebsiteBrowsing}
            variant="destructive"
            size="lg"
            className="mt-4"
          >
            <Target className="mr-2 h-5 w-5" />
            STOP RECORDING
          </Button>
        </div>
      </Card>
    );
  }

  if (flowState === "analyzing") {
    return (
      <Button 
        variant="purple"
        size="xl" 
        className="mt-6 w-full"
        disabled
      >
        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
        ANALYZING...
      </Button>
    );
  }

  if (flowState === "results_ready") {
    return (
      <Button 
        onClick={cooldown === 0 ? onNewSession : undefined} 
        variant="purple"
        size="xl" 
        className="mt-6 w-full relative overflow-hidden"
        disabled={cooldown > 0}
      >
        <div className="flex items-center justify-center w-full">
          {cooldown > 0 ? (
            <>
              <Clock className="mr-3 h-6 w-6" />
              PLEASE WAIT {cooldown}s
            </>
          ) : (
            <>
              <Sparkles className="mr-3 h-6 w-6" />
              NEW SESSION!
            </>
          )}
        </div>
        {cooldown > 0 && (
          <div 
            className="absolute bottom-0 left-0 h-1 bg-black/10 transition-all duration-1000 ease-linear"
            style={{ width: `${(cooldown / 10) * 100}%` }}
          />
        )}
      </Button>
    );
  }

  return null;
}