// components/analysis/au-heatmap.tsx
interface AuHeatmapProps {
    data: any;
  }
  
  export function AuHeatmap({ data }: AuHeatmapProps) {
    if (!data?.summary?.action_units?.statistics) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground">No Action Unit data available</p>
        </div>
      );
    }
  
    const auStats = data.summary.action_units.statistics;
    const sortedAUs = Object.entries(auStats)
      .sort(([a], [b]) => {
        const numA = parseInt(a.replace('AU', ''));
        const numB = parseInt(b.replace('AU', ''));
        return numA - numB;
      });
  
    const getIntensityColor = (value: number) => {
      const intensity = Math.floor(value * 255);
      return `rgb(${255 - intensity}, ${255 - intensity * 0.5}, ${255})`;
    };
  
    return (
      <div className="h-full overflow-auto">
        <div className="grid grid-cols-5 gap-2 p-4">
          {sortedAUs.map(([au, stats]: [string, any]) => (
            <div
              key={au}
              className="aspect-square rounded-lg border flex flex-col items-center justify-center p-2 transition-transform hover:scale-105"
              style={{
                backgroundColor: getIntensityColor(stats.mean),
                borderColor: stats.activation_rate > 0.5 ? '#3b82f6' : '#e5e7eb'
              }}
            >
              <span className="font-bold text-sm">{au}</span>
              <span className="text-xs opacity-75">
                {(stats.mean * 100).toFixed(0)}%
              </span>
              {stats.activation_rate > 0.5 && (
                <span className="text-xs font-medium text-blue-600 mt-1">
                  Active
                </span>
              )}
            </div>
          ))}
        </div>
        
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Low Intensity</span>
            <div className="flex gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                <div
                  key={v}
                  className="w-8 h-4 rounded"
                  style={{ backgroundColor: getIntensityColor(v) }}
                />
              ))}
            </div>
            <span>High Intensity</span>
          </div>
        </div>
      </div>
    );
  }