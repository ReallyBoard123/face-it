// components/video/video-recorder.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Progress } from '@/components/ui/progress';
import { Square, Circle, Video as VideoIcon } from 'lucide-react';
import { Button } from '../ui/button';

interface VideoRecorderProps {
  onVideoRecorded: (blob: Blob) => void;
  isAnalyzing: boolean;
  recordingDuration?: number;
  onRecordingStarted?: () => void;
  onRecordingStopped?: (blob: Blob) => void;
  showControls?: boolean;
}

export interface VideoRecorderHandles {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getStream: () => MediaStream | null;
  requestPermissions: () => Promise<MediaStream | null>;
  captureFrame: () => string | null; // Added for capturing current frame
}

const VideoRecorder = forwardRef<VideoRecorderHandles, VideoRecorderProps>(
  ({
    onVideoRecorded,
    isAnalyzing,
    recordingDuration,
    onRecordingStarted,
    onRecordingStopped,
    showControls = true,
  }, ref) => {
    const [isRecordingInternal, setIsRecordingInternal] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

    const requestPermissionsAndSetupStream = useCallback(async (): Promise<MediaStream | null> => {
      setError(null);
      try {
        const webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
        setStream(webcamStream);
        if (videoRef.current) {
          videoRef.current.srcObject = webcamStream;
        }
        return webcamStream;
      } catch (err) {
        console.error('Error accessing webcam:', err);
        setError('Failed to access webcam. Please ensure permissions are granted.');
        return null;
      }
    }, []);

    const startManualRecording = useCallback(async () => {
      let streamToRecord = stream;
      if (!streamToRecord) {
        streamToRecord = await requestPermissionsAndSetupStream();
        if (!streamToRecord) {
            setError('Cannot start recording without webcam stream.');
            return;
        }
      }
      if (isRecordingInternal || mediaRecorderRef.current?.state === 'recording') {
        console.warn("Recording is already in progress.");
        return;
      }

      setError(null);
      try {
        chunksRef.current = [];
        if (videoRef.current && !videoRef.current.srcObject) {
            videoRef.current.srcObject = streamToRecord;
        }

        const options = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} is not supported, trying default.`);
            // @ts-ignore
            delete options.mimeType;
        }
        const mediaRecorder = new MediaRecorder(streamToRecord, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: options.mimeType || 'video/webm' });
          onVideoRecorded(blob);
          if (onRecordingStopped) onRecordingStopped(blob);
        };
        
        mediaRecorder.onerror = (event) => {
            // @ts-ignore
            console.error("MediaRecorder error:", event.error);
            // @ts-ignore
            setError(`MediaRecorder error: ${event.error.name} - ${event.error.message}`);
            setIsRecordingInternal(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
        };

        mediaRecorder.start();
        setIsRecordingInternal(true);
        if (onRecordingStarted) onRecordingStarted();

        setRecordingTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);

        if (recordingDuration && recordingDuration > 0) {
          if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
          durationTimerRef.current = setTimeout(() => stopManualRecording(), recordingDuration * 1000);
        }
      } catch (err) {
        console.error('Error starting recording:', err);
        setError(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`);
        setIsRecordingInternal(false);
      }
    }, [stream, isRecordingInternal, onVideoRecorded, recordingDuration, onRecordingStarted, onRecordingStopped, requestPermissionsAndSetupStream]);

    const stopManualRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingInternal(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
    }, []);

    const captureCurrentFrameAsBase64 = useCallback((): string | null => {
        if (videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.8); // Use JPEG with quality for smaller size
          }
        }
        console.warn("VideoRecorder: Could not capture frame. Video not ready or dimensions are zero.");
        return null;
      }, []);

    useImperativeHandle(ref, () => ({
      startRecording: startManualRecording,
      stopRecording: stopManualRecording,
      getStream: () => stream,
      requestPermissions: requestPermissionsAndSetupStream,
      captureFrame: captureCurrentFrameAsBase64,
    }));

    useEffect(() => {
      return () => {
        stream?.getTracks().forEach(track => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
      };
    }, [stream]);

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 relative bg-muted rounded-lg overflow-hidden aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {isRecordingInternal && (
            <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded-md text-xs flex items-center gap-1">
              <Circle className="h-2 w-2 fill-current animate-pulse" />
              <span>{formatTime(recordingTime)}</span>
            </div>
          )}
          {!stream && !error && !isRecordingInternal && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <VideoIcon className="h-12 w-12" />
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

        {showControls && (
          <>
            <div className="mt-4">
              <Button
                onClick={isRecordingInternal ? stopManualRecording : startManualRecording}
                variant={isRecordingInternal ? "destructive" : "default"}
                className="w-full"
                disabled={isAnalyzing || (!stream && !isRecordingInternal && !error) } // Disable if no stream and not recording unless there's an error
              >
                {isRecordingInternal ? <Square className="mr-2 h-4 w-4" /> : <Circle className="mr-2 h-4 w-4" />}
                {isRecordingInternal ? 'Stop Recording' : 'Start Recording'}
              </Button>
            </div>
            {isAnalyzing && (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-center">Analyzing video...</p>
                <Progress value={undefined} className="h-2 animate-pulse" />
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

VideoRecorder.displayName = "VideoRecorder";
export { VideoRecorder };