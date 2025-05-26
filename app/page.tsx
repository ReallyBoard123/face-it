// app/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { StressClickGame } from '../components/games/stress-click-games';

type GameFlowState =
  | "idle"
  | "permissions_pending"
  | "permissions_denied"
  | "ready_to_start"
  | "game_active_recording"
  | "analyzing"
  | "results_ready";

type GameType = "flappy_bird" | "stress_click";

const RECORDING_DURATION_SECONDS = 30;
const FLAPPY_BIRD_EMBED_URL = "https://remarkablegames.org/flappy-bird/";

export default function Home() {
  const [settings, setSettings] = useState({
    frameSkip: 30,
    analysisType: 'emotions',
    visualizationStyle: 'timeline',
    detectionThreshold: 0.5,
    batchSize: 4,
  });
  const [selectedGame, setSelectedGame] = useState<GameType>("stress_click");
  const [flowState, setFlowState] = useState<GameFlowState>("idle");
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [isAnalyzingBackend, setIsAnalyzingBackend] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameEvents, setGameEvents] = useState<Array<{ type: string; data: any; timestamp: number }>>([]);

  const videoRecorderRef = useRef<VideoRecorderHandles>(null);
  const gameIframeRef = useRef<HTMLIFrameElement>(null);
  const [gameIframeKey, setGameIframeKey] = useState(Date.now());

  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState(RECORDING_DURATION_SECONDS);

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
        setErrorMessage("Webcam access denied. Please enable permissions in your browser settings and refresh.");
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (flowState === "idle" && videoRecorderRef.current) {
      requestWebcamPermissions();
    }
  }, [flowState, requestWebcamPermissions]);

  const handleGameEvent = useCallback((event: { type: string; data: any; timestamp: number }) => {
    setGameEvents(prev => [...prev, event]);
  }, []);

  const handleStartGameAndRecording = async () => {
    if (!videoRecorderRef.current) {
      setErrorMessage("Video recorder component is not yet available.");
      return;
    }

    if (flowState === "permissions_denied") {
      const permissionGranted = await requestWebcamPermissions();
      if (!permissionGranted) return;
    }
    
    if (flowState !== "ready_to_start") {
      if (flowState === "idle" || flowState === "permissions_pending" || flowState === "permissions_denied") {
        setErrorMessage("Please grant webcam permissions to start.");
      } else {
        setErrorMessage(`Cannot start game in current state: ${flowState.replace(/_/g, ' ')}`);
      }
      return;
    }

    setRecordedVideoBlob(null);
    setAnalysisResults(null);
    setErrorMessage(null);
    setGameEvents([]);
    setGameIframeKey(Date.now());

    videoRecorderRef.current?.startRecording()
      .then(() => {
        setFlowState("game_active_recording");
        setCountdown(RECORDING_DURATION_SECONDS);
        if(recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(recordingTimerRef.current!);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      })
      .catch(err => {
        console.error("Failed to start recording:", err);
        setErrorMessage("Could not start recording. Check camera permissions or try refreshing.");
        setFlowState("ready_to_start");
      });
  };

  const handleVideoRecordedByRecorder = (blob: Blob) => {
    if(recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordedVideoBlob(blob);
    setFlowState("analyzing");
    analyzeVideo(blob);
  };

  const analyzeVideo = async (videoBlob: Blob) => {
    if (!videoBlob) return;
    setIsAnalyzingBackend(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', videoBlob, 'gameplay-recording.webm');
    formData.append('settings', JSON.stringify(settings));

    try {
      const response = await fetch('http://localhost:8000/analyze-video', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Video analysis failed on the server.');
      }
      const data = await response.json();
      setAnalysisResults(data);
      setFlowState("results_ready");
    } catch (error) {
      console.error('Analysis error:', error);
      setErrorMessage(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      setFlowState("ready_to_start");
    } finally {
      setIsAnalyzingBackend(false);
    }
  };

  const PageHeader = () => {
    const { toggleSidebar } = useSidebar();
    const isGameActive = flowState === 'game_active_recording';
    return (
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
        {!isGameActive && <SidebarTrigger />}
        <Separator orientation="vertical" className={`mr-2 h-4 ${isGameActive ? 'hidden' : 'hidden md:flex'}`} />
        <div className="text-2xl font-bold">FaceIt Game Analysis</div>
        <div className="text-sm text-muted-foreground capitalize">
          {flowState.replace(/_/g, ' ')}
        </div>
      </header>
    );
  };

  const resetFlow = () => {
    setRecordedVideoBlob(null);
    setAnalysisResults(null);
    setIsAnalyzingBackend(false);
    setErrorMessage(null);
    setGameEvents([]);
    setCountdown(RECORDING_DURATION_SECONDS);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    requestWebcamPermissions();
  };

  return (
    <SidebarProvider>
      {flowState !== 'game_active_recording' && (
        <AppSidebar settings={settings} onSettingsChange={setSettings} />
      )}
      <SidebarInset>
        <PageHeader />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className={`grid gap-6 ${flowState === 'game_active_recording' ? 'grid-cols-1 md:grid-cols-3 h-[calc(100vh-8rem)]' : 'grid-cols-1'}`}>
            <div className={`${flowState === 'game_active_recording' ? 'md:col-span-1' : 'max-w-2xl mx-auto w-full'}`}>
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-6 w-6" /> Webcam Feed
                  </CardTitle>
                  {flowState !== "game_active_recording" && <CardDescription>Live preview of your webcam.</CardDescription>}
                </CardHeader>
                <CardContent className="flex-grow flex flex-col items-center justify-center">
                  <div className="w-full aspect-[16/9] max-w-md bg-muted rounded-md overflow-hidden">
                     <VideoRecorder
                        ref={videoRecorderRef}
                        onVideoRecorded={handleVideoRecordedByRecorder}
                        isAnalyzing={isAnalyzingBackend || flowState === "analyzing"}
                        recordingDuration={RECORDING_DURATION_SECONDS}
                        showControls={false}
                     />
                  </div>
                  
                  {/* Game Selection */}
                  {(flowState === "ready_to_start" || flowState === "idle") && (
                    <div className="mt-4 w-full max-w-md">
                      <Tabs value={selectedGame} onValueChange={(value) => setSelectedGame(value as GameType)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="stress_click" className="flex items-center gap-1">
                            <Target className="h-4 w-4" />
                            Stress Click
                          </TabsTrigger>
                          <TabsTrigger value="flappy_bird" className="flex items-center gap-1">
                            <Gamepad2 className="h-4 w-4" />
                            Flappy Bird
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="stress_click" className="mt-2 text-center">
                          <p className="text-sm text-muted-foreground">Click targets as fast as you can!</p>
                        </TabsContent>
                        <TabsContent value="flappy_bird" className="mt-2 text-center">
                          <p className="text-sm text-muted-foreground">Navigate through pipes by clicking!</p>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}

                  {errorMessage && (
                    <Alert variant="destructive" className="mt-4 w-full">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  )}
                  
                  {flowState === "permissions_pending" && (
                    <div className="mt-4 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      <p>Waiting for webcam permission...</p>
                    </div>
                  )}
                  
                  {flowState === "permissions_denied" && (
                    <Button onClick={requestWebcamPermissions} className="mt-4">Try Granting Permissions Again</Button>
                  )}
                  
                  {flowState === "ready_to_start" && (
                    <Button onClick={handleStartGameAndRecording} size="lg" className="mt-6 w-full max-w-xs">
                      <Play className="mr-2 h-5 w-5" /> 
                      Start {selectedGame === 'stress_click' ? 'Stress Click' : 'Flappy Bird'} & Recording
                    </Button>
                  )}
                  
                  {flowState === "game_active_recording" && (
                     <div className="mt-4 text-center p-3 bg-primary/10 rounded-md w-full">
                        <div className="flex items-center justify-center text-lg font-semibold text-primary mb-1">
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Recording...
                        </div>
                        <p className="text-2xl font-mono">{String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}</p>
                        <p className="text-xs text-muted-foreground">Focus on the game!</p>
                     </div>
                  )}
                  
                  {(flowState === "analyzing" || flowState === "results_ready" || recordedVideoBlob) && flowState !== "game_active_recording" && (
                     <Button onClick={resetFlow} variant="outline" className="mt-6 w-full max-w-xs">
                        Start New Session
                     </Button>
                   )}
                </CardContent>
              </Card>
            </div>

            {flowState === "game_active_recording" && (
              <div className="md:col-span-2 h-full">
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {selectedGame === 'stress_click' ? (
                        <>
                          <Target className="h-5 w-5" />
                          Stress Click Challenge
                        </>
                      ) : (
                        <>
                          <Gamepad2 className="h-5 w-5" />
                          Flappy Bird Challenge
                        </>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2">
                    {selectedGame === 'stress_click' ? (
                      <StressClickGame 
                        duration={RECORDING_DURATION_SECONDS}
                        onGameEvent={handleGameEvent}
                      />
                    ) : (
                      <iframe
                        key={gameIframeKey}
                        ref={gameIframeRef}
                        src={FLAPPY_BIRD_EMBED_URL}
                        title="Flappy Bird Game"
                        className="w-full h-full border-0 rounded-md"
                        style={{minWidth: '400px', minHeight: '490px'}}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {(flowState === "analyzing" && !isAnalyzingBackend && recordedVideoBlob) && (
                <div className="col-span-1 md:col-span-3 mt-6 text-center">
                    <Card>
                        <CardHeader><CardTitle>Processing Error</CardTitle></CardHeader>
                        <CardContent>
                            <p>There was an issue initiating the analysis. You can preview your video.</p>
                            <div className="max-w-md mx-auto my-4"><VideoPreview videoBlob={recordedVideoBlob} /></div>
                            <Button onClick={() => analyzeVideo(recordedVideoBlob)}>Retry Analysis</Button>
                        </CardContent>
                    </Card>
                </div>
            )}
            
            {flowState === "analyzing" && isAnalyzingBackend && (
                 <div className="col-span-1 md:col-span-3 mt-6 text-center">
                    <Card>
                        <CardHeader><CardTitle>Analyzing Your Gameplay...</CardTitle></CardHeader>
                        <CardContent className="space-y-4 py-10">
                            <Loader2 className="h-16 w-16 animate-spin mx-auto text-primary" />
                            <p className="text-muted-foreground">This may take a few moments.</p>
                            {recordedVideoBlob && (
                                <details className="text-xs text-muted-foreground">
                                    <summary>Show recorded video preview</summary>
                                    <div className="max-w-xs mx-auto mt-2">
                                        <VideoPreview videoBlob={recordedVideoBlob} />
                                    </div>
                                </details>
                            )}
                        </CardContent>
                    </Card>
                 </div>
             )}

            {flowState === "results_ready" && analysisResults && (
              <div className="col-span-1 md:col-span-3 mt-6">
                <DashboardGrid 
                  settings={settings} 
                  initialResults={analysisResults} 
                  videoBlob={recordedVideoBlob || undefined}
                  gameEvents={gameEvents}
                />
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}