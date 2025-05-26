import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  settings: {
    frameSkip: number;
    analysisType: string;
    visualizationStyle: string;
    detectionThreshold: number;
    batchSize: number;
  };
  onSettingsChange: (settings: any) => void;
}

export function Sidebar({ open, onClose, settings, onSettingsChange }: SidebarProps) {
  const updateSetting = (key: string, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed lg:relative z-50 h-full w-72 bg-card border-r transform transition-transform duration-200 ease-in-out",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Settings</h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="lg:hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Frame Skip */}
            <div className="space-y-2">
              <Label htmlFor="frameSkip">Frame Skip</Label>
              <div className="flex items-center space-x-2">
                <Slider
                  id="frameSkip"
                  min={1}
                  max={60}
                  step={1}
                  value={[settings.frameSkip]}
                  onValueChange={([value]) => updateSetting('frameSkip', value)}
                  className="flex-1"
                />
                <span className="w-12 text-sm text-muted-foreground">
                  {settings.frameSkip}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Process every Nth frame (higher = faster analysis)
              </p>
            </div>

            <Separator />

            {/* Analysis Type */}
            <div className="space-y-2">
              <Label htmlFor="analysisType">Analysis Type</Label>
              <Select 
                value={settings.analysisType} 
                onValueChange={(value) => updateSetting('analysisType', value)}
              >
                <SelectTrigger id="analysisType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emotions">Emotions Only</SelectItem>
                  <SelectItem value="aus">Action Units Only</SelectItem>
                  <SelectItem value="combined">Combined Analysis</SelectItem>
                  <SelectItem value="landmarks">Facial Landmarks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Visualization Style */}
            <div className="space-y-2">
              <Label htmlFor="visualizationStyle">Visualization Style</Label>
              <Select 
                value={settings.visualizationStyle} 
                onValueChange={(value) => updateSetting('visualizationStyle', value)}
              >
                <SelectTrigger id="visualizationStyle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeline">Timeline</SelectItem>
                  <SelectItem value="heatmap">Heatmap</SelectItem>
                  <SelectItem value="distribution">Distribution</SelectItem>
                  <SelectItem value="peaks">Peak Moments</SelectItem>
                  <SelectItem value="comparison">Comparison</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Detection Threshold */}
            <div className="space-y-2">
              <Label htmlFor="detectionThreshold">Detection Threshold</Label>
              <div className="flex items-center space-x-2">
                <Slider
                  id="detectionThreshold"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={[settings.detectionThreshold]}
                  onValueChange={([value]) => updateSetting('detectionThreshold', value)}
                  className="flex-1"
                />
                <span className="w-12 text-sm text-muted-foreground">
                  {settings.detectionThreshold.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Face detection sensitivity (lower = more detections)
              </p>
            </div>

            <Separator />

            {/* Advanced Settings */}
            <details className="space-y-2">
              <summary className="cursor-pointer font-medium text-sm">
                Advanced Settings
              </summary>
              <div className="pt-4 space-y-4">
                {/* Batch Size */}
                <div className="space-y-2">
                  <Label htmlFor="batchSize">Batch Size</Label>
                  <Select 
                    value={settings.batchSize.toString()} 
                    onValueChange={(value) => updateSetting('batchSize', parseInt(value))}
                  >
                    <SelectTrigger id="batchSize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 (Low Memory)</SelectItem>
                      <SelectItem value="4">4 (Balanced)</SelectItem>
                      <SelectItem value="8">8 (Fast)</SelectItem>
                      <SelectItem value="16">16 (Very Fast)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Frames processed simultaneously
                  </p>
                </div>
              </div>
            </details>
          </div>

          {/* Footer */}
          <div className="p-6 border-t">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                // Reset to defaults
                onSettingsChange({
                  frameSkip: 30,
                  analysisType: 'combined',
                  visualizationStyle: 'timeline',
                  detectionThreshold: 0.5,
                  batchSize: 1,
                });
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}