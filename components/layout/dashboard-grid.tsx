import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmotionTimeline } from '../analysis/emotional-timeline';
import { AuHeatmap } from '../analysis/au-heatmap';
import { EmotionDistribution } from '../analysis/emotion-distribution';
import { KeyMomentsDisplay, KeyMoment } from '../analysis/key-moments-display';
import { TrendingUp, Users, Clock, Sparkles, Zap, Target } from 'lucide-react';

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

interface TimelineData {
  timestamps?: number[];
  [emotion: string]: number[] | undefined;
}

interface EmotionStats {
  mean: number;
  max: number;
  peaks?: Array<unknown>;
}

interface AnalysisResults {
  data?: {
    summary?: {
      faces_detected?: number;
      total_frames?: number;
      emotions?: {
        statistics?: Record<string, EmotionStats>;
        timeline?: TimelineData;
      };
      action_units?: {
        statistics?: Record<string, {
          mean: number;
          activation_rate: number;
          max_intensity: number;
        }>;
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
  const analysisResults = initialResults || null;

  const renderVisualization = () => {
    if (!analysisResults?.data) return (
      <div className="flex items-center justify-center h-full text-black">
        <Card variant="white" className="p-8 text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-black" />
          <div className="neo-text-heading text-black">NO DATA TO DISPLAY</div>
        </Card>
      </div>
    );

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
      .filter(([key]) => key !== 'neutral')
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
      activityLevel: Math.min(100, totalActivity * 100),
      gameEventCount: gameEvents.filter(e => e.type !== 'target_spawn' && e.type !== 'target_miss').length
    };
  };

  const metrics = getKeyMetrics();

  const combinedKeyMoments = useMemo(() => {
    const backendMoments: KeyMoment[] = analysisResults?.data?.summary?.emotional_key_moments || [];
    return [...backendMoments, ...gameKeyMoments].sort((a, b) => a.timestamp - b.timestamp);
  }, [analysisResults, gameKeyMoments]);

  const getVisualizationTitle = () => {
    const baseTitle = settings.visualizationStyle === 'timeline' ? 'EMOTION TIMELINE' :
                     settings.visualizationStyle === 'heatmap' ? 'ACTION UNIT HEATMAP' :
                     'EMOTION DISTRIBUTION';
    
    return gameEvents.length > 0 && settings.visualizationStyle === 'timeline' 
      ? `${baseTitle} + GAME CHAOS!` 
      : baseTitle;
  };

  const metricCards = [
    {
      icon: Users,
      value: metrics?.facesDetected || 0,
      label: 'FACES DETECTED',
      variant: 'blue' as const,
    },
    {
      icon: Clock,
      value: metrics?.totalFrames || 0,
      label: 'FRAMES ANALYZED',
      variant: 'green' as const,
    },
    {
      icon: TrendingUp,
      value: metrics?.dominantEmotion?.name?.toUpperCase() || '-',
      label: `${metrics?.dominantEmotion?.value?.toFixed(0) || 0}% INTENSITY`,
      variant: 'purple' as const,
    },
    {
      icon: Target,
      value: metrics?.gameEventCount || 0,
      label: 'GAME EVENTS',
      variant: 'orange' as const,
    }
  ];

  return (
    <div className="space-y-8">
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {metricCards.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <Card key={index} variant={metric.variant} className="hover:scale-105 transition-transform">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <Icon className="h-8 w-8 md:h-10 md:w-10 text-black" />
                    <div>
                      <p className="text-xl md:text-3xl font-black text-black">{metric.value}</p>
                      <p className="text-xs font-bold text-black/70 uppercase tracking-widest">{metric.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {analysisResults && (
        <Card variant="white">
          <CardHeader className="border-b-4 border-black bg-gradient-to-r from-cyan-400 to-purple-400">
            <CardTitle className="flex items-center gap-3 text-black">
              <Zap className="h-6 w-6" />
              {getVisualizationTitle()}
              <Zap className="h-6 w-6" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-80 md:h-96 border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-white p-4">
              {renderVisualization()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Moments Display */}
      {(analysisResults || gameKeyMoments.length > 0) && (
        <div className="mt-6">
          <KeyMomentsDisplay moments={combinedKeyMoments} />
        </div>
      )}
    </div>
  );
}