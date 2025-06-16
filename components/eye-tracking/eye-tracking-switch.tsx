// components/eye-tracking/eye-tracking-switch.tsx
'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

interface EyeTrackingSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function EyeTrackingSwitch({ enabled, onToggle, disabled = false }: EyeTrackingSwitchProps) {
  return (
    <div className="flex items-center space-x-2">
      {enabled ? (
        <Eye className="h-4 w-4 text-blue-500" />
      ) : (
        <EyeOff className="h-4 w-4 text-gray-400" />
      )}
      <Label htmlFor="eye-tracking" className="text-sm font-medium cursor-pointer">
        Eye Tracking
      </Label>
      <Switch
        id="eye-tracking"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
    </div>
  );
}