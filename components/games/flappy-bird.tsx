// This file would typically be placed in `app/flappy-bird/page.tsx` or a similar route.
// Ensure you have Tailwind CSS configured in your Next.js project.
// Place `bird.png` and `pipe.png` in `public/assets/`
// Place `jump.wav` in `public/sounds/`

"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';

// --- Constants ---
const GAME_WIDTH = 384; // Adjusted for better visual on common screens (Tailwind's w-96)
const GAME_HEIGHT = 512; // Adjusted (Tailwind's h-[512px])
const BIRD_WIDTH = 34;
const BIRD_HEIGHT = 24;
const BIRD_X_POSITION = 80; // Bird's horizontal position
const PIPE_WIDTH = 52;
const PIPE_IMAGE_HEIGHT = 320; // Actual height of the pipe.png image
const PIPE_GAP = 120; // Gap between top and bottom pipes
const GRAVITY = 0.5;
const JUMP_STRENGTH = -8; // How high the bird jumps
const PIPE_SPEED = 2.5; // How fast pipes move
const PIPE_SPAWN_INTERVAL = 2200; // Milliseconds between new pipe spawns
const BIRD_ROTATION_UP = -25; // Degrees
const BIRD_ROTATION_DOWN_MAX = 30; // Degrees
const BIRD_ROTATION_SPEED = 3; // Degrees per frame when falling

const BIRD_IMAGE_SRC = '/assets/bird.png';
const PIPE_IMAGE_SRC = '/assets/pipe.png';

// --- Types & Interfaces ---
type GameStateType = 'start' | 'playing' | 'over';
interface PipeStateType {
  id: string; // Use string for unique ID (e.g., timestamp + random)
  x: number;
  topPipeHeight: number; // Height of the visible top pipe segment
  scored: boolean;
}

// --- Helper Components ---

interface BirdProps {
  y: number;
  rotation: number;
}
const Bird: React.FC<BirdProps> = React.memo(({ y, rotation }) => {
  return (
    <div
      className="absolute transition-transform duration-50 ease-linear" // Smoother rotation
      style={{
        top: `${y}px`,
        left: `${BIRD_X_POSITION}px`,
        width: `${BIRD_WIDTH}px`,
        height: `${BIRD_HEIGHT}px`,
        transform: `rotate(${rotation}deg)`,
        willChange: 'transform, top', // Performance hint
      }}
    >
      <Image src={BIRD_IMAGE_SRC} alt="Bird" width={BIRD_WIDTH} height={BIRD_HEIGHT} unoptimized priority />
    </div>
  );
});
Bird.displayName = "Bird";


interface PipeProps {
  x: number;
  topPipeHeight: number;
}
const PipePair: React.FC<PipeProps> = React.memo(({ x, topPipeHeight }) => {
  const bottomPipeTopY = topPipeHeight + PIPE_GAP;
  const bottomPipeHeight = GAME_HEIGHT - bottomPipeTopY;

  return (
    <>
      {/* Top Pipe */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${x}px`,
          top: `0px`,
          width: `${PIPE_WIDTH}px`,
          height: `${topPipeHeight}px`,
        }}
      >
        <Image
          src={PIPE_IMAGE_SRC}
          alt="Top Pipe"
          fill
          style={{ objectFit: 'fill' }}
          className="rotate-180"
          unoptimized
        />
      </div>
      {/* Bottom Pipe */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${x}px`,
          top: `${bottomPipeTopY}px`,
          width: `${PIPE_WIDTH}px`,
          height: `${bottomPipeHeight}px`,
        }}
      >
        <Image
          src={PIPE_IMAGE_SRC}
          alt="Bottom Pipe"
          fill
          style={{ objectFit: 'fill' }}
          unoptimized
        />
      </div>
    </>
  );
});
PipePair.displayName = "PipePair";

interface ScoreDisplayProps { score: number; }
const ScoreDisplay: React.FC<ScoreDisplayProps> = React.memo(({ score }) => (
  <div className="absolute top-6 left-1/2 -translate-x-1/2 text-4xl text-white font-bold z-10 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
    {score}
  </div>
));
ScoreDisplay.displayName = "ScoreDisplay";

