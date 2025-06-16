// components/analysis/emotional-timeline.tsx
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Zap, Target, Award } from 'lucide-react'; // Added Award for score

interface GameEvent {
  type: string;
  timestamp: number;
  data: GameEventData;
}

interface GameEventData {
  from?: number;
  to?: number;
  score?: number;
  finalScore?: number;
  [key: string]: unknown;
}

interface EmotionStats {
  max: number;
  peaks?: Array<unknown>;
}

interface TimelineData {
  timestamps?: number[];
  [emotion: string]: number[] | undefined;
}

interface AnalysisData {
  summary?: {
    emotions?: {
      timeline?: TimelineData;
      statistics?: Record<string, EmotionStats>;
    };
  };
}

interface EmotionTimelineProps {
  data: AnalysisData;
  gameEvents?: GameEvent[];
}

interface ChartDataPoint {
  time: string;
  timeValue: number;
  [emotion: string]: string | number;
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

interface EventMarker {
  timestamp: number;
  events: Array<GameEvent & { color: string }>;
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
  difficulty_change: '#f59e0b', // Orange
  target_hit: '#10b981',          // Green
  target_miss: '#ef4444',         // Red
  game_start: '#3b82f6',          // Blue
  game_end: '#6b7280',            // Gray
  flappy_bird_score_update: '#8b5cf6', // Purple for Flappy Bird score
  flappy_bird_game_start: '#3b82f6',
  flappy_bird_game_over: '#6b7280',
};

export function EmotionTimeline({ data, gameEvents = [] }: EmotionTimelineProps) {
  const chartData = useMemo(() => {
    if (!data?.summary?.emotions?.timeline) {
      return [];
    }

    const timeline = data.summary.emotions.timeline;
    const timestamps = timeline.timestamps || [];
    
    return timestamps.map((timestamp: number, index: number): ChartDataPoint => {
      const dataPoint: ChartDataPoint = {
        time: `${timestamp}s`,
        timeValue: timestamp
      };
      
      Object.keys(timeline).forEach(key => {
        if (key !== 'timestamps' && timeline[key] && timeline[key]![index] !== undefined) {
          dataPoint[key] = timeline[key]![index];
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
      .map(([emotion, stat]: [string, EmotionStats]) => ({
        emotion,
        maxValue: stat.max,
        peaks: stat.peaks?.length || 0
      }))
      .sort((a, b) => b.maxValue - a.maxValue)
      .slice(0, 3);
  }, [data]);

  const timelineEvents = useMemo(() => {
    return gameEvents
      .filter(event => [
        'difficulty_change', 
        'game_start', 
        'game_end',
        'flappy_bird_score_update',
        'flappy_bird_game_start',
        'flappy_bird_game_over'
      ].includes(event.type))
      .map(event => ({
        ...event,
        color: eventColors[event.type] || '#6b7280'
      }));
  }, [gameEvents]);

  const eventMarkers = useMemo(() => {
    const groups: Record<number, typeof timelineEvents> = {};
    timelineEvents.forEach(event => {
      const roundedTime = Math.round(event.timestamp);
      if (!groups[roundedTime]) groups[roundedTime] = [];
      // For score updates, keep only the last one for a given second to avoid clutter
      if (event.type === 'flappy_bird_score_update') {
        groups[roundedTime] = groups[roundedTime].filter(e => e.type !== 'flappy_bird_score_update');
      }
      groups[roundedTime].push(event);
    });
    return Object.entries(groups).map(([timestamp, events]): EventMarker => ({
      timestamp: parseInt(timestamp),
      events
    }));
  }, [timelineEvents]);

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const timeValue = parseFloat(String(label).replace('s', ''));
      const eventsAtTime = eventMarkers.find(m => Math.abs(m.timestamp - timeValue) < 1)?.events || [];
      
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg max-w-xs">
          <p className="font-medium">{`Time: ${label}`}</p>
          
          {payload.map((entry: TooltipPayload, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${(entry.value * 100).toFixed(1)}%`}
            </p>
          ))}
          
          {eventsAtTime.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">Game Events:</p>
              {eventsAtTime.map((event, index) => (
                <div key={index} className="text-xs" style={{ color: event.color }}>
                  {event.type === 'difficulty_change' && `StressClick: Level ${event.data.from} → ${event.data.to}`}
                  {event.type === 'game_start' && `StressClick: Game Started`}
                  {event.type === 'game_end' && `StressClick: Game Ended`}
                  {event.type === 'flappy_bird_score_update' && `Flappy Score: ${event.data.score}`}
                  {event.type === 'flappy_bird_game_start' && `Flappy: Game Started`}
                  {event.type === 'flappy_bird_game_over' && `Flappy: Game Over (Score: ${event.data.finalScore})`}
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
            <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="line" />
            
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

            {eventMarkers.map((markerGroup) => (
              markerGroup.events.map((marker, idx) => (
                 <ReferenceLine
                    key={`event-${marker.timestamp}-${marker.type}-${idx}`}
                    x={marker.timestamp}
                    stroke={marker.color || '#6b7280'}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: marker.type === 'difficulty_change' 
                              ? `L${marker.data?.to || '?'}` 
                              : marker.type === 'flappy_bird_score_update'
                              ? `S:${marker.data?.score}`
                              : '',
                      position: 'top',
                      offset: idx * 10, // Offset labels if multiple events at same timestamp
                      style: { 
                        fill: marker.color || '#6b7280',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }
                    }}
                  />
              ))
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3 mt-4 pt-4 border-t">
        {peakEmotions.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Peak emotions:
            </span>
            {peakEmotions.map(({ emotion, maxValue }) => (
              <Badge key={emotion} variant="secondary" style={{ backgroundColor: `${emotionColors[emotion]}20`, color: emotionColors[emotion], borderColor: emotionColors[emotion] }}>
                {emotion}: {(maxValue * 100).toFixed(0)}%
              </Badge>
            ))}
          </div>
        )}

        {timelineEvents.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Game events:
            </span>
            
            {timelineEvents.filter(e => e.type === 'difficulty_change').length > 0 && (
              <Badge variant="outline" className="text-xs">
                <Zap className="h-3 w-3 mr-1" /> {timelineEvents.filter(e => e.type === 'difficulty_change').length} StressClick level changes
              </Badge>
            )}
            {timelineEvents.filter(e => e.type === 'flappy_bird_score_update').length > 0 && (
               <Badge variant="outline" className="text-xs" style={{borderColor: eventColors.flappy_bird_score_update, color: eventColors.flappy_bird_score_update}}>
                <Award className="h-3 w-3 mr-1" /> Flappy Bird scores recorded
              </Badge>
            )}
             {(timelineEvents.some(e => e.type === 'game_start') || timelineEvents.some(e => e.type === 'flappy_bird_game_start')) && 
             (timelineEvents.some(e => e.type === 'game_end') || timelineEvents.some(e => e.type === 'flappy_bird_game_over')) && (
              <Badge variant="outline" className="text-xs">
                Game Duration: {Math.round(
                  (timelineEvents.find(e => e.type.includes('_game_end') || e.type.includes('_game_over'))?.timestamp || 0) -
                  (timelineEvents.find(e => e.type.includes('_game_start'))?.timestamp || 0)
                )}s
              </Badge>
            )}
          </div>
        )}

        {timelineEvents.length > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">Timeline markers:</span>
            {Object.entries(eventColors)
              .filter(([key]) => timelineEvents.some(ev => ev.type === key)) // Only show legend for present event types
              .map(([key, color]) => {
                let label = key.replace(/_/g, ' ');
                if (key === 'difficulty_change') label = 'StressClick Level';
                if (key === 'flappy_bird_score_update') label = 'Flappy Score';
                if (key.includes('_game_start')) label = 'Game Start';
                if (key.includes('_game_over') || key.includes('_game_end')) label = 'Game End';
                
                // Avoid duplicate legend items for start/end if both games are played (though not typical in one session)
                if ((key === 'game_start' && timelineEvents.some(ev => ev.type === 'flappy_bird_game_start')) ||
                    (key === 'game_end' && timelineEvents.some(ev => ev.type === 'flappy_bird_game_over'))) {
                      return null;
                    }

                return (
                  <span key={key} className="ml-2 capitalize">
                    <span style={{ color }}>■</span> {label}
                  </span>
                );
            })}
          </div>
        )}
      </div>
    </div>
  );
}