// components/forms/game-selection.tsx
'use client';

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Gamepad2, Globe } from 'lucide-react';

type GameType = "flappy_bird" | "stress_click" | "website_browse";

interface GameSelectionProps {
  selectedGame: GameType;
  onGameChange: (game: GameType) => void;
}

export function GameSelection({ selectedGame, onGameChange }: GameSelectionProps) {
  return (
    <Tabs value={selectedGame} onValueChange={(v) => onGameChange(v as GameType)} className="w-full">
      <TabsList className="grid w-full grid-cols-3 h-10">
        <TabsTrigger value="stress_click" className="text-xs">
          <Target className="h-4 w-4 mr-1" />
          Stress Click
        </TabsTrigger>
        <TabsTrigger value="flappy_bird" className="text-xs">
          <Gamepad2 className="h-4 w-4 mr-1" />
          Flappy Bird
        </TabsTrigger>
        <TabsTrigger value="website_browse" className="text-xs">
          <Globe className="h-4 w-4 mr-1" />
          Browse Web
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}