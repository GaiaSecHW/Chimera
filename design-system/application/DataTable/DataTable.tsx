import React from 'react';
import { Loader2 } from 'lucide-react';

import {
  ExecutionTable,
  ExecutionTableHead,
  ExecutionTableTh,
  ExecutionTableTd,
} from '../../../components/execution/ExecutionTable';
import { cx } from '../../utils/cx';
import { EmptyState } from '../EmptyState';
import { Pagination, PaginationProps } from './Pagination';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

export interface DataTableBulkActions {
  selectedKeys: string[];
  onSelectChange: (keys: string[]) => void;
  render: (selected: string[]) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  minWidth?: number;
  pagination?: Omit<PaginationProps, 'className'>;
  bulkActions?: DataTableBulkActions;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  minWidth = 1080,
  pagination,
  bulkActions,
  className,
}: DataTableProps<T>) {
  const colSpan = columns.length + (bulkActions ? 1 : 0);
  const allKeys = data.map(rowKey);
  const allSelected = bulkActions != null && allKeys.length > 0 && allKeys.every((k) => bulkActions.selectedKeys.includes(k));

  const toggleAll = () => {
    if (!bulkActions) return;
    bulkActions.onSelectChange(allSelected ? [] : allKeys);
  };

  const toggleOne = (key: string) => {
    if (!bulkActions) return;
    const next = bulkActions.selectedKeys.includes(key)
      ? bulkActions.selectedKeys.filter((k) => k !== key)
      : [...bulkActions.selectedKeys, key];
    bulkActions.onSelectChange(next);
  };

  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';

  return (
    <div className={cx('space-y-2', className)}>
      {bulkActions && bulkActions.selectedKeys.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-elevated px-4 py-2 text-sm text-theme-text-secondary">
          <span className="tabular-nums">已选 {bulkActions.selectedKeys.length} 项</span>
          <div className="flex items-center gap-2">{bulkActions.render(bulkActions.selectedKeys)}</div>
        </div>
      )}

      <ExecutionTable minWidth={minWidth}>
        <ExecutionTableHead>
          <tr>
            {bulkActions && (
              <ExecutionTableTh className="w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全选" />
              </ExecutionTableTh>
            )}
            {columns.map((col) => (
              <ExecutionTableTh key={col.key} align={col.align} className={col.className}>
                {col.header}
              </ExecutionTableTh>
            ))}
          </tr>
        </ExecutionTableHead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-6 py-12 text-center text-sm text-theme-text-muted">
                <Loader2 size={18} className="mx-auto animate-spin" />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-6 py-12">
                {empty ?? <EmptyState title="暂无数据" />}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cx(
                    'group transition-colors hover:bg-theme-elevated',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {bulkActions && (
                    <ExecutionTableTd className="w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={bulkActions.selectedKeys.includes(key)}
                        onChange={() => toggleOne(key)}
                        aria-label="选择行"
                      />
                    </ExecutionTableTd>
                  )}
                  {columns.map((col) => (
                    <ExecutionTableTd key={col.key} align={col.align} className={cx(alignClass(col.align), col.className)}>
                      {col.render ? col.render(row, index) : (row as Record<string, React.ReactNode>)[col.key]}
                    </ExecutionTableTd>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </ExecutionTable>

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
