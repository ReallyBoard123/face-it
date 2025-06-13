// components/forms/website-url-input.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';

interface WebsiteUrlInputProps {
  websiteUrl: string;
  onUrlChange: (url: string) => void;
}

export function WebsiteUrlInput({ websiteUrl, onUrlChange }: WebsiteUrlInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="website-url" className="text-sm font-medium">
        Website URL
      </Label>
      <div className="relative">
        <Input
          id="website-url"
          type="url"
          placeholder="Enter website URL (e.g., google.com)"
          value={websiteUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          className="pr-10"
        />
        <ExternalLink className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">
        The website will open in a new tab. Both your face and screen will be recorded.
      </p>
    </div>
  );
}