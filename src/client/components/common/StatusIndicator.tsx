import React from 'react';

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  online: { label: 'Online', className: 'status--online' },
  offline: { label: 'Offline', className: 'status--offline' },
  connecting: { label: 'Connecting...', className: 'status--connecting' },
  reconnecting: { label: 'Reconnecting...', className: 'status--reconnecting' },
};

export default function StatusIndicator({
  status,
  showLabel = false,
  size = 'sm',
}: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className={`status-indicator status-indicator--${size}`}>
      <span className={`status-dot ${config.className}`} />
      {showLabel && <span className="status-label">{config.label}</span>}
    </div>
  );
}
