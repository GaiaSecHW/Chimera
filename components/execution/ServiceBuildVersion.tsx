import React from 'react';

export interface ServiceHealthMeta {
  service_id?: string | null;
  service_name?: string | null;
  build_version?: string | null;
}

export const ServiceBuildVersion: React.FC<{
  version?: string | null;
  className?: string;
}> = ({ version, className = '' }) => {
  if (!version) return null;
  return <span className={`text-xs font-semibold text-slate-400 ${className}`.trim()}>{version}</span>;
};
