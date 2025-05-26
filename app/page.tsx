// app/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar'; // Corrected import path
import { DashboardGrid } from '@/components/layout/dashboard-grid';
import { VideoRecorder, VideoRecorderHandles } from '@/components/video/video-recorder';
import { VideoPreview } from '@/components/video/video-preview';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage
} from '@/components/ui/breadcrumb'; // Corrected import path
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Menu, Play, Loader2, Info, AlertTriangle, Video, Gamepad2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type GameFlowState =
  | "idle"
  | "permissions_pending"
  | "permissions_denied"
  | "ready_to_start"
  | "game_active_recording"
  | "analyzing"
  | "results_ready";

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
  const [flowState, setFlowState] = useState<GameFlowState>("idle");
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [isAnalyzingBackend, setIsAnalyzingBackend] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleStartGameAndRecording = async () => {
    if (!videoRecorderRef.current) {
      setErrorMessage("Video recorder component is not yet available.");
      return;
    }

    let currentFlowState = flowState; // Use a local variable to track state changes within this function

    if (currentFlowState === "permissions_denied") {
      const permissionGranted = await requestWebcamPermissions(); // This updates flowState internally
      // After await, flowState in the component might be updated.
      // For this function's logic, we need to know if it's now ready.
      // We assume requestWebcamPermissions updates flowState which we'll check next.
      // To be absolutely sure for *this function's execution*, we'd ideally get a return value.
      // Let's rely on the fact that `requestWebcamPermissions` sets the state.
      // We will re-check the component's flowState after this.
      // However, to avoid the TS error for the *immediate* subsequent check,
      // we can proceed if permission was granted.
      if (!permissionGranted) return; // Exit if permission was not granted in the re-attempt
      // If it was granted, flowState should now be "ready_to_start"
      // To ensure the next check uses the updated state, we can read it again,
      // or structure this to avoid the direct problematic comparison.
      // The simplest way to ensure the next check is valid after an await that changes state
      // is to re-fetch the state, but React state updates are asynchronous.
      // A better pattern:
      if (!(await videoRecorderRef.current.getStream())) { // Check if stream is available after attempt
         setErrorMessage("Webcam permissions are required. Please try again.");
         return;
      }
      // If we have a stream, assume we are ready or will become ready.
      // The component's flowState will be updated by requestWebcamPermissions.
      // The next general check will handle it.
      // For now, we let the next check determine if we are in 'ready_to_start'
    }
    
    // General check for readiness, this uses the component's current flowState
    // This state might have been updated by the requestWebcamPermissions call above.
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
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">FaceIt Game Analysis</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="capitalize">
                {flowState.replace(/_/g, ' ')}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
    );
  };

  const resetFlow = () => {
    setRecordedVideoBlob(null);
    setAnalysisResults(null);
    setIsAnalyzingBackend(false);
    setErrorMessage(null);
    setCountdown(RECORDING_DURATION_SECONDS);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    requestWebcamPermissions(); // This will set flowState to "permissions_pending" then "ready_to_start" or "permissions_denied"
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
                      <Play className="mr-2 h-5 w-5" /> Start Game & Recording
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
                    <CardTitle className="flex items-center gap-2"><Gamepad2 /> Flappy Bird Challenge</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2">
                    <iframe
                      key={gameIframeKey}
                      ref={gameIframeRef}
                      src={FLAPPY_BIRD_EMBED_URL}
                      title="Flappy Bird Game"
                      className="w-full h-full border-0 rounded-md"
                      style={{minWidth: '400px', minHeight: '490px'}} // Canvas size
                      // sandbox="allow-scripts allow-same-origin" // Enable if game allows and for extra security
                    />
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
                {/*
                  TODO: Modify DashboardGrid to accept analysisResults and recordedVideoBlob as props
                  Example: <DashboardGrid settings={settings} initialResults={analysisResults} videoBlob={recordedVideoBlob} />
                */}
                <DashboardGrid settings={settings} />
                <div className="mt-6 text-center">
                    <Card>
                        <CardHeader><CardTitle>Analysis Data</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">Raw analysis JSON output:</p>
                            <pre className="bg-muted p-4 rounded-md text-left text-xs overflow-auto max-h-96">
                                {JSON.stringify(analysisResults, null, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                </div>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}