import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../shared/types.js';
import { StreamManager } from './StreamManager.js';
import { RecordingManager } from './RecordingManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../../config.json');

function loadConfig(): AppConfig {
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function saveConfig(config: AppConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize StreamManager and RecordingManager with config
const config = loadConfig();
const streamManager = new StreamManager({
  host: config.xvr.host,
  port: config.xvr.port,
  username: config.xvr.username,
  password: config.xvr.password,
});

const recordingManager = new RecordingManager({
  host: config.xvr.host,
  port: config.xvr.port,
  username: config.xvr.username,
  password: config.xvr.password,
});

// API: Get config
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  // Don't expose password in API response
  const safeConfig = {
    ...config,
    xvr: {
      ...config.xvr,
      password: '********',
    },
  };
  res.json(safeConfig);
});

// API: Update config
app.put('/api/config', (req, res) => {
  const config = loadConfig();
  const updates = req.body;

  if (updates.xvr) {
    // If password is masked, keep the old one
    if (updates.xvr.password === '********') {
      updates.xvr.password = config.xvr.password;
    }
    config.xvr = { ...config.xvr, ...updates.xvr };
  }

  if (updates.xvr?.channels) {
    config.xvr.channels = updates.xvr.channels;
  }

  saveConfig(config);
  res.json({ success: true });
});

// API: Get enabled channels
app.get('/api/channels', (req, res) => {
  const config = loadConfig();
  const channels = config.xvr.channels.filter((c) => c.enabled);
  res.json(channels);
});

// API: Get active streams info
app.get('/api/streams', (req, res) => {
  res.json(streamManager.getActiveStreams());
});

// API: Get recording status
app.get('/api/recordings', (req, res) => {
  res.json(recordingManager.getActiveRecordings());
});

// API: Check if a specific channel is recording
app.get('/api/recordings/:channelId', (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  res.json({ recording: recordingManager.isRecording(channelId) });
});

// API: Start recording
app.post('/api/recordings/:channelId/start', (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const channelName = req.body.channelName || `Camera ${channelId}`;
  const result = recordingManager.startRecording(channelId, channelName);
  res.json(result);
});

// API: Stop recording
app.post('/api/recordings/:channelId/stop', (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const result = recordingManager.stopRecording(channelId);
  res.json(result);
});

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channelId = parseInt(url.searchParams.get('channel') || '1', 10);
  const quality = (url.searchParams.get('quality') || 'low') as 'low' | 'high';
  const audio = url.searchParams.get('audio') === 'true';

  console.log(`Client connected for channel ${channelId} (${quality}, audio: ${audio})`);

  // Subscribe to stream via StreamManager
  streamManager.subscribe(ws, channelId, quality, audio);

  ws.on('close', () => {
    console.log(`Client disconnected from channel ${channelId}`);
    streamManager.unsubscribe(ws, channelId, quality, audio);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for channel ${channelId}:`, err);
    streamManager.unsubscribe(ws, channelId, quality, audio);
  });
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('Shutting down...');
  streamManager.shutdown();
  recordingManager.stopAll();
  process.exit(0);
});

const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
});
