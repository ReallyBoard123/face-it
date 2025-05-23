import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Camera, Monitor, TestTube } from "lucide-react";

export default function Home() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Facial Expression Analysis Tool
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Record facial expressions while viewing content and analyze emotional responses 
            with AI-powered recognition using py-feat
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Webcam Recording
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Capture facial expressions in real-time while you interact with content
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Screen Capture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Simultaneously record screen activity to correlate with facial responses
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Advanced emotion recognition powered by py-feat machine learning models
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/test">
            <Button size="lg" className="w-full sm:w-auto">
              <TestTube className="mr-2 h-4 w-4" />
              Test Backend Connection
            </Button>
          </Link>
          
          <Button size="lg" variant="outline" disabled className="w-full sm:w-auto">
            <Camera className="mr-2 h-4 w-4" />
            Start Recording (Coming Soon)
          </Button>
        </div>

        {/* Tech Stack */}
        <Card>
          <CardHeader>
            <CardTitle>Technology Stack</CardTitle>
            <CardDescription>
              Modern, fast, and reliable architecture
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium mb-2">Frontend</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Next.js 15 with App Router</li>
                  <li>• TypeScript for type safety</li>
                  <li>• Tailwind CSS for styling</li>
                  <li>• Shadcn/ui component library</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Backend</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Python with Flask</li>
                  <li>• py-feat for emotion recognition</li>
                  <li>• OpenCV for video processing</li>
                  <li>• Machine learning models</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">1. Start the Backend Server</h4>
                <pre className="bg-muted p-2 rounded text-sm">
                </pre>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">2. Start the Frontend Server</h4>
                <pre className="bg-muted p-2 rounded text-sm">
                </pre>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">3. Test the Connection</h4>
                <p className="text-sm text-muted-foreground">
                  Click the "Test Backend Connection" button above to verify everything is working.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}