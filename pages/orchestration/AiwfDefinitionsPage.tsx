import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Eye, FileCode2, PauseCircle, PlayCircle, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfWorkflowDefinition, AiwfWorkflowDefinitionVersion } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, formatDateTime, prettyJson } from './AiwfShared';
import { AiwfWorkflowGraphPreview } from './AiwfWorkflowGraphPreview';

const EMPTY_DEFINITION = `{
  "version": "1.0",
  "global": {
    "workspace_root": "/workspace",
    "log_level": "INFO",
    "max_workflow_retry": 2,
    "max_review_cycles": 3,
    "default_context_reset": false,
    "parallel_result_review": true,
    "env_vars": {}
  },
  "agents": [],
  "plugins": [],
  "workflows": {
    "atomic": [
      {
        "id": "sample_atomic",
        "name": "Sample Atomic Workflow",
        "type": "atomic",
        "description": "",
        "input_task_type": "atomic:sample_atomic:input",
        "output_task_type": "atomic:sample_atomic:output",
        "working_dir_template": "sample_atomic_{task_id}",
        "start_plugins": [],
        "end_plugins": [],
        "engine": {
          "max_review_cycles": 2,
          "max_worker_turns_per_cycle": 5
        },
        "roles": {
          "worker": {
            "agent_id": "",
            "new_session": true,
            "reset_context_override": null,
            "prompts": {
              "work": {
                "system_prompt_file": "prompts/worker_system.md",
                "user_prompt_file": "prompts/worker_user.md"
              },
              "reflection": [],
              "summary": {
                "prompt_file": "prompts/summary.md",
                "output_summary_filename": "summary.md",
                "output_results_dir": "results"
              }
            }
          },
          "advisors": {
            "global_review": [],
            "result_review": []
          }
        }
      }
    ],
    "composite": [
      {
        "id": "sample_pipeline",
        "name": "Sample Pipeline",
        "type": "composite",
        "description": "",
        "working_dir_template": "sample_pipeline_{execution_id}",
        "stages": [
          {
            "stage_id": "stage_01",
            "name": "Stage 01",
            "sequence": 1,
            "workflow_ref": "sample_atomic",
            "workflow_type": "atomic",
            "on_error": "skip_task",
            "description": ""
          }
        ]
      }
    ]
  },
  "execution": {
    "entry_workflow": "sample_pipeline",
    "entry_workflow_type": "composite",
    "input_task": {
      "task_file": "input/task.md",
      "task_id": "sample-task"
    },
    "output_dir": "output",
    "execution_id": "sample-run",
    "runtime_mode": "rest_service",
    "on_completion": {
      "exit_code_on_success": 0,
      "exit_code_on_failure": 1,
      "write_summary": true,
      "summary_file": "output/execution_summary.json"
    }
  }
}`;

