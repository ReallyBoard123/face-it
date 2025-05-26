import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmotionTimeline } from '../analysis/emotional-timeline';
import { AuHeatmap } from '../analysis/au-heatmap';
import { EmotionDistribution } from '../analysis/emotion-distribution';
import { Progress } from '@/components/ui/progress';
import { Activity, TrendingUp, Users, Clock } from 'lucide-react';

interface DashboardGridProps {
  settings: {
    frameSkip: number;
    analysisType: string;
    visualizationStyle: string;
    detectionThreshold: number;
    batchSize: number;
  };
  initialResults?: any; // Analysis results from parent
  videoBlob?: Blob; // Video blob from parent
  gameEvents?: Array<{ type: string; data: any; timestamp: number }>; // Game events for timeline markers
}

export function DashboardGrid({ 
  settings, 
  initialResults, 
  videoBlob: initialVideoBlob,
  gameEvents = []
}: DashboardGridProps) {
  const [analysisResults, setAnalysisResults] = useState<any>(initialResults || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
        return <EmotionTimeline data={analysisResults.data} gameEvents={gameEvents} />;
      case 'heatmap':
        return <AuHeatmap data={analysisResults.data} />;
      case 'distribution':
        return <EmotionDistribution data={analysisResults.data} />;
      default:
        return <EmotionTimeline data={analysisResults.data} gameEvents={gameEvents} />;
    }
  };

  // Calculate key metrics
  const getKeyMetrics = () => {
    if (!analysisResults?.data?.summary) return null;
    
    const summary = analysisResults.data.summary;
    const emotions = summary.emotions?.statistics || {};
    
    // Find dominant emotion
    const dominantEmotion = Object.entries(emotions)
      .sort(([,a]: [string, any], [,b]: [string, any]) => b.mean - a.mean)[0];
    
    // Calculate overall activity level
    const totalActivity = Object.values(emotions)
      .reduce((sum: number, stat: any) => sum + stat.mean, 0);

    return {
      facesDetected: summary.faces_detected || 0,
      totalFrames: summary.total_frames || 0,
      dominantEmotion: dominantEmotion ? {
        name: dominantEmotion[0],
        value: (dominantEmotion[1] as any).mean * 100
      } : null,
      activityLevel: Math.min(100, totalActivity * 100),
      gameEventCount: gameEvents.length
    };
  };

  const metrics = getKeyMetrics();

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{metrics.facesDetected}</p>
                  <p className="text-xs text-muted-foreground">Faces Detected</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{metrics.totalFrames}</p>
                  <p className="text-xs text-muted-foreground">Frames Processed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {metrics.dominantEmotion && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-lg font-bold capitalize">{metrics.dominantEmotion.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {metrics.dominantEmotion.value.toFixed(1)}% dominant
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{metrics.gameEventCount}</p>
                  <p className="text-xs text-muted-foreground">Game Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Visualization */}
      {analysisResults && (
        <Card>
          <CardHeader>
            <CardTitle>
              {settings.visualizationStyle === 'timeline' && 'Emotion Timeline'}
              {settings.visualizationStyle === 'heatmap' && 'Action Unit Heatmap'}
              {settings.visualizationStyle === 'distribution' && 'Emotion Distribution'}
              {gameEvents.length > 0 && settings.visualizationStyle === 'timeline' && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  with game events
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              {renderVisualization()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Status */}
      {isAnalyzing && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-5 w-5 animate-spin" />
                <span className="font-medium">Analyzing facial expressions...</span>
              </div>
              <Progress value={undefined} className="h-2" />
              <p className="text-sm text-muted-foreground">
                Processing with frame skip: {settings.frameSkip}, Analysis: {settings.analysisType}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}