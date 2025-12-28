import React, { useState, useRef, useCallback, useEffect } from 'react';
import CameraView from './CameraView';

interface PiPProps {
  channelId: number;
  channelName: string;
  onClose: () => void;
  onExpand: () => void;
}

export default function PictureInPicture({ channelId, channelName, onClose, onExpand }: PiPProps) {
  const [position, setPosition] = useState({ x: window.innerWidth - 360, y: window.innerHeight - 260 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pip-controls')) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={containerRef}
      className={`pip-container animate-scale-in ${isDragging ? 'pip-container--dragging' : ''}`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="pip-header">
        <span className="pip-title">{channelName}</span>
        <div className="pip-controls">
          <button className="pip-expand" onClick={onExpand} aria-label="Expand" title="Expand">
            ⛶
          </button>
          <button className="pip-close" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
      </div>
      <div className="pip-video">
        <CameraView channelId={channelId} quality="low" showStatus={false} />
      </div>
    </div>
  );
}
