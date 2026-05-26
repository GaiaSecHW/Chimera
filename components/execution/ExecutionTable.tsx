import React from 'react';

export const executionTableHeaderClassName =
  'border-b border-slate-200 bg-slate-100/80 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500';

export const executionTableCellClassName =
  'border-b border-slate-100 px-4 py-3 align-top text-sm text-slate-600';

export const executionTableRowClassName =
  'group transition-colors hover:bg-slate-50';

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
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600" style={{ minWidth }}>
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
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignClassName = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return <th className={`px-4 py-3 ${alignClassName} ${className}`.trim()}>{children}</th>;
}

export function ExecutionTableTd({
  children,
  className = '',
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return <td colSpan={colSpan} className={`${executionTableCellClassName} ${className}`.trim()}>{children}</td>;
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
      <td colSpan={colSpan} className="px-6 py-12 text-center text-sm text-slate-400">
        {message}
      </td>
    </tr>
  );
}
