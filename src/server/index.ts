import express from 'express';
import { createServer } from 'http';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AppConfig } from '../shared/types.js';
import { StreamManager } from './StreamManager.js';
import { RecordingManager } from './RecordingManager.js';

const execAsync = promisify(exec);

// VPS processor URL
const VPS_URL = 'http://77.42.73.208:3003';

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

// Serve static files from the client build
const clientPath = path.resolve(__dirname, '../client');
app.use(express.static(clientPath));

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

// ============ DVR Direct Playback Endpoints ============

const GO2RTC_API = 'http://localhost:1984';
const DVR_HOST = config.xvr.host;
const DVR_USER = config.xvr.username;
const DVR_PASS = config.xvr.password;

// Helper to make digest-authenticated requests to DVR
async function dvrRequest(urlPath: string): Promise<string> {
  const url = `https://${DVR_HOST}${urlPath}`;
  // Use single quotes around URL to prevent shell interpretation of special chars
  const { stdout } = await execAsync(
    `curl -s -k --digest -u '${DVR_USER}:${DVR_PASS}' '${url}'`,
    { timeout: 15000 }
  );
  return stdout;
}

// Helper to query DVR recordings via Dahua CGI API
async function queryDVRRecordings(channel: number, date: string): Promise<any[]> {
  const year = date.slice(0, 4);
  const month = date.slice(4, 6);
  const day = date.slice(6, 8);
  // URL-encode the spaces as %20
  const startTime = `${year}-${month}-${day}%2000:00:00`;
  const endTime = `${year}-${month}-${day}%2023:59:59`;

  // Step 1: Create a file finder object
  const createText = await dvrRequest('/cgi-bin/mediaFileFind.cgi?action=factory.create');
  const objectMatch = createText.match(/result=(\d+)/);
  if (!objectMatch) {
    console.error('Failed to create file finder:', createText);
    return [];
  }
  const objectId = objectMatch[1];

  try {
    // Step 2: Find files (no Types filter needed - get all)
    const findPath = `/cgi-bin/mediaFileFind.cgi?action=findFile&object=${objectId}&condition.Channel=${channel}&condition.StartTime=${startTime}&condition.EndTime=${endTime}`;
    await dvrRequest(findPath);

    // Step 3: Get found files
    const listPath = `/cgi-bin/mediaFileFind.cgi?action=findNextFile&object=${objectId}&count=1000`;
    const listText = await dvrRequest(listPath);

    // Parse the response
    const recordings: any[] = [];
    const lines = listText.split('\n');

    for (const line of lines) {
      const match = line.match(/items\[(\d+)\]\.(\w+)=(.+)/);
      if (match) {
        const [, index, key, value] = match;
        if (!recordings[parseInt(index)]) {
          recordings[parseInt(index)] = {};
        }
        recordings[parseInt(index)][key] = value.trim();
      }
    }

    return recordings.filter((r) => r && r.StartTime);
  } finally {
    // Step 4: Cleanup - close and destroy the finder object
    try {
      await dvrRequest(`/cgi-bin/mediaFileFind.cgi?action=close&object=${objectId}`);
      await dvrRequest(`/cgi-bin/mediaFileFind.cgi?action=destroy&object=${objectId}`);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// API: Query DVR recordings for a channel and date
app.get('/api/dvr/recordings/:channel/:date', async (req, res) => {
  try {
    const channel = parseInt(req.params.channel, 10);
    const date = req.params.date;
    const recordings = await queryDVRRecordings(channel, date);

    // Transform to simpler format
    const result = recordings.map((r) => ({
      startTime: r.StartTime,
      endTime: r.EndTime,
      type: r.Type || 'dav',
      filePath: r.FilePath,
      duration: r.Duration ? parseInt(r.Duration) : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('DVR recordings query error:', err);
    res.status(500).json({ error: 'Failed to query DVR recordings' });
  }
});

// API: Create playback stream in go2rtc and return WebRTC info
app.post('/api/dvr/playback', async (req, res) => {
  try {
    const { channel, startTime, endTime } = req.body;

    // Format times for Dahua RTSP playback URL
    // Input: "2025-12-29 10:30:00" -> "2025_12_29_10_30_00"
    const formatTime = (t: string) => t.replace(/[-: ]/g, '_').replace(/_/g, '_');
    const start = formatTime(startTime);
    const end = formatTime(endTime);

    // Create unique stream name for this playback session
    const streamName = `playback_ch${channel}_${Date.now()}`;

    // RTSP playback URL for Dahua DVR with FFmpeg transcoding to H.264 for browser compatibility
    const rtspUrl = `rtsp://${DVR_USER}:${DVR_PASS}@${DVR_HOST}:554/cam/playback?channel=${channel}&starttime=${start}&endtime=${end}`;

    // Use FFmpeg to transcode H.265 to H.264 for browser compatibility
    const ffmpegSource = `ffmpeg:${rtspUrl}#video=h264`;

    // Add stream to go2rtc dynamically with transcoding
    const addStreamRes = await fetch(`${GO2RTC_API}/api/streams?name=${streamName}&src=${encodeURIComponent(ffmpegSource)}`, {
      method: 'PUT',
    });

    if (!addStreamRes.ok) {
      throw new Error('Failed to add stream to go2rtc');
    }

    res.json({
      streamName,
      webrtcUrl: `${GO2RTC_API}/api/webrtc?src=${streamName}`,
      wsUrl: `ws://localhost:1984/api/ws?src=${streamName}`,
    });
  } catch (err) {
    console.error('DVR playback error:', err);
    res.status(500).json({ error: 'Failed to create playback stream' });
  }
});

// API: Stop a playback stream
app.delete('/api/dvr/playback/:streamName', async (req, res) => {
  try {
    const { streamName } = req.params;
    await fetch(`${GO2RTC_API}/api/streams?name=${streamName}`, {
      method: 'DELETE',
    });
    res.json({ success: true });
  } catch (err) {
    console.error('DVR playback stop error:', err);
    res.status(500).json({ error: 'Failed to stop playback stream' });
  }
});

// Proxy go2rtc WebRTC API
app.all('/api/go2rtc/*', async (req, res) => {
  const go2rtcPath = req.url.replace('/api/go2rtc', '');
  const url = `${GO2RTC_API}${go2rtcPath}`;

  try {
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const contentType = fetchRes.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await fetchRes.json();
      res.json(data);
    } else {
      const text = await fetchRes.text();
      res.send(text);
    }
  } catch (err) {
    console.error('go2rtc proxy error:', err);
    res.status(502).json({ error: 'go2rtc unavailable' });
  }
});

// ============ VPS Proxy Endpoints ============

// Proxy to VPS for processed recordings list
app.get('/api/processed/:channel/:date', (req, res) => {
  const { channel, date } = req.params;
  const vpsPath = `/api/processed/${channel}/${date}`;

  const proxyReq = http.request(`${VPS_URL}${vpsPath}`, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('VPS proxy error:', err);
    res.status(502).json({ error: 'VPS unavailable' });
  });

  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'VPS timeout' });
  });

  proxyReq.end();
});

