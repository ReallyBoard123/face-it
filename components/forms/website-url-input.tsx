// components/forms/website-url-input.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ExternalLink, Globe } from 'lucide-react';

interface WebsiteUrlInputProps {
  websiteUrl: string;
  onUrlChange: (url: string) => void;
}

export function WebsiteUrlInput({ websiteUrl, onUrlChange }: WebsiteUrlInputProps) {
  return (
    <Card variant="white" className="p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2 justify-center">
          <Globe className="h-5 w-5 text-black" />
          <Label htmlFor="website-url" className="neo-text-label text-black text-center">
            WEBSITE URL
          </Label>
          <Globe className="h-5 w-5 text-black" />
        </div>
        
        <div className="relative">
          <Input
            id="website-url"
            type="url"
            placeholder="ENTER WEBSITE URL (e.g., google.com)"
            value={websiteUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            className="pr-12 text-center font-bold uppercase"
          />
          <ExternalLink className="absolute right-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/70" />
        </div>
        
        <Card variant="cyan" className="p-3">
          <div className="text-xs font-bold text-black text-center space-y-1 uppercase tracking-wide">
            <p>🌐 Website opens in new tab</p>
            <p>📹 Face & screen recorded</p>
            <p>⚡ Pure browsing chaos!</p>
          </div>
        </Card>
      </div>
    </Card>
  );
}