// components/video/video-preview.tsx
import { useEffect, useRef } from 'react';

interface VideoPreviewProps {
  videoBlob: Blob;
}

export function VideoPreview({ videoBlob }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoBlob) {
      const url = URL.createObjectURL(videoBlob);
      videoRef.current.src = url;
      
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [videoBlob]);

  return (
    <video
      ref={videoRef}
      controls
      className="w-full h-full rounded-lg object-contain bg-black"
    />
  );
}