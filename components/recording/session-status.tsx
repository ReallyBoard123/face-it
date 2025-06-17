// components/recording/session-status.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Play, Monitor } from 'lucide-react';

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
  const formatTime = (seconds: number) => {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  if (errorMessage) {
    return (
      <Alert variant="destructive" className="mt-3 w-full max-w-md text-xs md:text-sm">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  if (flowState === "permissions_pending") {
    return (
      <div className="mt-3 text-center text-sm">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-1" />
        Awaiting permission...
      </div>
    );
  }

  if (flowState === "permissions_denied") {
    return (
      <Button onClick={onRequestPermissions} className="mt-3 text-xs md:text-sm">
        Grant Permissions
      </Button>
    );
  }

  if (flowState === "ready_to_start") {
    return (
      <Button onClick={onStartSession} size="lg" className="mt-4 w-full max-w-xs text-sm md:text-base">
        <Play className="mr-2 h-5 w-5" />
        Start {getSessionTitle()}
      </Button>
    );
  }

  if (flowState === "game_active_recording") {
    return (
      <div className="mt-3 text-center p-2 md:p-3 bg-primary/10 rounded-md w-full max-w-md">
        <div className="flex items-center justify-center text-sm md:text-lg font-semibold text-primary mb-0.5 md:mb-1">
          <Loader2 className="h-4 w-4 md:h-5 md:w-5 mr-2 animate-spin" /> Recording...
        </div>
        <p className="text-xl md:text-2xl font-mono">{formatTime(countdown)}</p>
        <p className="text-xs text-muted-foreground">Focus on the game!</p>
        {isScreenRecording && (
          <div className="flex items-center justify-center mt-2 text-xs text-blue-600">
            <Monitor className="h-3 w-3 mr-1" />
            Screen recording active
          </div>
        )}
      </div>
    );
  }

  if (flowState === "website_browsing_recording") {
    return (
      <div className="mt-3 text-center p-2 md:p-3 bg-primary/10 rounded-md w-full max-w-md">
        <div className="flex items-center justify-center text-sm md:text-lg font-semibold text-primary mb-0.5 md:mb-1">
          <Loader2 className="h-4 w-4 md:h-5 md:w-5 mr-2 animate-spin" /> Recording...
        </div>
        <p className="text-sm text-muted-foreground">Browse the website in the new tab</p>
        <p className="text-xs text-muted-foreground mt-1">
          {websiteTabRef.current ? "Close the tab when finished" : "Click 'Stop Recording' when finished browsing"}
        </p>
        {isScreenRecording && (
          <div className="flex items-center justify-center mt-2 text-xs text-blue-600">
            <Monitor className="h-3 w-3 mr-1" />
            Screen recording active
          </div>
        )}
        <Button 
          onClick={onStopWebsiteBrowsing}
          variant="outline"
          size="sm"
          className="mt-2 text-xs"
        >
          Stop Recording
        </Button>
      </div>
    );
  }

  if (flowState === "analyzing" || flowState === "results_ready") {
    return (
      <Button onClick={onNewSession} variant="outline" className="mt-4 w-full max-w-xs text-sm md:text-base">
        New Session
      </Button>
    );
  }

  return null;
}