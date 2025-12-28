import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { JSMpegPlayer } from '../../jsmpeg';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useSnapshot } from '../../hooks/useSnapshot';
import { useRecording } from '../../hooks/useRecording';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  channelId: number;
  channelName: string;
  onBack: () => void;
  onPrevCamera?: () => void;
  onNextCamera?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export default function CameraFullscreen({
  channelId,
  channelName,
  onBack,
  onPrevCamera,
  onNextCamera,
  hasPrev = false,
  hasNext = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [timestamp, setTimestamp] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Update timestamp every second
  useEffect(() => {
    if (!showTimestamp) return;
    const updateTime = () => {
      const now = new Date();
      setTimestamp(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [showTimestamp]);

  const { takeSnapshot } = useSnapshot();
  const { isRecording, toggleRecording } = useRecording();
  const { addToast } = useToast();

  const handleSnapshot = useCallback(() => {
    if (canvasRef.current) {
      takeSnapshot(canvasRef.current, { filename: `${channelName.replace(/\s+/g, '-')}-snapshot` });
      addToast('success', 'Snapshot saved');
    }
  }, [takeSnapshot, channelName, addToast]);

  const handleRecordingToggle = useCallback(async () => {
    const success = await toggleRecording(channelId, channelName);
    if (success) {
      addToast('success', isRecording ? 'Recording stopped' : 'Recording started');
    } else {
      addToast('error', 'Failed to toggle recording');
    }
  }, [toggleRecording, channelId, channelName, isRecording, addToast]);

  // Touch pinch-to-zoom
  const { handlers: pinchHandlers } = usePinchZoom<HTMLDivElement>({
    minScale: 1,
    maxScale: 4,
    onTransformChange: setTransform,
  });

  // Touch swipe navigation (only when not zoomed)
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: transform.scale <= 1 && hasNext ? onNextCamera : undefined,
    onSwipeRight: transform.scale <= 1 && hasPrev ? onPrevCamera : undefined,
    threshold: 80,
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    const wsUrl = `ws://${window.location.hostname}:3002?channel=${channelId}&quality=high&audio=${audioEnabled}`;

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;

      playerRef.current = new window.JSMpeg.Player(wsUrl, {
        canvas: canvasRef.current,
        autoplay: true,
        audio: audioEnabled,
        loop: true,
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      try {
        playerRef.current?.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
      playerRef.current = null;
    };
  }, [channelId, audioEnabled]);

  const handleZoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale + 0.25, 4),
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale - 0.25, 1),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(1, Math.min(4, prev.scale + delta)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (transform.scale > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;

      const newX = e.clientX - panStart.x;
      const newY = e.clientY - panStart.y;

      // Limit panning based on zoom level
      const maxPan = (transform.scale - 1) * 200;
      setTransform((prev) => ({
        ...prev,
        x: Math.max(-maxPan, Math.min(maxPan, newX)),
        y: Math.max(-maxPan, Math.min(maxPan, newY)),
      }));
    },
    [isPanning, panStart, transform.scale]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onBack();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleReset();
          break;
        case 'ArrowLeft':
          if (transform.scale <= 1 && hasPrev) onPrevCamera?.();
          break;
        case 'ArrowRight':
          if (transform.scale <= 1 && hasNext) onNextCamera?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, handleZoomIn, handleZoomOut, handleReset, transform.scale, hasPrev, hasNext, onPrevCamera, onNextCamera]);

  return (
    <div className="fullscreen-view">
      <div className="fullscreen-header">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <h2>{channelName}</h2>
        <div className="fullscreen-actions">
          <button
            className="action-btn"
            onClick={handleSnapshot}
            title="Take snapshot"
            aria-label="Take snapshot"
          >
            📷
          </button>
          <button
            className={`action-btn ${isRecording ? 'action-btn--recording' : ''}`}
            onClick={handleRecordingToggle}
            title={isRecording ? 'Stop recording' : 'Start recording'}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording ? '⏹' : '⏺'}
          </button>
          <button
            className={`action-btn ${showTimestamp ? 'action-btn--active' : ''}`}
            onClick={() => setShowTimestamp(!showTimestamp)}
            title="Toggle timestamp"
            aria-label="Toggle timestamp"
          >
            🕐
          </button>
          <button
            className={`action-btn ${audioEnabled ? 'action-btn--active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute audio' : 'Enable audio'}
            aria-label={audioEnabled ? 'Mute audio' : 'Enable audio'}
          >
            {audioEnabled ? '🔊' : '🔇'}
          </button>
        </div>
        <div className="zoom-controls">
          <button onClick={handleZoomOut} disabled={transform.scale <= 1}>
            -
          </button>
          <span>{Math.round(transform.scale * 100)}%</span>
          <button onClick={handleZoomIn} disabled={transform.scale >= 4}>
            +
          </button>
          <button onClick={handleReset} className="reset-btn">
            Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="fullscreen-canvas-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={(e) => {
          pinchHandlers.onTouchStart(e);
          swipeHandlers.onTouchStart(e);
        }}
        onTouchMove={pinchHandlers.onTouchMove}
        onTouchEnd={(e) => {
          pinchHandlers.onTouchEnd(e);
          swipeHandlers.onTouchEnd(e);
        }}
        style={{
          cursor: transform.scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
        }}
      >
        {hasPrev && transform.scale <= 1 && (
          <button
            className="fullscreen-nav fullscreen-nav--prev"
            onClick={onPrevCamera}
            aria-label="Previous camera"
          >
            ‹
          </button>
        )}

        <canvas
          ref={canvasRef}
          className="fullscreen-canvas"
          style={{
            transform: `scale(${transform.scale}) translate(${transform.x / transform.scale}px, ${transform.y / transform.scale}px)`,
          }}
        />

        {showTimestamp && (
          <div className="fullscreen-timestamp">
            {timestamp}
          </div>
        )}

        {hasNext && transform.scale <= 1 && (
          <button
            className="fullscreen-nav fullscreen-nav--next"
            onClick={onNextCamera}
            aria-label="Next camera"
          >
            ›
          </button>
        )}
      </div>

      <div className="fullscreen-hints">
        <span>Scroll to zoom</span>
        <span>Drag to pan</span>
        <span>ESC to exit</span>
        <span>+/- to zoom</span>
        {(hasPrev || hasNext) && <span>←/→ prev/next</span>}
      </div>
    </div>
  );
}
