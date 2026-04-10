import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Eye, FileCode2, History, PauseCircle, PlayCircle, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfWorkflowDefinition, AiwfWorkflowDefinitionVersion } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, AiwfTabs, formatDateTime, prettyJson } from './AiwfShared';

const EMPTY_DEFINITION = `{
  "schema_version": "v1",
  "run": {
    "next_task_generator": {
      "agent_instance_id": "codex-worker",
      "system_prompt_ref": "next_task_generator_system",
      "user_prompt_ref": "next_task_generator_user",
      "allow_empty": true
    }
  },
  "prompts": {},
  "agent_types": [],
  "agent_instances": [],
  "plugins": [],
  "atomic_workflows": [],
  "composite_workflows": [],
  "root_workflow_id": ""
}`;

export const AiwfDefinitionsPage: React.FC<{
  projectId: string;
  initialTab?: 'list' | 'create' | 'versions';
  selectedDefinitionId?: string;
  onDefinitionSelected?: (definitionId: string) => void;
  onNavigateToTriggers?: (definitionId: string) => void;
}> = ({ projectId, initialTab = 'list', selectedDefinitionId, onDefinitionSelected, onNavigateToTriggers }) => {
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [definitions, setDefinitions] = useState<AiwfWorkflowDefinition[]>([]);
  const [versions, setVersions] = useState<AiwfWorkflowDefinitionVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(selectedDefinitionId || '');
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'manual',
    trigger_enabled: false,
    is_active: false,
    enabled: true,
    max_concurrency: 1,
    priority_default: 100,
    workspace_base_dir: '',
    execution_timeout_seconds: 7200,
    definition_json: EMPTY_DEFINITION,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (selectedDefinitionId) {
      setSelectedId(selectedDefinitionId);
    }
  }, [selectedDefinitionId]);

  useEffect(() => {
    if (projectId) {
      void loadDefinitions();
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'versions' && selectedId) {
      void loadVersions(selectedId);
    }
  }, [activeTab, selectedId]);

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.id === selectedId) || null,
    [definitions, selectedId]
  );

  const loadDefinitions = async () => {
    try {
      setLoading(true);
      const items = await api.aiAgentFramework.listDefinitions();
      setDefinitions(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载工作流定义失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (definitionId: string) => {
    try {
      setLoading(true);
      setVersions(await api.aiAgentFramework.listDefinitionVersions(definitionId));
    } catch (error: any) {
      notify(error.message || '加载版本列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const definition_json = JSON.parse(form.definition_json);
      await api.aiAgentFramework.createDefinition({
        name: form.name,
        description: form.description,
        project_id: projectId,
        definition_json,
        trigger_type: form.trigger_type,
        trigger_enabled: form.trigger_enabled,
        is_active: form.is_active,
        enabled: form.enabled,
        max_concurrency: form.max_concurrency,
        priority_default: form.priority_default,
        workspace_base_dir: form.workspace_base_dir || null,
        execution_timeout_seconds: form.execution_timeout_seconds,
      });
      notify('工作流定义已创建', 'success');
      setForm({ ...form, name: '', description: '' });
      setActiveTab('list');
      await loadDefinitions();
    } catch (error: any) {
      notify(error.message || '创建工作流定义失败', 'error');
    }
  };

  const handleToggleActive = async (definition: AiwfWorkflowDefinition) => {
    try {
      if (definition.is_active) {
        await api.aiAgentFramework.deactivateDefinition(definition.id);
      } else {
        await api.aiAgentFramework.activateDefinition(definition.id);
      }
      notify(definition.is_active ? '工作流定义已停用' : '工作流定义已启用', 'success');
      await loadDefinitions();
    } catch (error: any) {
      notify(error.message || '更新启停状态失败', 'error');
    }
  };

  const handleDelete = async (definition: AiwfWorkflowDefinition) => {
    const ok = await confirm({
      title: '删除工作流定义',
      message: `确认删除定义「${definition.name}」？此操作会删除版本快照记录。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.aiAgentFramework.deleteDefinition(definition.id);
      notify('工作流定义已删除', 'success');
      if (selectedId === definition.id) setSelectedId('');
      await loadDefinitions();
    } catch (error: any) {
      notify(error.message || '删除工作流定义失败', 'error');
    }
  };

  const handleCloneJson = async () => {
    if (!selectedDefinition) return;
    try {
      const detail = await api.aiAgentFramework.getDefinition(selectedDefinition.id);
      const payload = await api.aiAgentFramework.getDefinitionVersion(selectedDefinition.id, versions[0]?.version_no || 1).catch(() => null);
      setForm((prev) => ({
        ...prev,
        name: `${detail.name}-copy`,
        description: detail.description || '',
        trigger_type: detail.trigger_type,
        trigger_enabled: detail.trigger_enabled,
        is_active: false,
        enabled: detail.enabled,
        max_concurrency: detail.max_concurrency,
        priority_default: detail.priority_default,
        workspace_base_dir: detail.workspace_base_dir || '',
        execution_timeout_seconds: detail.execution_timeout_seconds,
        definition_json: prettyJson(payload?.definition_json || {}),
      }));
      setActiveTab('create');
      notify('已复制当前定义 JSON，可直接修改后创建', 'success');
    } catch (error: any) {
      notify(error.message || '复制定义失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流定义"
      description="管理多智能体工作流 definition JSON，配置触发方式、启停状态、并发上限和版本快照。"
      actions={
        <>
          <button onClick={() => void loadDefinitions()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setActiveTab('create')} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all">
            <Plus size={18} />
            新建定义
          </button>
        </>
      }
    >
      <AiwfTabs
        tabs={[
          { id: 'list', label: '定义列表' },
          { id: 'create', label: '新建定义' },
          { id: 'versions', label: '版本记录' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'list' | 'create' | 'versions')}
      />

      {activeTab === 'list' && (
        <AiwfCard className="overflow-hidden">
          {definitions.length === 0 ? (
            <AiwfEmpty title="暂无工作流定义" description="先创建一个 definition JSON，再触发任务执行。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4">名称</th>
                    <th className="px-6 py-4">根工作流</th>
                    <th className="px-6 py-4">触发</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">并发</th>
                    <th className="px-6 py-4">更新时间</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((definition) => (
                    <tr
                      key={definition.id}
                      className={`border-t border-slate-100 ${selectedId === definition.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedId(definition.id);
                            onDefinitionSelected?.(definition.id);
                          }}
                          className="text-left"
                        >
                          <div className="font-black text-slate-800">{definition.name}</div>
                          <div className="text-xs text-slate-500 mt-1">{definition.id}</div>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{definition.root_workflow_id}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {definition.trigger_type}
                        <span className={`ml-2 inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${definition.trigger_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {definition.trigger_enabled ? '已启用' : '未启用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${definition.is_active ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {definition.is_active ? '运行中' : '未激活'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{definition.max_concurrency}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(definition.updated_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => {
                            setSelectedId(definition.id);
                            setActiveTab('versions');
                            onDefinitionSelected?.(definition.id);
                          }} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50" title="查看版本">
                            <History size={16} />
                          </button>
                          <button onClick={() => void handleToggleActive(definition)} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50" title={definition.is_active ? '停用' : '启用'}>
                            {definition.is_active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                          </button>
                          <button onClick={() => onNavigateToTriggers?.(definition.id)} className="px-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
                            去触发
                          </button>
                          <button onClick={() => void handleDelete(definition)} className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100" title="删除">
                            <Trash2 size={16} />
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

      {activeTab === 'create' && (
        <AiwfCard className="p-8 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black tracking-widest uppercase text-slate-500">定义名称</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" placeholder="例如：漏洞流水线 v1" />
              </div>
              <div>
                <label className="text-xs font-black tracking-widest uppercase text-slate-500">描述</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 min-h-[110px]" placeholder="描述工作流用途和适用范围" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black tracking-widest uppercase text-slate-500">触发类型</label>
                  <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200">
                    <option value="manual">manual</option>
                    <option value="http">http</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black tracking-widest uppercase text-slate-500">最大并发</label>
                  <input type="number" min={1} value={form.max_concurrency} onChange={(e) => setForm({ ...form, max_concurrency: Number(e.target.value || 1) })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200">
                  <input type="checkbox" checked={form.trigger_enabled} onChange={(e) => setForm({ ...form, trigger_enabled: e.target.checked })} />
                  <span className="text-sm font-semibold text-slate-700">启用 HTTP Trigger</span>
                </label>
                <label className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                  <span className="text-sm font-semibold text-slate-700">定义可用</span>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black tracking-widest uppercase text-slate-500">Definition JSON</label>
                {selectedDefinition && (
                  <button onClick={() => void handleCloneJson()} className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700">
                    <Copy size={14} />
                    复制当前定义
                  </button>
                )}
              </div>
              <textarea
                value={form.definition_json}
                onChange={(e) => setForm({ ...form, definition_json: e.target.value })}
                className="w-full min-h-[420px] px-4 py-3 rounded-[1.5rem] border border-slate-200 font-mono text-xs leading-6"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => void handleCreate()} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800">
              <Save size={18} />
              创建定义
            </button>
          </div>
        </AiwfCard>
      )}

      {activeTab === 'versions' && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px,minmax(0,1fr)] gap-6">
          <AiwfCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileCode2 size={18} className="text-slate-500" />
              <h3 className="font-black text-slate-800">定义选择</h3>
            </div>
            <div className="space-y-2">
              {definitions.map((definition) => (
                <button
                  key={definition.id}
                  onClick={() => {
                    setSelectedId(definition.id);
                    onDefinitionSelected?.(definition.id);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${selectedId === definition.id ? 'bg-blue-50 border-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="font-bold text-slate-800">{definition.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{definition.id}</div>
                </button>
              ))}
            </div>
          </AiwfCard>

          <AiwfCard className="overflow-hidden">
            {!selectedId ? (
              <AiwfEmpty title="请选择工作流定义" description="选择左侧定义后查看版本快照和 JSON 内容。" />
            ) : versions.length === 0 ? (
              <AiwfEmpty title="暂无版本记录" description="当前定义还没有可展示的版本快照。" />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[360px,minmax(0,1fr)] min-h-[620px]">
                <div className="border-r border-slate-100">
                  {versions.map((version) => (
                    <div key={version.id} className="px-6 py-4 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-black text-slate-800">版本 #{version.version_no}</div>
                          <div className="text-xs text-slate-500 mt-1">{formatDateTime(version.created_at)}</div>
                        </div>
                        <button onClick={() => void navigator.clipboard.writeText(prettyJson(version.definition_json))} className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                          <Eye size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-6">
                  <pre className="w-full h-full min-h-[560px] whitespace-pre-wrap break-words rounded-[1.5rem] bg-slate-950 text-slate-100 p-5 text-xs leading-6 overflow-auto">
                    {prettyJson(versions[0]?.definition_json || {})}
                  </pre>
                </div>
              </div>
            )}
          </AiwfCard>
        </div>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
