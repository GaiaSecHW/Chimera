import React from 'react';

import { cx } from '../../utils/cx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'block' | 'inline';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  variant = 'inline',
  className,
}) => (
  <div
    className={cx(
      'flex flex-col items-center justify-center gap-2 py-10 text-center',
      variant === 'block' && 'rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4',
      className,
    )}
  >
    {icon && <div className="text-theme-text-faint">{icon}</div>}
    <p className="text-sm font-medium text-theme-text-secondary">{title}</p>
    {description && <p className="text-xs text-theme-text-faint">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
