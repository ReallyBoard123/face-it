"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, Clock, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface AnalysisResultsProps {
  data: AnalysisData;
  isLoading?: boolean;
  className?: string;
}

interface EmotionCardProps {
  emotion: string;
  value: number;
  rank: number;
}

function EmotionCard({ emotion, value, rank }: EmotionCardProps) {
  const emotionIcons: Record<string, string> = {
    happiness: "😊",
    sadness: "😢", 
    anger: "😠",
    fear: "😨",
    surprise: "😮",
    disgust: "🤢",
    neutral: "😐"
  };

  const emotionColors: Record<string, string> = {
    happiness: "bg-green-500",
    sadness: "bg-blue-500",
    anger: "bg-red-500", 
    fear: "bg-purple-500",
    surprise: "bg-yellow-500",
    disgust: "bg-orange-500",
    neutral: "bg-gray-500"
  };

  const cleanEmotionName = emotion.toLowerCase().replace(/[^a-z]/g, '');
  const icon = emotionIcons[cleanEmotionName] || "😐";
  const color = emotionColors[cleanEmotionName] || "bg-gray-500";
  const percentage = Math.round(value * 100);

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-medium capitalize">{cleanEmotionName}</h3>
              <Badge variant={rank <= 3 ? "default" : "secondary"} className="text-xs">
                #{rank}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{percentage}%</div>
          </div>
        </div>
        <Progress value={percentage} className="h-2" />
        <div className={cn("absolute bottom-0 left-0 right-0 h-1", color)} 
             style={{ opacity: percentage / 100 }} />
      </CardContent>
    </Card>
  );
}

export function AnalysisResults({ data, isLoading = false, className }: AnalysisResultsProps) {
  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardContent className="p-8 text-center">
            <Brain className="h-8 w-8 mx-auto mb-4 animate-pulse" />
            <h3 className="text-lg font-medium mb-2">Analyzing your expressions...</h3>
            <p className="text-muted-foreground">This may take a few moments</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emotionEntries = Object.entries(data.summary.average_emotions)
    .sort(([, a], [, b]) => b - a)
    .map(([emotion, value], index) => ({ emotion, value, rank: index + 1 }));

  const topEmotion = emotionEntries[0];
  const analysisTime = data.summary.total_frames / 30; // Assuming 30 FPS

  return (
    <div className={cn("space-y-6", className)}>
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">{analysisTime.toFixed(1)}s</div>
            <p className="text-sm text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">{data.summary.faces_detected}</div>
            <p className="text-sm text-muted-foreground">Faces Detected</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">{data.summary.total_frames}</div>
            <p className="text-sm text-muted-foreground">Frames Analyzed</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Emotion Highlight */}
      {topEmotion && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5" />
              <span>Dominant Emotion</span>
            </CardTitle>
            <CardDescription>
              Your most expressed emotion during the recording
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-6xl mb-4">
                {topEmotion.emotion.includes('happiness') ? '😊' :
                 topEmotion.emotion.includes('sadness') ? '😢' :
                 topEmotion.emotion.includes('anger') ? '😠' :
                 topEmotion.emotion.includes('fear') ? '😨' :
                 topEmotion.emotion.includes('surprise') ? '😮' :
                 topEmotion.emotion.includes('disgust') ? '🤢' : '😐'}
              </div>
              <h3 className="text-2xl font-bold capitalize mb-2">
                {topEmotion.emotion.toLowerCase().replace(/[^a-z]/g, '')}
              </h3>
              <p className="text-lg text-muted-foreground">
                {Math.round(topEmotion.value * 100)}% confidence
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Emotions Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Emotion Breakdown</CardTitle>
          <CardDescription>
            Average emotional expression throughout the recording
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {emotionEntries.map(({ emotion, value, rank }) => (
              <EmotionCard
                key={emotion}
                emotion={emotion}
                value={value}
                rank={rank}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Frame-by-Frame Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline Analysis</CardTitle>
          <CardDescription>
            Emotion intensity over time (showing every 10th frame)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.frames
              .filter((_, index) => index % 10 === 0)
              .slice(0, 10)
              .map((frame, index) => {
                const topFrameEmotion = Object.entries(frame.emotions)
                  .sort(([, a], [, b]) => b - a)[0];
                
                return (
                  <div key={frame.frame} className="flex items-center space-x-4 py-2">
                    <div className="w-16 text-sm text-muted-foreground">
                      {(frame.frame / 30).toFixed(1)}s
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium capitalize">
                          {topFrameEmotion?.[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'neutral'}
                        </span>
                        <Progress 
                          value={(topFrameEmotion?.[1] || 0) * 100} 
                          className="flex-1 h-2" 
                        />
                        <span className="text-sm text-muted-foreground w-12">
                          {Math.round((topFrameEmotion?.[1] || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}