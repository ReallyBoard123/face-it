// app/page.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardGrid } from '@/components/layout/dashboard-grid';
import { VideoRecorder, VideoRecorderHandles } from '@/components/video/video-recorder';
import { VideoPreview } from '@/components/video/video-preview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Play, Loader2, AlertTriangle, Video, Gamepad2, Target } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StressClickGame } from '@/components/games/stress-click-games'; // Adjusted path
import FlappyBirdGame from '@/components/games/flappy-bird'; // Adjusted path
import html2canvas from 'html2canvas';
import { KeyMoment } from '@/components/analysis/key-moments-display'; 

// For type safety with settings passed to backend
type AnalysisTypeString = "emotions" | "aus" | "combined" | "landmarks";
type VisualizationStyleString = "timeline" | "heatmap" | "distribution";

type GameFlowState =
  | "idle" | "permissions_pending" | "permissions_denied" | "ready_to_start"
  | "game_active_recording" | "analyzing" | "results_ready";
type GameType = "flappy_bird" | "stress_click";

const CAPTURE_DELAY_MS = 150; 
const RECORDING_DURATION_SECONDS = 30;

export default function Home() {
  const [settings, setSettings] = useState({
    frameSkip: 30, 
    analysisType: 'emotions' as AnalysisTypeString,
    visualizationStyle: 'timeline' as VisualizationStyleString, 
    detectionThreshold: 0.5, 
    batchSize: 1,
  });
  const [selectedGame, setSelectedGame] = useState<GameType>("stress_click");
  const [flowState, setFlowState] = useState<GameFlowState>("idle");
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [isAnalyzingBackend, setIsAnalyzingBackend] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameEvents, setGameEvents] = useState<Array<{ type: string; data: any; timestamp: number }>>([]);
  const [gameKeyMoments, setGameKeyMoments] = useState<KeyMoment[]>([]);

  const videoRecorderRef = useRef<VideoRecorderHandles>(null);
  const gameStartTimeRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState(RECORDING_DURATION_SECONDS);

  const requestWebcamPermissions = useCallback(async (): Promise<boolean> => {
    if (videoRecorderRef.current) {
      setFlowState("permissions_pending"); setErrorMessage(null);
      const stream = await videoRecorderRef.current.requestPermissions();
      if (stream) { setFlowState("ready_to_start"); return true; } 
      else { setFlowState("permissions_denied"); setErrorMessage("Webcam access denied. Enable in browser settings & refresh."); return false; }
    }
    return false;
  }, []);

  useEffect(() => {
    if (flowState === "idle" && videoRecorderRef.current) { requestWebcamPermissions(); }
  }, [flowState, requestWebcamPermissions]);

  const captureGameScreen = useCallback(async (): Promise<string | null> => {
    const gameContainerId = selectedGame === 'stress_click' 
                            ? 'stress-click-game-area-ref-id' 
                            : 'flappy-bird-game-area';
    const gameAreaElement = document.getElementById(gameContainerId);
    
    if (gameAreaElement) {
      try {
        const canvas = await html2canvas(gameAreaElement, { 
          useCORS: true, logging: false, width: gameAreaElement.offsetWidth, 
          height: gameAreaElement.offsetHeight, scale: 0.75 
        });
        return canvas.toDataURL('image/jpeg', 0.6);
      } catch (error) {
        console.error("Error capturing game screen for", selectedGame, ":", error);
        setErrorMessage(`Failed to capture game screen.`);
        return null;
      }
    }
    console.warn("Game area element not found for screen capture:", gameContainerId);
    return null;
  }, [selectedGame]);

  const handleGameEvent = useCallback(async (event: { type: string; data: any; timestamp: number }) => {
    // Defer state updates to avoid "Cannot update a component while rendering another"
    setTimeout(async () => {
        setGameEvents(prev => [...prev, event]);

        let isKeyGameTrigger = false;
        let reason = "";
        const event_ts_seconds = gameStartTimeRef.current ? (Date.now() - gameStartTimeRef.current) / 1000 : event.timestamp;

        if (event.type === 'difficulty_change') {
            isKeyGameTrigger = true;
            reason = `StressClick: Level ${event.data.from} → ${event.data.to}`;
        } else if (event.type === 'flappy_bird_score_update') {
            isKeyGameTrigger = true;
            reason = `Flappy Bird: Score ${event.data.score}`;
        } else if (event.type === 'flappy_bird_game_over') {
            isKeyGameTrigger = true;
            reason = `Flappy Bird: Game Over (Score: ${event.data.finalScore})`;
        }

        if (isKeyGameTrigger && videoRecorderRef.current) {
            await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY_MS));

            const faceFrameData = videoRecorderRef.current.captureFrame();
            const gameFrameData = await captureGameScreen(); 

            setGameKeyMoments(prev => [
                ...prev,
                {
                    timestamp: event_ts_seconds,
                    reason,
                    faceFrame: faceFrameData,
                    gameFrame: gameFrameData,
                    type: 'game_event'
                }
            ]);
        }
    }, 0);
  }, [videoRecorderRef, selectedGame, captureGameScreen]); // Removed setGameEvents, setGameKeyMoments as they are stable

  const handleStartGameAndRecording = async () => {
    if (!videoRecorderRef.current) { setErrorMessage("Video recorder not ready."); return; }
    if (flowState === "permissions_denied") {
      const granted = await requestWebcamPermissions(); if (!granted) return;
    }
    if (flowState !== "ready_to_start") {
      setErrorMessage( (flowState === "idle" || flowState === "permissions_pending") ? "Grant webcam permissions." : `Cannot start in state: ${flowState.replace(/_/g, ' ')}`);
      return;
    }
    setRecordedVideoBlob(null); setAnalysisResults(null); setErrorMessage(null);
    setGameEvents([]); setGameKeyMoments([]);
    setCountdown(RECORDING_DURATION_SECONDS);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    gameStartTimeRef.current = Date.now();

    videoRecorderRef.current?.startRecording()
      .then(() => {
        setFlowState("game_active_recording");
        setCountdown(RECORDING_DURATION_SECONDS); 
        if(recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = setInterval(() => {
          setCountdown(prev => { if (prev <= 1) { clearInterval(recordingTimerRef.current!); return 0; } return prev - 1; });
        }, 1000);
      })
      .catch(err => { console.error("Rec start fail:", err); setErrorMessage("Could not start recording."); setFlowState("ready_to_start"); });
  };

  const handleVideoRecordedByRecorder = (blob: Blob) => {
    if(recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordedVideoBlob(blob); setFlowState("analyzing"); analyzeVideo(blob);
  };

  const analyzeVideo = async (videoBlob: Blob) => {
    if (!videoBlob) return;
    setIsAnalyzingBackend(true); setErrorMessage(null);
    const formData = new FormData();
    formData.append('file', videoBlob, 'gameplay-recording.webm');
    formData.append('settings', JSON.stringify(settings));
    try {
      const response = await fetch('http://localhost:8000/analyze-video', { method: 'POST', body: formData });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.detail?.message || 'Analysis server error.'); }
      const data = await response.json();
      if (data.status === "nodata"){
        setErrorMessage(data.message || "No analysis data returned from server.");
        setAnalysisResults(null); // Clear previous results
        setFlowState("ready_to_start"); // Or a specific 'nodata_ready' state
      } else {
        setAnalysisResults(data);
        setFlowState("results_ready");
      }
    } catch (error) {
      console.error('Analysis fetch error:', error);
      setErrorMessage(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      setFlowState("ready_to_start");
    } finally { setIsAnalyzingBackend(false); }
  };

  const PageHeader = () => {
    const { toggleSidebar } = useSidebar();
    const isGameActive = flowState === 'game_active_recording';
    return (
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
        {!isGameActive && <SidebarTrigger />}
        <Separator orientation="vertical" className={`mr-2 h-4 ${isGameActive ? 'hidden' : 'hidden md:flex'}`} />
        <div className="text-lg md:text-2xl font-bold">FaceIt Game Analysis</div>
        <div className="ml-auto text-sm text-muted-foreground capitalize hidden sm:block">{flowState.replace(/_/g, ' ')}</div>
      </header>
    );
  };

  const resetFlow = () => {
    setRecordedVideoBlob(null); setAnalysisResults(null); setIsAnalyzingBackend(false);
    setErrorMessage(null); setGameEvents([]); setGameKeyMoments([]);
    setCountdown(RECORDING_DURATION_SECONDS);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    gameStartTimeRef.current = null; setFlowState("idle"); 
  };

  return (
    <SidebarProvider>
      {flowState !== 'game_active_recording' && (<AppSidebar settings={settings} onSettingsChange={setSettings} />)}
      <SidebarInset>
        <PageHeader />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <div className={`grid gap-4 md:gap-6 ${flowState === 'game_active_recording' ? 'grid-cols-1 md:grid-cols-3 h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6rem)]' : 'grid-cols-1'}`}>
            <div className={`${flowState === 'game_active_recording' ? 'md:col-span-1' : 'max-w-2xl mx-auto w-full'}`}>
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3 md:pb-4"><CardTitle className="flex items-center gap-2 text-base md:text-lg"><Video className="h-5 w-5 md:h-6 md:w-6" /> Webcam</CardTitle>
                  {flowState !== "game_active_recording" && <CardDescription className="text-xs md:text-sm">Live preview.</CardDescription>}
                </CardHeader>
                <CardContent className="flex-grow flex flex-col items-center justify-center pt-0">
                  <div className="w-full aspect-[16/9] max-w-md bg-muted rounded-md overflow-hidden mb-3">
                     <VideoRecorder ref={videoRecorderRef} onVideoRecorded={handleVideoRecordedByRecorder} isAnalyzing={isAnalyzingBackend || flowState === "analyzing"} recordingDuration={RECORDING_DURATION_SECONDS} showControls={false}/>
                  </div>
                  {(flowState === "ready_to_start" || flowState === "idle" || flowState === "permissions_denied") && (
                    <div className="mt-2 w-full max-w-md"><Tabs value={selectedGame} onValueChange={(v) => setSelectedGame(v as GameType)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 h-10">
                          <TabsTrigger value="stress_click" className="text-xs md:text-sm"><Target className="h-4 w-4 mr-1 md:mr-2" />Stress Click</TabsTrigger>
                          <TabsTrigger value="flappy_bird" className="text-xs md:text-sm"><Gamepad2 className="h-4 w-4 mr-1 md:mr-2" />Flappy Bird</TabsTrigger>
                        </TabsList></Tabs>
                    </div>)}
                  {errorMessage && (<Alert variant="destructive" className="mt-3 w-full max-w-md text-xs md:text-sm"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorMessage}</AlertDescription></Alert>)}
                  {flowState === "permissions_pending" && ( <div className="mt-3 text-center text-sm"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-1" />Awaiting permission...</div>)}
                  {flowState === "permissions_denied" && (<Button onClick={requestWebcamPermissions} className="mt-3 text-xs md:text-sm">Grant Permissions</Button>)}
                  {flowState === "ready_to_start" && (<Button onClick={handleStartGameAndRecording} size="lg" className="mt-4 w-full max-w-xs text-sm md:text-base"><Play className="mr-2 h-5 w-5" />Start {selectedGame === 'stress_click' ? 'Stress Click' : 'Flappy Bird'}</Button>)}
                  {flowState === "game_active_recording" && (
                     <div className="mt-3 text-center p-2 md:p-3 bg-primary/10 rounded-md w-full max-w-md">
                        <div className="flex items-center justify-center text-sm md:text-lg font-semibold text-primary mb-0.5 md:mb-1"><Loader2 className="h-4 w-4 md:h-5 md:w-5 mr-2 animate-spin" /> Recording...</div>
                        <p className="text-xl md:text-2xl font-mono">{String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}</p>
                        <p className="text-xs text-muted-foreground">Focus on the game!</p></div>)}
                  {(flowState === "analyzing" || flowState === "results_ready" || recordedVideoBlob) && flowState !== "game_active_recording" && (
                     <Button onClick={resetFlow} variant="outline" className="mt-4 w-full max-w-xs text-sm md:text-base"> New Session</Button>)}
                </CardContent>
              </Card>
            </div>
            {flowState === "game_active_recording" && (
              <div className="md:col-span-2 h-full" id={selectedGame === 'stress_click' ? 'stress-click-game-area-ref-id' : 'flappy-bird-game-area'}>
                <Card className="h-full flex flex-col"><CardHeader className="py-3 md:py-4"><CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      {selectedGame === 'stress_click' ? <><Target className="h-5 w-5" />Stress Click</> : <><Gamepad2 className="h-5 w-5" />Flappy Bird</>}
                    </CardTitle></CardHeader>
                  <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2 overflow-hidden">
                    {selectedGame === 'stress_click' ? (<StressClickGame duration={RECORDING_DURATION_SECONDS} onGameEvent={handleGameEvent} />) 
                                                     : (<FlappyBirdGame onGameEvent={handleGameEvent} />)}
                  </CardContent></Card>
              </div>)}
            {(flowState === "analyzing" && !isAnalyzingBackend && recordedVideoBlob) && (
                <div className="col-span-1 md:col-span-3 mt-4 md:mt-6 text-center"><Card><CardHeader><CardTitle className="text-base md:text-lg">Processing Error</CardTitle></CardHeader>
                  <CardContent><p className="text-sm">Issue initiating analysis. Preview video.</p><div className="max-w-sm md:max-w-md mx-auto my-3 md:my-4"><VideoPreview videoBlob={recordedVideoBlob} /></div>
                  <Button onClick={() => analyzeVideo(recordedVideoBlob)} className="text-xs md:text-sm">Retry Analysis</Button></CardContent></Card></div>)}
            {flowState === "analyzing" && isAnalyzingBackend && (
                 <div className="col-span-1 md:col-span-3 mt-4 md:mt-6 text-center"><Card><CardHeader><CardTitle className="text-base md:text-lg">Analyzing Gameplay...</CardTitle></CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 py-8 md:py-10"><Loader2 className="h-12 w-12 md:h-16 md:w-16 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">This may take a few moments.</p>
                      {recordedVideoBlob && (<details className="text-xs text-muted-foreground cursor-pointer"><summary>Show video preview</summary><div className="max-w-xs mx-auto mt-2"><VideoPreview videoBlob={recordedVideoBlob} /></div></details>)}
                    </CardContent></Card></div>)}
            {flowState === "results_ready" && analysisResults && (
              <div className="col-span-1 md:col-span-3 mt-4 md:mt-6">
                <DashboardGrid settings={settings} initialResults={analysisResults} videoBlob={recordedVideoBlob || undefined} gameEvents={gameEvents} gameKeyMoments={gameKeyMoments} />
              </div>)}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}