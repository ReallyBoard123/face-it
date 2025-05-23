"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Square, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WebcamRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  maxDuration?: number; // in seconds
  className?: string;
}

export function WebcamRecorder({ 
  onRecordingComplete, 
  maxDuration = 30,
  className 
}: WebcamRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Timer for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= maxDuration) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, maxDuration]);

  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }, 
        audio: true 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasPermission(true);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Camera access denied. Please enable camera permissions.");
      setHasPermission(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!videoRef.current?.srcObject) {
      await initializeCamera();
      return;
    }

    try {
      setError(null);
      chunksRef.current = [];
      
      const stream = videoRef.current.srcObject as MediaStream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/mp4'
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        setRecordedBlob(blob);
        onRecordingComplete(blob);
      };

      mediaRecorder.start(1000); // Capture data every 1 second
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error("Recording error:", err);
      setError("Failed to start recording. Please try again.");
    }
  }, [initializeCamera, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const downloadRecording = useCallback(() => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facial-recording-${new Date().toISOString().slice(0, 19)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [recordedBlob]);

  const clearRecording = useCallback(() => {
    setRecordedBlob(null);
    setRecordingTime(0);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    initializeCamera();
    
    return () => {
      // Cleanup: stop all media tracks
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [initializeCamera]);

  return (
    <Card className={cn("w-full max-w-2xl mx-auto", className)}>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Video Preview */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            
            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">REC</span>
              </div>
            )}
            
            {/* Timer */}
            <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full">
              <span className="text-sm font-mono">
                {formatTime(recordingTime)} / {formatTime(maxDuration)}
              </span>
            </div>

            {/* Error Overlay */}
            {error && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <div className="text-white text-center p-4">
                  <p className="mb-2">{error}</p>
                  <Button onClick={initializeCamera} variant="outline" size="sm">
                    Retry
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center space-x-4">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                disabled={!hasPermission}
                size="lg"
                className="min-w-32"
              >
                <Camera className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="lg"
                className="min-w-32"
              >
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </Button>
            )}

            {recordedBlob && (
              <>
                <Button
                  onClick={downloadRecording}
                  variant="outline"
                  size="lg"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button
                  onClick={clearRecording}
                  variant="outline"
                  size="lg"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </>
            )}
          </div>

          {/* Recording Status */}
          {recordedBlob && (
            <div className="text-center text-sm text-muted-foreground">
              ✅ Recording completed ({(recordedBlob.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}