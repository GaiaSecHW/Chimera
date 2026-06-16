import React, { useEffect, useState } from 'react';
import { ListTodo, Package, Settings2 } from 'lucide-react';

import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { FirmwareUnpackerPage } from './FirmwareUnpackerPage';

const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
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
      <div className="px-4 pt-4">
        <div
          className="rounded-2xl border p-4 shadow-sm"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} style={{ color: LK.primary }} />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: LK.ink }}>固件解包</h2>
              <p className="text-xs" style={{ color: LK.muted }}>统一任务控制台 · 动态配置 · K8S 多实例同步</p>
            </div>
          </div>

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
