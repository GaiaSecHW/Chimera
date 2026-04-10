import React, { useEffect, useMemo, useState } from 'react';
import { CirclePlus, Play, RefreshCw, RotateCcw, Square, Trash2, Workflow } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfTriggerTask, AiwfTriggerTaskInput, AiwfWorkflowDefinition } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, AiwfTabs, formatDateTime } from './AiwfShared';

type MetadataEntry = {
  id: string;
  key: string;
  value: string;
};

type TaskDraft = {
  localId: string;
  task_id: string;
  task_type: string;
  title: string;
  task_markdown: string;
  upstream_refs: string;
  metadataEntries: MetadataEntry[];
};

const newMetadataEntry = (): MetadataEntry => ({
  id: `meta-${Math.random().toString(36).slice(2, 10)}`,
  key: '',
  value: '',
});

const newTaskDraft = (index: number): TaskDraft => ({
  localId: `draft-${Date.now()}-${index}`,
  task_id: '',
  task_type: '',
  title: '',
  task_markdown: '',
  upstream_refs: '',
  metadataEntries: [newMetadataEntry()],
});

const toMetadataObject = (entries: MetadataEntry[]) =>
  entries.reduce<Record<string, string>>((acc, entry) => {
    const key = entry.key.trim();
    if (key) acc[key] = entry.value;
    return acc;
  }, {});

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
  const [taskDrafts, setTaskDrafts] = useState<TaskDraft[]>([newTaskDraft(1)]);
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

  const updateTaskDraft = (localId: string, updater: (current: TaskDraft) => TaskDraft) => {
    setTaskDrafts((current) => current.map((item) => (item.localId === localId ? updater(item) : item)));
  };

  const addTaskDraft = () => {
    setTaskDrafts((current) => [...current, newTaskDraft(current.length + 1)]);
  };

  const removeTaskDraft = (localId: string) => {
    setTaskDrafts((current) => (current.length > 1 ? current.filter((item) => item.localId !== localId) : current));
  };

  const buildPayload = (): AiwfTriggerTaskInput[] | null => {
    const payload = taskDrafts.map((draft, index) => {
      if (!draft.task_type.trim()) {
        notify(`任务 ${index + 1} 缺少任务类型`, 'warning');
        return null;
      }
      if (!draft.title.trim()) {
        notify(`任务 ${index + 1} 缺少标题`, 'warning');
        return null;
      }
      if (!draft.task_markdown.trim()) {
        notify(`任务 ${index + 1} 缺少任务描述`, 'warning');
        return null;
      }
      return {
        task_id: draft.task_id.trim() || undefined,
        task_type: draft.task_type.trim(),
        title: draft.title.trim(),
        task_markdown: draft.task_markdown,
        metadata: toMetadataObject(draft.metadataEntries),
        upstream_refs: draft.upstream_refs
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      };
    });
    if (payload.some((item) => item === null)) return null;
    return payload as AiwfTriggerTaskInput[];
  };

  const handleCreateTrigger = async () => {
    if (!selectedDefinitionIdState) {
      notify('请先选择一个工作流定义', 'warning');
      return;
    }
    const input_tasks = buildPayload();
    if (!input_tasks) return;
    try {
      await api.aiAgentFramework.createTriggerTask(selectedDefinitionIdState, {
        input_tasks,
        priority: priority.trim() ? Number(priority) : undefined,
      });
      notify('触发任务已创建，任务输入会自动落盘到项目 AI_AGENT_FRAMEWORK 目录', 'success');
      setTaskDrafts([newTaskDraft(1)]);
      setPriority('');
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
      description="通过表单化方式组织任务内容、元数据和上下游引用。后端会自动创建项目级 AI_AGENT_FRAMEWORK 工作区，并为每个任务准备独立目录。"
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
        <div className="space-y-6">
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
              </div>
              <div className="rounded-[1.5rem] bg-slate-50 p-5 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-700 font-black">
                  <Workflow size={16} />
                  任务目录策略
                </div>
                <ul className="mt-3 text-sm text-slate-600 space-y-2">
                  <li>工作流和任务都绑定当前项目，不再依赖手工填写 markdown 文件路径。</li>
                  <li>服务会自动确保 fileserver 共享目录下存在 `AI_AGENT_FRAMEWORK` 子项目。</li>
                  <li>每个 trigger task 和每个输入任务都会生成独立目录，输入文件和执行工件统一落在那里。</li>
                </ul>
              </div>
            </div>
          </AiwfCard>

          <AiwfCard className="p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black tracking-widest uppercase text-slate-500">输入任务</div>
                <div className="text-sm text-slate-500 mt-2">逐条填写任务描述，系统会自动生成 `tasks.json` 和任务输入文件。</div>
              </div>
              <button onClick={addTaskDraft} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                <CirclePlus size={16} />
                新增任务
              </button>
            </div>

            <div className="space-y-6">
              {taskDrafts.map((draft, index) => (
                <div key={draft.localId} className="rounded-[1.5rem] border border-slate-200 p-6 bg-white space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black text-slate-800">任务 {index + 1}</div>
                    <button
                      onClick={() => removeTaskDraft(draft.localId)}
                      disabled={taskDrafts.length === 1}
                      className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务 ID</label>
                      <input
                        value={draft.task_id}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, task_id: e.target.value }))}
                        placeholder="可选，留空则自动生成"
                        className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务类型</label>
                      <input
                        value={draft.task_type}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, task_type: e.target.value }))}
                        placeholder="如 package_list / unpacked_path / suspicious_vuln"
                        className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务标题</label>
                      <input
                        value={draft.title}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, title: e.target.value }))}
                        placeholder="如 待分析固件包"
                        className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务描述 Markdown</label>
                    <textarea
                      value={draft.task_markdown}
                      onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, task_markdown: e.target.value }))}
                      className="mt-2 w-full min-h-[220px] px-4 py-3 rounded-[1.5rem] border border-slate-200 text-sm leading-6"
                      placeholder={'# 任务说明\n\n- 输入对象\n- 目标范围\n- 约束条件'}
                      spellCheck={false}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">上游任务引用</label>
                      <textarea
                        value={draft.upstream_refs}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, upstream_refs: e.target.value }))}
                        className="mt-2 w-full min-h-[120px] px-4 py-3 rounded-[1.5rem] border border-slate-200 text-sm leading-6"
                        placeholder={'每行一个上游 task_id\n如:\npackage-001\nanalysis-002'}
                        spellCheck={false}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务元数据</label>
                      <div className="mt-2 space-y-3">
                        {draft.metadataEntries.map((entry) => (
                          <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <input
                              value={entry.key}
                              onChange={(e) =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.map((item) => item.id === entry.id ? { ...item, key: e.target.value } : item),
                                }))
                              }
                              placeholder="键"
                              className="px-4 py-3 rounded-2xl border border-slate-200"
                            />
                            <input
                              value={entry.value}
                              onChange={(e) =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.map((item) => item.id === entry.id ? { ...item, value: e.target.value } : item),
                                }))
                              }
                              placeholder="值"
                              className="px-4 py-3 rounded-2xl border border-slate-200"
                            />
                            <button
                              onClick={() =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.length > 1
                                    ? current.metadataEntries.filter((item) => item.id !== entry.id)
                                    : current.metadataEntries,
                                }))
                              }
                              className="px-3 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            updateTaskDraft(draft.localId, (current) => ({
                              ...current,
                              metadataEntries: [...current.metadataEntries, newMetadataEntry()],
                            }))
                          }
                          className="px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                        >
                          添加元数据
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button onClick={() => void handleCreateTrigger()} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                <Play size={18} />
                创建触发任务
              </button>
            </div>
          </AiwfCard>
        </div>
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
