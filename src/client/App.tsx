import React, { useState, useEffect, useCallback } from 'react';
import CameraGrid from './components/CameraGrid';
import CameraFullscreen from './components/CameraFullscreen';
import Settings from './components/Settings';
import type { CameraConfig } from '@shared/types';

type View = 'grid' | 'fullscreen' | 'settings';

export default function App() {
  const [channels, setChannels] = useState<CameraConfig[]>([]);
  const [view, setView] = useState<View>('grid');
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      setChannels(data);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleCameraClick = (channelId: number) => {
    setSelectedChannel(channelId);
    setView('fullscreen');
  };

  const handleBackToGrid = () => {
    setSelectedChannel(null);
    setView('grid');
  };

  const handleOpenSettings = () => {
    setView('settings');
  };

  const handleCloseSettings = () => {
    setView('grid');
    fetchChannels();
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading cameras...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Camera Viewer</h1>
        <button className="settings-btn" onClick={handleOpenSettings}>
          Settings
        </button>
      </header>

      <main className="main">
        {view === 'grid' && (
          <CameraGrid channels={channels} onCameraClick={handleCameraClick} />
        )}

        {view === 'fullscreen' && selectedChannel !== null && (
          <CameraFullscreen
            channelId={selectedChannel}
            channelName={
              channels.find((c) => c.id === selectedChannel)?.name ||
              `Camera ${selectedChannel}`
            }
            onBack={handleBackToGrid}
          />
        )}

        {view === 'settings' && <Settings onClose={handleCloseSettings} />}
      </main>
    </div>
  );
}
