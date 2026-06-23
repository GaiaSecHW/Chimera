import React from 'react';

import { cx } from '../../utils/cx';
import { SearchInput } from './SearchInput';

export interface ToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    onSubmit?: () => void;
  };
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ search, filters, actions, className }) => (
  <div className={cx('flex flex-wrap items-center gap-3', className)}>
    {search && (
      <div className="min-w-[220px]">
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder}
          onSubmit={search.onSubmit}
        />
      </div>
    )}
    {filters && <div className="flex items-center gap-2">{filters}</div>}
    {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
  </div>
);
