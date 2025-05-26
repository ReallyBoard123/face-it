'use client';

import { useState } from 'react';
import { DashboardGrid } from '@/components/layout/dashboard-grid';
import { Sidebar } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState({
    frameSkip: 30,
    analysisType: 'combined',
    visualizationStyle: 'timeline',
    detectionThreshold: 0.5,
    batchSize: 1,
  });

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar 
        open={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Facial Expression Analysis</h1>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-auto p-6">
          <DashboardGrid settings={settings} />
        </main>
      </div>
    </div>
  );
}