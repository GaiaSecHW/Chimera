import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Clock3, RefreshCw, Square, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfExecution, AiwfExecutionEvent } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, AiwfTabs, formatDateTime, prettyJson } from './AiwfShared';

export const AiwfExecutionsPage: React.FC<{
  projectId: string;
  initialTab?: 'list' | 'events' | 'artifacts';
  selectedExecutionId?: string;
}> = ({ projectId, initialTab = 'list', selectedExecutionId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [executions, setExecutions] = useState<AiwfExecution[]>([]);
  const [events, setEvents] = useState<AiwfExecutionEvent[]>([]);
  const [artifacts, setArtifacts] = useState<{ workspace_root?: string | null; output_manifest_path?: string | null; files: Array<{ path: string; size: number }> }>({ files: [] });
  const [selectedId, setSelectedId] = useState(selectedExecutionId || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (selectedExecutionId) setSelectedId(selectedExecutionId);
  }, [selectedExecutionId]);

  useEffect(() => {
    if (projectId) {
      void loadExecutions();
    }
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    if (activeTab === 'events') {
      void loadEvents(selectedId);
    } else if (activeTab === 'artifacts') {
      void loadArtifacts(selectedId);
    }
  }, [selectedId, activeTab]);

  const loadExecutions = async () => {
    try {
      setLoading(true);
      const items = await api.aiAgentFramework.listExecutions();
      setExecutions(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载执行列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (executionId: string) => {
    try {
      setLoading(true);
      setEvents(await api.aiAgentFramework.listExecutionEvents(executionId));
    } catch (error: any) {
      notify(error.message || '加载执行事件失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadArtifacts = async (executionId: string) => {
    try {
      setLoading(true);
      setArtifacts(await api.aiAgentFramework.getExecutionArtifacts(executionId));
    } catch (error: any) {
      notify(error.message || '加载执行工件失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedExecution = useMemo(
    () => executions.find((item) => item.id === selectedId) || null,
    [executions, selectedId]
  );

  const handleCancelExecution = async (executionId: string) => {
    try {
      await api.aiAgentFramework.cancelExecution(executionId);
      notify('已提交 execution 取消请求', 'success');
      await loadExecutions();
      if (selectedId === executionId && activeTab === 'events') {
        await loadEvents(executionId);
      }
    } catch (error: any) {
      notify(error.message || '取消 execution 失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流执行中心"
      description="查看 execution 状态、事件流和工件目录，跟踪 owner pod、阶段切换、评审回环和产物输出。"
      actions={
        <button onClick={() => void loadExecutions()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <AiwfTabs
        tabs={[
          { id: 'list', label: '执行列表' },
          { id: 'events', label: '执行事件' },
          { id: 'artifacts', label: '执行工件' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'list' | 'events' | 'artifacts')}
      />

      {activeTab === 'list' && (
        <AiwfCard className="overflow-hidden">
          {executions.length === 0 ? (
            <AiwfEmpty title="暂无执行记录" description="创建 trigger task 后，调度器抢占成功就会生成运行中的 execution。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4">Execution</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">当前阶段</th>
                    <th className="px-6 py-4">Owner Pod</th>
                    <th className="px-6 py-4">输出</th>
                    <th className="px-6 py-4">开始时间</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((execution) => (
                    <tr
                      key={execution.id}
                      className={`border-t border-slate-100 ${selectedId === execution.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-6 py-4">
                        <button onClick={() => setSelectedId(execution.id)} className="text-left">
                          <div className="font-black text-slate-800">{execution.id}</div>
                          <div className="text-xs text-slate-500 mt-1">trigger: {execution.trigger_task_id}</div>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {execution.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{execution.current_stage_id || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{execution.owner_pod_id || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{execution.output_task_count}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(execution.started_at || execution.created_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setSelectedId(execution.id); setActiveTab('events'); }} className="px-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
                            事件
                          </button>
                          <button onClick={() => { setSelectedId(execution.id); setActiveTab('artifacts'); }} className="px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold hover:bg-slate-50">
                            工件
                          </button>
                          <button onClick={() => void handleCancelExecution(execution.id)} className="p-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100">
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

      {activeTab !== 'list' && !selectedExecution && (
        <AiwfCard>
          <AiwfEmpty title="请先选择一个 execution" description="在执行列表中选中记录后，再查看事件流或工件目录。" />
        </AiwfCard>
      )}

      {activeTab === 'events' && selectedExecution && (
        <div className="grid grid-cols-1 xl:grid-cols-[340px,minmax(0,1fr)] gap-6">
          <AiwfCard className="p-6 space-y-4">
            <div>
              <div className="text-xs font-black tracking-widest uppercase text-slate-500">执行摘要</div>
              <div className="mt-2 font-black text-slate-800 break-all">{selectedExecution.id}</div>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Zap size={14} /> 状态：{selectedExecution.status}</div>
              <div className="flex items-center gap-2"><Boxes size={14} /> 当前阶段：{selectedExecution.current_stage_id || '-'}</div>
              <div className="flex items-center gap-2"><Clock3 size={14} /> Owner：{selectedExecution.owner_pod_id || '-'}</div>
            </div>
          </AiwfCard>
          <AiwfCard className="p-6 space-y-4">
            {events.length === 0 ? (
              <AiwfEmpty title="暂无事件" description="当前 execution 还没有事件输出，或尚未进入运行阶段。" />
            ) : (
              events.map((event) => (
                <div key={event.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-black text-slate-800">{event.event_type}</div>
                      <div className="text-xs text-slate-500 mt-1">{formatDateTime(event.created_at)}</div>
                    </div>
                    <span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                      {event.level}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-3">{event.message}</p>
                  {event.payload_json && Object.keys(event.payload_json).length > 0 ? (
                    <pre className="mt-3 rounded-2xl bg-slate-950 text-slate-100 p-4 text-xs whitespace-pre-wrap break-words">
                      {prettyJson(event.payload_json)}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </AiwfCard>
        </div>
      )}

      {activeTab === 'artifacts' && selectedExecution && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px,minmax(0,1fr)] gap-6">
          <AiwfCard className="p-6 space-y-4">
            <div>
              <div className="text-xs font-black tracking-widest uppercase text-slate-500">工件摘要</div>
              <div className="mt-2 text-sm text-slate-600 break-all">workspace: {artifacts.workspace_root || '-'}</div>
            </div>
            <div className="text-sm text-slate-600 break-all">output manifest: {artifacts.output_manifest_path || '-'}</div>
            <div className="text-sm text-slate-600">文件数：{artifacts.files.length}</div>
          </AiwfCard>
          <AiwfCard className="p-6">
            {artifacts.files.length === 0 ? (
              <AiwfEmpty title="暂无工件文件" description="当前 execution 还没有落盘产物，或工件目录为空。" />
            ) : (
              <div className="space-y-3">
                {artifacts.files.map((file) => (
                  <div key={file.path} className="rounded-[1.25rem] border border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{file.path}</div>
                      <div className="text-xs text-slate-500 mt-1">{file.size} bytes</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AiwfCard>
        </div>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
