"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Loader2, Server, Brain, Camera } from "lucide-react";

interface BackendStatus {
  isConnected: boolean;
  isLoading: boolean;
  healthData?: any;
  pyfeatData?: any;
  detectorInfo?: any;
  error?: string;
}

export default function TestPage() {
  const [status, setStatus] = useState<BackendStatus>({
    isConnected: false,
    isLoading: false,
  });

  const testConnection = async () => {
    setStatus({ isConnected: false, isLoading: true });

    try {
      // Test health endpoint
      const healthResponse = await fetch("http://localhost:8000/health");
      const healthData = await healthResponse.json();

      if (!healthResponse.ok) {
        throw new Error("Health check failed");
      }

      // Test py-feat endpoint
      const pyfeatResponse = await fetch("http://localhost:8000/test-pyfeat");
      const pyfeatData = await pyfeatResponse.json();

      // Get detector info
      const detectorResponse = await fetch("http://localhost:8000/detector-info");
      const detectorInfo = await detectorResponse.json();

      setStatus({
        isConnected: true,
        isLoading: false,
        healthData,
        pyfeatData,
        detectorInfo,
      });
    } catch (error) {
      setStatus({
        isConnected: false,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const StatusIcon = ({ success }: { success: boolean }) => {
    if (status.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
    return success ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Facial Expression Analysis Tool</h1>
          <p className="text-muted-foreground">
            Backend Connection & py-feat Testing Dashboard
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Backend Connection Test
            </CardTitle>
            <CardDescription>
              Test the connection to the Python backend server and py-feat installation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testConnection} 
              disabled={status.isLoading}
              className="w-full"
            >
              {status.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Server className="mr-2 h-4 w-4" />
                  Test Backend Connection
                </>
              )}
            </Button>

            {status.error && (
              <div className="p-4 border border-red-200 rounded-md bg-red-50">
                <div className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">Connection Failed</span>
                </div>
                <p className="text-red-700 mt-1 text-sm">{status.error}</p>
                <p className="text-red-600 mt-2 text-xs">
                  Make sure the backend server is running on http://localhost:8000
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {(status.healthData || status.pyfeatData || status.detectorInfo) && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Health Status */}
            {status.healthData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StatusIcon success={status.isConnected} />
                    Server Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge variant={status.isConnected ? "default" : "destructive"}>
                      {status.healthData.status}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {status.healthData.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(status.healthData.timestamp).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* py-feat Status */}
            {status.pyfeatData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StatusIcon success={status.pyfeatData.status === "success"} />
                    <Brain className="h-4 w-4" />
                    py-feat Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge 
                      variant={status.pyfeatData.status === "success" ? "default" : "destructive"}
                    >
                      {status.pyfeatData.status}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {status.pyfeatData.message}
                    </p>
                    {status.pyfeatData.detector_info && (
                      <div className="text-xs space-y-1">
                        <p><strong>Face Model:</strong> {status.pyfeatData.detector_info.face_model}</p>
                        <p><strong>Emotion Model:</strong> {status.pyfeatData.detector_info.emotion_model}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detector Info */}
            {status.detectorInfo && status.detectorInfo.status === "success" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Detector Models
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Recommended Setup:</p>
                      <div className="text-xs space-y-1 mt-1">
                        <p>Face: {status.detectorInfo.recommended_setup.face_model}</p>
                        <p>Emotion: {status.detectorInfo.recommended_setup.emotion_model}</p>
                        <p>AU: {status.detectorInfo.recommended_setup.au_model}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {status.pyfeatData?.detector_info?.available_emotions && (
          <Card>
            <CardHeader>
              <CardTitle>Available Emotions</CardTitle>
              <CardDescription>
                Emotions that can be detected by the current py-feat setup
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {status.pyfeatData.detector_info.available_emotions.map((emotion: string) => (
                  <Badge key={emotion} variant="outline">
                    {emotion}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Next Steps: Once both servers are running successfully, we can proceed with webcam integration and recording functionality.
          </p>
        </div>
      </div>
    </div>
  );
}