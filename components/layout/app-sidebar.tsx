// components/layout/app-sidebar.tsx
'use client';

import * as React from "react";
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

type AnalysisTypeString = "emotions" | "aus" | "combined" | "landmarks";
type VisualizationStyleString = "timeline" | "heatmap" | "distribution";

interface Settings {
  frameSkip: number;
  analysisType: AnalysisTypeString;
  visualizationStyle: VisualizationStyleString;
  detectionThreshold: number;
  batchSize: number;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function AppSidebar({ 
  settings, 
  onSettingsChange, 
  ...props 
}: AppSidebarProps) {
  const { setOpenMobile } = useSidebar();

  const updateSetting = (key: keyof Settings, value: string | number) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="p-0" />
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}