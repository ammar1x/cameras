import React, { useState, useEffect } from 'react';
import type { AppConfig, CameraConfig } from '@shared/types';

interface Props {
  onClose: () => void;
}

export default function Settings({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then(setConfig)
      .catch((err) => console.error('Failed to load config:', err));
  }, []);

  const handleXvrChange = (field: string, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      xvr: {
        ...config.xvr,
        [field]: field === 'port' ? parseInt(value, 10) : value,
      },
    });
  };

  const handleChannelToggle = (channelId: number) => {
    if (!config) return;
    setConfig({
      ...config,
      xvr: {
        ...config.xvr,
        channels: config.xvr.channels.map((ch) =>
          ch.id === channelId ? { ...ch, enabled: !ch.enabled } : ch
        ),
      },
    });
  };

  const handleChannelNameChange = (channelId: number, name: string) => {
    if (!config) return;
    setConfig({
      ...config,
      xvr: {
        ...config.xvr,
        channels: config.xvr.channels.map((ch) =>
          ch.id === channelId ? { ...ch, name } : ch
        ),
      },
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => onClose(), 1000);
      } else {
        setMessage('Failed to save settings');
      }
    } catch (err) {
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="settings">
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>XVR Connection</h3>
          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              value={config.xvr.host}
              onChange={(e) => handleXvrChange('host', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>RTSP Port</label>
            <input
              type="number"
              value={config.xvr.port}
              onChange={(e) => handleXvrChange('port', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={config.xvr.username}
              onChange={(e) => handleXvrChange('username', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={config.xvr.password}
              onChange={(e) => handleXvrChange('password', e.target.value)}
              placeholder="Enter new password to change"
            />
          </div>
        </section>

        <section className="settings-section">
          <h3>Cameras</h3>
          <div className="channels-grid">
            {config.xvr.channels.map((channel) => (
              <div key={channel.id} className="channel-item">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={() => handleChannelToggle(channel.id)}
                  id={`channel-${channel.id}`}
                />
                <input
                  type="text"
                  value={channel.name}
                  onChange={(e) => handleChannelNameChange(channel.id, e.target.value)}
                  className="channel-name"
                />
              </div>
            ))}
          </div>
        </section>

        {message && <div className="message">{message}</div>}

        <div className="settings-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
