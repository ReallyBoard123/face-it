"use client";

import { useState } from "react";

import { AnalysisResults } from "@/components/analysis-results";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Brain, Upload, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WebcamRecorder } from "@/components/webcam-recorder";

interface AnalysisData {
  summary: {
    total_frames: number;
    faces_detected: number;
    average_emotions: Record<string, number>;
  };
  frames: Array<{
    frame: number;
    emotions: Record<string, number>;
    confidence: number;
  }>;
  columns_available: string[];
}

export default function RecordPage() {
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecordingComplete = (blob: Blob) => {
    setRecordedBlob(blob);
    setAnalysisData(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!recordedBlob) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', recordedBlob, 'recording.webm');

      const response = await fetch('http://localhost:8000/analyze-video', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail?.message || 'Analysis failed');
      }

      if (result.status === 'success' && result.data) {
        setAnalysisData(result.data);
      } else {
        setError(result.message || 'No faces detected in the video');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAll = () => {
    setRecordedBlob(null);
    setAnalysisData(null);
    setError(null);
    setIsAnalyzing(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Facial Expression Recording
            </h1>
            <p className="text-muted-foreground">
              Record a 30-second video and analyze your facial expressions
            </p>
          </div>
        </div>

        <Separator />

        {/* Recording Section */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Step 1: Record Your Video</h2>
            <p className="text-muted-foreground">
              Position yourself in front of the camera and record for up to 30 seconds
            </p>
          </div>

          <WebcamRecorder 
            onRecordingComplete={handleRecordingComplete}
            maxDuration={30}
          />

          {/* Analysis Controls */}
          {recordedBlob && (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Analyze Your Recording</CardTitle>
                <CardDescription>
                  Upload your recording to our AI system for facial expression analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    size="lg"
                    className="min-w-48"
                  >
                    {isAnalyzing ? (
                      <>
                        <Brain className="mr-2 h-4 w-4 animate-pulse" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Analyze Expressions
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    onClick={resetAll}
                    variant="outline"
                    size="lg"
                  >
                    Start Over
                  </Button>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm">{error}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Section */}
        {(analysisData || isAnalyzing) && (
          <>
            <Separator />
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Analysis Results</h2>
                <p className="text-muted-foreground">
                  AI-powered insights into your facial expressions
                </p>
              </div>

              <AnalysisResults 
                data={analysisData!}
                isLoading={isAnalyzing}
              />
            </div>
          </>
        )}

        {/* Instructions */}
        {!recordedBlob && !analysisData && (
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">1</span>
                  </div>
                  <h3 className="font-medium">Record</h3>
                  <p className="text-sm text-muted-foreground">
                    Use your webcam to record a short video of your face
                  </p>
                </div>
                
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">2</span>
                  </div>
                  <h3 className="font-medium">Analyze</h3>
                  <p className="text-sm text-muted-foreground">
                    Our AI processes your video using advanced emotion recognition
                  </p>
                </div>
                
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">3</span>
                  </div>
                  <h3 className="font-medium">Results</h3>
                  <p className="text-sm text-muted-foreground">
                    View detailed insights about your emotional expressions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}