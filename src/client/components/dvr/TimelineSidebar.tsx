import React from 'react';

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

interface TimelineSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  dates: string[];
  channelData: ChannelRecordings[];
  selectedChannel: number | null;
  onTimelineClick: (channel: number, e: React.MouseEvent<HTMLDivElement>) => void;
  loading: boolean;
  currentPlaybackTime?: Date | null;
}

// Convert time string to hour position (0-24)
const timeToPosition = (timeStr: string): number => {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return parseInt(h) + parseInt(m) / 60 + parseInt(s) / 3600;
};

const formatDate = (dateStr: string) => {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
};

export default function TimelineSidebar({
  collapsed,
  onToggle,
  selectedDate,
  onDateChange,
  dates,
  channelData,
  selectedChannel,
  onTimelineClick,
  loading,
  currentPlaybackTime,
}: TimelineSidebarProps) {
  // Calculate current time position as percentage of day
  const currentTimePosition = currentPlaybackTime
    ? ((currentPlaybackTime.getHours() + currentPlaybackTime.getMinutes() / 60) / 24) * 100
    : null;
  return (
      <div className={`timeline-sidebar ${collapsed ? 'collapsed' : ''}`}>
        {/* Toggle button - attached to sidebar */}
        <button
          className="sidebar-toggle-btn"
          onClick={onToggle}
          title={collapsed ? 'Show timeline' : 'Hide timeline'}
        >
          {collapsed ? '◀' : '▶'}
        </button>
        <div className="sidebar-header">
          <h3>Timeline</h3>
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="date-select"
          >
            {dates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>

        <div className="timeline-content">
          {/* Hour markers */}
          <div className="timeline-hours-compact">
            {[0, 6, 12, 18, 24].map((h) => (
              <span key={h} className="hour-mark-compact" style={{ left: `${(h / 24) * 100}%` }}>
                {h.toString().padStart(2, '0')}
              </span>
            ))}
          </div>

          {/* Channel timelines */}
          {loading ? (
            <div className="loading-timelines">Loading...</div>
          ) : (
            <div className="timeline-channels">
              {/* Current playback time indicator line */}
              {currentTimePosition !== null && (
                <div
                  className="current-time-indicator"
                  style={{ left: `calc(55px + (100% - 55px - var(--spacing-sm)) * ${currentTimePosition} / 100)` }}
                />
              )}
              {channelData.map(({ channel, recordings }) => (
                <div
                  key={channel}
                  className={`channel-timeline-compact ${selectedChannel === channel ? 'selected' : ''}`}
                >
                  <div className="channel-label-compact">Cam {channel}</div>
                  <div
                    className="timeline-bar-compact"
                    onClick={(e) => onTimelineClick(channel, e)}
                  >
                    {recordings.map((rec, idx) => {
                      const start = timeToPosition(rec.startTime);
                      const end = timeToPosition(rec.endTime);
                      const left = (start / 24) * 100;
                      const width = ((end - start) / 24) * 100;
                      return (
                        <div
                          key={idx}
                          className={`recording-segment-compact ${rec.type === 'dav' ? 'continuous' : 'motion'}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${rec.startTime} - ${rec.endTime}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
