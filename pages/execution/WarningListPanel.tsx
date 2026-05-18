import React from 'react';

export const WarningListPanel: React.FC<{
  title: string;
  items: string[];
  className?: string;
}> = ({ title, items, className = '' }) => {
  if (!items.length) return null;

  return (
    <section className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm ${className}`.trim()}>
      <div className="font-bold">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
};
