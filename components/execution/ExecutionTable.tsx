import React from 'react';

export const executionTableHeaderClassName =
  'border-b border-theme-border bg-theme-elevated/80 text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-faint';

export const executionTableCellClassName =
  'border-b border-theme-border px-4 py-3 align-top text-sm text-theme-text-secondary';

export const executionTableRowClassName =
  'group transition-colors hover:bg-theme-elevated';

export const executionTableInteractiveRowClassName =
  `${executionTableRowClassName} cursor-pointer`;

export function ExecutionTable({
  children,
  minWidth = 1080,
  className = '',
}: {
  children: React.ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-sm ${className}`.trim()}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-theme-text-secondary" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function ExecutionTableHead({ children }: { children: React.ReactNode }) {
  return <thead className={executionTableHeaderClassName}>{children}</thead>;
}

export function ExecutionTableTh({
  children,
  className = '',
  align,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  colSpan?: number;
}) {
  const alignClassName =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return <th colSpan={colSpan} className={`px-4 py-3 ${alignClassName} ${className}`.trim()}>{children}</th>;
}

export function ExecutionTableTd({
  children,
  className = '',
  align,
  colSpan,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  colSpan?: number;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  const alignClassName =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return (
    <td colSpan={colSpan} onClick={onClick} className={`${executionTableCellClassName} ${alignClassName} ${className}`.trim()}>
      {children}
    </td>
  );
}

export function ExecutionTableEmptyRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-sm text-theme-text-muted">
        {message}
      </td>
    </tr>
  );
}
