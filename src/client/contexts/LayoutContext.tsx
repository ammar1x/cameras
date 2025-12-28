import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';

interface LayoutContextType {
  currentLayout: GridLayout;
  setCurrentLayout: (layout: GridLayout) => void;
  cameraOrder: number[];
  reorderCameras: (newOrder: number[]) => void;
}

const STORAGE_KEY = 'camera-viewer-layout';

const LayoutContext = createContext<LayoutContextType | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [currentLayout, setCurrentLayoutState] = useState<GridLayout>('2x2');
  const [cameraOrder, setCameraOrder] = useState<number[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCurrentLayoutState(parsed.currentLayout || '2x2');
        setCameraOrder(parsed.cameraOrder || []);
      }
    } catch (e) {
      console.error('Failed to load layout settings:', e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentLayout,
        cameraOrder,
      })
    );
  }, [currentLayout, cameraOrder]);

  const setCurrentLayout = useCallback((layout: GridLayout) => {
    setCurrentLayoutState(layout);
  }, []);

  const reorderCameras = useCallback((newOrder: number[]) => {
    setCameraOrder(newOrder);
  }, []);

  return (
    <LayoutContext.Provider
      value={{
        currentLayout,
        setCurrentLayout,
        cameraOrder,
        reorderCameras,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) throw new Error('useLayout must be used within LayoutProvider');
  return context;
}
