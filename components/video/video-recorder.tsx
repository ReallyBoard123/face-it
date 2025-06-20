// components/video/video-recorder.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Square, Circle, Video as VideoIcon, Zap } from 'lucide-react';
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
  captureFrame: () => string | null;
}

interface MediaRecorderErrorEvent extends Event {
  error: DOMException | null;
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
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 }, 
            facingMode: 'user',
            frameRate: { ideal: 15, max: 20 } // Reduce frame rate for smaller files
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 22050 // Lower audio quality for smaller files
          },
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

    const stopManualRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingInternal(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
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

        const options: MediaRecorderOptions = {
          videoBitsPerSecond: 250000, // 250kbps - much lower than default (usually 2.5Mbps)
          audioBitsPerSecond: 32000,  // 32kbps - lower audio bitrate
        };
        
        // Try VP9 first (better compression), fallback to VP8, then default
        const mimeTypes = [
          'video/webm;codecs=vp9,opus',  // Best compression
          'video/webm;codecs=vp8,opus',  // Good compression
          'video/webm'                   // Default fallback
        ];
        
        for (const mimeType of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            options.mimeType = mimeType;
            console.log(`Using codec: ${mimeType}`);
            break;
          }
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
        
        mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
            console.error("MediaRecorder error:", event.error);
            setError(`MediaRecorder error: ${event.error?.name} - ${event.error?.message}`);
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
    }, [stream, isRecordingInternal, onVideoRecorded, recordingDuration, onRecordingStarted, onRecordingStopped, requestPermissionsAndSetupStream, stopManualRecording]);

    const captureCurrentFrameAsBase64 = useCallback((): string | null => {
        if (videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.8);
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
        <div className="flex-1 relative border-4 border-black shadow-[8px_8px_0px_0px_#000] bg-gradient-to-br from-purple-400 to-cyan-400 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          
          {isRecordingInternal && (
            <Card variant="pink" className="absolute top-4 right-4 p-2 animate-pulse">
              <div className="flex items-center gap-2 text-black font-black text-sm uppercase">
                <Circle className="h-3 w-3 fill-current" />
                <span>{formatTime(recordingTime)}</span>
              </div>
            </Card>
          )}
          
          {!stream && !error && !isRecordingInternal && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card variant="white" className="p-6 text-center">
                <VideoIcon className="h-16 w-16 mx-auto mb-4 text-black" />
                <div className="font-black uppercase text-black text-lg">CAMERA READY</div>
              </Card>
            </div>
          )}
        </div>

        {error && (
          <Card variant="pink" className="mt-4 p-3">
            <p className="text-black font-bold text-sm text-center uppercase">{error}</p>
          </Card>
        )}

        {showControls && (
          <>
            <div className="mt-4">
              <Button
                onClick={isRecordingInternal ? stopManualRecording : startManualRecording}
                variant={isRecordingInternal ? "destructive" : "success"}
                className="w-full"
                size="lg"
                disabled={isAnalyzing || (!stream && !isRecordingInternal && !error)}
              >
                {isRecordingInternal ? (
                  <>
                    <Square className="mr-3 h-5 w-5" />
                    STOP RECORDING
                  </>
                ) : (
                  <>
                    <Circle className="mr-3 h-5 w-5" />
                    START RECORDING
                  </>
                )}
              </Button>
            </div>
            
            {isAnalyzing && (
              <Card variant="orange" className="mt-4 p-4 text-center neo-pulse">
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-black">
                    <Zap className="h-5 w-5 animate-spin" />
                    <span className="font-black uppercase text-sm">ANALYZING VIDEO...</span>
                  </div>
                  <Progress value={undefined} className="h-3" />
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }
);

VideoRecorder.displayName = "VideoRecorder";
export { VideoRecorder };