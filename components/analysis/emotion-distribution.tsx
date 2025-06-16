import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface EmotionStats {
  mean: number;
  max: number;
}

interface AnalysisData {
  summary?: {
    emotions?: {
      statistics?: Record<string, EmotionStats>;
    };
  };
}

interface EmotionDistributionProps {
  data: AnalysisData;
}

interface EmotionDataPoint {
  emotion: string;
  percentage: number;
  mean: number;
  max: number;
  color: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: EmotionDataPoint;
  }>;
  label?: string;
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: EmotionDataPoint;
  }>;
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

export function EmotionDistribution({ data }: EmotionDistributionProps) {
  const distributionData = useMemo(() => {
    if (!data?.summary?.emotions?.statistics) {
      return [];
    }

    const emotions = data.summary.emotions.statistics;
    
    return Object.entries(emotions)
      .map(([emotion, stats]: [string, EmotionStats]) => ({
        emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
        percentage: stats.mean * 100,
        mean: stats.mean,
        max: stats.max * 100,
        color: emotionColors[emotion] || '#6b7280'
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          <p style={{ color: data.color }}>
            Average: {data.percentage.toFixed(1)}%
          </p>
          <p style={{ color: data.color }}>
            Peak: {data.max.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: PieTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.emotion}</p>
          <p style={{ color: data.color }}>
            {data.percentage.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (!distributionData.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No emotion distribution data available</p>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bar Chart */}
      <div className="flex flex-col">
        <h4 className="text-sm font-medium mb-4 text-center">Average Intensity</h4>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distributionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="emotion"
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="percentage" 
              radius={[4, 4, 0, 0]}
            >
              {distributionData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart */}
      <div className="flex flex-col">
        <h4 className="text-sm font-medium mb-4 text-center">Distribution</h4>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distributionData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="percentage"
              label={({ emotion, percentage }) => `${emotion}: ${percentage.toFixed(1)}%`}
              labelLine={false}
            >
              {distributionData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}