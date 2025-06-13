'use client';

import * as React from "react";
import { X, SettingsIcon, SlidersHorizontal, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { EyeTrackingCalibrationDialog } from '@/components/dialogs/eye-tracking-calibration-dialog';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  settings: {
    frameSkip: number;
    analysisType: string;
    visualizationStyle: string;
    detectionThreshold: number;
    batchSize: number;
    eyeTrackingEnabled: boolean;
    eyeTrackingSessionId?: string;
  };
  onSettingsChange: (settings: any) => void;
}

export function AppSidebar({ settings, onSettingsChange, ...props }: AppSidebarProps) {
  const { openMobile, setOpenMobile, state } = useSidebar();
  const [isCalibrationDialogOpen, setIsCalibrationDialogOpen] = React.useState(false);

  const updateSetting = (key: string, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleEyeTrackingToggle = (enabled: boolean) => {
    if (enabled && !settings.eyeTrackingSessionId) {
      // Show calibration dialog if enabling for the first time
      setIsCalibrationDialogOpen(true);
    } else {
      // Simply toggle the setting
      updateSetting('eyeTrackingEnabled', enabled);
      if (!enabled) {
        // Show toast when disabling
        toast.info('Eye tracking disabled', {
          description: 'Eye tracking has been turned off for this session.',
        });
      }
    }
  };

  const handleCalibrationSuccess = (sessionId: string) => {
    updateSetting('eyeTrackingEnabled', true);
    updateSetting('eyeTrackingSessionId', sessionId);
    toast.success('Eye tracking enabled!', {
      description: 'You can now use eye tracking in your recordings.',
    });
  };

  const handleRecalibrate = () => {
    setIsCalibrationDialogOpen(true);
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="p-0">
        {/* Header for the main sidebar content - adjust if needed */}
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col h-full">
          {/* Settings Header */}
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Settings</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpenMobile(false)}
              className="md:hidden"
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

            {/* Eye Tracking */}
            <div className="space-y-3">
              <Label htmlFor="eyeTracking" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Eye Tracking
              </Label>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="eyeTrackingSwitch" className="text-sm font-normal">
                  Enable Eye Tracking
                </Label>
                <Switch
                  id="eyeTrackingSwitch"
                  checked={settings.eyeTrackingEnabled}
                  onCheckedChange={handleEyeTrackingToggle}
                />
              </div>
              
              {settings.eyeTrackingEnabled && settings.eyeTrackingSessionId && (
                <div className="space-y-2">
                  <div className="text-xs text-green-600 bg-green-50 dark:bg-green-950 p-2 rounded">
                    ✅ Calibrated (Session: {settings.eyeTrackingSessionId.slice(0, 8)}...)
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRecalibrate}
                    className="w-full text-xs"
                  >
                    Recalibrate
                  </Button>
                </div>
              )}
              
              {!settings.eyeTrackingEnabled && (
                <p className="text-xs text-muted-foreground">
                  Enable to track eye movements during recording sessions
                </p>
              )}
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
                  eyeTrackingEnabled: false,
                  eyeTrackingSessionId: undefined,
                });
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
      
      {/* Eye Tracking Calibration Dialog */}
      <EyeTrackingCalibrationDialog
        isOpen={isCalibrationDialogOpen}
        onOpenChange={setIsCalibrationDialogOpen}
        onCalibrationSuccess={handleCalibrationSuccess}
      />
    </Sidebar>
  );
}