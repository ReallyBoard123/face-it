// components/video/screen-recorder.tsx
'use client';

import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Monitor, Square, AlertCircle, Zap, Target } from 'lucide-react';

interface ScreenRecorderProps {
  onScreenRecorded: (blob: Blob) => void;
  recordingMode: 'current_tab' | 'any_screen';
  isRecording?: boolean;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
}

export interface ScreenRecorderHandles {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getStream: () => MediaStream | null;
}

interface MediaRecorderErrorEvent extends Event {
  error?: Error;
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
          audio: true,
        };

        if (recordingMode === 'current_tab') {
          (constraints as DisplayMediaStreamOptions & { preferCurrentTab?: boolean }).preferCurrentTab = true;
        }

        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        setScreenStream(stream);
        setHasPermission(true);
        return stream;
      } catch (err: unknown) {
        console.error('Error accessing screen capture:', err);
        setHasPermission(false);
        
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Screen capture permission denied. Please allow screen sharing.');
          } else if (err.name === 'NotSupportedError') {
            setError('Screen capture not supported in this browser.');
          } else {
            setError(`Screen capture error: ${err.message}`);
          }
        } else {
          setError('Unknown screen capture error occurred.');
        }
        return null;
      }
    }, [recordingMode]);

    const stopScreenRecording = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
      }
    }, [screenStream]);

    const startScreenRecording = useCallback(async () => {
      let streamToRecord = screenStream;
      if (!streamToRecord) {
        streamToRecord = await requestScreenCapture();
        if (!streamToRecord) return;
      }

      setError(null);
      try {
        chunksRef.current = [];

        const options: MediaRecorderOptions = {};
        const mimeType = 'video/webm;codecs=vp8,opus';
        if (MediaRecorder.isTypeSupported(mimeType)) {
          options.mimeType = mimeType;
        } else {
          console.warn(`${mimeType} not supported, using default`);
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

        mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
          console.error("Screen MediaRecorder error:", event.error);
          setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
        };

        streamToRecord.getVideoTracks()[0].addEventListener('ended', () => {
          console.log('Screen sharing ended by user');
          stopScreenRecording();
        });

        mediaRecorder.start();
        if (onRecordingStarted) onRecordingStarted();
      } catch (err: unknown) {
        console.error('Error starting screen recording:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to start recording: ${errorMessage}`);
      }
    }, [screenStream, onScreenRecorded, onRecordingStarted, onRecordingStopped, requestScreenCapture, stopScreenRecording]);

    useImperativeHandle(ref, () => ({
      startRecording: startScreenRecording,
      stopRecording: stopScreenRecording,
      getStream: () => screenStream,
    }));

    React.useEffect(() => {
      return () => {
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
        }
      };
    }, [screenStream]);

    return (
      <Card variant="cyan" className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-black">
            <Monitor className="h-5 w-5" />
            <div className="flex-1">
              <div className="font-black uppercase text-sm">SCREEN RECORDING</div>
              <div className="text-xs font-bold opacity-70 uppercase tracking-wider">
                ({recordingMode === 'current_tab' ? 'CURRENT TAB' : 'ANY SCREEN'})
              </div>
            </div>
          </div>

          {error && (
            <Card variant="pink" className="p-3">
              <div className="flex items-center gap-2 text-black">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-bold uppercase">{error}</span>
              </div>
            </Card>
          )}

          {hasPermission === false && (
            <Button 
              onClick={requestScreenCapture} 
              variant="warning"
              size="sm"
              className="w-full"
            >
              <Monitor className="mr-2 h-4 w-4" />
              GRANT SCREEN PERMISSION
            </Button>
          )}

          {hasPermission === true && !isRecording && (
            <Button 
              onClick={startScreenRecording} 
              variant="success"
              size="sm"
              className="w-full"
            >
              <Target className="mr-2 h-4 w-4" />
              START SCREEN CAPTURE
            </Button>
          )}

          {isRecording && (
            <Button 
              onClick={stopScreenRecording} 
              variant="destructive"
              size="sm"
              className="w-full"
            >
              <Square className="mr-2 h-4 w-4" />
              STOP SCREEN CAPTURE
            </Button>
          )}

          {screenStream && (
            <Card variant="green" className="p-3 text-center">
              <div className="flex items-center justify-center gap-2 text-black">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-black uppercase">SCREEN CAPTURE READY!</span>
              </div>
            </Card>
          )}
        </div>
      </Card>
    );
  }
);

ScreenRecorder.displayName = "ScreenRecorder";
export { ScreenRecorder };