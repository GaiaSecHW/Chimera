import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisCapabilitiesResponse, SystemAnalysisPromptTemplate } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

export const SystemAnalysisTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [capabilities, setCapabilities] = useState<SystemAnalysisCapabilitiesResponse | null>(null);
  const [prompts, setPrompts] = useState<SystemAnalysisPromptTemplate[]>([]);

  const [taskName, setTaskName] = useState(`系统分析任务-${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  const [analysisType, setAnalysisType] = useState('general_env_check');
  const [promptId, setPromptId] = useState('');
  const [promptContent, setPromptContent] = useState('请对当前测试环境进行自动化分析，重点关注服务健康、网络连通性、工具就绪度与风险暴露面。');
  const [selectedNodes, setSelectedNodes] = useState<Record<string, string>>({});

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [capResp, promptResp] = await Promise.all([
        api.systemAnalysis.getCapabilities(projectId),
        api.systemAnalysis.listPrompts({ page: 1, per_page: 200, is_enabled: true }),
      ]);
      setCapabilities(capResp);
      const promptItems = (promptResp.items || []) as SystemAnalysisPromptTemplate[];
      setPrompts(promptItems);
      const defaultPrompt = promptItems.find((p) => p.is_default) || promptItems[0];
      if (defaultPrompt) {
        setPromptId(defaultPrompt.prompt_id);
        setPromptContent(defaultPrompt.content || promptContent);
      }
    } catch (error: any) {
      notify(`加载分析任务配置失败: ${error?.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [projectId]);

  const candidateNodes = useMemo(() => (capabilities?.items || []).filter((n) => n.helper_installed && n.available_ai_agents.length > 0), [capabilities]);

  const handleCreateTask = async () => {
    const targets = Object.entries(selectedNodes)
      .filter(([, aiAgentId]) => aiAgentId)
      .map(([agent_key, ai_agent_id]) => ({ agent_key, ai_agent_id }));

    if (!taskName.trim()) {
      notify('任务名称不能为空', 'error');
      return;
    }
    if (!promptContent.trim()) {
      notify('Prompt 不能为空', 'error');
      return;
    }
    if (targets.length === 0) {
      notify('请至少为一个节点选择 AI Agent', 'error');
      return;
    }

    setCreating(true);
    try {
      const resp = await api.systemAnalysis.createTask({
        project_id: projectId,
        task_name: taskName.trim(),
        analysis_type: analysisType,
        prompt_template_id: promptId || undefined,
        prompt_content: promptContent.trim(),
        execution_config: { timeout_seconds: 600, max_concurrency: 5 },
        targets,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
    } catch (error: any) {
      notify(`任务创建失败: ${error?.message || error}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">选择多个节点，为每个节点指定一个 AI Agent，创建自动化系统分析任务。</p>
      </section>

      {loading ? <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><Loader2 size={15} className="animate-spin" />加载中...</div> : null}

      {!loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">节点与AI Agent</h2>
            <div className="mt-4 max-h-[720px] space-y-3 overflow-auto pr-1">
              {candidateNodes.map((node) => (
                <div key={node.agent_key} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-bold text-slate-900">{node.agent_hostname || node.agent_key}</div>
                  <div className="text-xs text-slate-500 mt-1">{node.agent_key} · {node.helper_service_name}</div>
                  <select
                    className="mt-3 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={selectedNodes[node.agent_key] || ''}
                    onChange={(e) => setSelectedNodes((prev) => ({ ...prev, [node.agent_key]: e.target.value }))}
                  >
                    <option value="">请选择 AI Agent</option>
                    {node.available_ai_agents.map((opt) => (
                      <option key={opt.agent_id} value={opt.agent_id}>{opt.agent_name} ({opt.agent_id})</option>
                    ))}
                  </select>
                </div>
              ))}
              {candidateNodes.length === 0 ? <div className="text-sm text-slate-500">当前项目没有可用于系统分析的节点。</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-black text-slate-900">任务配置</h2>

            <label className="block text-sm text-slate-600">
              任务名称
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={taskName} onChange={(e) => setTaskName(e.target.value)} />
            </label>

            <label className="block text-sm text-slate-600">
              分析类型
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={analysisType} onChange={(e) => setAnalysisType(e.target.value)}>
                <option value="general_env_check">general_env_check</option>
                <option value="service_dependency_check">service_dependency_check</option>
                <option value="tool_readiness_check">tool_readiness_check</option>
                <option value="network_connectivity_check">network_connectivity_check</option>
                <option value="custom">custom</option>
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Prompt 模板
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={promptId}
                onChange={(e) => {
                  const value = e.target.value;
                  setPromptId(value);
                  const selected = prompts.find((p) => p.prompt_id === value);
                  if (selected) setPromptContent(selected.content || '');
                }}
              >
                <option value="">不使用模板（手工输入）</option>
                {prompts.map((p) => (
                  <option key={p.prompt_id} value={p.prompt_id}>{p.name} (v{p.version})</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              分析 Prompt
              <textarea className="mt-1 min-h-[240px] w-full rounded-lg border border-slate-200 px-3 py-2" value={promptContent} onChange={(e) => setPromptContent(e.target.value)} />
            </label>

            <button
              onClick={() => void handleCreateTask()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : null}
              创建分析任务
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
};

