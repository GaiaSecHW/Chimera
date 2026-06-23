import React from 'react';

import { Card } from '../../primitives/Card';
import { cx } from '../../utils/cx';

export interface PageSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PageSection: React.FC<PageSectionProps> = ({
  title,
  description,
  actions,
  children,
  className,
}) => (
  <Card as="section" padding="md" className={cx('space-y-4', className)}>
    {(title || actions) && (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {title && <h2 className="text-base font-semibold text-theme-text-primary">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-theme-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </Card>
);
