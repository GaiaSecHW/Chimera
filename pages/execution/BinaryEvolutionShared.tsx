import React from 'react';

import {
  BinaryEvolutionTaskDetail,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';

export const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export const APPLY_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  applied: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
};

export const fmtTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.tasks)) return record.tasks as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

export const normalizeTaskList = (value: unknown): BinaryEvolutionTaskSummary[] => asArray<BinaryEvolutionTaskSummary>(value);

export const normalizeTaskDetail = (value: BinaryEvolutionTaskDetail): BinaryEvolutionTaskDetail => ({
  ...value,
  metrics: asRecord(value?.metrics),
  config: asRecord(value?.config),
  source_task_ids: asArray<string>(value?.source_task_ids),
  source_case_ids: asArray<string>(value?.source_case_ids),
  agent_state_roots: asRecord(value?.agent_state_roots),
  default_agent_source_dirs: asRecord(value?.default_agent_source_dirs),
  preview: {
    ...(value?.preview || {
      project_id: value?.project_id || '',
      requested_case_ids: [],
      effective_case_ids: [],
      can_create: false,
      blocked_reasons: [],
      sources: [],
    }),
    requested_case_ids: asArray<string>(value?.preview?.requested_case_ids),
    effective_case_ids: asArray<string>(value?.preview?.effective_case_ids),
    blocked_reasons: asArray<string>(value?.preview?.blocked_reasons),
    sources: asArray<any>(value?.preview?.sources),
  },
  sources: asArray<any>(value?.sources),
  rounds: asArray<any>(value?.rounds),
  artifacts: asArray<any>(value?.artifacts),
  events: asArray<any>(value?.events),
});

export const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'bg-slate-50 border-slate-200 text-slate-800' }) => (
  <div className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
    <div className="text-3xl font-black">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{label}</div>
  </div>
);
