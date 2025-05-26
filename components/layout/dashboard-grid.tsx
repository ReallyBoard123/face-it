import { useState } from 'react';
import { VideoRecorder } from '@/components/video/video-recorder';

import { Card } from '@/components/ui/card';
import { AnalysisSummary } from '../analysis/analysis-summary';
import { AuHeatmap } from '../analysis/au-heatmap';
import { EmotionDistribution } from '../analysis/emotion-distribution';
import { EmotionTimeline } from '../analysis/emotional-timeline';
import { VideoPreview } from '../video/video-preview';

interface DashboardGridProps {
  settings: {
    frameSkip: number;
    analysisType: string;
    visualizationStyle: string;
    detectionThreshold: number;
    batchSize: number;
  };
}

export function DashboardGrid({ settings }: DashboardGridProps) {
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleVideoRecorded = (blob: Blob) => {
    setRecordedVideo(blob);
    // Automatically start analysis
    analyzeVideo(blob);
  };

  const analyzeVideo = async (videoBlob: Blob) => {
    setIsAnalyzing(true);
    
    const formData = new FormData();
    formData.append('file', videoBlob, 'recorded-video.webm');
    
    // Append settings to the request
    formData.append('settings', JSON.stringify(settings));

    try {
      const response = await fetch('http://localhost:8000/analyze-video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.message || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysisResults(data);
    } catch (error) {
      console.error('Analysis error:', error);
      // Handle error appropriately
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Render different visualizations based on settings
  const renderVisualization = () => {
    if (!analysisResults?.data) return null;

    switch (settings.visualizationStyle) {
      case 'timeline':
        return <EmotionTimeline data={analysisResults.data} />;
      case 'heatmap':
        return <AuHeatmap data={analysisResults.data} />;
      case 'distribution':
        return <EmotionDistribution data={analysisResults.data} />;
      default:
        return <EmotionTimeline data={analysisResults.data} />;
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      {/* Video Recording Section - Large Box */}
      <Card className="col-span-12 lg:col-span-8 p-6">
        <div className="h-full flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Record or Upload Video</h3>
          <div className="flex-1">
            <VideoRecorder 
              onVideoRecorded={handleVideoRecorded}
              isAnalyzing={isAnalyzing}
            />
          </div>
        </div>
      </Card>

      {/* Quick Stats - Small Boxes */}
      <div className="col-span-12 lg:col-span-4 grid gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Analysis Status</h3>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {isAnalyzing ? 'Analyzing...' : recordedVideo ? 'Ready' : 'Waiting for video'}
            </p>
            {analysisResults && (
              <>
                <p className="text-2xl font-bold">
                  {analysisResults.data?.summary?.faces_detected || 0}
                </p>
                <p className="text-xs text-muted-foreground">Faces Detected</p>
              </>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Processing Settings</h3>
          <div className="space-y-1 text-sm">
            <p>Frame Skip: <span className="font-medium">{settings.frameSkip}</span></p>
            <p>Analysis: <span className="font-medium capitalize">{settings.analysisType}</span></p>
            <p>Style: <span className="font-medium capitalize">{settings.visualizationStyle}</span></p>
          </div>
        </Card>
      </div>

      {/* Video Preview - Medium Box */}
      {recordedVideo && (
        <Card className="col-span-12 lg:col-span-6 p-6">
          <h3 className="text-lg font-semibold mb-4">Video Preview</h3>
          <VideoPreview videoBlob={recordedVideo} />
        </Card>
      )}

      {/* Analysis Summary - Medium Box */}
      {analysisResults && (
        <Card className="col-span-12 lg:col-span-6 p-6">
          <h3 className="text-lg font-semibold mb-4">Analysis Summary</h3>
          <AnalysisSummary results={analysisResults} />
        </Card>
      )}

      {/* Main Visualization - Full Width */}
      {analysisResults && (
        <Card className="col-span-12 p-6">
          <h3 className="text-lg font-semibold mb-4">
            {settings.visualizationStyle === 'timeline' && 'Emotion Timeline'}
            {settings.visualizationStyle === 'heatmap' && 'Action Unit Heatmap'}
            {settings.visualizationStyle === 'distribution' && 'Emotion Distribution'}
          </h3>
          <div className="h-96">
            {renderVisualization()}
          </div>
        </Card>
      )}
    </div>
  );
}