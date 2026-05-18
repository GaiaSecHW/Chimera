import React from 'react';

export const AgentSessionWarningPanel: React.FC<{
  warnings: string[];
  title?: string;
  className?: string;
}> = ({ warnings, title = '会话文件存在部分异常行，已跳过不可解析内容', className = '' }) => {
  if (!warnings.length) return null;

  return (
    <section className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm ${className}`.trim()}>
      <div className="font-bold">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`}>{warning}</li>
        ))}
      </ul>
    </section>
  );
};
