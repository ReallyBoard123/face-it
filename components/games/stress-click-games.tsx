// components/games/stress-click-games.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Target {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  animation?: 'pulse' | 'shake';
  moveIntervalId?: NodeJS.Timeout;
  spawnTime: number;
}

interface DifficultySetting {
  spawnTime: number;
  displayTime: number;
  size: number;
  speed: number;
}

interface GameStats {
  score: number;
  level: number;
  timeLeft: number;
  hits: number;
  misses: number;
  accuracy: number;
}

interface GameEventData {
  targetId?: string;
  currentScore?: number;
  difficulty?: DifficultySetting;
  duration?: number;
  reactionTimeMs?: number;
  points?: number;
  from?: number;
  to?: number;
  direction?: 'up' | 'down';
  newDifficultySettings?: DifficultySetting;
  [key: string]: unknown;
}

interface StressClickGameProps {
  duration?: number;
  onGameEvent?: (event: { type: string; data: GameEventData; timestamp: number }) => void;
  onGameComplete?: (stats: GameStats) => void;
}

const DIFFICULTY_LEVELS_CONFIG: DifficultySetting[] = [
  { spawnTime: 1500, displayTime: 2500, size: 80, speed: 0.5 },
  { spawnTime: 1200, displayTime: 2000, size: 70, speed: 1.0 },
  { spawnTime: 1000, displayTime: 1500, size: 60, speed: 1.5 },
  { spawnTime: 800,  displayTime: 1200, size: 50, speed: 2.0 },
  { spawnTime: 600,  displayTime: 1000, size: 40, speed: 2.2 },
];
const MAX_DIFFICULTY_LEVEL = DIFFICULTY_LEVELS_CONFIG.length;
const DEFAULT_GAME_DURATION = 60;

const LEVEL_THRESHOLDS = [0, 8, 28, 48, 70];

