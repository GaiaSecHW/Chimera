import React from 'react';

import {
  BinaryEvolutionTaskDetail,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

export const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-[rgba(114,128,154,0.15)] text-[#72809a]',
  running: 'bg-[rgba(79,115,255,0.15)] text-[#4f73ff]',
  succeeded: 'bg-[rgba(69,192,111,0.15)] text-[#45c06f]',
  failed: 'bg-[rgba(241,93,93,0.15)] text-[#f15d5d]',
  cancelled: 'bg-[rgba(114,128,154,0.15)] text-[#72809a]',
};

export const APPLY_STYLE: Record<string, string> = {
  pending: 'bg-[rgba(213,161,58,0.15)] text-[#d5a13a]',
  applied: 'bg-[rgba(69,192,111,0.15)] text-[#45c06f]',
  failed: 'bg-[rgba(241,93,93,0.15)] text-[#f15d5d]',
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

export const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className={`rounded-xl border p-5 ${tone || 'bg-theme-elevated border-[#1b2438] text-[#f5f7ff]'}`}
    style={tone ? undefined : { backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.ink }}>
    <div className="text-3xl font-semibold">{value}</div>
    <div className="mt-1 text-xs" style={{ color: LK.muted }}>{label}</div>
  </div>
);
