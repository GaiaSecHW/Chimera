import React from 'react';
import type { SecOctoPagerState } from '../../../types/secocto';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function compactPageNumbers(totalPages: number, current: number): (number | '…')[] {
  if (totalPages <= 7) {
    const arr: number[] = [];
    for (let i = 1; i <= totalPages; i++) arr.push(i);
    return arr;
  }
  const seen: Record<number, true> = {};
  [1, totalPages, current, current - 1, current + 1].forEach((p) => {
    if (p >= 1 && p <= totalPages) seen[p] = true;
  });
  const keys = Object.keys(seen).map(Number).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let j = 0; j < keys.length; j++) {
    if (j > 0 && keys[j] - keys[j - 1] > 1) out.push('…');
    out.push(keys[j]);
  }
  return out;
}

interface PagerProps {
  total: number;
  state: SecOctoPagerState;
  onChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  sizeOptions?: number[];
}

export const SecOctoPager: React.FC<PagerProps> = ({ total, state, onChange, onSizeChange, sizeOptions = PAGE_SIZE_OPTIONS }) => {
  const totalPages = Math.max(1, Math.ceil(total / state.size));
  const page = Math.min(state.page, totalPages);
  const rangeStart = total === 0 ? 0 : (page - 1) * state.size + 1;
  const rangeEnd = Math.min(page * state.size, total);

  const nums = compactPageNumbers(totalPages, page);

  return (
    <div className="flex items-center justify-between gap-4 pt-3 pb-1 text-sm text-theme-text-secondary">
      <span className="text-xs">
        第 {rangeStart}–{rangeEnd} 条 / 共 {total} 条
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-2 py-1 rounded-lg text-xs font-medium border border-theme-border bg-theme-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-theme-elevated transition-colors"
        >
          ‹ 上一页
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-theme-text-faint">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${n === page ? 'bg-brand-primary text-theme-text-inverse' : 'border border-theme-border bg-theme-surface hover:bg-theme-elevated text-theme-text-secondary'}`}
            >
              {n}
            </button>
          ),
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="px-2 py-1 rounded-lg text-xs font-medium border border-theme-border bg-theme-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-theme-elevated transition-colors"
        >
          下一页 ›
        </button>
        <select
          value={state.size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="ml-2 px-2 py-1 rounded-lg text-xs border border-theme-border bg-theme-surface text-theme-text-secondary"
        >
          {sizeOptions.map((s) => (
            <option key={s} value={s}>{s} / 页</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export { compactPageNumbers, PAGE_SIZE_OPTIONS };
