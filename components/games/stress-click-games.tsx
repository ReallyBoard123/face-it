// components/games/stress-click-game.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Target, Zap } from 'lucide-react';

interface Target {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  xSpeed?: number;
  ySpeed?: number;
  spawnTime: number;
}

interface DifficultyLevel {
  level: number;
  spawnInterval: number;
  targetLifetime: number;
  targetSize: number;
  moveSpeed: number;
  color: string;
  name: string;
}

interface GameStats {
  score: number;
  level: number;
  timeLeft: number;
  hits: number;
  misses: number;
  accuracy: number;
}

interface StressClickGameProps {
  duration?: number;
  onGameEvent?: (event: { type: string; data: any; timestamp: number }) => void;
  onGameComplete?: (stats: GameStats) => void;
}

const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  { level: 1, spawnInterval: 1500, targetLifetime: 2500, targetSize: 80, moveSpeed: 0, color: 'hsl(120, 70%, 60%)', name: 'Easy' },
  { level: 2, spawnInterval: 1200, targetLifetime: 2000, targetSize: 70, moveSpeed: 0.5, color: 'hsl(80, 70%, 60%)', name: 'Medium' },
  { level: 3, spawnInterval: 1000, targetLifetime: 1500, targetSize: 60, moveSpeed: 1.0, color: 'hsl(40, 70%, 60%)', name: 'Hard' },
  { level: 4, spawnInterval: 800, targetLifetime: 1200, targetSize: 50, moveSpeed: 1.5, color: 'hsl(20, 70%, 60%)', name: 'Expert' },
  { level: 5, spawnInterval: 600, targetLifetime: 1000, targetSize: 40, moveSpeed: 2.0, color: 'hsl(0, 70%, 60%)', name: 'Insane' },
];

