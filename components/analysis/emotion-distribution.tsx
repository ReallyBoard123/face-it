// components/analysis/emotion-distribution.tsx
import { Card } from '@/components/ui/card';

interface EmotionDistributionProps {
  data: any;
}

export function EmotionDistribution({ data }: EmotionDistributionProps) {
  if (!data?.summary?.emotions?.statistics) {
    return null;
  }

  const emotions = data.summary.emotions.statistics;
  const total = Object.values(emotions).reduce((sum: number, stat: any) => sum + stat.mean, 0);

  const distribution = Object.entries(emotions)
    .map(([emotion, stats]: [string, any]) => ({
      emotion,
      percentage: (stats.mean / total) * 100
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const emotionColors: Record<string, string> = {
    anger: '#ef4444',
    disgust: '#f97316',
    fear: '#a855f7',
    happiness: '#22c55e',
    sadness: '#3b82f6',
    surprise: '#eab308',
    neutral: '#6b7280'
  };

  return (
    <div className="h-full flex flex-col justify-center">
      <div className="space-y-4">
        {distribution.map(({ emotion, percentage }, index) => (
          <div key={emotion} className="relative">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium capitalize">{emotion}</span>
              <span className="text-sm text-muted-foreground">
                {percentage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-8 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: emotionColors[emotion],
                  animationDelay: `${index * 100}ms`
                }}
              >
                {percentage > 10 && (
                  <span className="text-xs text-white font-medium">
                    {percentage.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}