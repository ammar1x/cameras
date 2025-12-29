import React, { RefObject, useEffect, useCallback, useState } from 'react';
import SkipDropdown from './SkipDropdown';

interface VideoPlayerOverlayProps {
  videoRef: RefObject<HTMLVideoElement>;
  visible: boolean;
  onMouseMove: () => void;
  onMouseLeave: () => void;
  onControlsHover: () => void;
  onControlsLeave: () => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkip: (seconds: number) => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  channelName: string;
  playbackTime: string | null;
  playbackStatus: string;
  onBack: () => void;
  onTimeJump?: (time: string) => void;
  disabled?: boolean;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 4];

export default function VideoPlayerOverlay({
  videoRef,
  visible,
  onMouseMove,
  onMouseLeave,
  onControlsHover,
  onControlsLeave,
  isPlaying,
  onPlayPause,
  onSkip,
  playbackSpeed,
  onSpeedChange,
  onToggleFullscreen,
  isFullscreen,
  onToggleSidebar,
  sidebarOpen,
  channelName,
  playbackTime,
  playbackStatus,
  onBack,
  onTimeJump,
  disabled,
}: VideoPlayerOverlayProps) {
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editTime, setEditTime] = useState('');

  // Extract just the time portion (HH:MM:SS) from playbackTime
  const timeOnly = playbackTime ? playbackTime.split(' ')[1] || '' : '';

  const handleTimeClick = () => {
    if (onTimeJump && playbackTime) {
      setEditTime(timeOnly);
      setIsEditingTime(true);
    }
  };

  const handleTimeSubmit = () => {
    if (onTimeJump && editTime && playbackTime) {
      const datePart = playbackTime.split(' ')[0];
      onTimeJump(`${datePart} ${editTime}`);
    }
    setIsEditingTime(false);
  };

  const handleTimeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTimeSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingTime(false);
    }
  };
  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        onPlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onSkip(-60);
        break;
      case 'ArrowRight':
        e.preventDefault();
        onSkip(60);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        onToggleFullscreen();
        break;
      case 't':
      case 'T':
        e.preventDefault();
        onToggleSidebar();
        break;
      case 'Escape':
        if (isFullscreen) {
          // Fullscreen exit is handled by browser
        }
        break;
    }
  }, [onPlayPause, onSkip, onToggleFullscreen, onToggleSidebar, isFullscreen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleVideoClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on controls
    if ((e.target as HTMLElement).closest('.overlay-bottom') ||
        (e.target as HTMLElement).closest('.overlay-top')) {
      return;
    }
    onPlayPause();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Don't toggle fullscreen if clicking on controls
    if ((e.target as HTMLElement).closest('.overlay-bottom') ||
        (e.target as HTMLElement).closest('.overlay-top')) {
      return;
    }
    onToggleFullscreen();
  };

  return (
    <div
      className={`video-overlay ${visible ? 'visible' : ''}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={handleVideoClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Top bar with back button and info */}
      <div className="overlay-top" onMouseEnter={onControlsHover} onMouseLeave={onControlsLeave}>
        <button className="overlay-back-btn" onClick={onBack}>
          <span className="back-icon">←</span>
          <span>Back</span>
        </button>
        <div className="overlay-info">
          <span className="overlay-channel">{channelName}</span>
          {playbackTime && (
            isEditingTime ? (
              <input
                type="time"
                step="1"
                className="overlay-time-input"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                onBlur={handleTimeSubmit}
                onKeyDown={handleTimeKeyDown}
                autoFocus
              />
            ) : (
              <span
                className={`overlay-time ${onTimeJump ? 'clickable' : ''}`}
                onClick={handleTimeClick}
                title={onTimeJump ? 'Click to jump to a specific time' : undefined}
              >
                {playbackTime}
              </span>
            )
          )}
          {playbackStatus && playbackStatus !== 'Playing' && (
            <span className={`overlay-status ${playbackStatus.includes('error') || playbackStatus.includes('Error') ? 'error' : ''}`}>
              {playbackStatus}
            </span>
          )}
        </div>
      </div>

      {/* Center play button */}
      <div className="overlay-center">
        {!isPlaying && (
          <button className="play-button-large" onClick={onPlayPause} disabled={disabled}>
            <span className="play-icon">▶</span>
          </button>
        )}
      </div>

      {/* Bottom controls bar */}
      <div
        className="overlay-bottom"
        onMouseEnter={onControlsHover}
        onMouseLeave={onControlsLeave}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mini timeline for quick navigation */}
        {playbackTime && onTimeJump && (
          <div className="mini-timeline" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const hour = Math.floor(percent * 24);
            const minute = Math.floor((percent * 24 - hour) * 60);
            const datePart = playbackTime.split(' ')[0];
            onTimeJump(`${datePart} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
          }}>
            <div className="mini-timeline-track">
              {/* Current position indicator */}
              <div
                className="mini-timeline-position"
                style={{
                  left: `${(() => {
                    const timePart = playbackTime.split(' ')[1] || '00:00:00';
                    const [h, m] = timePart.split(':').map(Number);
                    return ((h + m / 60) / 24) * 100;
                  })()}%`
                }}
              />
            </div>
            <div className="mini-timeline-labels">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>
        )}

        <div className="controls-row">
          {/* Play/Pause */}
          <button
            className="control-btn play-pause-btn"
            onClick={onPlayPause}
            disabled={disabled}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Skip controls */}
          <SkipDropdown direction="backward" onSkip={onSkip} disabled={disabled} />
          <SkipDropdown direction="forward" onSkip={onSkip} disabled={disabled} />

          {/* Spacer */}
          <div className="controls-spacer" />

          {/* Speed control */}
          <div className="speed-selector">
            <span className="speed-label">Speed:</span>
            <select
              value={playbackSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="speed-select"
              disabled={disabled}
            >
              {SPEED_OPTIONS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </div>

          {/* Sidebar toggle */}
          <button
            className="control-btn sidebar-btn"
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Hide timeline' : 'Show timeline'}
          >
            {sidebarOpen ? '▤' : '▥'}
          </button>

          {/* Fullscreen toggle */}
          <button
            className="control-btn fullscreen-btn"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      </div>
    </div>
  );
}