export const StressClickGame: React.FC<StressClickGameProps> = ({
  duration = DEFAULT_GAME_DURATION,
  onGameEvent,
  onGameComplete,
}) => {
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    level: 1,
    timeLeft: duration,
    hits: 0,
    misses: 0,
    accuracy: 0,
  });
  const [currentDifficultySetting, setCurrentDifficultySetting] = useState<DifficultySetting>(DIFFICULTY_LEVELS_CONFIG[0]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [gameActive, setGameActive] = useState(false);
  const [uiMessage, setUiMessage] = useState('');

  const gameAreaRef = useRef<HTMLDivElement>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const targetRemovalTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const gameStartTimeRef = useRef<number | null>(null);

  const emitGameEvent = useCallback((type: string, data: GameEventData) => {
    if (onGameEvent && gameStartTimeRef.current) {
      const timestamp = (Date.now() - gameStartTimeRef.current) / 1000;
      setTimeout(() => {
        onGameEvent({ type, data, timestamp });
      }, 0);
    }
  }, [onGameEvent]);

  const calculateLevelFromScore = useCallback((score: number): number => {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= LEVEL_THRESHOLDS[i]) {
        return Math.min(i + 1, MAX_DIFFICULTY_LEVEL);
      }
    }
    return 1;
  }, []);

  const endGame = useCallback(() => {
    setGameActive(false);
    
    setStats(prev => {
      const finalAccuracy = prev.hits + prev.misses > 0 ? (prev.hits / (prev.hits + prev.misses)) * 100 : 0;
      const finalStats = {
        ...prev,
        timeLeft: 0,
        accuracy: finalAccuracy,
      };
      
      if (onGameEvent && gameStartTimeRef.current) {
        const timestamp = (Date.now() - gameStartTimeRef.current) / 1000;
        onGameEvent({type: 'game_end', data: finalStats, timestamp });
      }
      if (onGameComplete) {
        onGameComplete(finalStats);
      }
      setUiMessage(`GAME OVER! FINAL SCORE: ${finalStats.score}`);
      return finalStats;
    });
  }, [onGameEvent, onGameComplete]);

  const updateGameTimer = useCallback(() => {
    setStats(prev => {
      if (prev.timeLeft <= 1) {
        endGame();
        return { ...prev, timeLeft: 0 };
      }
      return { ...prev, timeLeft: prev.timeLeft - 1 };
    });
  }, [endGame]);

  const handleTargetMiss = useCallback((targetId: string) => {
    setTargets(prevTargets => prevTargets.filter(t => t.id !== targetId));
    setStats(prev => {
      const newScore = Math.max(0, prev.score - 5);
      emitGameEvent('target_miss', { targetId, currentScore: newScore });
      return {
        ...prev,
        misses: prev.misses + 1,
        score: newScore
      };
    });
    targetRemovalTimersRef.current.delete(targetId);
  }, [emitGameEvent]);

  const performSpawnTarget = useCallback(() => {
    if (!gameActive) {
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      return;
    }
    
    if (!gameAreaRef.current || gameAreaRef.current.clientWidth === 0 || gameAreaRef.current.clientHeight === 0) {
      spawnTimerRef.current = setTimeout(performSpawnTarget, 250);
      return;
    }

    const gameAreaRect = gameAreaRef.current.getBoundingClientRect();
    const settings = currentDifficultySetting;
    const size = settings.size;
    const maxX = gameAreaRect.width - size;
    const maxY = gameAreaRect.height - size;

    if (maxX <= 0 || maxY <= 0) {
      spawnTimerRef.current = setTimeout(performSpawnTarget, 250);
      return;
    }

    const id = `target-${Date.now()}-${Math.random()}`;
    const x = Math.floor(Math.random() * maxX);
    const y = Math.floor(Math.random() * maxY);
    
    // Neobrutalism colors based on level
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
    const color = colors[stats.level - 1] || colors[colors.length - 1];
    
    const spawnTime = Date.now();
    const newTarget: Target = { id, x, y, size, color, animation: 'pulse', spawnTime };

    if (settings.speed > 0) {
      let xSpeed = (Math.random() - 0.5) * settings.speed * 2;
      let ySpeed = (Math.random() - 0.5) * settings.speed * 2;
      newTarget.moveIntervalId = setInterval(() => {
        setTargets(prevTargets =>
          prevTargets.map(t => {
            if (t.id === id && gameAreaRef.current) {
              const currentRect = gameAreaRef.current.getBoundingClientRect();
              const currentMaxX = currentRect.width - t.size;
              const currentMaxY = currentRect.height - t.size;
              let newXVal = t.x + xSpeed;
              let newYVal = t.y + ySpeed;
              if (newXVal <= 0 || newXVal >= currentMaxX) { xSpeed *= -1; newXVal = t.x + xSpeed; }
              if (newYVal <= 0 || newYVal >= currentMaxY) { ySpeed *= -1; newYVal = t.y + ySpeed; }
              return {
                ...t,
                x: Math.max(0, Math.min(newXVal, currentMaxX)),
                y: Math.max(0, Math.min(newYVal, currentMaxY)),
              };
            }
            return t;
          })
        );
      }, 30);
    }

    setTargets(prev => [...prev, newTarget]);
    emitGameEvent('target_spawn', { targetId: id, difficulty: settings, position: {x,y}, size });
    const removalTimer = setTimeout(() => handleTargetMiss(id), settings.displayTime);
    targetRemovalTimersRef.current.set(id, removalTimer);

    if (gameActive) {
      spawnTimerRef.current = setTimeout(performSpawnTarget, settings.spawnTime);
    }
  }, [gameActive, currentDifficultySetting, stats.level, emitGameEvent, handleTargetMiss]);

  const handleTargetHit = useCallback((targetId: string, currentTargets: Target[]) => {
    const hitTargetDetails = currentTargets.find(t => t.id === targetId);
    if (!gameActive || !hitTargetDetails) return;

    const reactionTime = Date.now() - hitTargetDetails.spawnTime;
    if (hitTargetDetails.moveIntervalId) clearInterval(hitTargetDetails.moveIntervalId);
    
    const removalTimer = targetRemovalTimersRef.current.get(targetId);
    if (removalTimer) { clearTimeout(removalTimer); targetRemovalTimersRef.current.delete(targetId); }

    setTargets(prev => prev.filter(t => t.id !== targetId));
    
    setStats(prev => {
      const pointsEarned = prev.level * 2;
      const newScore = prev.score + pointsEarned;
      emitGameEvent('target_hit', { targetId, reactionTimeMs: reactionTime, points: pointsEarned, currentScore: newScore });
      return { ...prev, score: newScore, hits: prev.hits + 1 };
    });
  }, [gameActive, emitGameEvent]);

  const startGameFlow = () => {
    setStats({
      score: 0,
      level: 1,
      timeLeft: duration,
      hits: 0,
      misses: 0,
      accuracy: 0,
    });
    setCurrentDifficultySetting(DIFFICULTY_LEVELS_CONFIG[0]);
    setUiMessage('');
    setTargets([]);
    gameStartTimeRef.current = Date.now();
    emitGameEvent('game_start', { difficulty: DIFFICULTY_LEVELS_CONFIG[0], duration });
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(updateGameTimer, 1000);
    setGameActive(true);
  };

  // Effect for managing the spawn loop
  useEffect(() => {
    if (gameActive) {
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      performSpawnTarget();
    } else {
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      const currentTimers = new Map(targetRemovalTimersRef.current);
      currentTimers.forEach(clearTimeout);
      targetRemovalTimersRef.current.clear();
      
      setTargets(prevTargets => {
        prevTargets.forEach(t => {
          if (t.moveIntervalId) clearInterval(t.moveIntervalId);
        });
        return [];
      });
    }

    return () => {
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
    };
  }, [gameActive, performSpawnTarget, currentDifficultySetting.spawnTime]);

  // Effect for level and difficulty changes
  useEffect(() => {
    if (!gameActive) return;
    const newLevel = calculateLevelFromScore(stats.score);
    if (newLevel !== stats.level) {
      const oldLevel = stats.level;
      const isLevelUp = newLevel > oldLevel;
      setStats(prev => ({ ...prev, level: newLevel }));
      setCurrentDifficultySetting(DIFFICULTY_LEVELS_CONFIG[newLevel - 1]);
      emitGameEvent('difficulty_change', { 
        from: oldLevel, 
        to: newLevel, 
        direction: isLevelUp ? 'up' : 'down',
        newDifficultySettings: DIFFICULTY_LEVELS_CONFIG[newLevel - 1] 
      });
    }
  }, [stats.score, stats.level, gameActive, calculateLevelFromScore, emitGameEvent]);

  // General cleanup
  useEffect(() => {
    const currentGameTimer = gameTimerRef.current;
    const currentSpawnTimer = spawnTimerRef.current;
    const currentTargetRemovalTimers = new Map(targetRemovalTimersRef.current);

    return () => {
      if (currentGameTimer) clearInterval(currentGameTimer);
      if (currentSpawnTimer) clearTimeout(currentSpawnTimer);
      currentTargetRemovalTimers.forEach(clearTimeout);
      
      setTargets(prevTargets => {
        prevTargets.forEach(t => { 
          if (t.moveIntervalId) clearInterval(t.moveIntervalId); 
        });
        return [];
      });
    };
  }, []);

  const toggleGame = () => {
    if (gameActive) {
      endGame();
    } else {
      startGameFlow();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <style jsx global>{`
        .neo-target {
          position: absolute;
          border: 4px solid #000;
          cursor: pointer;
          transition: all 0.1s ease-out;
          box-shadow: 4px 4px 0px 0px #000;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #000;
          font-size: 12px;
          text-shadow: 2px 2px 0px #fff;
        }
        .neo-target:hover {
          transform: scale(1.2) translate(-2px, -2px);
          box-shadow: 8px 8px 0px 0px #000;
          z-index: 10;
        }
        .neo-target:active {
          transform: scale(0.9) translate(2px, 2px);
          box-shadow: 2px 2px 0px 0px #000;
        }
        .neo-target.pulse-animation {
          animation: neoPulse 0.8s infinite alternate ease-in-out;
        }
        @keyframes neoPulse {
          from { 
            box-shadow: 4px 4px 0px 0px #000;
            transform: scale(1);
          }
          to { 
            box-shadow: 8px 8px 0px 0px #000;
            transform: scale(1.05);
          }
        }
        .neo-hit-effect {
          animation: neoHitEffect 0.3s ease-out;
        }
        @keyframes neoHitEffect {
          0% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.3) rotate(5deg); }
          50% { transform: scale(1.1) rotate(-3deg); }
          75% { transform: scale(1.2) rotate(2deg); }
          100% { transform: scale(0) rotate(0deg); }
        }
      `}</style>
      
      <div className="w-full h-full flex flex-col rounded-none overflow-hidden">
        {/* Header */}
        <Card variant="yellow" className="border-b-8 border-black rounded-none">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="neo-text-title text-black">STRESS CLICK</h2>
              <Button
                onClick={toggleGame}
                variant={gameActive ? 'destructive' : 'success'}
                size="xl"
                className="text-lg"
              >
                {gameActive ? 'STOP CHAOS' : 'START CHAOS'}
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card variant="cyan" className="p-3 text-center">
                <div className="text-xs font-black uppercase tracking-wider text-black mb-1">TIME</div>
                <div className="font-mono text-xl font-black text-black">{formatTime(stats.timeLeft)}</div>
              </Card>
              
              <Card variant="green" className="p-3 text-center">
                <div className="text-xs font-black uppercase tracking-wider text-black mb-1">SCORE</div>
                <div className="font-mono text-xl font-black text-black">{stats.score}</div>
              </Card>
              
              <Card variant="orange" className="p-3 text-center">
                <div className="text-xs font-black uppercase tracking-wider text-black mb-1">LEVEL</div>
                <div className="font-mono text-xl font-black text-black">{stats.level}</div>
              </Card>
              
              <Card variant="pink" className="p-3 text-center">
                <div className="text-xs font-black uppercase tracking-wider text-black mb-1">ACCURACY</div>
                <div className="font-mono text-xl font-black text-black">
                  {stats.hits + stats.misses > 0 ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(0)}%` : '-'}
                </div>
              </Card>
            </div>
          </div>
        </Card>

        {/* Game Area */}
        <div
          ref={gameAreaRef}
          className="flex-1 relative bg-gradient-to-br from-purple-400 via-pink-400 to-cyan-400 border-8 border-black overflow-hidden"
          style={{ minHeight: '300px' }}
        >
          {!gameActive && uiMessage && (
            <Card variant="white" className="absolute inset-4 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="neo-text-heading text-black mb-4">{uiMessage}</div>
                <Button onClick={toggleGame} variant="success" size="xl">
                  PLAY AGAIN!
                </Button>
              </div>
            </Card>
          )}
          
          {!gameActive && !uiMessage && (
            <Card variant="white" className="absolute inset-4 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="neo-text-heading text-black mb-4">READY FOR CHAOS?</div>
                <div className="text-sm font-bold text-black/70 uppercase tracking-wide mb-6">
                  Click targets as fast as you can!
                </div>
                <Button onClick={toggleGame} variant="success" size="xl">
                  UNLEASH THE MADNESS!
                </Button>
              </div>
            </Card>
          )}
          
          {targets.map(target => (
            <div
              key={target.id}
              id={target.id}
              className={`neo-target ${target.animation === 'pulse' ? 'pulse-animation' : ''}`}
              style={{
                left: `${target.x}px`,
                top: `${target.y}px`,
                width: `${target.size}px`,
                height: `${target.size}px`,
                backgroundColor: target.color,
                borderRadius: '0px', // Keep it square for brutalist look
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (gameActive) {
                  e.currentTarget.classList.add('neo-hit-effect');
                  handleTargetHit(target.id, targets);
                }
              }}
            >
              💥
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default StressClickGame;