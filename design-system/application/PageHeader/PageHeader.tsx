import React from 'react';
import { ChevronLeft } from 'lucide-react';

import { cx } from '../../utils/cx';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { label?: string; onClick: () => void };
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  back,
  className,
}) => (
  <header className={cx('border-b border-theme-border pb-4', className)}>
    {back && (
      <button
        type="button"
        onClick={back.onClick}
        className="mb-2 inline-flex items-center gap-1 text-sm text-theme-text-muted transition-colors hover:text-theme-text-primary"
      >
        <ChevronLeft size={16} />
        {back.label ?? '返回'}
      </button>
    )}
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-theme-text-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-theme-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </header>
);
