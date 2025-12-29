import { useState, useCallback, useEffect, useRef } from 'react';

export function useControlsVisibility(timeout = 3000) {
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLockedRef = useRef(false);

  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startHideTimeout = useCallback(() => {
    if (isLockedRef.current) return;
    clearHideTimeout();
    timeoutRef.current = setTimeout(() => {
      if (!isLockedRef.current) {
        setVisible(false);
      }
    }, timeout);
  }, [timeout, clearHideTimeout]);

  const showControls = useCallback(() => {
    setVisible(true);
    startHideTimeout();
  }, [startHideTimeout]);

  const hideControls = useCallback(() => {
    if (!isLockedRef.current) {
      clearHideTimeout();
      setVisible(false);
    }
  }, [clearHideTimeout]);

  // Keep controls visible (e.g., when hovering over controls or dropdown is open)
  const lockVisible = useCallback(() => {
    isLockedRef.current = true;
    clearHideTimeout();
    setVisible(true);
  }, [clearHideTimeout]);

  const unlockVisible = useCallback(() => {
    isLockedRef.current = false;
    startHideTimeout();
  }, [startHideTimeout]);

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  return {
    visible,
    showControls,
    hideControls,
    lockVisible,
    unlockVisible,
  };
}
