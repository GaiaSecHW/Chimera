import React, { useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, RotateCcw, Square, Workflow } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfTaskItem, AiwfTriggerTask, AiwfWorkflowDefinition } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, AiwfTabs, formatDateTime, prettyJson } from './AiwfShared';

const DEFAULT_TASKS_JSON = `[
  {
    "task_id": "task-001",
    "task_type": "package_list",
    "title": "样例输入任务",
    "task_md_path": "/workspace/input/task-001.md",
    "metadata": {},
    "upstream_refs": []
  }
]`;

export const AiwfTriggersPage: React.FC<{
  projectId: string;
  initialTab?: 'create' | 'list';
  selectedDefinitionId?: string;
  onNavigateToExecutionCenter?: () => void;
}> = ({ projectId, initialTab = 'create', selectedDefinitionId, onNavigateToExecutionCenter }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [definitions, setDefinitions] = useState<AiwfWorkflowDefinition[]>([]);
  const [triggers, setTriggers] = useState<AiwfTriggerTask[]>([]);
  const [selectedDefinitionIdState, setSelectedDefinitionIdState] = useState(selectedDefinitionId || '');
  const [priority, setPriority] = useState<string>('');
  const [tasksJson, setTasksJson] = useState(DEFAULT_TASKS_JSON);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (selectedDefinitionId) setSelectedDefinitionIdState(selectedDefinitionId);
  }, [selectedDefinitionId]);

  useEffect(() => {
    if (projectId) {
      void Promise.all([loadDefinitions(), loadTriggers()]);
    }
  }, [projectId]);

  const loadDefinitions = async () => {
    try {
      const items = await api.aiAgentFramework.listDefinitions();
      setDefinitions(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载定义失败', 'error');
    }
  };

  const loadTriggers = async () => {
    try {
      setLoading(true);
      const items = await api.aiAgentFramework.listTriggerTasks();
      setTriggers(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载触发任务失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.id === selectedDefinitionIdState) || null,
    [definitions, selectedDefinitionIdState]
  );

  const handleCreateTrigger = async () => {
    if (!selectedDefinitionIdState) {
      notify('请先选择一个工作流定义', 'warning');
      return;
    }
    try {
      const input_tasks = JSON.parse(tasksJson) as AiwfTaskItem[];
      await api.aiAgentFramework.createTriggerTask(selectedDefinitionIdState, {
        input_tasks,
        priority: priority.trim() ? Number(priority) : undefined,
      });
      notify('触发任务已创建', 'success');
      setActiveTab('list');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '创建触发任务失败', 'error');
    }
  };

  const handleCancelTrigger = async (triggerId: string) => {
    try {
      await api.aiAgentFramework.cancelTriggerTask(triggerId);
      notify('已提交取消请求', 'success');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '取消触发任务失败', 'error');
    }
  };

  const handleRetryTrigger = async (triggerId: string) => {
    try {
      await api.aiAgentFramework.retryTriggerTask(triggerId);
      notify('已基于当前触发任务创建重试任务', 'success');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '重试触发任务失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流触发任务"
      description="基于 definition 创建 trigger task，统一管理 pending、running、cancel_requested 和 retry 生命周期。"
      actions={
        <button onClick={() => void loadTriggers()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <AiwfTabs
        tabs={[
          { id: 'create', label: '触发任务' },
          { id: 'list', label: '任务列表' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'create' | 'list')}
      />

      {activeTab === 'create' && (
        <AiwfCard className="p-8 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black tracking-widest uppercase text-slate-500">目标工作流定义</label>
                <select
                  value={selectedDefinitionIdState}
                  onChange={(e) => setSelectedDefinitionIdState(e.target.value)}
                  className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200"
                >
                  <option value="">请选择</option>
                  {definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.name}
                    </option>
                  ))}
                </select>
                {selectedDefinition ? (
                  <p className="text-xs text-slate-500 mt-2">
                    根工作流：{selectedDefinition.root_workflow_id}，默认优先级：{selectedDefinition.priority_default}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务优先级</label>
                <input
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  placeholder="留空则使用 definition 默认优先级"
                  className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200"
                />
              </div>
              <div className="rounded-[1.5rem] bg-slate-50 p-5 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-700 font-black">
                  <Workflow size={16} />
                  触发说明
                </div>
                <ul className="mt-3 text-sm text-slate-600 space-y-2">
                  <li>输入载荷使用 `TaskItem[]`，和后端 `tasks.json` manifest 保持一致。</li>
                  <li>创建后会同步生成对应 execution，等待调度器抢占执行。</li>
                  <li>建议先在定义页启用 definition，再发起触发任务。</li>
                </ul>
              </div>
            </div>
            <div>
              <label className="text-xs font-black tracking-widest uppercase text-slate-500">输入任务 JSON</label>
              <textarea
                value={tasksJson}
                onChange={(e) => setTasksJson(e.target.value)}
                className="mt-2 w-full min-h-[360px] px-4 py-3 rounded-[1.5rem] border border-slate-200 font-mono text-xs leading-6"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => void handleCreateTrigger()} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800">
              <Play size={18} />
              创建触发任务
            </button>
          </div>
        </AiwfCard>
      )}

      {activeTab === 'list' && (
        <AiwfCard className="overflow-hidden">
          {triggers.length === 0 ? (
            <AiwfEmpty title="暂无触发任务" description="从上方创建 trigger task，或从定义页一键跳转过来发起执行。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4">任务 ID</th>
                    <th className="px-6 py-4">Definition</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">优先级</th>
                    <th className="px-6 py-4">提交时间</th>
                    <th className="px-6 py-4">消息</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.map((trigger) => (
                    <tr key={trigger.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800">{trigger.id}</div>
                        <div className="text-xs text-slate-500 mt-1">{trigger.trigger_type}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{trigger.workflow_definition_id}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {trigger.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{trigger.priority}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(trigger.created_at)}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-[280px] truncate">{trigger.message || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => onNavigateToExecutionCenter?.()} className="px-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
                            查看执行
                          </button>
                          <button onClick={() => void handleRetryTrigger(trigger.id)} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
                            <RotateCcw size={16} />
                          </button>
                          <button onClick={() => void handleCancelTrigger(trigger.id)} className="p-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100">
                            <Square size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AiwfCard>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
