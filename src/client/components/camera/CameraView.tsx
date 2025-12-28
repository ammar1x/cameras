import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { JSMpegPlayer } from '../../jsmpeg';
import Skeleton from '../common/Skeleton';
import StatusIndicator, { ConnectionStatus } from '../common/StatusIndicator';

interface Props {
  channelId: number;
  quality?: 'low' | 'high';
  showStatus?: boolean;
  onDoubleClick?: () => void;
}

export default function CameraView({
  channelId,
  quality = 'low',
  showStatus = true,
  onDoubleClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  const connect = useCallback(() => {
    if (!canvasRef.current) return;

    setStatus('connecting');
    const wsUrl = `ws://${window.location.hostname}:3002?channel=${channelId}&quality=${quality}`;

    try {
      playerRef.current = new window.JSMpeg.Player(wsUrl, {
        canvas: canvasRef.current,
        autoplay: true,
        audio: false,
        loop: true,
        onSourceEstablished: () => {
          setStatus('online');
          setIsLoading(false);
          setReconnectAttempts(0);
        },
        onSourceCompleted: () => {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setStatus('reconnecting');
            setReconnectAttempts((prev) => prev + 1);
            reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
          } else {
            setStatus('offline');
          }
        },
      });
    } catch (e) {
      setStatus('offline');
      setIsLoading(false);
    }
  }, [channelId, quality, reconnectAttempts]);

  useEffect(() => {
    const timer = setTimeout(connect, 100);

    return () => {
      clearTimeout(timer);
      clearTimeout(reconnectTimeoutRef.current);
      try {
        playerRef.current?.destroy();
      } catch (e) {
        // Ignore
      }
      playerRef.current = null;
    };
  }, [connect]);

  const handleRetry = useCallback(() => {
    setReconnectAttempts(0);
    setIsLoading(true);
    connect();
  }, [connect]);

  return (
    <div className="camera-view" onDoubleClick={onDoubleClick}>
      {isLoading && (
        <div className="camera-skeleton">
          <Skeleton height="100%" />
          <div className="camera-skeleton__text">Connecting...</div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`camera-canvas ${isLoading ? 'camera-canvas--hidden' : ''}`}
      />

      {showStatus && (
        <div className="camera-status-overlay">
          <StatusIndicator status={status} />
        </div>
      )}

      {status === 'offline' && (
        <div className="camera-error-overlay">
          <span>Connection Lost</span>
          <button onClick={handleRetry} className="retry-btn">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
