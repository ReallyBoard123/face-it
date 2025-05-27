// components/games/stress-click-games.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

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

interface StressClickGameProps {
  duration?: number;
  onGameEvent?: (event: { type: string; data: any; timestamp: number }) => void;
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

  // Memoized functions (emitGameEvent, calculateLevelFromScore, etc. from previous version)
  // Ensure their dependencies are correct.

  const emitGameEvent = useCallback((type: string, data: any) => {
    if (onGameEvent && gameStartTimeRef.current) {
      const timestamp = (Date.now() - gameStartTimeRef.current) / 1000;
      setTimeout(() => {
        onGameEvent({ type, data, timestamp });
      }, 0);
    }
  }, [onGameEvent]);

  // Define point thresholds for each level (progressive difficulty)  
  const LEVEL_THRESHOLDS = [0, 8, 28, 48, 70]; // Level 1: 0-7, Level 2: 8-19, Level 3: 20-37, Level 4: 38-61, Level 5: 62+
  const calculateLevelFromScore = useCallback((score: number): number => {
    // Find the highest level threshold that the score exceeds
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= LEVEL_THRESHOLDS[i]) {
        return Math.min(i + 1, MAX_DIFFICULTY_LEVEL);
      }
    }
    return 1; // Default to level 1
  }, []);

  const endGame = useCallback(() => {
    console.log('[endGame] Called. Setting gameActive to false.');
    setGameActive(false); // This will trigger the useEffect for gameActive to cleanup timers
    
    // Calculate and emit final stats *after* gameActive is set to false and timers are presumably cleared by useEffect
    // This might require a slight re-think if emitGameEvent depends on gameActive being true.
    // For now, let's ensure stats are updated.
    setStats(prev => {
      const finalAccuracy = prev.hits + prev.misses > 0 ? (prev.hits / (prev.hits + prev.misses)) * 100 : 0;
      const finalStats = {
        ...prev,
        timeLeft: 0,
        accuracy: finalAccuracy,
      };
      // emitGameEvent should ideally be called when all state is settled or from a useEffect.
      // For simplicity here, emitting with potentially slightly stale prev, but finalStats is correct.
      if (onGameEvent && gameStartTimeRef.current) {
          const timestamp = (Date.now() - gameStartTimeRef.current) / 1000;
          onGameEvent({type: 'game_end', data: finalStats, timestamp });
      }
      if (onGameComplete) {
        onGameComplete(finalStats);
      }
      setUiMessage(`Game Over! Final Score: ${finalStats.score}`);
      return finalStats;
    });

  }, [onGameEvent, onGameComplete]); // Removed stats.score as direct dep to avoid loop with setStats

  const updateGameTimer = useCallback(() => {
    setStats(prev => {
      if (prev.timeLeft <= 1) { // Check if it's about to be 0
        endGame();
        return { ...prev, timeLeft: 0 };
      }
      return { ...prev, timeLeft: prev.timeLeft - 1 };
    });
  }, [endGame]);

  const handleTargetMiss = useCallback((targetId: string) => {
    setTargets(prevTargets => prevTargets.filter(t => t.id !== targetId));
    setStats(prev => {
        // Reduce score by 1 point for every miss (minimum 0)
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
    // This function is now leaner and primarily focuses on spawning one target
    // and scheduling the *next* call to itself if the game is active.
    // It relies on the useEffect hook for initial calls and restarts.

    // console.log(`[performSpawnTarget] Called. gameActive: ${gameActive}, Level: ${stats.level}, SpawnTime: ${currentDifficultySetting.spawnTime}`);

    if (!gameActive) {
      // console.log("[performSpawnTarget] Bailing: game not active.");
      if (spawnTimerRef.current) { // Ensure no rogue timer is left if somehow called when not active
          clearTimeout(spawnTimerRef.current);
          spawnTimerRef.current = null;
      }
      return;
    }
    if (!gameAreaRef.current || gameAreaRef.current.clientWidth === 0 || gameAreaRef.current.clientHeight === 0) {
      // console.warn('[performSpawnTarget] Game area not ready or zero dimensions. Will retry via useEffect if performSpawnTarget identity changes, or if game restarts.');
      // Don't set a short retry timer here, let the main useEffect handle it or the next scheduled call.
      // If this was a scheduled call and dimensions became invalid, the loop might pause.
      // A more robust solution might involve a dedicated "wait for layout" state.
      // For now, if it fails here, the loop might break until next level change or game restart.
      // To keep it trying:
      spawnTimerRef.current = setTimeout(performSpawnTarget, 250); // Quick retry if area not ready
      return;
    }

    const gameAreaRect = gameAreaRef.current.getBoundingClientRect();
    const settings = currentDifficultySetting;
    const size = settings.size;
    const maxX = gameAreaRect.width - size;
    const maxY = gameAreaRect.height - size;

    if (maxX <= 0 || maxY <= 0) {
      // console.warn('[performSpawnTarget] No space for target. Retrying in 250ms');
      spawnTimerRef.current = setTimeout(performSpawnTarget, 250); // Quick retry
      return;
    }

    const id = `target-${Date.now()}-${Math.random()}`;
    const x = Math.floor(Math.random() * maxX);
    const y = Math.floor(Math.random() * maxY);
    const hue = 360 - (stats.level * 60);
    const color = `hsl(${hue}, 70%, 60%)`;
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
    emitGameEvent('target_spawn', { targetId: id, difficulty: stats.level, position: {x,y}, size });
    const removalTimer = setTimeout(() => handleTargetMiss(id), settings.displayTime);
    targetRemovalTimersRef.current.set(id, removalTimer);

    // Schedule the next call to this *current* performSpawnTarget instance
    // The useEffect will handle clearing this if performSpawnTarget itself changes identity
    if (gameActive) { // Re-check gameActive before setting timeout
        // console.log(`[performSpawnTarget] Scheduling next actual target in ${settings.spawnTime}ms.`);
        spawnTimerRef.current = setTimeout(performSpawnTarget, settings.spawnTime);
    }

  }, [gameActive, currentDifficultySetting, stats.level, emitGameEvent, handleTargetMiss]);


  const handleTargetHit = useCallback((targetId: string) => {
    const hitTargetDetails = targets.find(t => t.id === targetId);
    if (!gameActive || !hitTargetDetails) return; // Ensure game is active and target exists

    const reactionTime = Date.now() - hitTargetDetails.spawnTime;
    if (hitTargetDetails.moveIntervalId) clearInterval(hitTargetDetails.moveIntervalId);
    
    const removalTimer = targetRemovalTimersRef.current.get(targetId);
    if (removalTimer) { clearTimeout(removalTimer); targetRemovalTimersRef.current.delete(targetId); }

    setTargets(prev => prev.filter(t => t.id !== targetId));
    
    setStats(prev => {
        const pointsEarned = prev.level * 2; // Use prev.level for consistency
        const newScore = prev.score + pointsEarned;
        emitGameEvent('target_hit', { targetId, reactionTimeMs: reactionTime, points: pointsEarned, currentScore: newScore });
        return { ...prev, score: newScore, hits: prev.hits + 1 };
    });
    
    // Visual feedback (remains the same)
  }, [gameActive, targets, emitGameEvent]); // Removed stats.level, stats.score to use from setStats(prev => ...)

  const startGameFlow = () => {
    console.log('[startGameFlow] Initializing game...');
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
    setGameActive(true); // This will trigger the useEffect to start spawning
  };

  // Effect for managing the spawn loop based on gameActive and performSpawnTarget identity
  useEffect(() => {
    console.log(`[useEffect gameActive/performSpawnTarget] Fired. gameActive: ${gameActive}`);
    if (gameActive) {
      console.log(`   Current spawnTimerRef: ${spawnTimerRef.current}. Clearing it.`);
      // Always clear previous timer before starting a new one with the current performSpawnTarget
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      console.log(`   Calling performSpawnTarget (instance with spawn time: ${currentDifficultySetting.spawnTime}ms)`);
      performSpawnTarget(); // Call the current (potentially new) version
    } else {
      // Game is not active, clear all game-related timers
      console.log(`   Game not active. Clearing all timers. SpawnTimer: ${spawnTimerRef.current}`);
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      targetRemovalTimersRef.current.forEach(clearTimeout);
      targetRemovalTimersRef.current.clear();
      targets.forEach(t => {
        if (t.moveIntervalId) clearInterval(t.moveIntervalId);
      });
      setTargets([]); // Clear visual targets
    }

    // Cleanup function for this effect instance
    return () => {
      console.log(`[useEffect gameActive/performSpawnTarget CLEANUP] Clearing spawnTimerRef: ${spawnTimerRef.current}`);
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
    };
  }, [gameActive, performSpawnTarget]); // performSpawnTarget IS a dependency

  // Effect for level and difficulty changes
  useEffect(() => {
    if (!gameActive) return; // Only update level if game is active
    const newLevel = calculateLevelFromScore(stats.score);
    if (newLevel !== stats.level) {
      const oldLevel = stats.level;
      const isLevelUp = newLevel > oldLevel;
      console.log(`LEVEL ${isLevelUp ? 'UP' : 'DOWN'}: ${oldLevel} -> ${newLevel}. Score: ${stats.score}`);
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


  // General cleanup for component unmount
  useEffect(() => {
    return () => {
      console.log('[StressClickGame] Component Unmounting. Clearing all timers.');
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      targetRemovalTimersRef.current.forEach(clearTimeout);
      targets.forEach(t => { if (t.moveIntervalId) clearInterval(t.moveIntervalId); });
    };
  }, []); // Empty: runs on unmount only

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

  // JSX remains the same
  return (
    <>
      <style jsx global>{`
        .target-interactive {
          position: absolute;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.05s ease-out, box-shadow 0.2s ease-in-out;
          border: 2px solid white;
        }
        .target-interactive:hover {
          transform: scale(1.15);
          box-shadow: 0 0 15px currentColor, 0 0 25px currentColor;
        }
        .target-interactive:active {
          transform: scale(0.95);
        }
        .pulse-animation-strong {
          animation: pulseKeyframeStrong 0.7s infinite alternate ease-in-out;
        }
        @keyframes pulseKeyframeStrong {
          from { box-shadow: 0 0 5px 0px currentColor, 0 0 0 0px currentColor; opacity: 0.8; }
          to { box-shadow: 0 0 15px 8px currentColor, 0 0 0 5px currentColor; opacity: 1; }
        }
      `}</style>
      <div className="w-full h-full flex flex-col bg-gray-900 text-white rounded-lg overflow-hidden">
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl md:text-2xl font-bold text-red-400">Stress Click</h2>
            <button
              onClick={toggleGame}
              className={`text-white font-bold py-2 px-4 md:py-3 md:px-6 rounded-md text-sm md:text-lg transition-all ${
                gameActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {gameActive ? 'STOP' : 'START'}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-center">
            <div><p className="text-xs text-gray-400">Time</p><p className="font-mono text-lg">{formatTime(stats.timeLeft)}</p></div>
            <div><p className="text-xs text-gray-400">Score</p><p className="font-mono text-lg">{stats.score}</p></div>
            <div><p className="text-xs text-gray-400">Level</p><p className="font-mono text-lg">{stats.level}</p></div>
            <div><p className="text-xs text-gray-400">Accuracy</p><p className="font-mono text-lg">
              {stats.hits + stats.misses > 0 ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(0)}%` : '-'}
            </p></div>
          </div>
        </div>

        <div
          ref={gameAreaRef}
          className="flex-1 relative bg-gray-800 bg-opacity-50 overflow-hidden"
          style={{ minHeight: '300px' }}
        >
          {!gameActive && uiMessage && (
            <p className="absolute inset-0 flex items-center justify-center text-xl md:text-2xl font-bold text-yellow-400 p-4">
              {uiMessage}
            </p>
          )}
           {!gameActive && !uiMessage && (
             <p className="absolute inset-0 flex items-center justify-center text-xl md:text-2xl font-bold text-gray-500 p-4">
              Click START to begin!
            </p>
           )}
          {targets.map(target => (
            <div
              key={target.id}
              id={target.id}
              className={`target-interactive ${target.animation === 'pulse' ? 'pulse-animation-strong' : ''}`}
              style={{
                left: `${target.x}px`,
                top: `${target.y}px`,
                width: `${target.size}px`,
                height: `${target.size}px`,
                backgroundColor: target.color,
                color: target.color, // For box-shadow
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (gameActive) handleTargetHit(target.id);
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default StressClickGame;