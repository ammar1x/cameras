import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoPlayerOverlay from './VideoPlayerOverlay';
import TimelineSidebar from './TimelineSidebar';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useControlsVisibility } from '../../hooks/useControlsVisibility';

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
  initialChannel?: number;
  initialDate?: string;
  initialTime?: string;
  onStateChange?: (channel: number, date: string, time: string) => void;
}

export default function DVRPlayback({ onBack, initialChannel, initialDate, initialTime, onStateChange }: Props) {
  // Existing state - initialize from props if available
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    const now = new Date();
    return now.toISOString().slice(0, 10).replace(/-/g, '');
  });
  const [channelData, setChannelData] = useState<ChannelRecordings[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(initialChannel ?? null);
  const [playbackTime, setPlaybackTime] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<{ streamName: string } | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<string>('');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // New state for layout
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  // Hooks
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const { visible: controlsVisible, showControls, lockVisible, unlockVisible } = useControlsVisibility(3000);

  const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Generate last 7 dates
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });

  // Track if we've initialized from URL
  const initializedRef = useRef(false);

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

  // Track video play state - re-run when selectedChannel changes since video is conditionally rendered
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handlePlaying = () => setIsPlaying(true);

    // Check initial state
    if (!video.paused) {
      setIsPlaying(true);
    }

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('playing', handlePlaying);
    };
  }, [selectedChannel]);

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
    setIsPlaying(false);
  }, []);

  // Start MSE playback via go2rtc
  const startPlayback = useCallback(async (channel: number, startTime: string, endTime: string) => {
    stopPlayback();
    if (streamInfo) {
      await fetch(`/api/dvr/playback/${streamInfo.streamName}`, { method: 'DELETE' }).catch(() => {});
    }

    setPlaybackStatus('Connecting...');

    // Check MediaSource support early
    if (typeof MediaSource === 'undefined') {
      setPlaybackStatus('MediaSource not supported on this browser');
      return;
    }

    try {
      const res = await fetch('/api/dvr/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, startTime, endTime }),
      });

      if (!res.ok) {
        setPlaybackStatus(`Server error: ${res.status}`);
        return;
      }

      const info = await res.json();

      if (info.error) {
        setPlaybackStatus(`Error: ${info.error}`);
        return;
      }

      setStreamInfo(info);
      setPlaybackStatus('Loading stream...');

      const wsUrl = `ws://${window.location.host}/go2rtc/ws?src=${info.streamName}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      let sourceBuffer: SourceBuffer | null = null;
      const queue: ArrayBuffer[] = [];
      let isAppending = false;
      let wsReady = false;
      let mediaSourceReady = false;
      let hasError = false;

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

      const tryStartMSE = () => {
        if (wsReady && mediaSourceReady && ws.readyState === WebSocket.OPEN) {
          console.log('Sending MSE request to go2rtc...');
          ws.send(JSON.stringify({ type: 'mse' }));
        }
      };

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!wsReady || !mediaSourceReady) {
          console.error('Connection timeout');
          setPlaybackStatus('Connection timeout');
          ws.close();
        }
      }, 10000);

      ws.onopen = () => {
        console.log('WebSocket connected to go2rtc proxy');
        wsReady = true;
        clearTimeout(connectionTimeout);
        tryStartMSE();
      };

      mediaSource.addEventListener('sourceopen', () => {
        console.log('MediaSource is ready');
        mediaSourceReady = true;
        tryStartMSE();
      });

      if (videoRef.current) {
        // Set oncanplay BEFORE src to avoid race condition
        videoRef.current.oncanplay = () => {
          videoRef.current?.play().catch(() => {});
        };
        videoRef.current.src = URL.createObjectURL(mediaSource);
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const data = event.data as ArrayBuffer;
          const firstByte = new Uint8Array(data)[0];

          if (firstByte === 123) {
            const text = new TextDecoder().decode(data);
            try {
              const msg = JSON.parse(text);
              if (msg.type === 'error') {
                console.error('go2rtc error:', msg.value);
                hasError = true;
                const errorMsg = msg.value || 'Stream error';
                if (errorMsg.includes('404')) {
                  setPlaybackStatus('No recording at this time');
                } else {
                  setPlaybackStatus('Stream unavailable');
                }
                ws.close();
              } else if (msg.type === 'mse') {
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
        if (!hasError) {
          setPlaybackStatus('Stream ended');
        }
      };

    } catch (err) {
      console.error('Failed to start playback:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errMsg.includes('fetch') || errMsg.includes('network')) {
        setPlaybackStatus('Network error - check connection');
      } else {
        setPlaybackStatus(`Playback error: ${errMsg}`);
      }
    }
  }, [streamInfo, stopPlayback]);

  // Auto-start playback from URL on initial load
  useEffect(() => {
    if (initializedRef.current) return;
    if (!initialChannel || !initialDate || !initialTime) return;

    initializedRef.current = true;

    // Parse time and start playback
    const year = initialDate.slice(0, 4);
    const month = initialDate.slice(4, 6);
    const day = initialDate.slice(6, 8);
    const [hour, minute] = initialTime.split(':').map(Number);

    const startTimeStr = `${year}-${month}-${day} ${initialTime}`;
    const endHour = Math.min(hour + 1, 23);
    const endTimeStr = `${year}-${month}-${day} ${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

    setPlaybackTime(startTimeStr);
    setCurrentPlaybackTime(new Date(`${year}-${month}-${day}T${initialTime}`));

    // Delay to allow component to mount
    setTimeout(() => {
      startPlayback(initialChannel, startTimeStr, endTimeStr);
    }, 100);
  }, [initialChannel, initialDate, initialTime, startPlayback]);

  // Skip forward or backward by seconds
  const handleSkip = useCallback((seconds: number) => {
    if (!currentPlaybackTime || !selectedChannel) return;

    const newTime = new Date(currentPlaybackTime.getTime() + seconds * 1000);
    const year = newTime.getFullYear();
    const month = (newTime.getMonth() + 1).toString().padStart(2, '0');
    const day = newTime.getDate().toString().padStart(2, '0');
    const hour = newTime.getHours();
    const minute = newTime.getMinutes();
    const second = newTime.getSeconds();

    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
    const startTime = `${year}-${month}-${day} ${timeStr}`;
    const endHour = Math.min(hour + 1, 23);
    const endTime = `${year}-${month}-${day} ${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

    setPlaybackTime(startTime);
    setCurrentPlaybackTime(newTime);
    startPlayback(selectedChannel, startTime, endTime);

    // Update URL
    const dateStr = `${year}${month}${day}`;
    onStateChange?.(selectedChannel, dateStr, timeStr);
  }, [currentPlaybackTime, selectedChannel, startPlayback, onStateChange]);

  // Play/Pause toggle
  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  // Speed change
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);

  // Jump to specific time
  const handleTimeJump = useCallback((timeStr: string) => {
    if (!selectedChannel) return;

    // Parse "YYYY-MM-DD HH:MM:SS" format
    const [datePart, timePart] = timeStr.split(' ');
    if (!datePart || !timePart) return;

    const [year, month, day] = datePart.split('-');
    const [hour, minute, second] = timePart.split(':').map(Number);

    const startTime = timeStr;
    const endHour = Math.min(hour + 1, 23);
    const endTime = `${datePart} ${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

    const newTime = new Date(`${datePart}T${timePart}`);
    setPlaybackTime(startTime);
    setCurrentPlaybackTime(newTime);
    startPlayback(selectedChannel, startTime, endTime);

    // Update URL
    const dateStr = `${year}${month}${day}`;
    onStateChange?.(selectedChannel, dateStr, timePart);
  }, [selectedChannel, startPlayback, onStateChange]);

  // Handle timeline click
  const handleTimelineClick = useCallback((channel: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const hour = Math.floor(percent * 24);
    const minute = Math.floor((percent * 24 - hour) * 60);

    const year = selectedDate.slice(0, 4);
    const month = selectedDate.slice(4, 6);
    const day = selectedDate.slice(6, 8);

    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    const startTime = `${year}-${month}-${day} ${timeStr}`;
    const endHour = hour + 1;
    const endTime = `${year}-${month}-${day} ${endHour.toString().padStart(2, '0')}:00:00`;

    setSelectedChannel(channel);
    setPlaybackTime(startTime);
    setCurrentPlaybackTime(new Date(`${year}-${month}-${day}T${timeStr}`));
    startPlayback(channel, startTime, endTime);

    // Update URL
    onStateChange?.(channel, selectedDate, timeStr);
  }, [selectedDate, startPlayback, onStateChange]);

  // Cleanup refs
  const streamInfoRef = useRef<{ streamName: string } | null>(null);
  useEffect(() => {
    streamInfoRef.current = streamInfo;
  }, [streamInfo]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const wsToClose = wsRef.current;
      const streamToDelete = streamInfoRef.current;
      setTimeout(() => {
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

  const hasContent = selectedChannel !== null;

  return (
    <div className="dvr-playback-new">
      {/* Main video container */}
      <div
        ref={containerRef}
        className={`dvr-player-container ${sidebarCollapsed ? 'sidebar-hidden' : ''}`}
      >
        {hasContent ? (
          <>
            <video
              ref={videoRef}
              className="dvr-video"
              playsInline
              muted
            />
            <VideoPlayerOverlay
              videoRef={videoRef}
              visible={controlsVisible}
              onMouseMove={showControls}
              onMouseLeave={() => {}}
              onControlsHover={lockVisible}
              onControlsLeave={unlockVisible}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onSkip={handleSkip}
              playbackSpeed={playbackSpeed}
              onSpeedChange={handleSpeedChange}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              sidebarOpen={!sidebarCollapsed}
              channelName={`Camera ${selectedChannel}`}
              playbackTime={playbackTime}
              playbackStatus={playbackStatus}
              onBack={onBack}
              onTimeJump={handleTimeJump}
              disabled={!hasContent}
            />
          </>
        ) : (
          <div className="player-placeholder-new">
            <div className="placeholder-content">
              <span className="placeholder-icon">📹</span>
              <span className="placeholder-text">Select a recording from the timeline</span>
            </div>
          </div>
        )}
      </div>

      {/* Timeline sidebar */}
      <TimelineSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        dates={dates}
        channelData={channelData}
        selectedChannel={selectedChannel}
        onTimelineClick={handleTimelineClick}
        loading={loading}
        currentPlaybackTime={currentPlaybackTime}
      />
    </div>
  );
}
