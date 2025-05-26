import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AuHeatmapProps {
  data: any;
}

// AU descriptions for better tooltips
const auDescriptions: Record<string, string> = {
  'AU01': 'Inner Brow Raiser',
  'AU02': 'Outer Brow Raiser', 
  'AU04': 'Brow Lowerer',
  'AU05': 'Upper Lid Raiser',
  'AU06': 'Cheek Raiser',
  'AU07': 'Lid Tightener',
  'AU09': 'Nose Wrinkler',
  'AU10': 'Upper Lip Raiser',
  'AU12': 'Lip Corner Puller',
  'AU14': 'Dimpler',
  'AU15': 'Lip Corner Depressor',
  'AU17': 'Chin Raiser',
  'AU20': 'Lip Stretcher',
  'AU23': 'Lip Tightener',
  'AU25': 'Lips Part',
  'AU26': 'Jaw Drop',
  'AU45': 'Blink'
};

export function AuHeatmap({ data }: AuHeatmapProps) {
  const auData = useMemo(() => {
    if (!data?.summary?.action_units?.statistics) {
      return [];
    }

    const auStats = data.summary.action_units.statistics;
    
    return Object.entries(auStats)
      .map(([au, stats]: [string, any]) => ({
        au,
        name: auDescriptions[au] || au,
        intensity: stats.mean * 100,
        activation: stats.activation_rate * 100,
        maxIntensity: stats.max_intensity * 100,
        color: getIntensityColor(stats.mean)
      }))
      .sort((a, b) => {
        // Sort by AU number
        const numA = parseInt(a.au.replace('AU', ''));
        const numB = parseInt(b.au.replace('AU', ''));
        return numA - numB;
      });
  }, [data]);

  const activeAUs = useMemo(() => {
    return auData.filter(au => au.activation > 50);
  }, [auData]);

  const getIntensityColor = (intensity: number) => {
    // Create a color gradient from blue to red based on intensity
    if (intensity < 0.2) return '#e0f2fe'; // Very light blue
    if (intensity < 0.4) return '#81d4fa'; // Light blue  
    if (intensity < 0.6) return '#29b6f6'; // Medium blue
    if (intensity < 0.8) return '#0277bd'; // Dark blue
    return '#01579b'; // Very dark blue
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg max-w-xs">
          <p className="font-medium">{data.au}</p>
          <p className="text-sm text-muted-foreground">{data.name}</p>
          <p className="text-sm">Intensity: {data.intensity.toFixed(1)}%</p>
          <p className="text-sm">Activation Rate: {data.activation.toFixed(1)}%</p>
          <p className="text-sm">Peak: {data.maxIntensity.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  if (!auData.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No Action Unit data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Main Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={auData} 
            margin={{ top: 20, right: 30, left: 40, bottom: 80 }}
            layout="horizontal"
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              className="text-xs"
            />
            <YAxis 
              type="category"
              dataKey="au"
              className="text-xs"
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="intensity" radius={[0, 4, 4, 0]}>
              {auData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke={entry.activation > 50 ? '#3b82f6' : 'transparent'}
                  strokeWidth={entry.activation > 50 ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Active AUs Summary */}
      {activeAUs.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-muted-foreground">
              Highly Active AUs ({activeAUs.length}):
            </span>
            {activeAUs.slice(0, 5).map((au) => (
              <div 
                key={au.au}
                className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 border"
                title={au.name}
              >
                {au.au} ({au.intensity.toFixed(0)}%)
              </div>
            ))}
            {activeAUs.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{activeAUs.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 pt-2 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Low Intensity</span>
          <div className="flex gap-1">
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
              <div
                key={v}
                className="w-6 h-3 rounded"
                style={{ backgroundColor: getIntensityColor(v) }}
              />
            ))}
          </div>
          <span>High Intensity</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Blue border indicates activation rate &gt; 50%
        </p>
      </div>
    </div>
  );
}