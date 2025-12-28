import React, { useRef, useEffect } from 'react';
import type { JSMpegPlayer } from '../jsmpeg';

interface Props {
  channelId: number;
}

export default function CameraView({ channelId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const wsUrl = `ws://${window.location.hostname}:3002?channel=${channelId}`;

    // Small delay to avoid React StrictMode double-invoke issues
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

  return <canvas ref={canvasRef} className="camera-canvas" />;
}
