import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cx } from '../../utils/cx';

export interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  perPageOptions = [20, 50, 100],
  className,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const to = Math.min(total, safePage * perPage);

  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3 px-4 py-3 text-xs text-theme-text-muted',
        className,
      )}
    >
      <span className="tabular-nums">
        {from}-{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        {onPerPageChange && (
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="form-select px-2 py-1 text-xs"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n}/页
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          aria-label="上一页"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="btn-icon disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="tabular-nums">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="下一页"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="btn-icon disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
