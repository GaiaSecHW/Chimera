import React from 'react';

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

export const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

export const AiwfPageShell: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description = '', actions, children }) => {
  return (
    <div className="space-y-5">
      <div className="rounded-[1.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.12),_transparent_45%),linear-gradient(135deg,_#f8fafc,_#eef2ff)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">AI Agent Framework</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{title}</h1>
            {description ? <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
};

export const AiwfCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...props }) => {
  return (
    <div
      {...props}
      className={`rounded-[1.5rem] border border-slate-200 bg-white shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
};

export const AiwfEmpty: React.FC<{ title: string; description?: string }> = ({ title, description = '' }) => {
  return (
    <div className="px-6 py-12 text-center">
      <div className="text-lg font-black text-slate-900">{title}</div>
      {description ? <div className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</div> : null}
    </div>
  );
};
