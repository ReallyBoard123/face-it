// app/page.tsx
'use client';

import React, { useEffect, useCallback } from 'react';
import { VideoRecorderHandles } from '@/components/video/video-recorder';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardGrid } from '@/components/layout/dashboard-grid';
import { VideoPreview } from '@/components/video/video-preview';
import { RecordingSessionManager } from '@/components/recording/recording-session-manager';
import { EyeTrackingPanel } from '@/components/eye-tracking/eye-tracking-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Loader2, Target, Gamepad2, Globe } from 'lucide-react';
import { StressClickGame } from '@/components/games/stress-click-games';
import FlappyBirdGame from '@/components/games/flappy-bird';
import { useRecordingFlow } from '@/hooks/use-recording-flow';
import { useGameEvents } from '@/hooks/use-game-events';
import { useWebsiteSession } from '@/hooks/use-website-session';

type AnalysisTypeString = "emotions" | "aus" | "combined" | "landmarks";
type VisualizationStyleString = "timeline" | "heatmap" | "distribution";

export default function Home() {
  const [settings, setSettings] = React.useState({
    frameSkip: 30, 
    analysisType: 'emotions' as AnalysisTypeString,
    visualizationStyle: 'timeline' as VisualizationStyleString, 
    detectionThreshold: 0.5, 
    batchSize: 1,
  });

  const recordingFlow = useRecordingFlow();
  const websiteSession = useWebsiteSession();
  const videoRecorderRef = React.useRef<VideoRecorderHandles>(null);
  const gameEvents = useGameEvents(
    recordingFlow.selectedGame,
    videoRecorderRef as React.RefObject<VideoRecorderHandles>,
    recordingFlow.gameStartTimeRef,
    recordingFlow.setErrorMessage
  );

  // Memoize analyzeVideo to prevent useEffect dependency issues
  const analyzeVideo = useCallback(async (videoBlob: Blob) => {
    recordingFlow.setIsAnalyzingBackend(true);
    recordingFlow.setErrorMessage(null);
    
    const formData = new FormData();
    formData.append('file', videoBlob, recordingFlow.selectedGame === 'website_browse' ? 'website-browsing-recording.webm' : 'gameplay-recording.webm');
    
    if (recordingFlow.recordedScreenBlob) {
      formData.append('screen_file', recordingFlow.recordedScreenBlob, 'screen-recording.webm');
    }
    
    formData.append('settings', JSON.stringify(settings));
    
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/analyze/face`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail?.message || 'Analysis server error.');
      }
      const data = await response.json();
      if (data.status === "nodata") {
        recordingFlow.setErrorMessage(data.message || "No analysis data returned from server.");
        recordingFlow.setAnalysisResults(null);
        recordingFlow.setFlowState("ready_to_start");
      } else {
        recordingFlow.setAnalysisResults(data);
        recordingFlow.setFlowState("results_ready");
      }
    } catch (error) {
      console.error('Analysis fetch error:', error);
      recordingFlow.setErrorMessage(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      recordingFlow.setFlowState("ready_to_start");
    } finally {
      recordingFlow.setIsAnalyzingBackend(false);
    }
  }, [recordingFlow, settings]);

  // Handle video recording completion
  const handleVideoRecorded = useCallback((blob: Blob) => {
    recordingFlow.stopCountdown();
    recordingFlow.setRecordedVideoBlob(blob);
    
    if (recordingFlow.selectedGame === 'website_browse') {
      if (recordingFlow.recordedScreenBlob) {
        recordingFlow.setFlowState("analyzing");
        analyzeVideo(blob);
      }
    } else {
      recordingFlow.setFlowState("analyzing");
      analyzeVideo(blob);
    }
  }, [recordingFlow, analyzeVideo]);

  // Handle screen recording completion
  const handleScreenRecorded = useCallback((blob: Blob) => {
    console.log('Screen recording completed:', blob.size, 'bytes');
    recordingFlow.setRecordedScreenBlob(blob);
  }, [recordingFlow]);

  // Auto-start analysis when both recordings are ready
  useEffect(() => {
    if (recordingFlow.recordedVideoBlob && recordingFlow.recordedScreenBlob && 
        recordingFlow.flowState !== "analyzing" && recordingFlow.flowState !== "results_ready") {
      console.log('Both recordings complete, starting analysis...');
      recordingFlow.setFlowState("analyzing");
      analyzeVideo(recordingFlow.recordedVideoBlob);
    }
  }, [recordingFlow, recordingFlow.recordedVideoBlob, recordingFlow.recordedScreenBlob, recordingFlow.flowState, recordingFlow.setFlowState, analyzeVideo]);

  const handleReset = useCallback(() => {
    recordingFlow.resetFlow();
    gameEvents.resetGameEvents();
    websiteSession.cleanup();
  }, [recordingFlow, gameEvents, websiteSession]);

  const PageHeader = () => {
    const isActiveSession = recordingFlow.flowState === 'game_active_recording' || recordingFlow.flowState === 'website_browsing_recording';
    return (
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
        <Separator orientation="vertical" className={`mr-2 h-4 ${isActiveSession ? 'hidden' : 'hidden md:flex'}`} />
        <div className="text-lg md:text-2xl font-bold">FaceIt Analysis</div>
        <div className="ml-auto text-sm text-muted-foreground capitalize hidden sm:block">
          {recordingFlow.flowState.replace(/_/g, ' ')}
        </div>
      </header>
    );
  };

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const isActiveSession = recordingFlow.flowState === 'game_active_recording' || recordingFlow.flowState === 'website_browsing_recording';

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      {!isActiveSession && (
        <AppSidebar 
          settings={settings} 
          onSettingsChange={setSettings}
        />
      )}
      <SidebarInset>
        <PageHeader />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <div className={`grid gap-4 md:gap-6 ${isActiveSession ? 'grid-cols-1 md:grid-cols-3 h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6rem)]' : 'grid-cols-1'}`}>
            
            {/* Recording Session Manager */}
            <div className={`${isActiveSession ? 'md:col-span-1' : 'max-w-2xl mx-auto w-full'}`}>
              <RecordingSessionManager
                // State from recording flow hook
                flowState={recordingFlow.flowState}
                selectedGame={recordingFlow.selectedGame}
                isScreenRecording={recordingFlow.isScreenRecording}
                countdown={recordingFlow.countdown}
                errorMessage={recordingFlow.errorMessage}
                isAnalyzingBackend={recordingFlow.isAnalyzingBackend}
                
                // State setters
                setFlowState={recordingFlow.setFlowState}
                setSelectedGame={recordingFlow.setSelectedGame}
                setIsScreenRecording={recordingFlow.setIsScreenRecording}
                setErrorMessage={recordingFlow.setErrorMessage}
                
                // Event handlers
                onVideoRecorded={handleVideoRecorded}
                onScreenRecorded={handleScreenRecorded}
                onGameEvent={gameEvents.handleGameEvent}
                
                // Website session data
                websiteUrl={websiteSession.websiteUrl}
                setWebsiteUrl={websiteSession.setWebsiteUrl}
                websiteTabRef={websiteSession.websiteTabRef}
                isValidUrl={websiteSession.isValidUrl}
                openWebsiteTab={websiteSession.openWebsiteTab}
                startTabMonitoring={websiteSession.startTabMonitoring}
                closeWebsiteTab={websiteSession.closeWebsiteTab}
                
                // Recording refs and actions
                gameStartTimeRef={recordingFlow.gameStartTimeRef}
                startCountdown={recordingFlow.startCountdown}
                resetFlow={handleReset}
              />
            </div>
            
            {/* Active Game Session */}
            {recordingFlow.flowState === "game_active_recording" && (
              <div className="md:col-span-2 h-full" id={recordingFlow.selectedGame === 'stress_click' ? 'stress-click-game-area-ref-id' : 'flappy-bird-game-area'}>
                <Card className="h-full flex flex-col">
                  <CardHeader className="py-3 md:py-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      {recordingFlow.selectedGame === 'stress_click' ? (
                        <><Target className="h-5 w-5" />Stress Click</>
                      ) : (
                        <><Gamepad2 className="h-5 w-5" />Flappy Bird</>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2 overflow-hidden">
                    {recordingFlow.selectedGame === 'stress_click' ? (
                      <StressClickGame 
                        duration={recordingFlow.DEFAULT_GAME_DURATION_SECONDS} 
                        onGameEvent={gameEvents.handleGameEvent} 
                      />
                    ) : (
                      <FlappyBirdGame onGameEvent={gameEvents.handleGameEvent} />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Website Browsing Session */}
            {recordingFlow.flowState === "website_browsing_recording" && (
              <div className="md:col-span-2 h-full">
                <Card className="h-full flex flex-col">
                  <CardHeader className="py-3 md:py-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <Globe className="h-5 w-5" />Website Browsing Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow flex items-center justify-center p-4 text-center">
                    <div className="space-y-4">
                      <div className="text-lg font-medium">🌐 Browse freely in the new tab!</div>
                      <div className="text-sm text-muted-foreground max-w-md">
                        <p>• The website has opened in a new tab</p>
                        <p>• Your facial expressions are being recorded</p>
                        <p>• Your screen activity is also being captured</p>
                        <p>• Click &ldquo;Stop Recording&rdquo; when you&rsquo;re finished browsing</p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        URL: {websiteSession.websiteUrl}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Analysis Loading */}
            {recordingFlow.flowState === "analyzing" && recordingFlow.isAnalyzingBackend && (
              <div className="col-span-1 md:col-span-3 mt-4 md:mt-6 text-center">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg">
                      Analyzing {recordingFlow.selectedGame === 'website_browse' ? 'Website Browsing' : 'Gameplay'}...
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 md:space-y-4 py-8 md:py-10">
                    <Loader2 className="h-12 w-12 md:h-16 md:w-16 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Analyzing facial expressions{recordingFlow.recordedScreenBlob ? ' and screen activity' : ''}...
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Results */}
            {recordingFlow.flowState === "results_ready" && recordingFlow.analysisResults && (
              <div className="col-span-1 md:col-span-3 mt-4 md:mt-6">
                <DashboardGrid 
                  settings={settings} 
                  initialResults={recordingFlow.analysisResults} 
                  videoBlob={recordingFlow.recordedVideoBlob || undefined} 
                  gameEvents={gameEvents.gameEvents} 
                  gameKeyMoments={gameEvents.gameKeyMoments} 
                />
                
                {/* Screen Recording Preview */}
                {recordingFlow.recordedScreenBlob && (
                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                        <Globe className="h-5 w-5" />Screen Recording
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-w-4xl mx-auto">
                        <VideoPreview videoBlob={recordingFlow.recordedScreenBlob} />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Eye Tracking Panel - Self-contained */}
      <EyeTrackingPanel />
    </SidebarProvider>
  );
}