// Proxy to VPS for processed files (HLS, MP4, thumbnails)
app.get('/processed/*', (req, res) => {
  const vpsPath = req.url;

  const options: http.RequestOptions = {
    hostname: '77.42.73.208',
    port: 3003,
    path: vpsPath,
    method: 'GET',
    headers: req.headers.range ? { Range: req.headers.range } : {},
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('VPS proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'VPS unavailable' });
    }
  });

  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'VPS timeout' });
    }
  });

  proxyReq.end();
});

// Proxy all go2rtc requests (HLS playlists, MP4 streams, segments)
app.get('/go2rtc/*', (req, res) => {
  // Extract the path after /go2rtc/
  const go2rtcPath = req.path.replace('/go2rtc/', '');
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const fullPath = queryString ? `${go2rtcPath}?${queryString}` : go2rtcPath;
  const proxyUrl = `${GO2RTC_API}/api/${fullPath}`;

  console.log('Proxying go2rtc request:', proxyUrl);

  // For MP4 streaming, use Node's http module for proper streaming
  if (go2rtcPath.startsWith('stream.mp4')) {
    const proxyReq = http.request(proxyUrl, (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        console.error('go2rtc MP4 proxy error:', proxyRes.statusCode);
        res.status(proxyRes.statusCode || 502).send('Stream failed');
        return;
      }

      // Set proper headers for MP4 streaming
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Connection', 'keep-alive');

      // Stream the response
      proxyRes.pipe(res);

      // Handle client disconnect
      req.on('close', () => {
        proxyRes.destroy();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('go2rtc MP4 proxy error:', err);
      if (!res.headersSent) {
        res.status(502).send('Proxy failed');
      }
    });

    proxyReq.end();
    return;
  }

  // For non-streaming content (playlists, segments), use fetch
  (async () => {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        console.error('go2rtc proxy error:', response.status, response.statusText);
        res.status(response.status).send('Request failed');
        return;
      }

      // Copy content-type from response
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader('Cache-Control', 'no-cache');

      // For m3u8 playlists, rewrite URLs to go through our proxy
      if (go2rtcPath.endsWith('.m3u8') || contentType?.includes('mpegurl')) {
        let body = await response.text();
        // Rewrite relative URLs like "hls/playlist.m3u8?id=xxx" to "/go2rtc/hls/playlist.m3u8?id=xxx"
        body = body.replace(/(hls\/[^\s]+)/g, '/go2rtc/$1');
        // Rewrite segment URLs
        body = body.replace(/segment\.(ts|m4s)\?/g, '/go2rtc/segment.$1?');
        res.send(body);
      } else {
        // For binary content (segments), stream directly
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (err) {
      console.error('go2rtc proxy error:', err);
      res.status(502).send('Proxy failed');
    }
  })();
});

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  // Check if this is a go2rtc proxy request
  if (url.pathname === '/go2rtc/ws') {
    const src = url.searchParams.get('src');
    console.log(`Proxying WebSocket to go2rtc for stream: ${src}`);

    // Connect to go2rtc WebSocket
    const go2rtcWs = new WebSocket(`ws://localhost:1984/api/ws?src=${src}`);

    go2rtcWs.binaryType = 'arraybuffer';

    // Queue messages until go2rtc is connected
    const messageQueue: (Buffer | string)[] = [];
    let go2rtcConnected = false;

    go2rtcWs.on('open', () => {
      console.log(`Connected to go2rtc for stream: ${src}`);
      go2rtcConnected = true;
      // Send any queued messages
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (msg) go2rtcWs.send(msg);
      }
    });

    go2rtcWs.on('message', (data: Buffer | string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    go2rtcWs.on('close', () => {
      console.log(`go2rtc WebSocket closed for stream: ${src}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    go2rtcWs.on('error', (err) => {
      console.error(`go2rtc WebSocket error for stream ${src}:`, err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on('message', (data: Buffer | string) => {
      if (go2rtcConnected && go2rtcWs.readyState === WebSocket.OPEN) {
        go2rtcWs.send(data);
      } else {
        // Queue message until go2rtc is connected
        messageQueue.push(data);
      }
    });

    ws.on('close', () => {
      console.log(`Client WebSocket closed for stream: ${src}`);
      if (go2rtcWs.readyState === WebSocket.OPEN || go2rtcWs.readyState === WebSocket.CONNECTING) {
        go2rtcWs.close();
      }
    });

    ws.on('error', (err) => {
      console.error(`Client WebSocket error for stream ${src}:`, err);
    });

    return;
  }

  // Regular camera stream handling
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
