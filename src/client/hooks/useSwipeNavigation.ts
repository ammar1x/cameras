import { useRef, useCallback } from 'react';

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Minimum distance to trigger swipe
  allowedTime?: number; // Maximum time in ms for a swipe
}

export function useSwipeNavigation(options: UseSwipeNavigationOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 100,
    allowedTime = 300,
  } = options;

  const stateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    isMultiTouch: boolean;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isMultiTouch: false,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;
    state.isMultiTouch = e.touches.length > 1;

    if (e.touches.length === 1) {
      state.startX = e.touches[0].clientX;
      state.startY = e.touches[0].clientY;
      state.startTime = Date.now();
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;

    // Don't process if it was a multi-touch gesture
    if (state.isMultiTouch) {
      state.isMultiTouch = false;
      return;
    }

    if (e.changedTouches.length !== 1) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const elapsed = Date.now() - state.startTime;

    // Only process quick swipes
    if (elapsed > allowedTime) return;

    const deltaX = endX - state.startX;
    const deltaY = endY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine if horizontal or vertical swipe
    if (absX > absY && absX >= threshold) {
      // Horizontal swipe
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else if (absY > absX && absY >= threshold) {
      // Vertical swipe
      if (deltaY > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, allowedTime]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
