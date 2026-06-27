import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisTaskDetail, SystemAnalysisTaskItem, SystemAnalysisTaskNodeItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
} as const;

function formatDuration(createdAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!createdAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(createdAt).getTime()) / 1000);
  if (secs < 60) return`${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return`${m}m${s}s`;
}

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
    <div className="px-5 py-5 space-y-4" style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      {feedbackNodes}
      <section className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.primary }}>System Analysis</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: LK.ink }}>任务记录</h1>
          </div>
          <button onClick={() => void loadTasks()} className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:opacity-80" style={{ backgroundColor: LK.primary, color: '#ffffff' }}>刷新</button>
        </div>
      </section>

      {loading ? <div className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}><Loader2 size={15} className="animate-spin" />加载中...</div> : null}

      {!loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <h2 className="text-base font-semibold" style={{ color: LK.ink }}>任务列表</h2>
            <div className="mt-4 max-h-[760px] space-y-2 overflow-auto pr-1">
              {tasks.map((task) => (
                <button
                  key={task.task_id}
                  onClick={() => setSelectedTaskId(task.task_id)}
                  className={`w-full rounded-lg p-3 text-left ${selectedTaskId === task.task_id ? '' : ''}`}
                  style={{ backgroundColor: selectedTaskId === task.task_id ? LK.primaryMuted : LK.surfaceRaised, border: selectedTaskId === task.task_id ?`1px solid ${LK.primary}` :`1px solid ${LK.borderSoft}` }}
                >
                  <div className="text-sm font-medium truncate" style={{ color: LK.ink }}>{task.task_name}</div>
                  <div className="mt-1 text-xs" style={{ color: LK.muted }}>{task.task_id}</div>
                  <div className="mt-2 text-xs" style={{ color: LK.body }}>{task.status} · risk {task.risk_level} · {task.success_nodes}/{task.total_nodes} · 执行时间: {formatDuration(task.created_at, task.finished_at)}</div>
                </button>
              ))}
              {tasks.length === 0 ? <div className="text-sm" style={{ color: LK.muted }}>暂无任务记录</div> : null}
            </div>
          </section>

          <section className="rounded-lg p-4 space-y-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            {!selectedTask ? <div className="text-sm" style={{ color: LK.muted }}>请选择左侧任务查看详情。</div> : (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xl font-semibold" style={{ color: LK.ink }}>{selectedTask.task_name}</h2>
                    <div className="mt-1 text-xs" style={{ color: LK.muted }}>{selectedTask.task_id}</div>
                    <div className="mt-2 text-sm" style={{ color: LK.body }}>状态 {detail?.status || selectedTask.status} · 风险 {detail?.risk_level || selectedTask.risk_level}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:opacity-80" style={{ backgroundColor: LK.surface, borderColor: LK.border, color: LK.body }} onClick={() => selectedTaskId && void executionApi.systemAnalysis.rerunTask(selectedTaskId).then(() => { notify('已提交重跑任务', 'success'); void loadTasks(); })}>重跑</button>
                    <button className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80" style={{ backgroundColor: LK.surface, borderColor: LK.error, color: LK.error }} onClick={() => selectedTaskId && void executionApi.systemAnalysis.cancelTask(selectedTaskId).then(() => { notify('任务已取消', 'success'); void loadTasks(); void loadDetail(selectedTaskId); })}>取消</button>
                  </div>
                </div>

                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>{detail?.summary_json?.summary || '-'}</div>

                <div>
                  <h3 className="text-sm font-semibold" style={{ color: LK.ink }}>节点结果</h3>
                  <div className="mt-2 space-y-2">
                    {nodes.map((node) => (
                      <div key={node.agent_key} className="rounded-lg p-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                        <div className="text-sm font-medium" style={{ color: LK.ink }}>{node.agent_hostname || node.agent_key} · {node.ai_agent_id}</div>
                        <div className="mt-1 text-xs" style={{ color: LK.body }}>status {node.status} · risk {node.risk_level}</div>
                        <div className="mt-1 text-sm" style={{ color: LK.body }}>{node.result_summary || node.error_message || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold" style={{ color: LK.ink }}>报告摘要</h3>
                  <pre className="mt-2 max-h-[260px] overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>{report?.summary_markdown || '暂无报告'}</pre>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
};
