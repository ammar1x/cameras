import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';

interface StreamConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface ActiveStream {
  ffmpeg: ChildProcess;
  clients: Set<WebSocket>;
  channelId: number;
  quality: 'low' | 'high';
  audio: boolean;
  cleanupTimer: NodeJS.Timeout | null;
  lastData: Buffer | null;
}

const CLEANUP_DELAY_MS = 30000; // Keep stream alive 30s after last client

export class StreamManager {
  private streams = new Map<string, ActiveStream>();
  private config: StreamConfig;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  private getStreamKey(channelId: number, quality: 'low' | 'high', audio: boolean): string {
    return `${channelId}-${quality}-${audio ? 'audio' : 'noaudio'}`;
  }

  private createStream(channelId: number, quality: 'low' | 'high', audio: boolean): ActiveStream {
    const { host, port, username, password } = this.config;

    // subtype=0 is main stream (high quality), subtype=1 is sub stream (low quality)
    const subtype = quality === 'low' ? 1 : 0;
    const rtspUrl = `rtsp://${username}:${password}@${host}:${port}/cam/realmonitor?channel=${channelId}&subtype=${subtype}`;

    // Quality settings
    const resolution = quality === 'low' ? '400x300' : '1280x960';
    const bitrate = quality === 'low' ? '400k' : '3000k';

    // Build FFmpeg args
    const ffmpegArgs = [
      // Low-latency input flags
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-probesize', '32',
      '-analyzeduration', '0',
      // RTSP input
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      // Output format
      '-f', 'mpegts',
      '-codec:v', 'mpeg1video',
      '-b:v', bitrate,
      '-r', '24',
      '-s', resolution,
      '-bf', '0',
      '-q:v', '4',
    ];

    // Add audio or disable it
    if (audio) {
      ffmpegArgs.push('-codec:a', 'mp2', '-b:a', '128k');
    } else {
      ffmpegArgs.push('-an');
    }

    ffmpegArgs.push('-');

    // Spawn FFmpeg with low-latency flags
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    const stream: ActiveStream = {
      ffmpeg,
      clients: new Set(),
      channelId,
      quality,
      audio,
      cleanupTimer: null,
      lastData: null,
    };

    const key = this.getStreamKey(channelId, quality, audio);

    ffmpeg.stdout.on('data', (data: Buffer) => {
      stream.lastData = data;
      stream.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    });

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('error') || msg.includes('Error')) {
        console.error(`FFmpeg channel ${channelId} (${quality}):`, msg);
      }
    });

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg channel ${channelId} (${quality}) exited with code ${code}`);
      this.streams.delete(key);
    });

    ffmpeg.on('error', (err) => {
      console.error(`FFmpeg process error for channel ${channelId}:`, err);
      this.streams.delete(key);
    });

    this.streams.set(key, stream);
    console.log(`Created new stream for channel ${channelId} (${quality}, audio: ${audio})`);

    return stream;
  }

  subscribe(ws: WebSocket, channelId: number, quality: 'low' | 'high' = 'low', audio: boolean = false): void {
    const key = this.getStreamKey(channelId, quality, audio);
    let stream = this.streams.get(key);

    if (!stream) {
      stream = this.createStream(channelId, quality, audio);
    } else {
      // Cancel cleanup timer if it was scheduled
      if (stream.cleanupTimer) {
        clearTimeout(stream.cleanupTimer);
        stream.cleanupTimer = null;
        console.log(`Cancelled cleanup for channel ${channelId} (${quality}), new client joined`);
      }
    }

    stream.clients.add(ws);
    console.log(`Client subscribed to channel ${channelId} (${quality}, audio: ${audio}), total clients: ${stream.clients.size}`);

    // Send last frame immediately for faster initial display
    if (stream.lastData && ws.readyState === WebSocket.OPEN) {
      ws.send(stream.lastData);
    }
  }

  unsubscribe(ws: WebSocket, channelId: number, quality: 'low' | 'high' = 'low', audio: boolean = false): void {
    const key = this.getStreamKey(channelId, quality, audio);
    const stream = this.streams.get(key);

    if (!stream) return;

    stream.clients.delete(ws);
    console.log(`Client unsubscribed from channel ${channelId} (${quality}), remaining: ${stream.clients.size}`);

    if (stream.clients.size === 0) {
      // Schedule cleanup after delay
      stream.cleanupTimer = setTimeout(() => {
        if (stream.clients.size === 0) {
          console.log(`Cleaning up idle stream for channel ${channelId} (${quality})`);
          stream.ffmpeg.kill('SIGTERM');
          this.streams.delete(key);
        }
      }, CLEANUP_DELAY_MS);
    }
  }

  shutdown(): void {
    console.log('Shutting down all streams...');
    this.streams.forEach((stream) => {
      if (stream.cleanupTimer) {
        clearTimeout(stream.cleanupTimer);
      }
      stream.ffmpeg.kill('SIGTERM');
    });
    this.streams.clear();
  }

  getActiveStreams(): { channelId: number; quality: string; clients: number }[] {
    return Array.from(this.streams.values()).map((s) => ({
      channelId: s.channelId,
      quality: s.quality,
      clients: s.clients.size,
    }));
  }
}
