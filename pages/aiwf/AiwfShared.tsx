import React from 'react';

export const AiwfPageShell: React.FC<{
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, actions, children }) => (
  <div className="p-10 space-y-8 animate-in fade-in duration-500">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">{title}</h2>
        <p className="text-slate-500 mt-1 font-medium italic">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
    {children}
  </div>
);

export const AiwfTabs: React.FC<{
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (tabId: string) => void;
}> = ({ tabs, activeTab, onChange }) => (
  <div className="flex flex-wrap gap-3">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all ${
          activeTab === tab.id
            ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15'
            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const AiwfCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-[2rem] shadow-sm ${className}`}>{children}</div>
);

export const AiwfEmpty: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="p-10 text-center">
    <h3 className="text-xl font-black text-slate-700">{title}</h3>
    <p className="text-sm text-slate-500 mt-2">{description}</p>
  </div>
);

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const prettyJson = (value: any) => JSON.stringify(value ?? {}, null, 2);
