import React from 'react';
import CameraView from './CameraView';
import type { CameraConfig } from '@shared/types';

interface Props {
  channels: CameraConfig[];
  onCameraClick: (channelId: number) => void;
}

export default function CameraGrid({ channels, onCameraClick }: Props) {
  if (channels.length === 0) {
    return (
      <div className="no-cameras">
        <p>No cameras enabled. Go to Settings to enable cameras.</p>
      </div>
    );
  }

  // Calculate grid columns based on camera count
  const cols = channels.length <= 1 ? 1 : channels.length <= 4 ? 2 : channels.length <= 9 ? 3 : 4;

  return (
    <div
      className="camera-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {channels.map((channel) => (
        <div
          key={channel.id}
          className="camera-tile"
          onClick={() => onCameraClick(channel.id)}
        >
          <CameraView channelId={channel.id} />
          <div className="camera-label">{channel.name}</div>
        </div>
      ))}
    </div>
  );
}
