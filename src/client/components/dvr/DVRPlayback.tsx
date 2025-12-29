import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Recording {
  startTime: string;
  endTime: string;
  type: string;
  filePath: string;
  duration: number;
}

interface ChannelRecordings {
  channel: number;
  recordings: Recording[];
}

interface Props {
  onBack: () => void;
}

export default function DVRPlayback({ onBack }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10).replace(/-/g, '');
  });
  const [channelData, setChannelData] = useState<ChannelRecordings[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [playbackTime, setPlaybackTime] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<{
    streamName: string;
  } | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('12:00');
  const [jumpChannel, setJumpChannel] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Generate last 7 dates
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });

  // Fetch recordings for all channels
  useEffect(() => {
    async function fetchAllChannels() {
      setLoading(true);
      try {
        const results = await Promise.all(
          channels.map(async (ch) => {
            const res = await fetch(`/api/dvr/recordings/${ch}/${selectedDate}`);
            const recordings = await res.json();
            return { channel: ch, recordings: Array.isArray(recordings) ? recordings : [] };
          })
        );
        setChannelData(results);
      } catch (err) {
        console.error('Failed to fetch DVR recordings:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAllChannels();
  }, [selectedDate]);

  // Convert time string to hour position (0-24)
  const timeToPosition = (timeStr: string): number => {
    const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return 0;
    const [, h, m, s] = match;
    return parseInt(h) + parseInt(m) / 60 + parseInt(s) / 3600;
  };

  // Stop current playback
  const stopPlayback = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch (e) {
        // Ignore
      }
    }
    if (videoRef.current) {
      videoRef.current.src = '';
    }
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
  }, []);

  // Start MSE playback via go2rtc
  const startPlayback = useCallback(async (channel: number, startTime: string, endTime: string) => {
    // Stop any existing playback
    stopPlayback();
    if (streamInfo) {
      await fetch(`/api/dvr/playback/${streamInfo.streamName}`, { method: 'DELETE' }).catch(() => {});
    }

    setPlaybackStatus('Connecting...');

    try {
      // Create playback stream in go2rtc
      const res = await fetch('/api/dvr/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, startTime, endTime }),
      });
      const info = await res.json();

      if (info.error) {
        setPlaybackStatus(`Error: ${info.error}`);
        return;
      }

      setStreamInfo(info);
      setPlaybackStatus('Loading stream...');

      // Use proxied WebSocket to go2rtc (avoids CORS issues)
      const wsUrl = `ws://${window.location.host}/go2rtc/ws?src=${info.streamName}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      // Set up MediaSource
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      let sourceBuffer: SourceBuffer | null = null;
      const queue: ArrayBuffer[] = [];
      let isAppending = false;
      let wsReady = false;
      let mediaSourceReady = false;

      const appendBuffer = () => {
        if (!sourceBuffer || isAppending || queue.length === 0) return;
        if (sourceBuffer.updating) return;

        isAppending = true;
        const data = queue.shift();
        if (data) {
          try {
            sourceBuffer.appendBuffer(data);
          } catch (e) {
            console.error('Error appending buffer:', e);
            isAppending = false;
          }
        }
      };

      // Only send MSE request when both WebSocket and MediaSource are ready
      const tryStartMSE = () => {
        if (wsReady && mediaSourceReady && ws.readyState === WebSocket.OPEN) {
          console.log('Sending MSE request to go2rtc...');
          ws.send(JSON.stringify({ type: 'mse' }));
        }
      };

      ws.onopen = () => {
        console.log('WebSocket connected to go2rtc proxy');
        wsReady = true;
        tryStartMSE();
      };

      mediaSource.addEventListener('sourceopen', () => {
        console.log('MediaSource is ready');
        mediaSourceReady = true;
        tryStartMSE();
      });

      // Attach MediaSource to video after setting up event handlers
      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(mediaSource);
      }

      ws.onmessage = (event) => {
        // With binaryType='arraybuffer', all data comes as ArrayBuffer
        // First message is JSON text, rest are binary video data
        if (event.data instanceof ArrayBuffer) {
          const data = event.data as ArrayBuffer;

          // Check if this looks like JSON (starts with '{')
          const firstByte = new Uint8Array(data)[0];
          if (firstByte === 123) { // '{' character
            // This is JSON text - decode and parse
            const text = new TextDecoder().decode(data);
            try {
              const msg = JSON.parse(text);
              if (msg.type === 'mse') {
                // Got codec info, create source buffer
                const mimeType = msg.value;
                console.log('MSE codec:', mimeType);

                if (MediaSource.isTypeSupported(mimeType)) {
                  try {
                    sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                    sourceBufferRef.current = sourceBuffer;

                    sourceBuffer.addEventListener('updateend', () => {
                      isAppending = false;
                      appendBuffer();
                    });

                    setPlaybackStatus('Playing');
                  } catch (e) {
                    console.error('Error creating source buffer:', e);
                    setPlaybackStatus('Codec not supported');
                  }
                } else {
                  console.error('Unsupported codec:', mimeType);
                  setPlaybackStatus(`Unsupported codec: ${mimeType}`);
                }
              }
            } catch (e) {
              console.error('Error parsing JSON:', e);
            }
          } else {
            // Binary video data
            queue.push(data);
            appendBuffer();
          }
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
        setPlaybackStatus('Connection error');
      };

      ws.onclose = () => {
        setPlaybackStatus('Stream ended');
      };

      // Start video playback when enough data
      if (videoRef.current) {
        videoRef.current.oncanplay = () => {
          videoRef.current?.play().catch(() => {});
        };
      }

    } catch (err) {
      console.error('Failed to start playback:', err);
      setPlaybackStatus('Failed to start playback');
    }
  }, [streamInfo, stopPlayback]);

  // Handle jumping to a specific time
  const handleJumpToTime = () => {
    const [hour, minute] = selectedTime.split(':').map(Number);
    const year = selectedDate.slice(0, 4);
    const month = selectedDate.slice(4, 6);
    const day = selectedDate.slice(6, 8);

    const startTime = `${year}-${month}-${day} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    const endHour = Math.min(hour + 1, 23);
    const endTime = `${year}-${month}-${day} ${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

    setSelectedChannel(jumpChannel);
    setPlaybackTime(startTime);
    startPlayback(jumpChannel, startTime, endTime);
  };

  // Handle timeline click
  const handleTimelineClick = (channel: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const hour = Math.floor(percent * 24);
    const minute = Math.floor((percent * 24 - hour) * 60);

    const year = selectedDate.slice(0, 4);
    const month = selectedDate.slice(4, 6);
    const day = selectedDate.slice(6, 8);

    const startTime = `${year}-${month}-${day} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    const endHour = hour + 1;
    const endTime = `${year}-${month}-${day} ${endHour.toString().padStart(2, '0')}:00:00`;

    setSelectedChannel(channel);
    setPlaybackTime(startTime);
    startPlayback(channel, startTime, endTime);
  };

  // Store streamInfo in a ref for cleanup to avoid dependency issues
  const streamInfoRef = useRef<{ streamName: string } | null>(null);
  useEffect(() => {
    streamInfoRef.current = streamInfo;
  }, [streamInfo]);

  // Track if component is mounted to handle StrictMode properly
  const isMountedRef = useRef(true);

  // Cleanup on unmount only (empty deps) with delay to handle StrictMode
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Delay cleanup to allow StrictMode remount to cancel it
      const wsToClose = wsRef.current;
      const streamToDelete = streamInfoRef.current;

      setTimeout(() => {
        // Only cleanup if still unmounted after delay
        if (!isMountedRef.current) {
          if (wsToClose && wsToClose.readyState !== WebSocket.CLOSED) {
            wsToClose.close();
          }
          if (streamToDelete) {
            fetch(`/api/dvr/playback/${streamToDelete.streamName}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }, 100);
    };
  }, []);

  const formatDate = (dateStr: string) => {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  };

  return (
    <div className="dvr-playback">
      <div className="dvr-header">
        <button className="back-btn" onClick={onBack}>
          &larr; Back
        </button>
        <h2>DVR Playback</h2>
        <div className="dvr-controls">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-select"
          >
            {dates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
          <select
            value={jumpChannel}
            onChange={(e) => setJumpChannel(Number(e.target.value))}
            className="channel-select"
          >
            {channels.map((ch) => (
              <option key={ch} value={ch}>
                Camera {ch}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="time-input"
          />
          <button className="go-btn" onClick={handleJumpToTime}>
            Go
          </button>
        </div>
      </div>

      <div className="dvr-content">
        <div className="timeline-grid">
          {/* Hour markers */}
          <div className="timeline-hours">
            <div className="channel-label"></div>
            <div className="hours-bar">
              {Array.from({ length: 25 }, (_, i) => (
                <span key={i} className="hour-mark" style={{ left: `${(i / 24) * 100}%` }}>
                  {i.toString().padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          {/* Channel timelines */}
          {loading ? (
            <div className="loading-timelines">Loading...</div>
          ) : (
            channelData.map(({ channel, recordings }) => (
              <div
                key={channel}
                className={`channel-timeline ${selectedChannel === channel ? 'selected' : ''}`}
              >
                <div className="channel-label">Camera {channel}</div>
                <div
                  className="timeline-bar"
                  onClick={(e) => handleTimelineClick(channel, e)}
                >
                  {recordings.map((rec, idx) => {
                    const start = timeToPosition(rec.startTime);
                    const end = timeToPosition(rec.endTime);
                    const left = (start / 24) * 100;
                    const width = ((end - start) / 24) * 100;
                    return (
                      <div
                        key={idx}
                        className={`recording-segment ${rec.type === 'dav' ? 'continuous' : 'motion'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${rec.startTime} - ${rec.endTime}`}
                      />
                    );
                  })}
                  {/* Current time indicator */}
                  <div
                    className="current-time-indicator"
                    style={{ left: `${(new Date().getHours() + new Date().getMinutes() / 60) / 24 * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Video player */}
        <div className="dvr-player">
          {selectedChannel ? (
            <>
              <div className="player-info">
                <span>Camera {selectedChannel}</span>
                {playbackTime && <span>{playbackTime}</span>}
                {playbackStatus && <span className="playback-status">{playbackStatus}</span>}
              </div>
              <video ref={videoRef} controls autoPlay playsInline muted />
            </>
          ) : (
            <div className="player-placeholder">
              Click on a timeline to start playback
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