interface ScreenOverlayProps {
  title?: string;
  message?: string;
  buttonText: string;
  onButtonClick: () => void;
  score?: number;
}
const ScreenOverlay: React.FC<ScreenOverlayProps> = ({ title, message, buttonText, onButtonClick, score }) => (
  <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/60 z-20 text-white p-4 text-center">
    {title && <h1 className="text-5xl font-bold mb-4 drop-shadow-lg">{title}</h1>}
    {typeof score === 'number' && <p className="text-3xl mb-2">Score: {score}</p>}
    {message && <p className="text-xl mb-6">{message}</p>}
    <button
      onClick={onButtonClick}
      className="py-3 px-8 bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-2xl font-semibold rounded-lg shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300"
    >
      {buttonText}
    </button>
  </div>
);


// --- Main Game Component ---
export default function FlappyBirdGame() {
  const [gameState, setGameState] = useState<GameStateType>('start');
  const [birdY, setBirdY] = useState<number>(GAME_HEIGHT / 2 - BIRD_HEIGHT / 2);
  const [birdVelocity, setBirdVelocity] = useState<number>(0);
  const [birdRotation, setBirdRotation] = useState<number>(0);
  const [pipes, setPipes] = useState<PipeStateType[]>([]);
  const [score, setScore] = useState<number>(0);

  const gameLoopRef = useRef<number | null>(null);
  const pipeSpawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null); // Ref for the game area div

  const resetGame = useCallback((startPlaying = true) => {
    setBirdY(GAME_HEIGHT / 2 - BIRD_HEIGHT / 2);
    setBirdVelocity(0);
    setBirdRotation(0);
    setPipes([]);
    setScore(0);
    if (startPlaying) {
      setGameState('playing');
    } else {
      setGameState('start');
    }
  }, []);

  const jump = useCallback(() => {
    if (gameState !== 'playing') return;
    setBirdVelocity(JUMP_STRENGTH);
    setBirdRotation(BIRD_ROTATION_UP);
  }, [gameState]);

  const handleGameAction = useCallback(() => {
    if (gameState === 'start') {
      resetGame(true);
    } else if (gameState === 'playing') {
      jump();
    } else if (gameState === 'over') {
      resetGame(false); // Go back to start screen
    }
  }, [gameState, jump, resetGame]);

  // Input Handling (Keyboard and Click/Tap)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Prevent page scroll
        handleGameAction();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    // Click/Tap listener on the game area
    const gameAreaElement = gameAreaRef.current;
    if (gameAreaElement) {
      gameAreaElement.addEventListener('click', handleGameAction);
      gameAreaElement.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent double tap zoom or other touch behaviors
        handleGameAction();
      }, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (gameAreaElement) {
        gameAreaElement.removeEventListener('click', handleGameAction);
        gameAreaElement.removeEventListener('touchstart', handleGameAction);
      }
    };
  }, [handleGameAction]);


  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      return;
    }

    let lastTime = 0;
    const gameTick = (timestamp: number) => {
      if (!lastTime) {
        lastTime = timestamp;
        gameLoopRef.current = requestAnimationFrame(gameTick);
        return;
      }
      // const deltaTime = (timestamp - lastTime) / 1000; // Time in seconds, if needed for frame-independent physics
      // lastTime = timestamp;

      // Bird physics
      setBirdVelocity(v => v + GRAVITY);
      setBirdY(y => {
        const newY = y + birdVelocity;
        // Collision with top/bottom boundaries
        if (newY <= 0) {
          setGameState('over');
          return 0;
        }
        if (newY >= GAME_HEIGHT - BIRD_HEIGHT) {
          setGameState('over');
          return GAME_HEIGHT - BIRD_HEIGHT;
        }
        return newY;
      });

      // Bird rotation
      if (birdVelocity < 0) { // Moving up
        // Rotation is set on jump, could add slight adjustment here if needed
      } else { // Moving down
        setBirdRotation(r => Math.min(r + BIRD_ROTATION_SPEED, BIRD_ROTATION_DOWN_MAX));
      }

      // Pipe movement, scoring, and collision
      setPipes(prevPipes => {
        let newPipes = prevPipes.map(pipe => ({ ...pipe, x: pipe.x - PIPE_SPEED }));
        let newScore = score;

        for (const pipe of newPipes) {
          // Scoring: if bird has passed the pipe's right edge
          if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X_POSITION) {
            pipe.scored = true;
            newScore++;
          }

          // Collision detection
          const birdRect = { x: BIRD_X_POSITION, y: birdY, width: BIRD_WIDTH, height: BIRD_HEIGHT };
          const pipeRightEdge = pipe.x + PIPE_WIDTH;

          // Check if bird is horizontally aligned with the current pipe
          if (BIRD_X_POSITION + BIRD_WIDTH > pipe.x && BIRD_X_POSITION < pipeRightEdge) {
            const topPipeBottomEdge = pipe.topPipeHeight;
            const bottomPipeTopEdge = pipe.topPipeHeight + PIPE_GAP;

            if (birdY < topPipeBottomEdge || birdY + BIRD_HEIGHT > bottomPipeTopEdge) {
              setGameState('over');
              // No need to break, state change will stop the loop
            }
          }
        }
        if (newScore !== score) setScore(newScore);
        return newPipes.filter(pipe => pipe.x > -PIPE_WIDTH); // Remove off-screen pipes
      });
      
      if (gameState === 'playing') { // Check again as state might have changed within this tick
          gameLoopRef.current = requestAnimationFrame(gameTick);
      }
    };

    gameLoopRef.current = requestAnimationFrame(gameTick);

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, birdVelocity, birdY, score]); // Dependencies for the game loop

  // NEW: Separate useEffect for Pipe Spawning
  useEffect(() => {
    if (gameState === 'playing') {
      pipeSpawnTimerRef.current = setInterval(() => {
        const minTopPipeHeight = 60;
        const maxTopPipeHeight = GAME_HEIGHT - PIPE_GAP - 60;
        const topPipeHeight = Math.floor(Math.random() * (maxTopPipeHeight - minTopPipeHeight + 1)) + minTopPipeHeight;
        
        setPipes(prevPipes => [
          ...prevPipes,
          { id: `${Date.now()}-${Math.random()}`, x: GAME_WIDTH, topPipeHeight, scored: false },
        ]);
      }, PIPE_SPAWN_INTERVAL);

      return () => {
        if (pipeSpawnTimerRef.current) {
          clearInterval(pipeSpawnTimerRef.current);
        }
      };
    } else {
      // Ensure timer is cleared if gameState is not 'playing' (e.g., 'start' or 'over')
      if (pipeSpawnTimerRef.current) {
        clearInterval(pipeSpawnTimerRef.current);
      }
    }
  }, [gameState]); // Only depends on gameState


  return (
      <div
        ref={gameAreaRef}
        id="flappy-bird-game-area"
        className="relative overflow-hidden border-4 border-black shadow-2xl cursor-pointer bg-cover bg-center"
        style={{ 
            width: GAME_WIDTH, 
            height: GAME_HEIGHT, 
            backgroundImage: "url('/assets/background.png')", // Optional: if you have a background image
            backgroundColor: '#71c5cf' // Fallback color
        }}
        tabIndex={0} // Make div focusable for keyboard events if window listener is removed
      >
        {gameState === 'start' && (
          <ScreenOverlay 
            title="Flappy Bird"
            message="Click or Press Space to Play"
            buttonText="Start Game"
            onButtonClick={handleGameAction}
          />
        )}
        {gameState === 'over' && (
          <ScreenOverlay 
            title="Game Over!"
            score={score}
            buttonText="Try Again"
            onButtonClick={handleGameAction}
          />
        )}

        {/* Render game elements if playing or game over (to show final state) */}
        {(gameState === 'playing' || gameState === 'over') && (
          <>
            <Bird y={birdY} rotation={birdRotation} />
            {pipes.map(pipe => (
              <PipePair key={pipe.id} x={pipe.x} topPipeHeight={pipe.topPipeHeight} />
            ))}
            <ScoreDisplay score={score} />
          </>
        )}
      </div>
  );
}