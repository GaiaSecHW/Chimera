import React from 'react';

import { cx } from '../../utils/cx';

export interface SegmentedOption {
  label: React.ReactNode;
  value: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  value,
  onChange,
  options,
  icon,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cx('flex items-center gap-1.5', className)}>
    {options.map((opt) => {
      const active = value === opt.value;
      const optIcon = opt.icon ?? icon;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-lg font-semibold uppercase tracking-wider transition-colors',
            size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            active ? 'theme-shell-active' : 'btn btn-secondary',
          )}
        >
          {optIcon}
          {opt.label}
        </button>
      );
    })}
  </div>
);
