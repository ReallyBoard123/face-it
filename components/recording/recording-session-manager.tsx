// components/recording/recording-session-manager.tsx
'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VideoRecorder, VideoRecorderHandles } from '@/components/video/video-recorder';
import { ScreenRecorder, ScreenRecorderHandles } from '@/components/video/screen-recorder';
import { GameSelection } from '@/components/forms/game-selection';
import { WebsiteUrlInput } from '@/components/forms/website-url-input';
import { SessionStatus } from '@/components/recording/session-status';
import { Video, Target, Gamepad2, Globe, Sparkles, Zap } from 'lucide-react';

type GameType = "flappy_bird" | "stress_click" | "website_browse";
type GameFlowState = "idle" | "permissions_pending" | "permissions_denied" | "ready_to_start" | "game_active_recording" | "website_browsing_recording" | "analyzing" | "results_ready";

interface GameEventData {
  action?: string;
  [key: string]: unknown;
}

interface RecordingSessionManagerProps {
  // State from hooks
  flowState: GameFlowState;
  selectedGame: GameType;
  isScreenRecording: boolean;
  countdown: number;
  errorMessage: string | null;
  isAnalyzingBackend: boolean;
  
  // State setters
  setFlowState: (state: GameFlowState) => void;
  setSelectedGame: (game: GameType) => void;
  setIsScreenRecording: (recording: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  
  // Event handlers
  onVideoRecorded: (blob: Blob) => void;
  onScreenRecorded: (blob: Blob) => void;
  onGameEvent: (event: { type: string; data: GameEventData; timestamp: number }) => void;
  
  // Website session data
  websiteUrl: string;
  setWebsiteUrl: (url: string) => void;
  websiteTabRef: React.MutableRefObject<Window | null>;
  isValidUrl: (url: string) => boolean;
  openWebsiteTab: (url: string) => string;
  startTabMonitoring: (onTabClosed: () => void) => void;
  closeWebsiteTab: () => void;
  
  // Recording refs
  gameStartTimeRef: React.MutableRefObject<number | null>;
  startCountdown: () => void;
  resetFlow: () => void;
}

export function RecordingSessionManager({
  flowState,
  selectedGame,
  isScreenRecording,
  countdown,
  errorMessage,
  isAnalyzingBackend,
  setFlowState,
  setSelectedGame,
  setIsScreenRecording,
  setErrorMessage,
  onVideoRecorded,
  onScreenRecorded,
  onGameEvent,
  websiteUrl,
  setWebsiteUrl,
  websiteTabRef,
  isValidUrl,
  openWebsiteTab,
  startTabMonitoring,
  closeWebsiteTab,
  gameStartTimeRef,
  startCountdown,
  resetFlow,
}: RecordingSessionManagerProps) {
  const videoRecorderRef = useRef<VideoRecorderHandles>(null);
  const screenRecorderRef = useRef<ScreenRecorderHandles>(null);

  const requestWebcamPermissions = useCallback(async (): Promise<boolean> => {
    if (videoRecorderRef.current) {
      setFlowState("permissions_pending");
      setErrorMessage(null);
      const stream = await videoRecorderRef.current.requestPermissions();
      if (stream) {
        setFlowState("ready_to_start");
        return true;
      } else {
        setFlowState("permissions_denied");
        setErrorMessage("Webcam access denied. Enable in browser settings & refresh.");
        return false;
      }
    }
    return false;
  }, [setFlowState, setErrorMessage]);

  useEffect(() => {
    if (flowState === "idle" && videoRecorderRef.current) {
      requestWebcamPermissions();
    }
  }, [flowState, requestWebcamPermissions]);

  const handleScreenRecordingStarted = useCallback(() => {
    setIsScreenRecording(true);
  }, [setIsScreenRecording]);

  const handleScreenRecordingStopped = useCallback(() => {
    setIsScreenRecording(false);
  }, [setIsScreenRecording]);

  const handleStopWebsiteBrowsing = useCallback(() => {
    if (flowState !== "website_browsing_recording") return;
    
    window.removeEventListener('beforeunload', handleStopWebsiteBrowsing);
    closeWebsiteTab();

    const endTime = gameStartTimeRef.current ? (Date.now() - gameStartTimeRef.current) / 1000 : 0;
    onGameEvent({
      type: 'website_interaction',
      data: { action: 'Finished browsing session' },
      timestamp: endTime
    });

    if (videoRecorderRef.current) {
      videoRecorderRef.current.stopRecording();
    }
    if (screenRecorderRef.current) {
      screenRecorderRef.current.stopRecording();
    }
  }, [flowState, closeWebsiteTab, gameStartTimeRef, onGameEvent]);

  const startWebsiteBrowsingSession = useCallback(async () => {
    if (!videoRecorderRef.current) {
      setErrorMessage("Video recorder not ready.");
      return;
    }
    if (!websiteUrl.trim()) {
      setErrorMessage("Please enter a website URL.");
      return;
    }
    if (!isValidUrl(websiteUrl.trim())) {
      setErrorMessage("Please enter a valid website URL.");
      return;
    }

    gameStartTimeRef.current = Date.now();

    try {
      await videoRecorderRef.current.startRecording();
      
      if (screenRecorderRef.current) {
        await screenRecorderRef.current.startRecording();
      }
      
      const normalizedUrl = openWebsiteTab(websiteUrl.trim());
      
      setFlowState("website_browsing_recording");
      
      onGameEvent({
        type: 'website_interaction',
        data: { action: `Started browsing ${normalizedUrl}` },
        timestamp: 0
      });

      startTabMonitoring(() => {
        handleStopWebsiteBrowsing();
      });

      window.addEventListener('beforeunload', handleStopWebsiteBrowsing);
    } catch (err: unknown) {
      console.error("Website browsing start failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Could not start website browsing session.";
      setErrorMessage(errorMessage);
      setFlowState("ready_to_start");
    }
  }, [websiteUrl, isValidUrl, openWebsiteTab, gameStartTimeRef, setFlowState, onGameEvent, startTabMonitoring, setErrorMessage, handleStopWebsiteBrowsing]);

  const handleStartGameAndRecording = async () => {
    if (!videoRecorderRef.current) {
      setErrorMessage("Video recorder not ready.");
      return;
    }
    if (flowState === "permissions_denied") {
      const granted = await requestWebcamPermissions();
      if (!granted) return;
    }
    if (flowState !== "ready_to_start") {
      setErrorMessage(
        (flowState === "idle" || flowState === "permissions_pending") 
          ? "Grant webcam permissions." 
          : `Cannot start in state: ${flowState.replace(/_/g, ' ')}`
      );
      return;
    }

    if (selectedGame === "website_browse") {
      return startWebsiteBrowsingSession();
    }

    gameStartTimeRef.current = Date.now();

    try {
      await videoRecorderRef.current.startRecording();
      
      if (screenRecorderRef.current) {
        await screenRecorderRef.current.startRecording();
      }

      setFlowState("game_active_recording");
      startCountdown();

      setTimeout(() => {
        if (screenRecorderRef.current) {
          screenRecorderRef.current.stopRecording();
        }
      }, 30000);
    } catch (err: unknown) {
      console.error("Recording start failed:", err);
      setErrorMessage("Could not start recording.");
      setFlowState("ready_to_start");
    }
  };

  const getSessionTitle = () => {
    switch(selectedGame) {
      case 'stress_click': return 'STRESS CLICK CHAOS';
      case 'flappy_bird': return 'FLAPPY BIRD MADNESS';
      case 'website_browse': return 'WEBSITE ADVENTURE';
      default: return 'RECORDING SESSION';
    }
  };

  const getSessionIcon = () => {
    switch(selectedGame) {
      case 'stress_click': return <Target className="h-6 w-6" />;
      case 'flappy_bird': return <Gamepad2 className="h-6 w-6" />;
      case 'website_browse': return <Globe className="h-6 w-6" />;
      default: return <Video className="h-6 w-6" />;
    }
  };

  // Card variant logic removed as it was unused
  return (
    <>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-black">
          {getSessionIcon()}
          <Sparkles className="h-5 w-5" />
          RECORDING SETUP
          <Zap className="h-5 w-5" />
        </CardTitle>
        {(flowState !== "game_active_recording" && flowState !== "website_browsing_recording") && (
          <CardDescription className="text-black font-bold uppercase tracking-wide">
            Camera and screen recording for {getSessionTitle()}.
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="flex-grow flex flex-col items-center justify-center pt-4 space-y-6">
        {/* Webcam Section */}
        <div className="w-full max-w-lg">
          <VideoRecorder 
            ref={videoRecorderRef} 
            onVideoRecorded={onVideoRecorded} 
            onRecordingStopped={flowState === "website_browsing_recording" ? handleStopWebsiteBrowsing : undefined}
            isAnalyzing={isAnalyzingBackend || flowState === "analyzing"} 
            recordingDuration={selectedGame === 'website_browse' ? undefined : 30}
            showControls={flowState === "website_browsing_recording"}
          />

          {/* Screen Recording Section */}
          {(flowState === "ready_to_start" || flowState === "idle" || flowState === "permissions_denied") && (
            <div className="mt-4">
              <ScreenRecorder
                ref={screenRecorderRef}
                onScreenRecorded={onScreenRecorded}
                recordingMode={selectedGame === 'website_browse' ? 'any_screen' : 'current_tab'}
                isRecording={isScreenRecording}
                onRecordingStarted={handleScreenRecordingStarted}
                onRecordingStopped={handleScreenRecordingStopped}
              />
            </div>
          )}
        </div>
        
        {/* Game Selection and URL Input */}
        {(flowState === "ready_to_start" || flowState === "idle" || flowState === "permissions_denied") && (
          <div className="w-full max-w-lg space-y-6">
            <GameSelection 
              selectedGame={selectedGame} 
              onGameChange={setSelectedGame} 
            />
            
            {selectedGame === "website_browse" && (
              <WebsiteUrlInput 
                websiteUrl={websiteUrl} 
                onUrlChange={setWebsiteUrl} 
              />
            )}
          </div>
        )}

        {/* Session Status */}
        <SessionStatus
          flowState={flowState}
          countdown={countdown}
          isScreenRecording={isScreenRecording}
          websiteTabRef={websiteTabRef}
          errorMessage={errorMessage}
          onRequestPermissions={requestWebcamPermissions}
          onStartSession={handleStartGameAndRecording}
          onStopWebsiteBrowsing={handleStopWebsiteBrowsing}
          onNewSession={resetFlow}
          getSessionTitle={getSessionTitle}
        />
      </CardContent>
    </>
  );
}