"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Camera, Square, Upload, BarChart3, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AnalysisResult {
  status: string;
  message?: string;
  data?: {
    summary: {
      total_frames: number;
      faces_detected: number;
      average_emotions?: Record<string, number>;
      emotions_detected?: Record<string, {
        mean: number;
        std: number;
        min: number;
        max: number;
      }>;
    };
    frames: Array<{
      frame: number;
      emotions: Record<string, number>;
      timestamp?: number;
    }>;
  };
  timestamp?: string;
}

export default function RecordPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Initialize webcam
  useEffect(() => {
    const initWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          }, 
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Failed to access webcam. Please ensure you have granted camera permissions.");
        console.error("Webcam error:", err);
      }
    };

    initWebcam();

    return () => {
      // Cleanup
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!videoRef.current?.srcObject) {
      setError("No webcam stream available");
      return;
    }

    setError(null);
    setAnalysisResult(null);
    chunksRef.current = [];
    
    const stream = videoRef.current.srcObject as MediaStream;
    
    // Use VP8 codec for better compatibility
    const options = {
      mimeType: 'video/webm;codecs=vp8,opus'
    };
    
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedVideo(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setError("Failed to start recording. Your browser may not support video recording.");
      console.error("Recording error:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleAnalyze = async () => {
    if (!recordedVideo) {
      setError("No video recorded");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', recordedVideo, 'recording.webm');

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('http://localhost:8000/analyze-video', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();
      console.log('Analysis result:', result);

      // Check if the response indicates an error
      if (result.status === 'error' || result.error) {
        throw new Error(result.message || result.detail?.message || 'Analysis failed');
      }

      // Handle successful response
      setAnalysisResult(result);
      
      // Show appropriate message based on results
      if (!result.data || result.data.summary.faces_detected === 0) {
        setError("No faces were detected in the video. Please ensure your face is clearly visible and well-lit.");
      }

    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
      setAnalysisResult(null);
    } finally {
      setIsAnalyzing(false);
      setUploadProgress(0);
    }
  };

  const formatEmotionValue = (value: number | { mean: number }) => {
    if (typeof value === 'object' && 'mean' in value) {
      return (value.mean * 100).toFixed(1);
    }
    return (value * 100).toFixed(1);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Record Facial Expressions</h1>
          <p className="text-muted-foreground">
            Record yourself while viewing content to analyze emotional responses
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Webcam Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Webcam Preview</CardTitle>
              <CardDescription>
                Position your face clearly in the frame
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-sm font-medium">Recording</span>
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex gap-4">
                {!isRecording ? (
                  <Button onClick={startRecording} className="flex-1">
                    <Camera className="mr-2 h-4 w-4" />
                    Start Recording
                  </Button>
                ) : (
                  <Button onClick={stopRecording} variant="destructive" className="flex-1">
                    <Square className="mr-2 h-4 w-4" />
                    Stop Recording
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recording Status */}
          <Card>
            <CardHeader>
              <CardTitle>Recording Status</CardTitle>
              <CardDescription>
                Record for at least 5 seconds for best results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Status</span>
                  <span className="font-medium">
                    {isRecording ? "Recording..." : recordedVideo ? "Ready to analyze" : "Not recording"}
                  </span>
                </div>
                
                {recordedVideo && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span>Video Size</span>
                      <span className="font-medium">
                        {(recordedVideo.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </>
                )}
              </div>

              {recordedVideo && !isRecording && (
                <Button 
                  onClick={handleAnalyze} 
                  disabled={isAnalyzing}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>Analyzing...</>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Analyze Video
                    </>
                  )}
                </Button>
              )}

              {isAnalyzing && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    {uploadProgress < 100 ? "Uploading video..." : "Processing facial expressions..."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Analysis Results */}
        {analysisResult?.data && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Analysis Results
              </CardTitle>
              <CardDescription>
                {analysisResult.message || `Analyzed ${analysisResult.data.summary.total_frames} frames`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysisResult.data.summary.faces_detected > 0 ? (
                <div className="space-y-6">
                  <Alert>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>
                      Detected faces in {analysisResult.data.summary.faces_detected} frames
                    </AlertDescription>
                  </Alert>

                  {/* Emotion Summary */}
                  {(analysisResult.data.summary.average_emotions || analysisResult.data.summary.emotions_detected) && (
                    <div>
                      <h3 className="font-medium mb-4">Average Emotions Detected</h3>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(
                          analysisResult.data.summary.emotions_detected || 
                          analysisResult.data.summary.average_emotions || 
                          {}
                        ).map(([emotion, value]) => (
                          <div key={emotion} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{emotion}</span>
                              <span className="font-medium">
                                {formatEmotionValue(value)}%
                              </span>
                            </div>
                            <Progress 
                              value={parseFloat(formatEmotionValue(value))} 
                              className="h-2"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Frame Timeline */}
                  {analysisResult.data.frames && analysisResult.data.frames.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-4">Emotion Timeline (First 10 frames)</h3>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {analysisResult.data.frames.slice(0, 10).map((frame) => (
                          <div key={frame.frame} className="text-sm space-y-1 p-3 bg-muted rounded-lg">
                            <div className="font-medium">
                              Frame {frame.frame} 
                              {frame.timestamp && ` (${frame.timestamp.toFixed(1)}s)`}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              {Object.entries(frame.emotions)
                                .filter(([_, value]) => value > 0.1)
                                .sort(([_, a], [__, b]) => b - a)
                                .slice(0, 3)
                                .map(([emotion, value]) => (
                                  <span key={emotion}>
                                    {emotion}: {(value * 100).toFixed(0)}%
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No Faces Detected</AlertTitle>
                  <AlertDescription>
                    The analysis completed but no faces were found in the video. 
                    Please ensure your face is clearly visible and well-lit, then try again.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}