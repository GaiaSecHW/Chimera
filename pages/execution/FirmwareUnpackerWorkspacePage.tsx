import React, { useEffect, useState } from 'react';
import { ListTodo, Package, Settings2 } from 'lucide-react';

import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { FirmwareUnpackerPage } from './FirmwareUnpackerPage';
import { PageHeader } from '../../design-system';

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

interface Props {
  projectId: string;
  initialTab?: 'tasks' | 'config';
}

const TABS: Array<{
  key: 'tasks' | 'config';
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'tasks',
    label: '任务列表',
    desc: '查询、创建、停止、删除、重试固件解包任务',
    icon: <ListTodo size={14} />,
  },
  {
    key: 'config',
    label: '固件解包配置',
    desc: '查看集群实例、并发配置和运行参数',
    icon: <Settings2 size={14} />,
  },
];

export const FirmwareUnpackerWorkspacePage: React.FC<Props> = ({
  projectId,
  initialTab = 'tasks',
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'config'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, projectId]);

  return (
    <div className="space-y-0" style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      <PageHeader title="固件解包" description="统一任务控制台 · 动态配置 · K8S 多实例同步" />
      <div className="px-4 pt-4">
        <div
 className="rounded-2xl border p-4"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >

          <div className="grid gap-2 sm:grid-cols-2">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="rounded-2xl border px-4 py-3 text-left transition"
                  style={
                    active
                      ? { backgroundColor: LK.primaryMuted, border: `1px solid ${LK.primary}`, color: LK.primary }
                      : { backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }
                  }
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = LK.borderSoft;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = LK.border;
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                      style={
                        active
                          ? { backgroundColor: LK.primary, color: '#ffffff' }
                          : { backgroundColor: LK.surface, color: LK.muted }
                      }
                    >
                      {tab.icon}
                    </span>
                    <span className={`text-sm font-semibold ${active ? '' : ''}`} style={{ color: active ? LK.primary : LK.ink }}>
                      {tab.label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: active ? LK.primarySoft : LK.muted }}>{tab.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'tasks' ? (
        <FirmwareUnpackerPage projectId={projectId} />
      ) : (
        <FirmwareUnpackConfigPage projectId={projectId} />
      )}
    </div>
  );
};
