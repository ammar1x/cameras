import React, { useState, useCallback } from 'react';
import CameraView from './CameraView';
import ContextMenu, { ContextMenuItem } from '../common/ContextMenu';
import { useLayout } from '../../contexts/LayoutContext';
import type { CameraConfig } from '@shared/types';

interface Props {
  channels: CameraConfig[];
  onCameraClick: (channelId: number) => void;
  onOpenPiP?: (channelId: number) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  channelId: number;
  channelName: string;
}

const LAYOUT_COLS: Record<string, number> = {
  '1x1': 1,
  '2x2': 2,
  '3x3': 3,
  '4x4': 4,
};

export default function CameraGrid({ channels, onCameraClick, onOpenPiP }: Props) {
  const { currentLayout, cameraOrder, reorderCameras } = useLayout();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Sort channels by user-defined order
  const sortedChannels = [...channels].sort((a, b) => {
    const aIndex = cameraOrder.indexOf(a.id);
    const bIndex = cameraOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const handleContextMenu = useCallback((e: React.MouseEvent, channel: CameraConfig) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      channelId: channel.id,
      channelName: channel.name,
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, channelId: number) => {
    setDraggedId(channelId);
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).classList.add('dragging');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, channelId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId !== channelId) {
      setDragOverId(channelId);
    }
  }, [draggedId]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('dragging');

    if (draggedId && dragOverId && draggedId !== dragOverId) {
      const currentOrder = cameraOrder.length > 0 ? cameraOrder : channels.map(c => c.id);
      const newOrder = [...currentOrder];
      const draggedIndex = newOrder.indexOf(draggedId);
      const targetIndex = newOrder.indexOf(dragOverId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedId);
        reorderCameras(newOrder);
      }
    }

    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId, dragOverId, cameraOrder, channels, reorderCameras]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    return [
      {
        id: 'fullscreen',
        label: 'Open Fullscreen',
        icon: '⛶',
        shortcut: 'Enter',
        onClick: () => onCameraClick(contextMenu.channelId),
      },
      {
        id: 'pip',
        label: 'Picture in Picture',
        icon: '⧉',
        onClick: () => onOpenPiP?.(contextMenu.channelId),
        disabled: !onOpenPiP,
      },
      { id: 'divider1', label: '', divider: true, onClick: () => {} },
      {
        id: 'rename',
        label: 'Rename Camera',
        icon: '✎',
        onClick: () => {
          // TODO: Implement rename modal
        },
        disabled: true,
      },
    ];
  }, [contextMenu, onCameraClick, onOpenPiP]);

  if (channels.length === 0) {
    return (
      <div className="no-cameras animate-fade-in">
        <p>No cameras enabled. Go to Settings to enable cameras.</p>
      </div>
    );
  }

  const cols = LAYOUT_COLS[currentLayout] || 2;

  return (
    <>
      <div
        className="camera-grid animate-fade-in"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      >
        {sortedChannels.map((channel) => (
          <div
            key={channel.id}
            className={`camera-tile ${dragOverId === channel.id ? 'camera-tile--drag-over' : ''}`}
            onClick={() => onCameraClick(channel.id)}
            onContextMenu={(e) => handleContextMenu(e, channel)}
            draggable
            onDragStart={(e) => handleDragStart(e, channel.id)}
            onDragOver={(e) => handleDragOver(e, channel.id)}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
          >
            <CameraView
              channelId={channel.id}
              onDoubleClick={() => onCameraClick(channel.id)}
            />
            <div className="camera-label">{channel.name}</div>
          </div>
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems()}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
