import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Card } from '../../primitives/Card';
import { cx } from '../../utils/cx';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface StatTrend {
  direction: 'up' | 'down';
  value: string;
}

export interface StatisticCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  trend?: StatTrend;
  hint?: React.ReactNode;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
}

const toneClass: Record<StatTone, string> = {
  default: 'text-theme-text-primary',
  success: 'text-state-success',
  warning: 'text-state-warning',
  danger: 'text-state-danger',
  info: 'text-blue-400',
  brand: 'text-brand-primary',
};

export const StatisticCard: React.FC<StatisticCardProps> = ({
  label,
  value,
  icon,
  trend,
  hint,
  tone = 'default',
  onClick,
  className,
}) => (
  <Card
    padding="sm"
    onClick={onClick}
    className={cx(
      'flex items-center justify-between gap-3',
      onClick && 'cursor-pointer transition-colors hover:border-brand-border',
      className,
    )}
  >
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-theme-text-muted">{label}</p>
      <p className={cx('mt-1 text-3xl font-semibold tabular-nums', toneClass[tone])}>{value}</p>
      {trend && (
        <span
          className={cx(
            'mt-0.5 inline-flex items-center gap-0.5 text-xs',
            trend.direction === 'up' ? 'text-state-success' : 'text-state-danger',
          )}
        >
          {trend.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {trend.value}
        </span>
      )}
      {hint && <p className="mt-0.5 text-xs text-theme-text-faint">{hint}</p>}
    </div>
    {icon && <div className="shrink-0 text-theme-text-muted">{icon}</div>}
  </Card>
);