export function StressClickGame({ 
  duration = 70, 
  onGameEvent,
  onGameComplete 
}: StressClickGameProps) {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'completed'>('idle');
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    level: 1,
    timeLeft: duration,
    hits: 0,
    misses: 0,
    accuracy: 0
  });
  const [targets, setTargets] = useState<Target[]>([]);
  const [currentDifficulty, setCurrentDifficulty] = useState<DifficultyLevel>(DIFFICULTY_LEVELS[0]);

  const gameAreaRef = useRef<HTMLDivElement>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const gameStartTimeRef = useRef<number>(0);

  // Calculate level based on score
  const calculateLevel = useCallback((score: number): number => {
    return Math.min(Math.floor(score / 8) + 1, DIFFICULTY_LEVELS.length);
  }, []);

  // Emit game events for analysis
  const emitGameEvent = useCallback((type: string, data: any) => {
    if (onGameEvent) {
      const timestamp = gameStartTimeRef.current ? 
        (Date.now() - gameStartTimeRef.current) / 1000 : 0;
      onGameEvent({ type, data, timestamp });
    }
  }, [onGameEvent]);

  // Start the game
  const startGame = useCallback(() => {
    const initialStats = {
      score: 0,
      level: 1,
      timeLeft: duration,
      hits: 0,
      misses: 0,
      accuracy: 0
    };

    setStats(initialStats);
    setTargets([]);
    setCurrentDifficulty(DIFFICULTY_LEVELS[0]);
    setGameState('playing');
    gameStartTimeRef.current = Date.now();

    emitGameEvent('game_start', { difficulty: DIFFICULTY_LEVELS[0] });

    // Start game timer
    gameTimerRef.current = setInterval(() => {
      setStats(prev => {
        const newTimeLeft = Math.max(0, prev.timeLeft - 1);
        if (newTimeLeft === 0) {
          return prev; // Will be handled by useEffect
        }
        return { ...prev, timeLeft: newTimeLeft };
      });
    }, 1000);

    // Start spawning targets
    scheduleNextTarget();
  }, [duration, emitGameEvent]);

  // End the game
  const endGame = useCallback(() => {
    setGameState('completed');
    
    // Clear all timers
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    targetTimersRef.current.forEach(timer => clearTimeout(timer));
    targetTimersRef.current.clear();

    // Clear targets
    setTargets([]);

    // Emit final stats
    setStats(prev => {
      const finalStats = {
        ...prev,
        accuracy: prev.hits + prev.misses > 0 ? (prev.hits / (prev.hits + prev.misses)) * 100 : 0
      };
      
      emitGameEvent('game_end', finalStats);
      if (onGameComplete) {
        onGameComplete(finalStats);
      }
      
      return finalStats;
    });
  }, [emitGameEvent, onGameComplete]);

  // Schedule next target spawn
  const scheduleNextTarget = useCallback(() => {
    if (gameState !== 'playing') return;

    spawnTimerRef.current = setTimeout(() => {
      spawnTarget();
      scheduleNextTarget();
    }, currentDifficulty.spawnInterval);
  }, [gameState, currentDifficulty]);

  // Spawn a new target
  const spawnTarget = useCallback(() => {
    if (!gameAreaRef.current || gameState !== 'playing') return;

    const area = gameAreaRef.current.getBoundingClientRect();
    const size = currentDifficulty.targetSize;
    const maxX = area.width - size;
    const maxY = area.height - size;

    if (maxX <= 0 || maxY <= 0) return;

    const targetId = `target_${Date.now()}_${Math.random()}`;
    const x = Math.random() * maxX;
    const y = Math.random() * maxY;

    const newTarget: Target = {
      id: targetId,
      x,
      y,
      size,
      color: currentDifficulty.color,
      xSpeed: currentDifficulty.moveSpeed > 0 ? (Math.random() - 0.5) * currentDifficulty.moveSpeed : 0,
      ySpeed: currentDifficulty.moveSpeed > 0 ? (Math.random() - 0.5) * currentDifficulty.moveSpeed : 0,
      spawnTime: Date.now()
    };

    setTargets(prev => [...prev, newTarget]);
    
    emitGameEvent('target_spawn', { 
      targetId, 
      difficulty: currentDifficulty.level,
      position: { x, y }
    });

    // Schedule target removal
    const removeTimer = setTimeout(() => {
      setTargets(prev => prev.filter(t => t.id !== targetId));
      setStats(prev => ({ 
        ...prev, 
        misses: prev.misses + 1,
        score: Math.max(0, prev.score - 1)
      }));
      
      emitGameEvent('target_miss', { targetId });
      targetTimersRef.current.delete(targetId);
    }, currentDifficulty.targetLifetime);

    targetTimersRef.current.set(targetId, removeTimer);
  }, [gameState, currentDifficulty, emitGameEvent]);

  // Handle target click
  const handleTargetClick = useCallback((targetId: string) => {
    const target = targets.find(t => t.id === targetId);
    if (!target) return;

    // Calculate reaction time
    const reactionTime = Date.now() - target.spawnTime;

    // Remove target
    setTargets(prev => prev.filter(t => t.id !== targetId));
    
    // Clear removal timer
    const timer = targetTimersRef.current.get(targetId);
    if (timer) {
      clearTimeout(timer);
      targetTimersRef.current.delete(targetId);
    }

    // Update stats
    setStats(prev => {
      const newScore = prev.score + currentDifficulty.level;
      const newLevel = calculateLevel(newScore);
      const levelChanged = newLevel !== prev.level;

      if (levelChanged && newLevel <= DIFFICULTY_LEVELS.length) {
        const newDifficulty = DIFFICULTY_LEVELS[newLevel - 1];
        setCurrentDifficulty(newDifficulty);
        emitGameEvent('difficulty_change', { 
          from: prev.level, 
          to: newLevel,
          difficulty: newDifficulty
        });
      }

      return {
        ...prev,
        score: newScore,
        level: newLevel,
        hits: prev.hits + 1
      };
    });

    emitGameEvent('target_hit', { 
      targetId, 
      reactionTime,
      score: currentDifficulty.level,
      difficulty: currentDifficulty.level
    });
  }, [targets, currentDifficulty, calculateLevel, emitGameEvent]);

  // Handle target movement
  useEffect(() => {
    if (gameState !== 'playing' || currentDifficulty.moveSpeed === 0) return;

    const moveInterval = setInterval(() => {
      setTargets(prev => prev.map(target => {
        if (!target.xSpeed || !target.ySpeed || !gameAreaRef.current) return target;

        const area = gameAreaRef.current.getBoundingClientRect();
        let newX = target.x + target.xSpeed;
        let newY = target.y + target.ySpeed;
        let newXSpeed = target.xSpeed;
        let newYSpeed = target.ySpeed;

        // Bounce off walls
        if (newX <= 0 || newX >= area.width - target.size) {
          newXSpeed *= -1;
          newX = Math.max(0, Math.min(newX, area.width - target.size));
        }
        if (newY <= 0 || newY >= area.height - target.size) {
          newYSpeed *= -1;
          newY = Math.max(0, Math.min(newY, area.height - target.size));
        }

        return {
          ...target,
          x: newX,
          y: newY,
          xSpeed: newXSpeed,
          ySpeed: newYSpeed
        };
      }));
    }, 16); // ~60fps

    return () => clearInterval(moveInterval);
  }, [gameState, currentDifficulty.moveSpeed]);

  // Handle game timer end
  useEffect(() => {
    if (stats.timeLeft === 0 && gameState === 'playing') {
      endGame();
    }
  }, [stats.timeLeft, gameState, endGame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      targetTimersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-red-400 flex items-center gap-2">
            <Target className="h-6 w-6" />
            Stress Click Challenge
          </h2>
          {gameState === 'idle' && (
            <Button 
              onClick={startGame}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="mr-2 h-4 w-4" />
              Start Game
            </Button>
          )}
          {gameState === 'playing' && (
            <Button 
              onClick={endGame}
              variant="destructive"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop Game
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gray-700 px-3 py-2 rounded text-center">
            <p className="text-xs text-gray-400">Time</p>
            <p className="font-mono text-lg">{formatTime(stats.timeLeft)}</p>
          </div>
          <div className="bg-gray-700 px-3 py-2 rounded text-center">
            <p className="text-xs text-gray-400">Score</p>
            <p className="font-mono text-lg">{stats.score}</p>
          </div>
          <div className="bg-gray-700 px-3 py-2 rounded text-center">
            <p className="text-xs text-gray-400">Level</p>
            <div className="flex items-center justify-center gap-1">
              <p className="font-mono text-lg">{stats.level}</p>
              <Badge 
                variant="outline" 
                className="text-xs"
                style={{ color: currentDifficulty.color, borderColor: currentDifficulty.color }}
              >
                {currentDifficulty.name}
              </Badge>
            </div>
          </div>
          <div className="bg-gray-700 px-3 py-2 rounded text-center">
            <p className="text-xs text-gray-400">Hits</p>
            <p className="font-mono text-lg text-green-400">{stats.hits}</p>
          </div>
          <div className="bg-gray-700 px-3 py-2 rounded text-center">
            <p className="text-xs text-gray-400">Accuracy</p>
            <p className="font-mono text-lg">
              {stats.hits + stats.misses > 0 ? 
                `${Math.round((stats.hits / (stats.hits + stats.misses)) * 100)}%` : 
                '-%'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div 
        ref={gameAreaRef}
        className="flex-1 relative bg-gray-800 bg-opacity-50 overflow-hidden"
        style={{ minHeight: '400px' }}
      >
        {/* Instructions */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Target className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-xl mb-2">Click the targets as fast as you can!</p>
              <p className="text-gray-400">Difficulty increases as you score more points</p>
            </div>
          </div>
        )}

        {/* Game Complete */}
        {gameState === 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            <div className="text-center p-6 bg-gray-800 rounded-lg border border-gray-600">
              <Zap className="h-12 w-12 mx-auto mb-4 text-yellow-400" />
              <h3 className="text-2xl font-bold mb-2">Game Complete!</h3>
              <p className="text-lg mb-1">Final Score: <span className="text-green-400">{stats.score}</span></p>
              <p className="text-sm text-gray-400 mb-4">
                Accuracy: {stats.accuracy.toFixed(1)}% • Level Reached: {stats.level}
              </p>
              <Button onClick={startGame} className="bg-green-600 hover:bg-green-700">
                Play Again
              </Button>
            </div>
          </div>
        )}

        {/* Targets */}
        {targets.map(target => (
          <button
            key={target.id}
            onClick={() => handleTargetClick(target.id)}
            className="absolute rounded-full border-2 border-white shadow-lg transform hover:scale-110 active:scale-90 transition-transform"
            style={{
              left: `${target.x}px`,
              top: `${target.y}px`,
              width: `${target.size}px`,
              height: `${target.size}px`,
              backgroundColor: target.color,
              boxShadow: `0 0 20px ${target.color}`
            }}
          />
        ))}

        {/* Pulse overlay for difficulty changes */}
        {gameState === 'playing' && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${currentDifficulty.color}20 0%, transparent 50%)`,
              opacity: Math.max(0.1, (currentDifficulty.level - 1) * 0.1)
            }}
          />
        )}
      </div>
    </div>
  );
}