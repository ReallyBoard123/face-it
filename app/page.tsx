// app/page.tsx - Updated for Async Job Processing
'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { VideoRecorderHandles } from '@/components/video/video-recorder';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { DashboardGrid } from '@/components/layout/dashboard-grid';
import { VideoPreview } from '@/components/video/video-preview';
import { RecordingSessionManager } from '@/components/recording/recording-session-manager';
import { EyeTrackingSwitch } from '@/components/eye-tracking/eye-tracking-switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Loader2, Target, Gamepad2, Globe, Sparkles, Zap, Eye, EyeOff, Server, Wifi, Clock, X } from 'lucide-react';
import { StressClickGame } from '@/components/games/stress-click-games';
import FlappyBirdGame from '@/components/games/flappy-bird';
import { useRecordingFlow } from '@/hooks/use-recording-flow';
import { useGameEvents } from '@/hooks/use-game-events';
import { useWebsiteSession } from '@/hooks/use-website-session';
import { useBackendService } from '@/hooks/use-backend-service';
import { backendService } from '@/lib/backend-service';
import { toast } from 'sonner';

type AnalysisTypeString = "emotions" | "aus" | "combined" | "landmarks";
type VisualizationStyleString = "timeline" | "heatmap" | "distribution";

export default function Home() {
  const [settings, setSettings] = React.useState({
    frameSkip: 30, 
    analysisType: 'emotions' as AnalysisTypeString,
    visualizationStyle: 'timeline' as VisualizationStyleString, 
    detectionThreshold: 0.5, 
    batchSize: 4, // Increased for better performance
  });

  // NEW: Job tracking state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [estimatedTimeMinutes, setEstimatedTimeMinutes] = useState<number | null>(null);

  const recordingFlow = useRecordingFlow();
  const [showScreenPreview, setShowScreenPreview] = useState(false);
  const backendServiceHook = useBackendService();
  const websiteSession = useWebsiteSession();
  const videoRecorderRef = React.useRef<VideoRecorderHandles>(null);
  const gameEvents = useGameEvents(
    recordingFlow.selectedGame,
    videoRecorderRef as React.RefObject<VideoRecorderHandles>,
    recordingFlow.gameStartTimeRef,
    recordingFlow.setErrorMessage
  );

  // NEW: Updated analyzeVideo function with async job processing
  const analyzeVideo = useCallback(async (videoBlob: Blob) => {
    recordingFlow.setIsAnalyzingBackend(true);
    recordingFlow.setErrorMessage(null);
    setAnalysisProgress(0);
    setAnalysisMessage('Submitting video for analysis...');
    
    try {
      // Submit job
      const jobResponse = await backendService.submitVideoAnalysis(
        videoBlob, 
        settings,
        Date.now().toString() // Simple session ID
      );
      
      setCurrentJobId(jobResponse.job_id);
      setEstimatedTimeMinutes(jobResponse.estimated_time_minutes || null);
      setAnalysisMessage('Analysis queued. Processing will begin shortly...');
      
      toast.success(`✅ Analysis job submitted! Job ID: ${jobResponse.job_id.slice(0, 8)}...`);
      
      // Poll for results with progress updates
      const result = await backendService.pollJobUntilComplete(
        jobResponse.job_id,
        (progress, message) => {
          setAnalysisProgress(progress * 100);
          setAnalysisMessage(message);
        },
        2000, // Poll every 2 seconds
        30    // Max 30 minutes
      );
      
      // Success
      recordingFlow.setAnalysisResults(result);
      recordingFlow.setFlowState("results_ready");
      setAnalysisProgress(100);
      setAnalysisMessage('Analysis completed successfully!');
      
      toast.success('🎉 Video analysis completed!');
      
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      recordingFlow.setErrorMessage(errorMessage);
      recordingFlow.setFlowState("ready_to_start");
      setAnalysisProgress(0);
      setAnalysisMessage('');
      
      toast.error(`❌ ${errorMessage}`);
    } finally {
      recordingFlow.setIsAnalyzingBackend(false);
      setCurrentJobId(null);
    }
  }, [recordingFlow, settings]);

  // NEW: Cancel analysis function
  const cancelAnalysis = useCallback(async () => {
    if (currentJobId) {
      try {
        await backendService.cancelJob(currentJobId);
        recordingFlow.setIsAnalyzingBackend(false);
        recordingFlow.setFlowState("ready_to_start");
        setCurrentJobId(null);
        setAnalysisProgress(0);
        setAnalysisMessage('');
        toast.info('Analysis cancelled');
      } catch (error) {
        console.warn('Failed to cancel job:', error);
      }
    }
  }, [currentJobId, recordingFlow]);

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

  // Reset function with job cancellation
  const handleReset = useCallback(async () => {
    // Cancel any active job
    if (currentJobId) {
      await cancelAnalysis();
    }
    
    // Frontend cleanup
    recordingFlow.resetFlow();
    gameEvents.resetGameEvents();
    websiteSession.cleanup();
    
    // Reset analysis state
    setCurrentJobId(null);
    setAnalysisProgress(0);
    setAnalysisMessage('');
    setEstimatedTimeMinutes(null);
    
    // Prepare backend for new session
    try {
      await backendServiceHook.prepareNewSession();
    } catch {
      console.warn('Backend preparation failed, but frontend reset completed');
    }
  }, [currentJobId, cancelAnalysis, recordingFlow, gameEvents, websiteSession, backendServiceHook]);

  // Check server health on startup
  useEffect(() => {
    const checkServerOnStartup = async () => {
      try {
        await backendServiceHook.healthCheck();
        console.log('Initial server health check completed');
      } catch (error) {
        console.warn('Initial server health check failed:', error);
        toast.warning('⚠️ Backend server may not be running.');
      }
    };

    checkServerOnStartup();
  }, [backendServiceHook]);

  const getStatusColors = (state: string) => {
    switch (state) {
      case 'game_active_recording':
      case 'website_browsing_recording':
        return 'neo-status-recording';
      case 'ready_to_start':
        return 'neo-status-ready';
      case 'analyzing':
        return 'neo-status-analyzing';
      default:
        return 'neo-blue';
    }
  };

  // NEW: Progress display component
  const AnalysisProgressDisplay = () => {
    if (!recordingFlow.isAnalyzingBackend) return null;

    return (
      <Card className="border-4 border-black bg-yellow-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-black font-black uppercase">
            <span className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              VIDEO ANALYSIS IN PROGRESS
            </span>
            {currentJobId && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={cancelAnalysis}
                className="font-black uppercase"
              >
                <X className="h-4 w-4 mr-1" />
                CANCEL
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={analysisProgress} className="h-3 border-2 border-black" />
          <div className="text-sm font-bold text-black">
            <p>{analysisMessage}</p>
            <p>{analysisProgress.toFixed(0)}% Complete</p>
            {estimatedTimeMinutes && (
              <p className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                Estimated: {estimatedTimeMinutes.toFixed(1)} minutes
              </p>
            )}
            {currentJobId && (
              <p className="text-xs text-black/70">
                Job ID: {currentJobId.slice(0, 8)}...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const PageHeader = () => {
    const isActiveSession = recordingFlow.flowState === 'game_active_recording' || recordingFlow.flowState === 'website_browsing_recording';
    return (
      <header className="flex h-20 shrink-0 items-center gap-4 border-b-8 border-black px-6 neo-yellow">
        <Separator orientation="vertical" className={`mr-2 h-8 border-black border-l-4 ${isActiveSession ? 'hidden' : 'hidden md:flex'}`} />
        <div className="neo-text-title text-black flex items-center gap-3">
          <Sparkles className="h-8 w-8 md:h-12 md:w-12" />
          FACE IT
          <Zap className="h-8 w-8 md:h-12 md:w-12" />
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <EyeTrackingSwitch className="hidden sm:flex" />
          
          {backendServiceHook.isLoading && (
            <div className="flex items-center gap-2 border-4 border-black neo-orange p-2 font-black text-black uppercase text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">SERVER CHECK...</span>
            </div>
          )}
          
          {backendServiceHook.serverStatus && (
            <div className={`flex items-center gap-2 border-4 border-black p-2 font-black text-black uppercase text-xs ${
              backendServiceHook.serverStatus.detector_ready ? 'neo-green' : 'neo-orange'
            }`}>
              {backendServiceHook.serverStatus.detector_ready ? (
                <><Server className="h-4 w-4" />READY!</>
              ) : (
                <><Wifi className="h-4 w-4" />LOADING...</>
              )}
            </div>
          )}
          
          <div className={`text-lg font-black uppercase tracking-wider p-3 rounded-none border-4 border-black ${getStatusColors(recordingFlow.flowState)} hidden sm:block`}>
            {recordingFlow.flowState.replace(/_/g, ' ')}
          </div>
        </div>
      </header>
    );
  };

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const isActiveSession = recordingFlow.flowState === 'game_active_recording' || recordingFlow.flowState === 'website_browsing_recording';

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-300 via-pink-300 to-cyan-300">
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        {!isActiveSession && (
          <AppSidebar 
            settings={settings} 
            onSettingsChange={(newSettings) => setSettings(newSettings)}
          />
        )}
        <SidebarInset>
          <PageHeader />
          <main className="flex-1 overflow-auto p-6">
            <div className={`grid gap-8 ${isActiveSession ? 'grid-cols-1 md:grid-cols-3 h-[calc(100vh-8rem)]' : 'grid-cols-1'}`}>
              
              {/* Recording Session Manager */}
              <div className={`${isActiveSession ? 'md:col-span-2' : ''}`}>
                <RecordingSessionManager
                  flowState={recordingFlow.flowState}
                  selectedGame={recordingFlow.selectedGame}
                  isScreenRecording={recordingFlow.isScreenRecording}
                  countdown={recordingFlow.countdown}
                  errorMessage={recordingFlow.errorMessage}
                  isAnalyzingBackend={recordingFlow.isAnalyzingBackend}
                  setFlowState={recordingFlow.setFlowState}
                  setSelectedGame={recordingFlow.setSelectedGame}
                  setIsScreenRecording={recordingFlow.setIsScreenRecording}
                  setErrorMessage={recordingFlow.setErrorMessage}
                  onVideoRecorded={handleVideoRecorded}
                  onScreenRecorded={handleScreenRecorded}
                  onGameEvent={gameEvents.handleGameEvent}
                  websiteUrl={websiteSession.websiteUrl}
                  setWebsiteUrl={websiteSession.setWebsiteUrl}
                  websiteTabRef={websiteSession.websiteTabRef}
                  isValidUrl={websiteSession.isValidUrl}
                  openWebsiteTab={websiteSession.openWebsiteTab}
                  startTabMonitoring={websiteSession.startTabMonitoring}
                  closeWebsiteTab={websiteSession.closeWebsiteTab}
                  gameStartTimeRef={recordingFlow.gameStartTimeRef}
                  startCountdown={recordingFlow.startCountdown}
                  resetFlow={handleReset}
                />
                
                {/* NEW: Analysis Progress Display */}
                {recordingFlow.isAnalyzingBackend && (
                  <div className="mt-6">
                    <AnalysisProgressDisplay />
                  </div>
                )}
              </div>

              {/* Game/Content Area */}
              {isActiveSession && (
                <div className="space-y-6">
                  {recordingFlow.selectedGame === 'stress_click' && (
                    <StressClickGame
                      duration={recordingFlow.DEFAULT_GAME_DURATION_SECONDS}
                      onGameEvent={gameEvents.handleGameEvent}
                      onGameComplete={(stats) => {
                        console.log('Game completed with stats:', stats);
                      }}
                    />
                  )}

                  {recordingFlow.selectedGame === 'flappy_bird' && (
                    <FlappyBirdGame
                      onGameEvent={gameEvents.handleGameEvent}
                      onGameComplete={(stats) => {
                        console.log('Game completed with stats:', stats);
                      }}
                    />
                  )}

                  {recordingFlow.selectedGame === 'website_browse' && (
                    <Card className="border-4 border-black bg-blue-200">
                      <CardHeader>
                        <CardTitle className="text-black font-black uppercase flex items-center gap-2">
                          <Globe className="h-6 w-6" />
                          BROWSE WEBSITES
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-black font-bold mb-4">
                          Browse any website while we record your facial expressions!
                        </p>
                        <div className="text-black">
                          Website browsing active: {websiteSession.websiteUrl}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Video Preview */}
                  {recordingFlow.recordedVideoBlob && (
                    <VideoPreview 
                      videoBlob={recordingFlow.recordedVideoBlob}
                    />
                  )}
                </div>
              )}

              {/* Results Display */}
              {!isActiveSession && (
                <DashboardGrid 
                  settings={settings}
                  initialResults={recordingFlow.analysisResults}
                  gameEvents={gameEvents.gameEvents}
                  gameKeyMoments={gameEvents.gameKeyMoments}
                />
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}