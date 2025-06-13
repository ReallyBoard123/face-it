// hooks/use-game-events.ts
import { useState, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { VideoRecorderHandles } from '@/components/video/video-recorder';
import { KeyMoment } from '@/components/analysis/key-moments-display';

const CAPTURE_DELAY_MS = 150;

type GameType = "flappy_bird" | "stress_click" | "website_browse";

export function useGameEvents(
  selectedGame: GameType,
  videoRecorderRef: React.RefObject<VideoRecorderHandles>,
  gameStartTimeRef: React.MutableRefObject<number | null>,
  setErrorMessage: (message: string | null) => void
) {
  const [gameEvents, setGameEvents] = useState<Array<{ type: string; data: any; timestamp: number }>>([]);
  const [gameKeyMoments, setGameKeyMoments] = useState<KeyMoment[]>([]);

  const captureGameScreen = useCallback(async (): Promise<string | null> => {
    const gameContainerId = selectedGame === 'stress_click' 
                            ? 'stress-click-game-area-ref-id' 
                            : 'flappy-bird-game-area';
    const gameAreaElement = document.getElementById(gameContainerId);
    
    if (gameAreaElement) {
      try {
        const canvas = await html2canvas(gameAreaElement, { 
          useCORS: true, 
          logging: false, 
          width: gameAreaElement.offsetWidth, 
          height: gameAreaElement.offsetHeight, 
          scale: 0.75 
        });
        return canvas.toDataURL('image/jpeg', 0.6);
      } catch (error) {
        console.error("Error capturing game screen for", selectedGame, ":", error);
        setErrorMessage(`Failed to capture game screen.`);
        return null;
      }
    }
    console.warn("Game area element not found for screen capture:", gameContainerId);
    return null;
  }, [selectedGame, setErrorMessage]);

  const handleGameEvent = useCallback(async (event: { type: string; data: any; timestamp: number }) => {
    setTimeout(async () => {
      setGameEvents(prev => [...prev, event]);

      let isKeyGameTrigger = false;
      let reason = "";
      const event_ts_seconds = gameStartTimeRef.current ? (Date.now() - gameStartTimeRef.current) / 1000 : event.timestamp;

      if (event.type === 'difficulty_change') {
        isKeyGameTrigger = true;
        reason = `StressClick: Level ${event.data.from} → ${event.data.to}`;
      } else if (event.type === 'flappy_bird_score_update') {
        isKeyGameTrigger = true;
        reason = `Flappy Bird: Score ${event.data.score}`;
      } else if (event.type === 'flappy_bird_game_over') {
        isKeyGameTrigger = true;
        reason = `Flappy Bird: Game Over (Score: ${event.data.finalScore})`;
      } else if (event.type === 'website_interaction') {
        isKeyGameTrigger = true;
        reason = `Website: ${event.data.action}`;
      }

      if (isKeyGameTrigger && videoRecorderRef.current) {
        await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY_MS));

        const faceFrameData = videoRecorderRef.current.captureFrame();
        const gameFrameData = selectedGame !== 'website_browse' ? await captureGameScreen() : null;

        setGameKeyMoments(prev => [
          ...prev,
          {
            timestamp: event_ts_seconds,
            reason,
            faceFrame: faceFrameData,
            gameFrame: gameFrameData,
            type: 'game_event'
          }
        ]);
      }
    }, 0);
  }, [videoRecorderRef, selectedGame, captureGameScreen, gameStartTimeRef]);

  const resetGameEvents = useCallback(() => {
    setGameEvents([]);
    setGameKeyMoments([]);
  }, []);

  return {
    gameEvents,
    gameKeyMoments,
    handleGameEvent,
    resetGameEvents,
  };
}