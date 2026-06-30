import React, { useEffect, useState } from 'react';
import type { ServiceHealthMeta } from './serviceHealthMeta';

const VERSION_PRIORITY_FIELDS: Array<keyof ServiceHealthMeta> = [
  'build_version',
  'service_version',
  'version',
  'image_tag',
  'git_tag',
  'git_commit',
];

export function resolveServiceBuildVersion(payload?: ServiceHealthMeta | null): string | null {
  if (!payload) return null;
  for (const field of VERSION_PRIORITY_FIELDS) {
    const normalized = String(payload[field] || '').trim();
    if (normalized) return normalized;
  }
  return null;
}

export function useServiceBuildVersion<T extends ServiceHealthMeta>(
  loadHealth: () => Promise<T>,
): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadHealth()
      .then((payload) => {
        if (active) setVersion(resolveServiceBuildVersion(payload));
      })
      .catch(() => {
        if (active) setVersion(null);
      });
    return () => {
      active = false;
    };
  }, [loadHealth]);

  return version;
}

export const ServiceBuildVersionBadge: React.FC<{
  version?: string | null;
  className?: string;
}> = ({ version, className = '' }) => {
  const normalized = String(version || '').trim();
  if (!normalized) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-theme-border bg-theme-elevated px-2.5 py-0.5 text-[11px] font-bold text-theme-text-secondary ${className}`.trim()}
    >
      {normalized}
    </span>
  );
};

export const ServicePageTitle: React.FC<{
  title: React.ReactNode;
  version?: string | null;
  className?: string;
  titleClassName?: string;
  badgeClassName?: string;
}> = ({
  title,
  version,
  className = '',
  titleClassName = 'text-2xl font-semibold tracking-tight text-theme-text-primary',
  badgeClassName = '',
}) => (
  <div className={`flex flex-wrap items-center gap-3 ${className}`.trim()}>
    <h1 className={titleClassName}>{title}</h1>
    <ServiceBuildVersionBadge version={version} className={badgeClassName} />
  </div>
);
