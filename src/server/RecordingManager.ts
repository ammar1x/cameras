import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.resolve(__dirname, '../../recordings');

interface RecordingConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface ActiveRecording {
  ffmpeg: ChildProcess;
  channelId: number;
  channelName: string;
  filepath: string;
  startTime: Date;
}

export class RecordingManager {
  private recordings = new Map<number, ActiveRecording>();
  private config: RecordingConfig;

  constructor(config: RecordingConfig) {
    this.config = config;
    // Ensure recordings directory exists
    if (!existsSync(RECORDINGS_DIR)) {
      mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
  }

  isRecording(channelId: number): boolean {
    return this.recordings.has(channelId);
  }

  getActiveRecordings(): { channelId: number; channelName: string; startTime: string; filepath: string }[] {
    return Array.from(this.recordings.values()).map((r) => ({
      channelId: r.channelId,
      channelName: r.channelName,
      startTime: r.startTime.toISOString(),
      filepath: r.filepath,
    }));
  }

  startRecording(channelId: number, channelName: string): { success: boolean; message: string; filepath?: string } {
    if (this.recordings.has(channelId)) {
      return { success: false, message: 'Already recording this channel' };
    }

    const { host, port, username, password } = this.config;
    const rtspUrl = `rtsp://${username}:${password}@${host}:${port}/cam/realmonitor?channel=${channelId}&subtype=0`;

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = channelName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `${safeName}-${timestamp}.mp4`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    // Spawn FFmpeg to record
    const ffmpeg = spawn('ffmpeg', [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c:v', 'copy', // Copy video codec (no re-encoding)
      '-c:a', 'aac',  // Convert audio to AAC if present
      '-movflags', '+faststart', // Enable fast start for streaming
      '-y', // Overwrite output file
      filepath,
    ]);

    const recording: ActiveRecording = {
      ffmpeg,
      channelId,
      channelName,
      filepath,
      startTime: new Date(),
    };

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('error') || msg.includes('Error')) {
        console.error(`Recording ${channelId}:`, msg);
      }
    });

    ffmpeg.on('close', (code) => {
      console.log(`Recording for channel ${channelId} stopped with code ${code}`);
      this.recordings.delete(channelId);
    });

    ffmpeg.on('error', (err) => {
      console.error(`Recording error for channel ${channelId}:`, err);
      this.recordings.delete(channelId);
    });

    this.recordings.set(channelId, recording);
    console.log(`Started recording channel ${channelId} to ${filepath}`);

    return { success: true, message: 'Recording started', filepath };
  }

  stopRecording(channelId: number): { success: boolean; message: string; filepath?: string } {
    const recording = this.recordings.get(channelId);
    if (!recording) {
      return { success: false, message: 'Not recording this channel' };
    }

    // Send SIGINT to gracefully stop recording (finalizes file)
    recording.ffmpeg.kill('SIGINT');
    this.recordings.delete(channelId);

    console.log(`Stopped recording channel ${channelId}`);
    return { success: true, message: 'Recording stopped', filepath: recording.filepath };
  }

  stopAll(): void {
    console.log('Stopping all recordings...');
    this.recordings.forEach((recording) => {
      recording.ffmpeg.kill('SIGINT');
    });
    this.recordings.clear();
  }
}
