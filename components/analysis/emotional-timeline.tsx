import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !data?.summary?.emotions?.timeline) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const timeline = data.summary.emotions.timeline;
    const timestamps = timeline.timestamps;
    const emotions = Object.keys(timeline).filter(key => key !== 'timestamps');

    if (!timestamps || timestamps.length === 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Drawing parameters
    const padding = 40;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;
    const xStep = graphWidth / (timestamps.length - 1);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (graphHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${(1 - i / 5).toFixed(1)}`, padding - 10, y + 4);
    }

    // Draw emotion lines
    emotions.forEach((emotion, emotionIndex) => {
      const values = timeline[emotion];
      if (!values || values.length === 0) return;

      const color = emotionColors[emotion] || '#000';
      
      // Draw line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      values.forEach((value: number, i: number) => {
        const x = padding + i * xStep;
        const y = padding + graphHeight * (1 - value);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Add glow effect for higher values
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;

      // Draw label at the end
      const lastValue = values[values.length - 1];
      const lastX = padding + (values.length - 1) * xStep;
      const lastY = padding + graphHeight * (1 - lastValue);

      ctx.fillStyle = color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(emotion, lastX + 10, lastY + 4);
    });

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();

    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // X-axis labels (time)
    const timeStep = Math.max(1, Math.floor(timestamps.length / 10));
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    for (let i = 0; i < timestamps.length; i += timeStep) {
      const x = padding + i * xStep;
      const time = (i * 30 / 30).toFixed(0); // Assuming 30fps with 30 frame skip = 1 second
      ctx.fillText(`${time}s`, x, canvas.height - padding + 20);
    }

    // Title
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Emotion Intensity Over Time', canvas.width / 2, 20);

  }, [data]);

  // Find peak emotions
  const getPeakEmotions = () => {
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
  };

  const peakEmotions = getPeakEmotions();

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>

      {/* Peak emotions badges */}
      {peakEmotions.length > 0 && (
        <div className="flex gap-2 items-center">
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