// components/forms/game-selection.tsx
'use client';

import { Button } from "@/components/ui/button";
import { Target, Gamepad2, Globe } from 'lucide-react';

type GameType = "flappy_bird" | "stress_click" | "website_browse";

interface GameSelectionProps {
  selectedGame: GameType;
  onGameChange: (game: GameType) => void;
}

export function GameSelection({ selectedGame, onGameChange }: GameSelectionProps) {
  const games = [
    {
      id: 'stress_click' as GameType,
      name: 'STRESS CLICK',
      icon: Target,
      variant: 'success' as const,
      description: 'CLICK TARGETS FAST!'
    },
    {
      id: 'flappy_bird' as GameType, 
      name: 'FLAPPY BIRD',
      icon: Gamepad2,
      variant: 'purple' as const,
      description: 'FLY & SURVIVE!'
    },
    {
      id: 'website_browse' as GameType,
      name: 'WEB SURF',
      icon: Globe,
      variant: 'cyan' as const,
      description: 'BROWSE THE NET!'
    }
  ];

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <h3 className="neo-text-label text-black mb-2">CHOOSE YOUR CHAOS</h3>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {games.map((game) => {
          const Icon = game.icon;
          const isSelected = selectedGame === game.id;
          
          return (
            <Button
              key={game.id}
              variant={isSelected ? game.variant : 'outline'}
              size="lg"
              onClick={() => onGameChange(game.id)}
              className={`w-full h-auto py-4 px-6 flex flex-col items-center gap-2 text-black ${
                isSelected ? 'ring-4 ring-black ring-offset-4 ring-offset-yellow-400' : ''
              }`}
            >
              <div className="flex items-center gap-3 w-full justify-center">
                <Icon className="h-6 w-6" />
                <span className="font-black text-lg">{game.name}</span>
              </div>
              <span className="text-xs font-bold opacity-80 uppercase tracking-wider">
                {game.description}
              </span>
            </Button>
          );
        })}
      </div>
      
      <div className="text-center">
        <p className="text-xs font-bold text-black/70 uppercase tracking-wide">
          Pick your poison and let&apos;s analyze those expressions! 🤪
        </p>
      </div>
    </div>
  );
}