// hooks/use-recording-flow.ts
import { useState, useRef, useCallback } from 'react';

type GameFlowState =
  | "idle" | "permissions_pending" | "permissions_denied" | "ready_to_start"
  | "game_active_recording" | "website_browsing_recording" | "analyzing" | "results_ready";

type GameType = "flappy_bird" | "stress_click" | "website_browse";

const DEFAULT_GAME_DURATION_SECONDS = 30;

export function useRecordingFlow() {
  const [flowState, setFlowState] = useState<GameFlowState>("idle");
  const [selectedGame, setSelectedGame] = useState<GameType>("stress_click");
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedScreenBlob, setRecordedScreenBlob] = useState<Blob | null>(null);
  const [isAnalyzingBackend, setIsAnalyzingBackend] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_GAME_DURATION_SECONDS);

  const gameStartTimeRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetFlow = useCallback(() => {
    setRecordedVideoBlob(null);
    setRecordedScreenBlob(null);
    setAnalysisResults(null);
    setIsAnalyzingBackend(false);
    setErrorMessage(null);
    setCountdown(DEFAULT_GAME_DURATION_SECONDS);
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    gameStartTimeRef.current = null;
    setFlowState("idle");
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(DEFAULT_GAME_DURATION_SECONDS);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    
    recordingTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(recordingTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopCountdown = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  return {
    // State
    flowState,
    selectedGame,
    recordedVideoBlob,
    recordedScreenBlob,
    isAnalyzingBackend,
    analysisResults,
    errorMessage,
    isScreenRecording,
    countdown,
    gameStartTimeRef,
    
    // Actions
    setFlowState,
    setSelectedGame,
    setRecordedVideoBlob,
    setRecordedScreenBlob,
    setIsAnalyzingBackend,
    setAnalysisResults,
    setErrorMessage,
    setIsScreenRecording,
    resetFlow,
    startCountdown,
    stopCountdown,
    
    // Constants
    DEFAULT_GAME_DURATION_SECONDS,
  };
}