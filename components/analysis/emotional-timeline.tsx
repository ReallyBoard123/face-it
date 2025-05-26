// components/analysis/emotional-timeline.tsx
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Zap, Target } from 'lucide-react';

interface EmotionTimelineProps {
  data: any;
  gameEvents?: Array<{
    type: string;
    timestamp: number;
    data: any;
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

const eventColors: Record<string, string> = {
  difficulty_change: '#f59e0b',
  target_hit: '#10b981',
  target_miss: '#ef4444',
  game_start: '#3b82f6',
  game_end: '#6b7280'
};

export function EmotionTimeline({ data, gameEvents = [] }: EmotionTimelineProps) {
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

  // Process game events for timeline markers
  const timelineEvents = useMemo(() => {
    return gameEvents
      .filter(event => ['difficulty_change', 'game_start', 'game_end'].includes(event.type))
      .map(event => ({
        ...event,
        color: eventColors[event.type] || '#6b7280'
      }));
  }, [gameEvents]);

  // Group events by timestamp for better display
  const eventMarkers = useMemo(() => {
    const groups: Record<number, typeof timelineEvents> = {};
    
    timelineEvents.forEach(event => {
      const roundedTime = Math.round(event.timestamp);
      if (!groups[roundedTime]) {
        groups[roundedTime] = [];
      }
      groups[roundedTime].push(event);
    });
    
    return Object.entries(groups).map(([timestamp, events]) => ({
      timestamp: parseInt(timestamp),
      events
    }));
  }, [timelineEvents]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const timeValue = parseFloat(String(label).replace('s', ''));
      const eventsAtTime = eventMarkers.find(m => Math.abs(m.timestamp - timeValue) < 1)?.events || [];
      
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg max-w-xs">
          <p className="font-medium">{`Time: ${label}`}</p>
          
          {/* Emotion values */}
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${(entry.value * 100).toFixed(1)}%`}
            </p>
          ))}
          
          {/* Game events at this time */}
          {eventsAtTime.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">Game Events:</p>
              {eventsAtTime.map((event, index) => (
                <div key={index} className="text-xs" style={{ color: event.color }}>
                  {event.type === 'difficulty_change' && (
                    <span>Difficulty: Level {event.data.from} → {event.data.to}</span>
                  )}
                  {event.type === 'game_start' && <span>Game Started</span>}
                  {event.type === 'game_end' && <span>Game Ended</span>}
                </div>
              ))}
            </div>
          )}
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
            
            {/* Emotion lines */}
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

            {/* Event markers */}
            {eventMarkers.map((marker) => (
              <ReferenceLine
                key={`event-${marker.timestamp}`}
                x={marker.timestamp}
                stroke={marker.events[0]?.color || '#6b7280'}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: marker.events[0]?.type === 'difficulty_change' ? 
                    `L${marker.events[0]?.data?.to || '?'}` : '',
                  position: 'top',
                  style: { 
                    fill: marker.events[0]?.color || '#6b7280',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom info section */}
      <div className="space-y-3 mt-4 pt-4 border-t">
        {/* Peak emotions */}
        {peakEmotions.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Peak emotions:
            </span>
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

        {/* Game event summary */}
        {timelineEvents.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Game events:
            </span>
            
            {/* Difficulty changes */}
            {timelineEvents.filter(e => e.type === 'difficulty_change').length > 0 && (
              <Badge variant="outline" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                {timelineEvents.filter(e => e.type === 'difficulty_change').length} difficulty changes
              </Badge>
            )}
            
            {/* Game duration */}
            {timelineEvents.some(e => e.type === 'game_start') && timelineEvents.some(e => e.type === 'game_end') && (
              <Badge variant="outline" className="text-xs">
                Duration: {Math.round(
                  (timelineEvents.find(e => e.type === 'game_end')?.timestamp || 0) -
                  (timelineEvents.find(e => e.type === 'game_start')?.timestamp || 0)
                )}s
              </Badge>
            )}
          </div>
        )}

        {/* Event legend */}
        {timelineEvents.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Timeline markers:</span>
            <span className="ml-2">
              <span style={{ color: eventColors.difficulty_change }}>■</span> Difficulty changes
            </span>
            <span className="ml-2">
              <span style={{ color: eventColors.game_start }}>■</span> Game start/end
            </span>
          </div>
        )}
      </div>
    </div>
  );
}