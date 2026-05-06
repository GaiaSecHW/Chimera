import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Square } from 'lucide-react';

import { api } from '../../clients/api';
import { AiwfWorkflowExecution, AiwfWorkflowExecutionEvent } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, formatDateTime, prettyJson } from './AiwfShared';

type ExecutionTab = 'list' | 'events' | 'artifacts';

export const AiwfExecutionsPage: React.FC<{
  projectId: string;
  initialTab?: ExecutionTab;
  selectedExecutionId?: string;
}> = ({ projectId, initialTab = 'list', selectedExecutionId = '' }) => {
  const orchestrationApi = api.domains.orchestration;
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ExecutionTab>(initialTab);
  const [executions, setExecutions] = useState<AiwfWorkflowExecution[]>([]);
  const [activeExecutionId, setActiveExecutionId] = useState(selectedExecutionId);
  const [events, setEvents] = useState<AiwfWorkflowExecutionEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, any> | null>(null);

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (selectedExecutionId) setActiveExecutionId(selectedExecutionId);
  }, [selectedExecutionId]);

  const loadExecutions = async () => {
    try {
      setLoading(true);
      const items = await orchestrationApi.aiAgentFramework.listExecutions();
      const filtered = items.filter((item) => item.project_id === projectId);
      setExecutions(filtered);
      if (!activeExecutionId && filtered.length > 0) {
        setActiveExecutionId(filtered[0].id);
      }
    } catch (error: any) {
      notify(error.message || '加载执行列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadExecutionDetail = async (executionId: string, nextTab: ExecutionTab) => {
    if (!executionId) return;
    try {
      setLoading(true);
      if (nextTab === 'events') {
        setEvents(await orchestrationApi.aiAgentFramework.getExecutionEvents(executionId));
      }
      if (nextTab === 'artifacts') {
        setArtifacts(await orchestrationApi.aiAgentFramework.getExecutionArtifacts(executionId));
      }
    } catch (error: any) {
      notify(error.message || '加载执行详情失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) void loadExecutions();
  }, [projectId]);

  useEffect(() => {
    if (activeExecutionId && tab !== 'list') {
      void loadExecutionDetail(activeExecutionId, tab);
    }
  }, [activeExecutionId, tab]);

  const activeExecution = useMemo(
    () => executions.find((item) => item.id === activeExecutionId) || null,
    [executions, activeExecutionId],
  );

  const cancelExecution = async () => {
    if (!activeExecutionId) return;
    try {
      await orchestrationApi.aiAgentFramework.cancelExecution(activeExecutionId);
      notify('已发送 execution 取消请求', 'success');
      await loadExecutions();
    } catch (error: any) {
      notify(error.message || '取消 execution 失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流执行中心"
      description="查看当前项目下的执行记录、事件流和产物索引。"
      actions={
        <button onClick={() => void loadExecutions()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <AiwfCard className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-900">Executions</div>
          {executions.length === 0 ? (
            <AiwfEmpty title="暂无执行记录" description="触发工作流后，这里会显示 execution 列表。" />
          ) : (
            <div className="divide-y divide-slate-100">
              {executions.map((item) => (
                <button key={item.id} onClick={() => setActiveExecutionId(item.id)} className={`block w-full px-5 py-4 text-left transition hover:bg-slate-50 ${activeExecutionId === item.id ? 'bg-blue-50/70' : 'bg-white'}`}>
                  <div className="font-black text-slate-900">{item.id}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.workflow_definition_id}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{item.status}</span>
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </AiwfCard>

        <AiwfCard className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">{activeExecution?.id || '请选择执行记录'}</div>
                {activeExecution ? <div className="mt-1 text-xs text-slate-500">{activeExecution.workflow_definition_id}</div> : null}
              </div>
              {activeExecution ? (
                <button onClick={() => void cancelExecution()} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
                  <Square size={14} />
                  取消执行
                </button>
              ) : null}
            </div>
            <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
              {(['list', 'events', 'artifacts'] as ExecutionTab[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === item ? 'border border-slate-200 bg-slate-50 text-slate-900' : 'text-slate-600'}`}
                >
                  {item === 'list' ? '概览' : item === 'events' ? '事件' : '产物'}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {!activeExecution ? (
              <AiwfEmpty title="未选择执行记录" description="从左侧执行列表选择一条记录即可查看详情。" />
            ) : tab === 'list' ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">状态</div><div className="mt-1 text-sm font-black text-slate-900">{activeExecution.status}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">当前阶段</div><div className="mt-1 text-sm font-black text-slate-900">{activeExecution.current_stage_id || '-'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">工作目录</div><div className="mt-1 break-all text-sm font-black text-slate-900">{activeExecution.workspace_root || '-'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">产物数量</div><div className="mt-1 text-sm font-black text-slate-900">{activeExecution.output_task_count}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">开始时间</div><div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(activeExecution.started_at)}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] text-slate-500">完成时间</div><div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(activeExecution.finished_at)}</div></div>
              </div>
            ) : tab === 'events' ? (
              events.length === 0 ? (
                <AiwfEmpty title="暂无事件" description="当前 execution 尚未产生可展示的事件流。" />
              ) : (
                <div className="space-y-3">
                  {events.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-black text-slate-900">{item.event_type}</div>
                        <div className="text-xs text-slate-500">{formatDateTime(item.created_at)}</div>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{item.message}</div>
                      {item.payload_json ? <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-6 text-slate-100">{prettyJson(item.payload_json)}</pre> : null}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <pre className="min-h-[360px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{prettyJson(artifacts || {})}</pre>
            )}
          </div>
        </AiwfCard>
      </div>
      {loading ? <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> 加载中...</div> : null}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
