import React, { useState, useEffect, useCallback } from 'react';
import CameraGrid from './components/camera/CameraGrid';
import CameraFullscreen from './components/camera/CameraFullscreen';
import PictureInPicture from './components/camera/PictureInPicture';
import Settings from './components/Settings';
import LayoutSelector from './components/layout/LayoutSelector';
import ToastContainer from './components/common/ToastContainer';
import RecordingBrowser from './components/recordings/RecordingBrowser';
import DVRPlayback from './components/dvr/DVRPlayback';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { LayoutProvider } from './contexts/LayoutContext';
import type { CameraConfig } from '@shared/types';

type View = 'grid' | 'fullscreen' | 'settings' | 'recordings' | 'dvr';

interface PiPState {
  channelId: number;
  channelName: string;
}

interface DVRState {
  channel?: number;
  date?: string;
  time?: string;
}

// Parse hash to determine view and state
function parseHash(): { view: View; selectedChannel?: number; dvrState?: DVRState } {
  const hash = window.location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);

  if (parts.length === 0 || parts[0] === 'grid') {
    return { view: 'grid' };
  }

  if (parts[0] === 'fullscreen' && parts[1]) {
    return { view: 'fullscreen', selectedChannel: parseInt(parts[1], 10) };
  }

  if (parts[0] === 'settings') {
    return { view: 'settings' };
  }

  if (parts[0] === 'recordings') {
    return { view: 'recordings' };
  }

  if (parts[0] === 'dvr') {
    const dvrState: DVRState = {};
    if (parts[1]) dvrState.channel = parseInt(parts[1], 10);
    if (parts[2]) dvrState.date = parts[2];
    if (parts[3]) dvrState.time = parts[3].replace(/-/g, ':');
    return { view: 'dvr', dvrState };
  }

  return { view: 'grid' };
}

function AppContent() {
  const [channels, setChannels] = useState<CameraConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [pip, setPip] = useState<PiPState | null>(null);
  const { addToast } = useToast();

  // Initialize state from URL hash
  const initialState = parseHash();
  const [view, setView] = useState<View>(initialState.view);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(
    initialState.selectedChannel ?? null
  );
  const [dvrState, setDvrState] = useState<DVRState | undefined>(initialState.dvrState);

  // Update hash when view changes
  const updateHash = useCallback((newView: View, channel?: number, dvr?: DVRState) => {
    let hash = '#/';
    switch (newView) {
      case 'grid':
        hash = '#/grid';
        break;
      case 'fullscreen':
        hash = `#/fullscreen/${channel}`;
        break;
      case 'settings':
        hash = '#/settings';
        break;
      case 'recordings':
        hash = '#/recordings';
        break;
      case 'dvr':
        if (dvr?.channel && dvr?.date && dvr?.time) {
          hash = `#/dvr/${dvr.channel}/${dvr.date}/${dvr.time.replace(/:/g, '-')}`;
        } else {
          hash = '#/dvr';
        }
        break;
    }
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHash();
      setView(parsed.view);
      setSelectedChannel(parsed.selectedChannel ?? null);
      setDvrState(parsed.dvrState);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
    updateHash('fullscreen', channelId);
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
    updateHash('grid');
  };

  const handleOpenSettings = () => {
    setView('settings');
    updateHash('settings');
  };

  const handleCloseSettings = () => {
    setView('grid');
    updateHash('grid');
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
          <button className="recordings-btn" onClick={() => { setView('dvr'); updateHash('dvr'); }}>
            DVR Playback
          </button>
          <button className="recordings-btn" onClick={() => { setView('recordings'); updateHash('recordings'); }}>
            Processed
          </button>
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

        {view === 'recordings' && <RecordingBrowser onBack={() => { setView('grid'); updateHash('grid'); }} />}

        {view === 'dvr' && (
          <DVRPlayback
            onBack={() => { setView('grid'); updateHash('grid'); }}
            initialChannel={dvrState?.channel}
            initialDate={dvrState?.date}
            initialTime={dvrState?.time}
            onStateChange={(channel, date, time) => {
              const newDvrState = { channel, date, time };
              setDvrState(newDvrState);
              updateHash('dvr', undefined, newDvrState);
            }}
          />
        )}
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
