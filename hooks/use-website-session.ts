// hooks/use-website-session.ts
import { useState, useRef, useCallback } from 'react';

export function useWebsiteSession() {
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const websiteTabRef = useRef<Window | null>(null);
  const tabCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }, []);

  const normalizeUrl = useCallback((url: string): string => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }, []);

  const openWebsiteTab = useCallback((url: string) => {
    const normalizedUrl = normalizeUrl(url);
    websiteTabRef.current = window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
    return normalizedUrl;
  }, [normalizeUrl]);

  const startTabMonitoring = useCallback((onTabClosed: () => void) => {
    if (websiteTabRef.current) {
      tabCheckIntervalRef.current = setInterval(() => {
        if (websiteTabRef.current?.closed) {
          onTabClosed();
        }
      }, 1000);
    }
  }, []);

  const stopTabMonitoring = useCallback(() => {
    if (tabCheckIntervalRef.current) {
      clearInterval(tabCheckIntervalRef.current);
      tabCheckIntervalRef.current = null;
    }
  }, []);

  const closeWebsiteTab = useCallback(() => {
    if (websiteTabRef.current && !websiteTabRef.current.closed) {
      try {
        websiteTabRef.current.close();
      } catch (error) {
        console.log("Could not close tab programmatically (normal for cross-origin tabs)");
      }
    }
    websiteTabRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopTabMonitoring();
    closeWebsiteTab();
    setWebsiteUrl("");
  }, [stopTabMonitoring, closeWebsiteTab]);

  return {
    websiteUrl,
    setWebsiteUrl,
    websiteTabRef,
    isValidUrl,
    normalizeUrl,
    openWebsiteTab,
    startTabMonitoring,
    stopTabMonitoring,
    closeWebsiteTab,
    cleanup,
  };
}