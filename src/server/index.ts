import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { readFileSync, writeFileSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../shared/types.js';

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

// Store active FFmpeg processes
const streams = new Map<number, ChildProcess>();

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

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channelId = parseInt(url.searchParams.get('channel') || '1', 10);

  console.log(`Client connected for channel ${channelId}`);

  const config = loadConfig();
  const { host, port, username, password } = config.xvr;

  // Build RTSP URL - subtype=0 is main stream (high quality), subtype=1 is sub stream
  const quality = url.searchParams.get('quality') || 'high';
  const subtype = quality === 'low' ? 1 : 0;
  const rtspUrl = `rtsp://${username}:${password}@${host}:${port}/cam/realmonitor?channel=${channelId}&subtype=${subtype}`;

  // Quality settings
  const resolution = quality === 'low' ? '640x480' : '1280x960';
  const bitrate = quality === 'low' ? '800k' : '3000k';

  // Spawn FFmpeg to transcode RTSP to MPEG1 for JSMpeg
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-f', 'mpegts',
    '-codec:v', 'mpeg1video',
    '-b:v', bitrate,
    '-r', '24',
    '-s', resolution,
    '-bf', '0',
    '-q:v', '4', // Quality scale (1-31, lower is better)
    '-an', // No audio
    '-',
  ]);

  streams.set(channelId, ffmpeg);

  ffmpeg.stdout.on('data', (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ffmpeg.stderr.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes('error') || msg.includes('Error')) {
      console.error(`FFmpeg channel ${channelId}:`, msg);
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg channel ${channelId} exited with code ${code}`);
    streams.delete(channelId);
  });

  ws.on('close', () => {
    console.log(`Client disconnected from channel ${channelId}`);
    ffmpeg.kill('SIGTERM');
    streams.delete(channelId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for channel ${channelId}:`, err);
    ffmpeg.kill('SIGTERM');
    streams.delete(channelId);
  });
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('Shutting down...');
  streams.forEach((ffmpeg) => ffmpeg.kill('SIGTERM'));
  process.exit(0);
});

const config = loadConfig();
const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
});