export const AiwfDefinitionsPage: React.FC<{
  projectId: string;
  selectedDefinitionId?: string;
  onDefinitionSelected?: (definitionId: string) => void;
  onNavigateToTriggers?: (definitionId: string) => void;
}> = ({ projectId, selectedDefinitionId, onDefinitionSelected, onNavigateToTriggers }) => {
  const orchestrationApi = api.domains.orchestration;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [definitions, setDefinitions] = useState<AiwfWorkflowDefinition[]>([]);
  const [versions, setVersions] = useState<AiwfWorkflowDefinitionVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(selectedDefinitionId || '');
  const [selectedVersionNo, setSelectedVersionNo] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'json'>('overview');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTab, setCreateTab] = useState<'basic' | 'json'>('basic');
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
    if (selectedId) {
      void loadVersions(selectedId);
      setDetailTab('overview');
    } else {
      setVersions([]);
      setSelectedVersionNo(null);
    }
  }, [selectedId]);

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.id === selectedId) || null,
    [definitions, selectedId]
  );

  const loadDefinitions = async () => {
    try {
      setLoading(true);
      const items = await orchestrationApi.aiAgentFramework.listDefinitions();
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
      const items = await orchestrationApi.aiAgentFramework.listDefinitionVersions(definitionId);
      setVersions(items);
      setSelectedVersionNo(items.length > 0 ? items[0].version_no : null);
    } catch (error: any) {
      notify(error.message || '加载版本列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const definition_json = JSON.parse(form.definition_json);
      await orchestrationApi.aiAgentFramework.createDefinition({
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
      setCreateDialogOpen(false);
      setCreateTab('basic');
      await loadDefinitions();
    } catch (error: any) {
      notify(error.message || '创建工作流定义失败', 'error');
    }
  };

  const handleToggleActive = async (definition: AiwfWorkflowDefinition) => {
    try {
      if (definition.is_active) {
        await orchestrationApi.aiAgentFramework.deactivateDefinition(definition.id);
      } else {
        await orchestrationApi.aiAgentFramework.activateDefinition(definition.id);
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
      await orchestrationApi.aiAgentFramework.deleteDefinition(definition.id);
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
      const detail = await orchestrationApi.aiAgentFramework.getDefinition(selectedDefinition.id);
      const payload = await orchestrationApi.aiAgentFramework.getDefinitionVersion(selectedDefinition.id, versions[0]?.version_no || 1).catch(() => null);
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
      setCreateDialogOpen(true);
      setCreateTab('json');
      notify('已复制当前定义 JSON，可直接修改后创建', 'success');
    } catch (error: any) {
      notify(error.message || '复制定义失败', 'error');
    }
  };

  const selectedVersion = useMemo(() => {
    if (versions.length === 0) return null;
    if (selectedVersionNo === null) return versions[0];
    return versions.find((item) => item.version_no === selectedVersionNo) || versions[0];
  }, [versions, selectedVersionNo]);

  return (
    <AiwfPageShell
      title="AI工作流定义"
      description=""
      actions={
        <>
          <button onClick={() => void loadDefinitions()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setCreateDialogOpen(true); setCreateTab('basic'); }} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all">
            <Plus size={18} />
            新建定义
          </button>
        </>
      }
    >
      {!selectedDefinition ? (
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
                    <th className="px-6 py-4">入口/终态类型</th>
                    <th className="px-6 py-4">触发</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">更新时间</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((definition) => (
                    <tr key={definition.id} className="border-t border-slate-100 hover:bg-slate-50">
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
                      <td className="px-6 py-4 text-xs text-slate-600">
                        <div>入口: {definition.entry_input_task_type}</div>
                        <div className="mt-1">终态: {definition.final_output_task_type}</div>
                      </td>
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
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(definition.updated_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
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
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => {
              setSelectedId('');
              onDefinitionSelected?.('');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
          >
            <ArrowLeft size={16} />
            返回工作流列表
          </button>
          <AiwfCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-black text-slate-900">{selectedDefinition.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{selectedDefinition.id}</div>
                </div>
                <button onClick={() => void handleCloneJson()} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-blue-700 hover:bg-blue-50">
                  <Copy size={13} />
                  复制为新定义
                </button>
              </div>
            </div>
            <div className="px-5 pt-4">
              <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                <button
                  onClick={() => setDetailTab('overview')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${detailTab === 'overview' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600'}`}
                >
                  概览与流程图
                </button>
                <button
                  onClick={() => setDetailTab('json')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${detailTab === 'json' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600'}`}
                >
                  JSON 文件
                </button>
              </div>
            </div>
            <div className="p-5">
              {detailTab === 'overview' ? (
                <div className="space-y-4">
                  <AiwfCard className="p-3">
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">根工作流</div>
                        <div className="text-xs font-bold text-slate-800 mt-1 break-all">{selectedDefinition.root_workflow_id}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">入口类型</div>
                        <div className="text-xs font-bold text-slate-800 mt-1 break-all">{selectedDefinition.entry_input_task_type}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">终态类型</div>
                        <div className="text-xs font-bold text-slate-800 mt-1 break-all">{selectedDefinition.final_output_task_type}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-500">最大并发</div>
                        <div className="text-xs font-bold text-slate-800 mt-1">{selectedDefinition.max_concurrency}</div>
                      </div>
                    </div>
                  </AiwfCard>

                  <AiwfCard className="p-3">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {versions.length === 0 ? (
                        <div className="text-xs text-slate-500">暂无版本</div>
                      ) : (
                        versions.map((version) => (
                          <button
                            key={version.id}
                            onClick={() => setSelectedVersionNo(version.version_no)}
                            className={`shrink-0 text-left px-3 py-2 rounded-xl border ${selectedVersionNo === version.version_no ? 'bg-blue-50 border-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}
                          >
                            <div className="font-bold text-slate-800 text-sm">v{version.version_no}</div>
                            <div className="text-[11px] text-slate-500 mt-1">{formatDateTime(version.created_at)}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </AiwfCard>

                  <AiwfWorkflowGraphPreview definitionJson={selectedVersion?.definition_json || null} />
                </div>
              ) : (
                <div>
                  <div className="flex justify-end mb-2">
                    {selectedVersion && (
                      <button onClick={() => void navigator.clipboard.writeText(prettyJson(selectedVersion.definition_json))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200" title="复制 JSON">
                        <Eye size={16} />
                      </button>
                    )}
                  </div>
                  <pre className="w-full min-h-[680px] whitespace-pre-wrap break-words rounded-[1rem] bg-slate-950 text-slate-100 p-4 text-xs leading-6 overflow-auto">
                    {prettyJson(selectedVersion?.definition_json || {})}
                  </pre>
                </div>
              )}
            </div>
          </AiwfCard>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="font-black text-slate-800">新建工作流定义</div>
              <button
                onClick={() => setCreateDialogOpen(false)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 pt-4">
              <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                <button
                  onClick={() => setCreateTab('basic')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${createTab === 'basic' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600'}`}
                >
                  基础配置
                </button>
                <button
                  onClick={() => setCreateTab('json')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${createTab === 'json' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600'}`}
                >
                  Definition JSON
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              {createTab === 'basic' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">定义名称</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" placeholder="例如：漏洞流水线 v1" />
                  </div>
                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">描述</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" placeholder="描述工作流用途和适用范围" />
                  </div>
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
                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">默认优先级</label>
                    <input type="number" value={form.priority_default} onChange={(e) => setForm({ ...form, priority_default: Number(e.target.value || 100) })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" />
                  </div>
                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">超时时间(秒)</label>
                    <input type="number" min={60} value={form.execution_timeout_seconds} onChange={(e) => setForm({ ...form, execution_timeout_seconds: Number(e.target.value || 7200) })} className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200" />
                  </div>
                  <label className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200">
                    <input type="checkbox" checked={form.trigger_enabled} onChange={(e) => setForm({ ...form, trigger_enabled: e.target.checked })} />
                    <span className="text-sm font-semibold text-slate-700">启用 HTTP Trigger</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    <span className="text-sm font-semibold text-slate-700">定义可用</span>
                  </label>
                </div>
              ) : (
                <textarea
                  value={form.definition_json}
                  onChange={(e) => setForm({ ...form, definition_json: e.target.value })}
                  className="w-full min-h-[460px] px-4 py-3 rounded-[1.2rem] border border-slate-200 font-mono text-xs leading-6"
                  spellCheck={false}
                />
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => void handleCreate()} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                <Save size={16} />
                创建定义
              </button>
            </div>
          </div>
        </div>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
