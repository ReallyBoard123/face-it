import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Camera, 
  Upload, 
  Square, 
  Circle, 
  Download,
  Monitor,
  Video
} from 'lucide-react';

interface VideoRecorderProps {
  onVideoRecorded: (blob: Blob) => void;
  isAnalyzing: boolean;
}

export function VideoRecorder({ onVideoRecorded, isAnalyzing }: VideoRecorderProps) {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [includeScreen, setIncludeScreen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      
      // Get webcam stream
      const webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      let finalStream = webcamStream;

      // If screen recording is enabled, combine streams
      if (includeScreen) {
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });

          // Create a canvas to combine both streams
          // For now, we'll just use the webcam stream
          // In a production app, you'd use Canvas API to combine them
          finalStream = webcamStream;
        } catch (err) {
          console.log("Screen recording denied, using webcam only");
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = finalStream;
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        onVideoRecorded(blob);
        
        // Stop all tracks
        finalStream.getTracks().forEach(track => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);

      // Start timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please ensure camera permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onVideoRecorded(file);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'record' | 'upload')} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="record" disabled={isRecording}>
            <Camera className="mr-2 h-4 w-4" />
            Record
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={isRecording}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="flex-1 flex flex-col mt-4">
          <div className="flex-1 relative bg-muted rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            
            {isRecording && (
              <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full flex items-center gap-2">
                <Circle className="h-3 w-3 fill-current animate-pulse" />
                <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
              </div>
            )}

            {!isRecording && !videoRef.current?.srcObject && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Click record to start</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-4">
            {/* Screen recording toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScreen}
                onChange={(e) => setIncludeScreen(e.target.checked)}
                disabled={isRecording}
                className="rounded"
              />
              <Monitor className="h-4 w-4" />
              <span className="text-sm">Include screen recording</span>
            </label>

            <div className="flex gap-2">
              {!isRecording ? (
                <Button 
                  onClick={startRecording} 
                  className="flex-1"
                  disabled={isAnalyzing}
                >
                  <Circle className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>
              ) : (
                <Button 
                  onClick={stopRecording} 
                  variant="destructive" 
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop Recording
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="flex-1 flex flex-col mt-4">
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
            <div className="text-center">
              <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Upload a video file</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supported formats: MP4, WebM, MOV
              </p>
              <label htmlFor="video-upload">
                <Button asChild disabled={isAnalyzing}>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </span>
                </Button>
              </label>
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isAnalyzing}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isAnalyzing && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Analyzing video...</span>
            <span className="text-muted-foreground">Processing frames</span>
          </div>
          <Progress value={33} className="h-2" />
        </div>
      )}
    </div>
  );
}