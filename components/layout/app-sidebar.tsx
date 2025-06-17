// components/layout/app-sidebar.tsx
'use client';

import * as React from "react";
import { X, SlidersHorizontal, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
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
    <Sidebar {...props} className="border-r-8 border-black">
      <SidebarHeader className="p-0" />
      <SidebarContent className="neo-purple">
        <div className="flex flex-col h-full">
          {/* Settings Header */}
          <div className="p-6 border-b-4 border-black flex items-center justify-between bg-black/10">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="h-6 w-6 text-black" />
              <h2 className="neo-text-heading text-black">SETTINGS</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpenMobile(false)}
              className="md:hidden border-4 border-black"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-auto p-6 space-y-8">
            {/* Frame Skip */}
            <Card variant="white" className="p-4">
              <div className="space-y-4">
                <Label htmlFor="frameSkip" className="neo-text-label text-black">
                  FRAME SKIP
                </Label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="frameSkip"
                    min={1}
                    max={60}
                    step={1}
                    value={[settings.frameSkip]}
                    onValueChange={([value]) => updateSetting('frameSkip', value)}
                    className="flex-1"
                  />
                  <Card variant="yellow" className="px-3 py-2 min-w-[3rem]">
                    <span className="font-black text-black text-center">
                      {settings.frameSkip}
                    </span>
                  </Card>
                </div>
                <p className="text-xs font-bold text-black/70 uppercase tracking-wide">
                  Process every Nth frame (higher = faster)
                </p>
              </div>
            </Card>

            <Separator className="border-black border-t-4" />

            {/* Analysis Type */}
            <Card variant="cyan" className="p-4">
              <div className="space-y-4">
                <Label htmlFor="analysisType" className="neo-text-label text-black">
                  ANALYSIS TYPE
                </Label>
                <Select
                  value={settings.analysisType}
                  onValueChange={(value) => updateSetting('analysisType', value)}
                >
                  <SelectTrigger id="analysisType" className="neo-input h-12 font-bold uppercase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-4 border-black">
                    <SelectItem value="emotions" className="font-bold uppercase">EMOTIONS ONLY</SelectItem>
                    <SelectItem value="aus" className="font-bold uppercase">ACTION UNITS ONLY</SelectItem>
                    <SelectItem value="combined" className="font-bold uppercase">COMBINED ANALYSIS</SelectItem>
                    <SelectItem value="landmarks" className="font-bold uppercase">FACIAL LANDMARKS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Separator className="border-black border-t-4" />

            {/* Visualization Style */}
            <Card variant="green" className="p-4">
              <div className="space-y-4">
                <Label htmlFor="visualizationStyle" className="neo-text-label text-black">
                  VISUALIZATION STYLE
                </Label>
                <Select
                  value={settings.visualizationStyle}
                  onValueChange={(value) => updateSetting('visualizationStyle', value)}
                >
                  <SelectTrigger id="visualizationStyle" className="neo-input h-12 font-bold uppercase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-4 border-black">
                    <SelectItem value="timeline" className="font-bold uppercase">TIMELINE</SelectItem>
                    <SelectItem value="heatmap" className="font-bold uppercase">HEATMAP</SelectItem>
                    <SelectItem value="distribution" className="font-bold uppercase">DISTRIBUTION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Separator className="border-black border-t-4" />

            {/* Detection Threshold */}
            <Card variant="orange" className="p-4">
              <div className="space-y-4">
                <Label htmlFor="detectionThreshold" className="neo-text-label text-black">
                  DETECTION THRESHOLD
                </Label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="detectionThreshold"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={[settings.detectionThreshold]}
                    onValueChange={([value]) => updateSetting('detectionThreshold', value)}
                    className="flex-1"
                  />
                  <Card variant="pink" className="px-3 py-2 min-w-[4rem]">
                    <span className="font-black text-black text-center">
                      {settings.detectionThreshold.toFixed(2)}
                    </span>
                  </Card>
                </div>
                <p className="text-xs font-bold text-black/70 uppercase tracking-wide">
                  Face detection sensitivity (lower = more detections)
                </p>
              </div>
            </Card>

            <Separator className="border-black border-t-4" />

            {/* Advanced Settings */}
            <Card variant="yellow" className="p-4">
              <details className="space-y-4">
                <summary className="cursor-pointer font-black text-black text-lg uppercase tracking-wider flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  ADVANCED SETTINGS
                </summary>
                <div className="pt-4 space-y-4">
                  {/* Batch Size */}
                  <div className="space-y-4">
                    <Label htmlFor="batchSize" className="neo-text-label text-black">
                      BATCH SIZE
                    </Label>
                    <Select
                      value={settings.batchSize.toString()}
                      onValueChange={(value) => updateSetting('batchSize', parseInt(value))}
                    >
                      <SelectTrigger id="batchSize" className="neo-input h-12 font-bold uppercase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-4 border-black">
                        <SelectItem value="1" className="font-bold uppercase">1 (LOW MEMORY)</SelectItem>
                        <SelectItem value="4" className="font-bold uppercase">4 (BALANCED)</SelectItem>
                        <SelectItem value="8" className="font-bold uppercase">8 (FAST)</SelectItem>
                        <SelectItem value="16" className="font-bold uppercase">16 (VERY FAST)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs font-bold text-black/70 uppercase tracking-wide">
                      Frames processed simultaneously
                    </p>
                  </div>
                </div>
              </details>
            </Card>
          </div>

          {/* Footer */}
          <div className="p-6 border-t-4 border-black bg-black/10">
            <Button
              variant="destructive"
              className="w-full"
              size="lg"
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
              <RotateCcw className="mr-3 h-5 w-5" />
              RESET
            </Button>
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}