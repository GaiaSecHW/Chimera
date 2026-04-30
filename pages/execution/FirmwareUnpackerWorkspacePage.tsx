import React, { useEffect, useState } from 'react';
import { ListTodo, Package, Settings2 } from 'lucide-react';

import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { FirmwareUnpackerPage } from './FirmwareUnpackerPage';

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
    <div className="space-y-0">
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-800">固件解包</h2>
              <p className="text-xs text-slate-400">统一任务控制台 · 动态配置 · K8S 多实例同步</p>
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
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                        active ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      {tab.icon}
                    </span>
                    <span className={`text-sm font-bold ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                      {tab.label}
                    </span>
                  </div>
                  <p className={`text-xs ${active ? 'text-blue-600' : 'text-slate-500'}`}>{tab.desc}</p>
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
