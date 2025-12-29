import React, { useState, useRef, useEffect } from 'react';

interface SkipDropdownProps {
  direction: 'forward' | 'backward';
  onSkip: (seconds: number) => void;
  disabled?: boolean;
}

const SKIP_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1h', value: 3600 },
];

export default function SkipDropdown({ direction, onSkip, disabled }: SkipDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(60); // Default 1 minute
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSkip = () => {
    const seconds = direction === 'backward' ? -selectedValue : selectedValue;
    onSkip(seconds);
  };

  const handleSelectOption = (value: number) => {
    setSelectedValue(value);
    setIsOpen(false);
  };

  const selectedLabel = SKIP_OPTIONS.find(opt => opt.value === selectedValue)?.label || '1m';
  const icon = direction === 'backward' ? '<<' : '>>';

  return (
    <div className="skip-dropdown" ref={dropdownRef}>
      <div className="skip-dropdown-buttons">
        <button
          className="skip-btn"
          onClick={handleSkip}
          disabled={disabled}
          title={`Skip ${direction} ${selectedLabel}`}
        >
          <span className="skip-icon">{icon}</span>
          <span className="skip-label">{selectedLabel}</span>
        </button>
        <button
          className="skip-dropdown-toggle"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="skip-dropdown-menu">
          {SKIP_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`skip-option ${option.value === selectedValue ? 'active' : ''}`}
              onClick={() => handleSelectOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
