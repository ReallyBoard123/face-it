import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  SmilePlus, 
  Frown, 
  Meh, 
  AlertCircle,
  Activity,
  TrendingUp
} from 'lucide-react';

interface AnalysisSummaryProps {
  results: any;
}

const emotionIcons: Record<string, any> = {
  happiness: SmilePlus,
  sadness: Frown,
  neutral: Meh,
  surprise: AlertCircle,
  anger: AlertCircle,
  fear: AlertCircle,
  disgust: AlertCircle
};

export function AnalysisSummary({ results }: AnalysisSummaryProps) {
  if (!results?.data?.summary) {
    return null;
  }

  const { summary } = results.data;
  const emotions = summary.emotions?.statistics || {};
  const dominantEmotions: Record<string, number> = summary.emotions?.dominant_emotions || {};

  // Calculate overall emotional valence
  const calculateValence = () => {
    const positive = emotions.happiness?.mean || 0;
    const negative = (emotions.sadness?.mean || 0) + 
                    (emotions.anger?.mean || 0) + 
                    (emotions.fear?.mean || 0) + 
                    (emotions.disgust?.mean || 0);
    return positive - negative / 4;
  };

  const valence = calculateValence();

  // Get top emotions
  const topEmotions = Object.entries(emotions)
    .map(([emotion, stats]: [string, any]) => ({
      emotion,
      mean: stats.mean,
      max: stats.max
    }))
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Frames Analyzed</p>
              <p className="text-2xl font-bold">{summary.total_frames}</p>
            </div>
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Emotional Valence</p>
              <p className="text-2xl font-bold">
                {valence > 0 ? '+' : ''}{(valence * 100).toFixed(0)}%
              </p>
            </div>
            <TrendingUp className={`h-8 w-8 ${valence > 0 ? 'text-green-500' : 'text-red-500'}`} />
          </div>
        </Card>
      </div>

      {/* Top Emotions */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Emotion Breakdown</h4>
        {topEmotions.map(({ emotion, mean, max }) => {
          const Icon = emotionIcons[emotion] || Activity;
          return (
            <div key={emotion} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{emotion}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {(mean * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={mean * 100} className="h-2" />
            </div>
          );
        })}
      </div>

      {/* Dominant Emotions Count */}
      {Object.keys(dominantEmotions).length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Most Frequent Dominant Emotions
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(dominantEmotions)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([emotion, count]) => (
                <div 
                  key={emotion}
                  className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-full"
                >
                  <span className="text-xs font-medium capitalize">{emotion}</span>
                  <span className="text-xs text-muted-foreground">×{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}