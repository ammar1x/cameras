import React, { useState, useEffect, useCallback } from 'react';
import CameraGrid from './components/camera/CameraGrid';
import CameraFullscreen from './components/camera/CameraFullscreen';
import PictureInPicture from './components/camera/PictureInPicture';
import Settings from './components/Settings';
import LayoutSelector from './components/layout/LayoutSelector';
import ToastContainer from './components/common/ToastContainer';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { LayoutProvider } from './contexts/LayoutContext';
import type { CameraConfig } from '@shared/types';

type View = 'grid' | 'fullscreen' | 'settings';

interface PiPState {
  channelId: number;
  channelName: string;
}

function AppContent() {
  const [channels, setChannels] = useState<CameraConfig[]>([]);
  const [view, setView] = useState<View>('grid');
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pip, setPip] = useState<PiPState | null>(null);
  const { addToast } = useToast();

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      setChannels(data);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
      addToast('error', 'Failed to load cameras');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleCameraClick = (channelId: number) => {
    setSelectedChannel(channelId);
    setView('fullscreen');
  };

  const handlePrevCamera = () => {
    if (selectedChannel === null) return;
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel);
    if (currentIndex > 0) {
      setSelectedChannel(channels[currentIndex - 1].id);
    }
  };

  const handleNextCamera = () => {
    if (selectedChannel === null) return;
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel);
    if (currentIndex < channels.length - 1) {
      setSelectedChannel(channels[currentIndex + 1].id);
    }
  };

  const getCurrentCameraIndex = () => {
    if (selectedChannel === null) return -1;
    return channels.findIndex((c) => c.id === selectedChannel);
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
    addToast('success', 'Settings saved');
  };

  const handleOpenPiP = (channelId: number) => {
    const channel = channels.find((c) => c.id === channelId);
    if (channel) {
      setPip({
        channelId: channel.id,
        channelName: channel.name,
      });
    }
  };

  const handleClosePiP = () => {
    setPip(null);
  };

  const handleExpandPiP = () => {
    if (pip) {
      handleCameraClick(pip.channelId);
      setPip(null);
    }
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
        <div className="header-controls">
          {view === 'grid' && <LayoutSelector />}
          <button className="settings-btn" onClick={handleOpenSettings}>
            Settings
          </button>
        </div>
      </header>

      <main className="main">
        {view === 'grid' && (
          <CameraGrid
            channels={channels}
            onCameraClick={handleCameraClick}
            onOpenPiP={handleOpenPiP}
          />
        )}

        {view === 'fullscreen' && selectedChannel !== null && (
          <CameraFullscreen
            channelId={selectedChannel}
            channelName={
              channels.find((c) => c.id === selectedChannel)?.name ||
              `Camera ${selectedChannel}`
            }
            onBack={handleBackToGrid}
            onPrevCamera={handlePrevCamera}
            onNextCamera={handleNextCamera}
            hasPrev={getCurrentCameraIndex() > 0}
            hasNext={getCurrentCameraIndex() < channels.length - 1}
          />
        )}

        {view === 'settings' && <Settings onClose={handleCloseSettings} />}
      </main>

      {pip && (
        <PictureInPicture
          channelId={pip.channelId}
          channelName={pip.channelName}
          onClose={handleClosePiP}
          onExpand={handleExpandPiP}
        />
      )}

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <LayoutProvider>
        <AppContent />
      </LayoutProvider>
    </ToastProvider>
  );
}
