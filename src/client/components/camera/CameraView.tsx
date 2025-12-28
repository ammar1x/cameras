import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { JSMpegPlayer } from '../../jsmpeg';
import Skeleton from '../common/Skeleton';
import StatusIndicator, { ConnectionStatus } from '../common/StatusIndicator';
import { useLazyLoad } from '../../hooks/useLazyLoad';

interface Props {
  channelId: number;
  quality?: 'low' | 'high';
  showStatus?: boolean;
  showTimestamp?: boolean;
  onDoubleClick?: () => void;
  lazyLoad?: boolean;
}

export default function CameraView({
  channelId,
  quality = 'low',
  showStatus = true,
  showTimestamp = false,
  onDoubleClick,
  lazyLoad = true,
}: Props) {
  const [containerRef, isVisible] = useLazyLoad<HTMLDivElement>({ unloadDelay: 2000 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [timestamp, setTimestamp] = useState('');

  // Update timestamp every second when showing
  useEffect(() => {
    if (!showTimestamp || status !== 'online') return;

    const updateTime = () => {
      const now = new Date();
      setTimestamp(now.toLocaleTimeString('en-US', { hour12: false }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [showTimestamp, status]);

  // Determine if we should be connected
  const shouldConnect = !lazyLoad || isVisible;

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
    if (!shouldConnect) {
      // Disconnect when not visible
      clearTimeout(reconnectTimeoutRef.current);
      try {
        playerRef.current?.destroy();
      } catch (e) {
        // Ignore
      }
      playerRef.current = null;
      setStatus('connecting');
      setIsLoading(true);
      return;
    }

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
  }, [connect, shouldConnect]);

  const handleRetry = useCallback(() => {
    setReconnectAttempts(0);
    setIsLoading(true);
    connect();
  }, [connect]);

  return (
    <div ref={containerRef} className="camera-view" onDoubleClick={onDoubleClick}>
      {isLoading && (
        <div className="camera-skeleton">
          <Skeleton height="100%" />
          <div className="camera-skeleton__text">
            {shouldConnect ? 'Connecting...' : 'Waiting...'}
          </div>
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

      {showTimestamp && status === 'online' && (
        <div className="camera-timestamp-overlay">
          {timestamp}
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
