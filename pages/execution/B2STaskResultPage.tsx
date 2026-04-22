import React, { useEffect, useMemo, useState } from 'react';
import { B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SCompactTable } from './B2SCompactTable';
import { B2SStatsHeader, B2SStats, emptyB2SStats, summarizeB2STasks } from './B2SStatsHeader';

interface Props {
  projectId: string;
}

export const B2STaskResultPage: React.FC<Props> = ({ projectId }) => {
  const executionApi = api.domains.execution;
  const [taskId, setTaskId] = useState('');
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [projectStats, setProjectStats] = useState<B2SStats>(emptyB2SStats());
  const [error, setError] = useState('');

  const loadProjectStats = async () => {
    if (!projectId) return;
    try {
      const data = await executionApi.binaryToSource.listTasks(projectId);
      setProjectStats(summarizeB2STasks(data.items || []));
    } catch (_e) {
      setProjectStats(emptyB2SStats());
    }
  };

  const loadTask = async () => {
    if (!projectId || !taskId.trim()) return;
    setError('');
    try {
      const data = await executionApi.binaryToSource.getTask(projectId, taskId.trim());
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || '查询失败');
      setDetail(null);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    void loadProjectStats();
    const timer = window.setInterval(() => {
      void loadTask();
      void loadProjectStats();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [projectId, taskId]);

  const currentStats = useMemo<B2SStats>(() => {
    if (!detail) return projectStats;
    return {
      taskCount: 1,
      totalItems: detail.total_items || 0,
      pendingItems: detail.pending_items || 0,
      queuedItems: detail.queued_items || 0,
      runningItems: detail.running_items || 0,
      successItems: detail.success_items || 0,
      partialItems: detail.partial_items || 0,
      failedItems: detail.failed_items || 0,
      cancelledItems: detail.cancelled_items || 0,
    };
  }, [detail, projectStats]);

  const rows = useMemo(() => (detail?.items || []).map((it) => [
    it.sequence_no,
    it.elf_path,
    it.status,
    it.failure_type || '-',
    it.error_reason || '-',
    (it.generated_files || []).join(', ') || '-',
  ]), [detail]);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-sm font-bold text-slate-800">代码逆向还原引擎 / 结果查询</h2>
      <B2SStatsHeader stats={currentStats} title={detail ? '当前任务统计' : '项目任务统计'} />
      <div className="flex gap-2">
        <input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="输入任务ID" className="flex-1 px-2 py-2 border rounded text-xs" />
        <button onClick={() => void loadTask()} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold">查询</button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <B2SCompactTable
        headers={['序号', 'ELF路径', '状态', '失败类型', '失败原因', '输出文件']}
        rows={rows}
      />
    </div>
  );
};
