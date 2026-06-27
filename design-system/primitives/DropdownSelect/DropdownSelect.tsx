import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cx } from '../../utils/cx';

export interface DropdownSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownSelectOption[];
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  /** extra classes for the trigger button */
  className?: string;
  /** extra classes for the relative wrapper (sizing, e.g. "flex-1" / "w-full" / "mt-1") */
  containerClassName?: string;
  /** extra classes for the dropdown panel */
  panelClassName?: string;
}

const SEARCH_THRESHOLD = 10;
const PANEL_ESTIMATE = 300;
const LIST_MAX = 240;
const LIST_MIN = 80;
const CHROME_WITH_SEARCH = 56;
const CHROME_NO_SEARCH = 24;

type PositionResult = { dropUp: boolean; listMaxHeight: number };

const computePosition = (el: HTMLElement, withSearch: boolean): PositionResult => {
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const shouldFlip = spaceBelow < PANEL_ESTIMATE && spaceAbove > spaceBelow;
  const available = shouldFlip ? spaceAbove : spaceBelow;
  const chrome = withSearch ? CHROME_WITH_SEARCH : CHROME_NO_SEARCH;
  const listMaxHeight = Math.max(LIST_MIN, Math.min(LIST_MAX, Math.round(available - chrome)));
  return { dropUp: shouldFlip, listMaxHeight };
};

export const DropdownSelect = function DropdownSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyText = '暂无数据',
  searchPlaceholder = '搜索...',
  className,
  containerClassName,
  panelClassName,
}: DropdownSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState<number | undefined>(undefined);
  const [query, setQuery] = useState('');

  const showSearch = options.length > SEARCH_THRESHOLD;
  const selectedOption = options.find((opt) => opt.value === value) || null;
  const triggerLabel = selectedOption ? selectedOption.label : (placeholder || '请选择');

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  /* measure position + focus search on open */
  useLayoutEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (el) {
      const { dropUp: du, listMaxHeight: lmh } = computePosition(el, showSearch);
      setDropUp(du);
      setListMaxHeight(lmh);
    }
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus({ preventScroll: true });
    }
    const sel = selectedRef.current;
    if (sel) {
      sel.scrollIntoView({ block: 'nearest' });
    }
  }, [open, showSearch]);

  /* recompute on resize while open */
  useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      const el = containerRef.current;
      if (!el) return;
      const { dropUp: du, listMaxHeight: lmh } = computePosition(el, showSearch);
      setDropUp(du);
      setListMaxHeight(lmh);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, showSearch]);

  /* reset search when closing */
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filteredOptions = showSearch && query
    ? options.filter((opt) => {
        const q = query.toLowerCase();
        return opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
      })
    : options;

  const handleSelect = (opt: DropdownSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const panelPositionClass = dropUp
    ? 'absolute bottom-full left-0 mb-2'
    : 'absolute top-full left-0 mt-2';

  return (
    <div className={cx('relative', containerClassName)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx('form-select flex w-full items-center justify-between gap-2 text-left', className)}
      >
        <span className="truncate flex-1 text-left font-normal">{triggerLabel}</span>
        <ChevronDown size={14} className={cx('shrink-0 text-theme-text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className={cx(
            panelPositionClass,
            'w-full bg-theme-surface border border-theme-border rounded-lg shadow-overlay p-2 z-50',
            panelClassName,
          )}
        >
          {showSearch && (
            <div className="mb-1.5">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="form-input w-full px-2 py-1.5 text-xs"
              />
            </div>
          )}
          <div ref={listRef} className="max-h-60 overflow-y-auto space-y-0.5" style={{ maxHeight: listMaxHeight ? `${listMaxHeight}px` : undefined }}>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs font-medium text-theme-text-secondary">{emptyText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    ref={selected ? selectedRef : undefined}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt)}
                    className={cx(
                      'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      selected
                        ? 'theme-shell-active'
                        : opt.disabled
                          ? 'cursor-not-allowed text-theme-text-faint opacity-50'
                          : 'text-theme-text-secondary hover:bg-theme-elevated',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
