import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';

interface EmotionTimelineProps {
  data: any;
}

const emotionColors: Record<string, string> = {
  anger: '#ef4444',
  disgust: '#f97316', 
  fear: '#a855f7',
  happiness: '#22c55e',
  sadness: '#3b82f6',
  surprise: '#eab308',
  neutral: '#6b7280'
};

export function EmotionTimeline({ data }: EmotionTimelineProps) {
  const chartData = useMemo(() => {
    if (!data?.summary?.emotions?.timeline) {
      return [];
    }

    const timeline = data.summary.emotions.timeline;
    const timestamps = timeline.timestamps || [];
    
    // Transform the data into the format Recharts expects
    return timestamps.map((timestamp: number, index: number) => {
      const dataPoint: any = {
        time: `${timestamp}s`,
        timeValue: timestamp
      };
      
      // Add each emotion value for this timestamp
      Object.keys(timeline).forEach(key => {
        if (key !== 'timestamps' && timeline[key] && timeline[key][index] !== undefined) {
          dataPoint[key] = timeline[key][index];
        }
      });
      
      return dataPoint;
    });
  }, [data]);

  const emotions = useMemo(() => {
    if (!data?.summary?.emotions?.timeline) return [];
    
    return Object.keys(data.summary.emotions.timeline).filter(key => key !== 'timestamps');
  }, [data]);

  const peakEmotions = useMemo(() => {
    if (!data?.summary?.emotions?.statistics) return [];
    
    const stats = data.summary.emotions.statistics;
    return Object.entries(stats)
      .map(([emotion, stat]: [string, any]) => ({
        emotion,
        maxValue: stat.max,
        peaks: stat.peaks?.length || 0
      }))
      .sort((a, b) => b.maxValue - a.maxValue)
      .slice(0, 3);
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{`Time: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${(entry.value * 100).toFixed(1)}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No emotion timeline data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="timeValue"
              type="number"
              scale="linear"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `${value}s`}
              className="text-xs"
            />
            <YAxis 
              domain={[0, 1]}
              tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="line"
            />
            
            {emotions.map((emotion) => (
              <Line
                key={emotion}
                type="monotone"
                dataKey={emotion}
                stroke={emotionColors[emotion] || '#6b7280'}
                strokeWidth={2}
                dot={false}
                name={emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Peak emotions badges */}
      {peakEmotions.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground">Peak emotions:</span>
          {peakEmotions.map(({ emotion, maxValue }) => (
            <Badge 
              key={emotion}
              variant="secondary"
              style={{ 
                backgroundColor: `${emotionColors[emotion]}20`,
                color: emotionColors[emotion],
                borderColor: emotionColors[emotion]
              }}
            >
              {emotion}: {(maxValue * 100).toFixed(0)}%
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}