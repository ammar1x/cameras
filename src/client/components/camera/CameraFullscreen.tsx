import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { JSMpegPlayer } from '../../jsmpeg';

interface Props {
  channelId: number;
  channelName: string;
  onBack: () => void;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export default function CameraFullscreen({ channelId, channelName, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current) return;

    const wsUrl = `ws://${window.location.hostname}:3002?channel=${channelId}&quality=high`;

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;

      playerRef.current = new window.JSMpeg.Player(wsUrl, {
        canvas: canvasRef.current,
        autoplay: true,
        audio: false,
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
  }, [channelId]);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, handleZoomIn, handleZoomOut, handleReset]);

  return (
    <div className="fullscreen-view">
      <div className="fullscreen-header">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <h2>{channelName}</h2>
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
        style={{ cursor: transform.scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      >
        <canvas
          ref={canvasRef}
          className="fullscreen-canvas"
          style={{
            transform: `scale(${transform.scale}) translate(${transform.x / transform.scale}px, ${transform.y / transform.scale}px)`,
          }}
        />
      </div>

      <div className="fullscreen-hints">
        <span>Scroll to zoom</span>
        <span>Drag to pan</span>
        <span>ESC to exit</span>
        <span>+/- to zoom</span>
      </div>
    </div>
  );
}
