// app/page.tsx
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
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Loader2, Target, Gamepad2, Globe, Sparkles, Zap, Eye, EyeOff, Server, Wifi } from 'lucide-react';
import { StressClickGame } from '@/components/games/stress-click-games';
import FlappyBirdGame from '@/components/games/flappy-bird';
import { useRecordingFlow } from '@/hooks/use-recording-flow';
import { useGameEvents } from '@/hooks/use-game-events';
import { useWebsiteSession } from '@/hooks/use-website-session';
import { useBackendService } from '@/hooks/use-backend-service'; // NEW IMPORT
import { toast } from 'sonner'; // NEW IMPORT

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
  const [showScreenPreview, setShowScreenPreview] = useState(false);
  const backendService = useBackendService(); // NEW HOOK
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

  // UPDATED RESET FUNCTION WITH BACKEND SERVICE INTEGRATION
  const handleReset = useCallback(async () => {
    // Start with frontend cleanup
    recordingFlow.resetFlow();
    gameEvents.resetGameEvents();
    websiteSession.cleanup();
    
    // Prepare backend for new session with custom neo-brutalist style toast
    try {
      await backendService.prepareNewSession();
    } catch {
      // Error is already shown via toast, but we can log it
      console.warn('Backend preparation failed, but frontend reset completed');
    }
  }, [recordingFlow, gameEvents, websiteSession, backendService]);

  // NEW: Check server health on app startup
  useEffect(() => {
    const checkServerOnStartup = async () => {
      try {
        await backendService.healthCheck();
        console.log('Initial server health check completed');
      } catch (error) {
        console.warn('Initial server health check failed:', error);
        toast.warning('⚠️ Backend server may not be running. Some features may be unavailable.');
      }
    };

    checkServerOnStartup();
  }, [backendService]);

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
          
          {/* NEW: Backend status indicator with neo-brutalist styling */}
          {backendService.isLoading && (
            <div className="flex items-center gap-2 border-4 border-black neo-orange p-2 font-black text-black uppercase text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">SERVER CHECK...</span>
            </div>
          )}
          
          {backendService.serverStatus && (
            <div className={`flex items-center gap-2 border-4 border-black p-2 font-black text-black uppercase text-xs ${
              backendService.serverStatus.detector_ready ? 'neo-green' : 'neo-orange'
            }`}>
              {backendService.serverStatus.detector_ready ? (
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
              <div className={`${isActiveSession ? 'md:col-span-1' : 'max-w-4xl mx-auto w-full'}`}>
                <Card variant="purple" className="h-full">
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
                    resetFlow={handleReset} // UPDATED TO USE NEW BACKEND-INTEGRATED RESET
                  />
                </Card>
              </div>
              
              {/* Active Game Session */}
              {recordingFlow.flowState === "game_active_recording" && (
                <div className="md:col-span-2 h-full" id={recordingFlow.selectedGame === 'stress_click' ? 'stress-click-game-area-ref-id' : 'flappy-bird-game-area'}>
                  <Card variant={recordingFlow.selectedGame === 'stress_click' ? 'green' : 'blue'} className="h-full flex flex-col neo-game-area">
                    <CardHeader className="py-4">
                      <CardTitle className="flex items-center gap-3 text-black">
                        {recordingFlow.selectedGame === 'stress_click' ? (
                          <><Target className="h-6 w-6" />STRESS CLICK MAYHEM!</>
                        ) : (
                          <><Gamepad2 className="h-6 w-6" />FLAPPY BIRD CHAOS!</>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow flex items-center justify-center p-4 overflow-hidden">
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
                  <Card variant="cyan" className="h-full flex flex-col">
                    <CardHeader className="py-4">
                      <CardTitle className="flex items-center gap-3 text-black">
                        <Globe className="h-6 w-6" />WEBSITE ADVENTURE MODE!
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow flex items-center justify-center p-6 text-center">
                      <div className="space-y-6">
                        <div className="text-3xl font-black text-black">🌐 SURF THE WEB!</div>
                        <Card variant="white" className="p-6 max-w-md">
                          <div className="text-sm font-bold text-black space-y-2 uppercase">
                            <p>• Website opened in new tab</p>
                            <p>• Facial expressions recording</p>
                            <p>• Screen activity captured</p>
                            <p>• Click &quot;STOP&quot; when done browsing</p>
                          </div>
                        </Card>
                        <div className="text-xs font-bold text-black border-4 border-black p-3 neo-yellow inline-block">
                          URL: {websiteSession.websiteUrl}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {/* Analysis Loading */}
              {recordingFlow.flowState === "analyzing" && recordingFlow.isAnalyzingBackend && (
                <div className="col-span-1 md:col-span-3 mt-8 text-center">
                  <Card variant="orange" className="neo-pulse">
                    <CardHeader>
                      <CardTitle className="text-black">
                        ANALYZING {recordingFlow.selectedGame === 'website_browse' ? 'WEBSITE CHAOS' : 'GAMEPLAY MADNESS'}...
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 py-12">
                      <Loader2 className="h-20 w-20 animate-spin mx-auto text-black" />
                      <p className="text-lg font-bold text-black uppercase tracking-wider">
                        CRUNCHING THE DATA{recordingFlow.recordedScreenBlob ? ' & SCREEN ACTIVITY' : ''}...
                      </p>
                      <div className="flex justify-center gap-2">
                        {[...Array(5)].map((_, i) => (
                          <div 
                            key={i} 
                            className="w-4 h-4 neo-pink border-2 border-black animate-bounce"
                            style={{ animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {/* Results */}
              {recordingFlow.flowState === "results_ready" && recordingFlow.analysisResults && (
                <div className="col-span-1 md:col-span-3 mt-8">
                  <DashboardGrid 
                    settings={settings} 
                    initialResults={recordingFlow.analysisResults} 
                    videoBlob={recordingFlow.recordedVideoBlob || undefined} 
                    gameEvents={gameEvents.gameEvents} 
                    gameKeyMoments={gameEvents.gameKeyMoments} 
                  />
                  
                  {/* Screen Recording Preview */}
                  {recordingFlow.recordedScreenBlob && (
                    <Card variant="green" className="mt-8">
                      <CardHeader className="relative pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-3 text-black">
                            <Globe className="h-6 w-6" />
                            SCREEN RECORDING PLAYBACK
                          </CardTitle>
                          <Button
                            onClick={() => setShowScreenPreview(!showScreenPreview)}
                            variant="ghost"
                            size="sm" 
                            className="border-4 border-black"
                          >
                            {showScreenPreview ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className={!showScreenPreview ? 'hidden' : ''}>
                        <div className="max-w-4xl mx-auto border-8 border-black shadow-[12px_12px_0px_0px_#000]">
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
      </SidebarProvider>
    </div>
  );
}