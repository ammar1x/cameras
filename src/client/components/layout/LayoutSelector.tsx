import React from 'react';
import { useLayout, GridLayout } from '../../contexts/LayoutContext';

interface LayoutOption {
  value: GridLayout;
  cols: number;
}

const LAYOUTS: LayoutOption[] = [
  { value: '1x1', cols: 1 },
  { value: '2x2', cols: 2 },
  { value: '3x3', cols: 3 },
  { value: '4x4', cols: 4 },
];

function GridIcon({ cols }: { cols: number }) {
  const cells = Array.from({ length: cols * cols });
  return (
    <div
      className="layout-icon"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '2px',
        width: '20px',
        height: '20px',
      }}
    >
      {cells.map((_, i) => (
        <div key={i} className="layout-icon__cell" />
      ))}
    </div>
  );
}

export default function LayoutSelector() {
  const { currentLayout, setCurrentLayout } = useLayout();

  return (
    <div className="layout-selector" role="radiogroup" aria-label="Grid layout">
      {LAYOUTS.map((layout) => (
        <button
          key={layout.value}
          className={`layout-option ${currentLayout === layout.value ? 'layout-option--active' : ''}`}
          onClick={() => setCurrentLayout(layout.value)}
          role="radio"
          aria-checked={currentLayout === layout.value}
          title={`${layout.value} Grid`}
        >
          <GridIcon cols={layout.cols} />
        </button>
      ))}
    </div>
  );
}
