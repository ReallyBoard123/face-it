// components/video/screen-recorder.tsx
'use client';

import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button } from '../ui/button';
import { Monitor, Square, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';

interface ScreenRecorderProps {
  onScreenRecorded: (blob: Blob) => void;
  recordingMode: 'current_tab' | 'any_screen'; // current_tab for games, any_screen for browsing
  isRecording?: boolean;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
}

export interface ScreenRecorderHandles {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getStream: () => MediaStream | null;
}

const ScreenRecorder = forwardRef<ScreenRecorderHandles, ScreenRecorderProps>(
  ({
    onScreenRecorded,
    recordingMode,
    isRecording = false,
    onRecordingStarted,
    onRecordingStopped,
  }, ref) => {
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const requestScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
      setError(null);
      try {
        const constraints: DisplayMediaStreamOptions = {
          video: {
            displaySurface: recordingMode === 'current_tab' ? 'browser' : 'monitor'
          },
          audio: true, // Capture system audio if available
        };

        // For current tab recording, we can be more specific
        if (recordingMode === 'current_tab') {
          // @ts-ignore - preferCurrentTab is experimental but works in Chrome
          constraints.preferCurrentTab = true;
        }

        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        setScreenStream(stream);
        setHasPermission(true);
        return stream;
      } catch (err: any) {
        console.error('Error accessing screen capture:', err);
        setHasPermission(false);
        
        if (err.name === 'NotAllowedError') {
          setError('Screen capture permission denied. Please allow screen sharing.');
        } else if (err.name === 'NotSupportedError') {
          setError('Screen capture not supported in this browser.');
        } else {
          setError(`Screen capture error: ${err.message}`);
        }
        return null;
      }
    }, [recordingMode]);

    const startScreenRecording = useCallback(async () => {
      let streamToRecord = screenStream;
      if (!streamToRecord) {
        streamToRecord = await requestScreenCapture();
        if (!streamToRecord) return;
      }

      setError(null);
      try {
        chunksRef.current = [];

        const options = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          console.warn(`${options.mimeType} not supported, using default`);
          // @ts-ignore
          delete options.mimeType;
        }

        const mediaRecorder = new MediaRecorder(streamToRecord, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { 
            type: options.mimeType || 'video/webm' 
          });
          onScreenRecorded(blob);
          if (onRecordingStopped) onRecordingStopped();
        };

        mediaRecorder.onerror = (event: any) => {
          console.error("Screen MediaRecorder error:", event.error);
          setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
        };

        // Listen for when user stops sharing (e.g., clicks "Stop sharing" in browser)
        streamToRecord.getVideoTracks()[0].addEventListener('ended', () => {
          console.log('Screen sharing ended by user');
          stopScreenRecording();
        });

        mediaRecorder.start();
        if (onRecordingStarted) onRecordingStarted();
      } catch (err: any) {
        console.error('Error starting screen recording:', err);
        setError(`Failed to start recording: ${err.message}`);
      }
    }, [screenStream, onScreenRecorded, onRecordingStarted, onRecordingStopped, requestScreenCapture]);

    const stopScreenRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      
      // Stop the screen stream
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
      }
    }, [screenStream]);

    useImperativeHandle(ref, () => ({
      startRecording: startScreenRecording,
      stopRecording: stopScreenRecording,
      getStream: () => screenStream,
    }));

    // Clean up stream when component unmounts
    React.useEffect(() => {
      return () => {
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
        }
      };
    }, [screenStream]);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4" />
          Screen Recording
          <span className="text-xs text-muted-foreground">
            ({recordingMode === 'current_tab' ? 'Current Tab' : 'Any Screen'})
          </span>
        </div>

        {error && (
          <Alert variant="destructive" className="text-xs">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {hasPermission === false && (
          <Button 
            onClick={requestScreenCapture} 
            variant="outline" 
            size="sm"
            className="w-full text-xs"
          >
            <Monitor className="mr-2 h-4 w-4" />
            Grant Screen Capture Permission
          </Button>
        )}

        {hasPermission === true && !isRecording && (
          <Button 
            onClick={startScreenRecording} 
            variant="default" 
            size="sm"
            className="w-full text-xs"
          >
            <Monitor className="mr-2 h-4 w-4" />
            Start Screen Recording
          </Button>
        )}

        {isRecording && (
          <Button 
            onClick={stopScreenRecording} 
            variant="destructive" 
            size="sm"
            className="w-full text-xs"
          >
            <Square className="mr-2 h-4 w-4" />
            Stop Screen Recording
          </Button>
        )}

        {screenStream && (
          <div className="text-xs text-muted-foreground">
            ✅ Screen capture ready
          </div>
        )}
      </div>
    );
  }
);

ScreenRecorder.displayName = "ScreenRecorder";
export { ScreenRecorder };