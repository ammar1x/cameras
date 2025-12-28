import { useRef, useCallback, RefObject } from 'react';

interface PinchZoomState {
  scale: number;
  x: number;
  y: number;
}

interface UsePinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  onTransformChange: (transform: PinchZoomState) => void;
}

export function usePinchZoom<T extends HTMLElement>(
  options: UsePinchZoomOptions
): {
  ref: RefObject<T | null>;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
} {
  const { minScale = 1, maxScale = 4, onTransformChange } = options;
  const ref = useRef<T>(null);
  const stateRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialX: number;
    initialY: number;
    lastX: number;
    lastY: number;
    isPinching: boolean;
    isPanning: boolean;
    currentScale: number;
  }>({
    initialDistance: 0,
    initialScale: 1,
    initialX: 0,
    initialY: 0,
    lastX: 0,
    lastY: 0,
    isPinching: false,
    isPanning: false,
    currentScale: 1,
  });

  const getDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getCenter = useCallback((touch1: React.Touch, touch2: React.Touch): { x: number; y: number } => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;

    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      state.isPinching = true;
      state.isPanning = false;
      state.initialDistance = getDistance(e.touches[0], e.touches[1]);
      state.initialScale = state.currentScale;
      const center = getCenter(e.touches[0], e.touches[1]);
      state.initialX = center.x;
      state.initialY = center.y;
    } else if (e.touches.length === 1 && state.currentScale > 1) {
      // Pan start (only when zoomed in)
      state.isPanning = true;
      state.initialX = e.touches[0].clientX - state.lastX;
      state.initialY = e.touches[0].clientY - state.lastY;
    }
  }, [getDistance, getCenter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;

    if (state.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scaleDelta = currentDistance / state.initialDistance;
      let newScale = state.initialScale * scaleDelta;
      newScale = Math.max(minScale, Math.min(maxScale, newScale));

      state.currentScale = newScale;
      onTransformChange({
        scale: newScale,
        x: state.lastX,
        y: state.lastY,
      });
    } else if (state.isPanning && e.touches.length === 1) {
      const newX = e.touches[0].clientX - state.initialX;
      const newY = e.touches[0].clientY - state.initialY;

      // Limit panning based on zoom level
      const maxPan = (state.currentScale - 1) * 200;
      const clampedX = Math.max(-maxPan, Math.min(maxPan, newX));
      const clampedY = Math.max(-maxPan, Math.min(maxPan, newY));

      state.lastX = clampedX;
      state.lastY = clampedY;

      onTransformChange({
        scale: state.currentScale,
        x: clampedX,
        y: clampedY,
      });
    }
  }, [getDistance, minScale, maxScale, onTransformChange]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;

    if (e.touches.length < 2) {
      state.isPinching = false;
    }

    if (e.touches.length === 0) {
      state.isPanning = false;

      // Reset position if zoomed out fully
      if (state.currentScale <= 1) {
        state.currentScale = 1;
        state.lastX = 0;
        state.lastY = 0;
        onTransformChange({ scale: 1, x: 0, y: 0 });
      }
    }
  }, [onTransformChange]);

  return {
    ref,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
