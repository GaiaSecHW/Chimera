import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisTaskDetail, SystemAnalysisTaskItem, SystemAnalysisTaskNodeItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

export const SystemAnalysisHistoryPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution;
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<SystemAnalysisTaskItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<SystemAnalysisTaskDetail | null>(null);
  const [nodes, setNodes] = useState<SystemAnalysisTaskNodeItem[]>([]);
  const [report, setReport] = useState<any>(null);

  const loadTasks = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await executionApi.systemAnalysis.listTasks({ project_id: projectId, page: 1, per_page: 50 });
      const taskItems = resp.items || [];
      setTasks(taskItems);
      if (!selectedTaskId && taskItems.length > 0) {
        setSelectedTaskId(taskItems[0].task_id);
      }
    } catch (error: any) {
      notify(`加载任务记录失败: ${error?.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (taskId: string) => {
    if (!taskId) return;
    try {
      const [d, n, r] = await Promise.all([
        executionApi.systemAnalysis.getTask(taskId),
        executionApi.systemAnalysis.getTaskNodes(taskId),
        executionApi.systemAnalysis.getTaskReport(taskId).catch(() => null),
      ]);
      setDetail(d);
      setNodes(n.items || []);
      setReport(r);
    } catch (error: any) {
      notify(`加载任务详情失败: ${error?.message || error}`, 'error');
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  useEffect(() => {
    if (selectedTaskId) void loadDetail(selectedTaskId);
  }, [selectedTaskId]);

  const selectedTask = useMemo(() => tasks.find((t) => t.task_id === selectedTaskId), [tasks, selectedTaskId]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">任务记录</h1>
          </div>
          <button onClick={() => void loadTasks()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">刷新</button>
        </div>
      </section>

      {loading ? <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><Loader2 size={15} className="animate-spin" />加载中...</div> : null}

      {!loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">任务列表</h2>
            <div className="mt-4 max-h-[760px] space-y-3 overflow-auto pr-1">
              {tasks.map((task) => (
                <button
                  key={task.task_id}
                  onClick={() => setSelectedTaskId(task.task_id)}
                  className={`w-full rounded-xl border p-3 text-left ${selectedTaskId === task.task_id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
                >
                  <div className="text-sm font-bold text-slate-900 truncate">{task.task_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{task.task_id}</div>
                  <div className="mt-2 text-xs text-slate-600">{task.status} · risk {task.risk_level} · {task.success_nodes}/{task.total_nodes}</div>
                </button>
              ))}
              {tasks.length === 0 ? <div className="text-sm text-slate-500">暂无任务记录</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            {!selectedTask ? <div className="text-sm text-slate-500">请选择左侧任务查看详情。</div> : (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{selectedTask.task_name}</h2>
                    <div className="mt-1 text-xs text-slate-500">{selectedTask.task_id}</div>
                    <div className="mt-2 text-sm text-slate-600">状态 {detail?.status || selectedTask.status} · 风险 {detail?.risk_level || selectedTask.risk_level}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => selectedTaskId && void executionApi.systemAnalysis.rerunTask(selectedTaskId).then(() => { notify('已提交重跑任务', 'success'); void loadTasks(); })}>重跑</button>
                    <button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600" onClick={() => selectedTaskId && void executionApi.systemAnalysis.cancelTask(selectedTaskId).then(() => { notify('任务已取消', 'success'); void loadTasks(); void loadDetail(selectedTaskId); })}>取消</button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">{detail?.summary_json?.summary || '-'}</div>

                <div>
                  <h3 className="text-sm font-black text-slate-900">节点结果</h3>
                  <div className="mt-2 space-y-2">
                    {nodes.map((node) => (
                      <div key={node.agent_key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-sm font-semibold text-slate-900">{node.agent_hostname || node.agent_key} · {node.ai_agent_id}</div>
                        <div className="mt-1 text-xs text-slate-600">status {node.status} · risk {node.risk_level}</div>
                        <div className="mt-1 text-sm text-slate-700">{node.result_summary || node.error_message || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-900">报告摘要</h3>
                  <pre className="mt-2 max-h-[260px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">{report?.summary_markdown || '暂无报告'}</pre>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
};
