import { useMemo } from 'react'; // Removed unused useState
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmotionTimeline } from '../analysis/emotional-timeline';
import { AuHeatmap } from '../analysis/au-heatmap';
import { EmotionDistribution } from '../analysis/emotion-distribution';
import { KeyMomentsDisplay, KeyMoment } from '../analysis/key-moments-display'; // Added KeyMomentsDisplay
import { Activity, TrendingUp, Users, Clock } from 'lucide-react';

interface Settings {
  frameSkip: number;
  analysisType: string;
  visualizationStyle: string;
  detectionThreshold: number;
  batchSize: number;
}

interface GameEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface EmotionStats {
  mean: number;
  [key: string]: unknown;
}

interface AnalysisResults {
  data?: {
    summary?: {
      faces_detected?: number;
      total_frames?: number;
      emotions?: {
        statistics?: Record<string, EmotionStats>;
      };
      emotional_key_moments?: KeyMoment[];
    };
  };
}

interface DashboardGridProps {
  settings: Settings;
  initialResults?: AnalysisResults;
  videoBlob?: Blob;
  gameEvents?: GameEvent[];
  gameKeyMoments?: KeyMoment[];
}

export function DashboardGrid({ 
  settings, 
  initialResults, 
  gameEvents = [],
  gameKeyMoments = [],
}: DashboardGridProps) {
  // initialResults contains data from the parent after analysis is complete
  const analysisResults = initialResults || null;
  // isAnalyzing state is also managed by parent, this component just displays results

  const renderVisualization = () => {
    if (!analysisResults?.data) return <div className="flex items-center justify-center h-full text-muted-foreground">No analysis data to display.</div>;

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

  const getKeyMetrics = () => {
    if (!analysisResults?.data?.summary) return null;
    
    const summary = analysisResults.data.summary;
    const emotions = summary.emotions?.statistics || {};
    
    const dominantEmotionEntry = Object.entries(emotions)
      .filter(([key]) => key !== 'neutral') // Exclude neutral for dominance
      .sort(([,a], [,b]) => (b as EmotionStats).mean - (a as EmotionStats).mean)[0];
    
    const totalActivity = Object.values(emotions)
      .reduce((sum: number, stat) => sum + (stat as EmotionStats).mean, 0);

    return {
      facesDetected: summary.faces_detected || 0,
      totalFrames: summary.total_frames || 0,
      dominantEmotion: dominantEmotionEntry ? {
        name: dominantEmotionEntry[0],
        value: (dominantEmotionEntry[1] as EmotionStats).mean * 100
      } : null,
      activityLevel: Math.min(100, totalActivity * 100), // This is a rough metric
      gameEventCount: gameEvents.filter(e => e.type !== 'target_spawn' && e.type !== 'target_miss').length // Filter out noisy events if needed
    };
  };

  const metrics = getKeyMetrics();

  const combinedKeyMoments = useMemo(() => {
    const backendMoments: KeyMoment[] = analysisResults?.data?.summary?.emotional_key_moments || [];
    // gameKeyMoments is already in KeyMoment[] format from app/page.tsx
    return [...backendMoments, ...gameKeyMoments].sort((a, b) => a.timestamp - b.timestamp);
  }, [analysisResults, gameKeyMoments]);


  return (
    <div className="space-y-6">
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                <div>
                  <p className="text-lg md:text-2xl font-bold">{metrics.facesDetected}</p>
                  <p className="text-xs text-muted-foreground">Faces Detected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-6 w-6 md:h-8 md:w-8 text-green-500" />
                <div>
                  <p className="text-lg md:text-2xl font-bold">{metrics.totalFrames}</p>
                  <p className="text-xs text-muted-foreground">Frames Analyzed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {metrics.dominantEmotion ? (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-purple-500" />
                  <div>
                    <p className="text-base md:text-lg font-bold capitalize">{metrics.dominantEmotion.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {metrics.dominantEmotion.value.toFixed(0)}% avg intensity
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
             <Card><CardContent className="p-4 flex items-center space-x-2"><TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" /><div><p className="text-base md:text-lg font-bold">-</p><p className="text-xs text-muted-foreground">Dominant Emotion</p></div></CardContent></Card>
          )}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
                <div>
                  <p className="text-lg md:text-2xl font-bold">{metrics.gameEventCount}</p>
                  <p className="text-xs text-muted-foreground">Key Game Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {analysisResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">
              {settings.visualizationStyle === 'timeline' && 'Emotion Timeline'}
              {settings.visualizationStyle === 'heatmap' && 'Action Unit Heatmap'}
              {settings.visualizationStyle === 'distribution' && 'Emotion Distribution'}
              {gameEvents.length > 0 && settings.visualizationStyle === 'timeline' && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  with game event markers
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 md:h-96"> {/* Responsive height */}
              {renderVisualization()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Display Key Moments */}
      {(analysisResults || gameKeyMoments.length > 0) && ( // Show if there's any moment data
          <KeyMomentsDisplay moments={combinedKeyMoments} />
      )}
      
      {/* Removed isAnalyzing block as parent page handles this state */}
    </div>
  );
}