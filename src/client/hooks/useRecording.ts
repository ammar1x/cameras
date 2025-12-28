import { useState, useCallback } from 'react';

interface UseRecordingReturn {
  isRecording: boolean;
  isLoading: boolean;
  startRecording: (channelId: number, channelName: string) => Promise<boolean>;
  stopRecording: (channelId: number) => Promise<boolean>;
  toggleRecording: (channelId: number, channelName: string) => Promise<boolean>;
}

export function useRecording(initialRecording = false): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [isLoading, setIsLoading] = useState(false);

  const startRecording = useCallback(async (channelId: number, channelName: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/recordings/${channelId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRecording(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to start recording:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopRecording = useCallback(async (channelId: number): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/recordings/${channelId}/stop`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setIsRecording(false);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to stop recording:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleRecording = useCallback(async (channelId: number, channelName: string): Promise<boolean> => {
    if (isRecording) {
      return stopRecording(channelId);
    } else {
      return startRecording(channelId, channelName);
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isLoading,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
