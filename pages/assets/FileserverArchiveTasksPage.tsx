import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '../../clients/api';

const assetApi = api.domains.assets;

interface Props {
  projectId: string;
}

const fmt = (value?: string | null) => {
  if (!value) return '--';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

export const FileserverArchiveTasksPage: React.FC<Props> = ({ projectId }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string>('');
  const [focusTaskId, setFocusTaskId] = useState<string>('');

  const loadTasks = async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await assetApi.fileserver.listArchiveTasks(projectId, 300);
      setTasks(items || []);
    } catch (err: any) {
      setError(err?.message || '加载打包任务失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    const focus = sessionStorage.getItem('chimera:archiveTaskFocus');
    if (focus) {
      sessionStorage.removeItem('chimera:archiveTaskFocus');
      setFocusTaskId(focus);
    }
  }, []);

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.accepted_at || 0).getTime() - new Date(a.accepted_at || 0).getTime()),
    [tasks],
  );

  const handleDownload = async (task: any) => {
    setBusyTaskId(task.task_id);
    try {
      const blob = await assetApi.fileserver.fetchArchiveTaskDownloadBlob(task.task_id);
      const filename = task?.result?.archive_name ||`${task.task_id}.zip`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || '下载失败');
    } finally {
      setBusyTaskId('');
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="rounded-3xl border border-theme-border bg-theme-elevated p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="mt-1 text-2xl font-black text-theme-text-primary">打包下载任务</h2>
              <div className="mt-1 text-xs text-theme-text-muted">项目: {projectId || '未选择'}</div>
            </div>
            <button
              type="button"
              onClick={() => void loadTasks()}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-black text-theme-text-secondary"
            >
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div> : null}

        <div className="overflow-hidden rounded-3xl border border-theme-border bg-theme-elevated shadow-panel">
          <div className="grid grid-cols-[1.7fr_1fr_0.8fr_0.7fr_0.8fr_1fr_1fr_0.9fr] gap-3 border-b border-theme-border bg-theme-elevated px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">
            <div>任务ID</div>
            <div>提交时间</div>
            <div>状态</div>
            <div>文件数</div>
            <div>压缩包大小</div>
            <div>过期时间</div>
            <div>模式</div>
            <div>操作</div>
          </div>
          {loading ? (
            <div className="px-4 py-10 text-sm text-theme-text-muted">加载中...</div>
          ) : sorted.length === 0 ? (
            <div className="px-4 py-10 text-sm text-theme-text-muted">暂无打包任务</div>
          ) : (
            sorted.map((task) => {
              const isFocus = focusTaskId && task.task_id === focusTaskId;
              const canDownload = task.status === 'succeeded';
              return (
                <div
                  key={task.task_id}
                  className={`grid grid-cols-[1.7fr_1fr_0.8fr_0.7fr_0.8fr_1fr_1fr_0.9fr] gap-3 border-b border-theme-border px-4 py-3 text-sm last:border-b-0 ${isFocus ? 'bg-brand-soft' : 'bg-theme-elevated'}`}
                >
                  <div className="truncate font-mono text-xs font-semibold text-theme-text-faint">{task.task_id}</div>
                  <div className="text-xs text-theme-text-muted">{fmt(task.accepted_at)}</div>
                  <div className="text-xs font-black text-theme-text-faint">{task.status}</div>
                  <div className="text-xs text-theme-text-secondary">{Number(task?.result?.file_count || 0)}</div>
                  <div className="text-xs text-theme-text-secondary">{Number(task?.result?.archive_size || 0)} bytes</div>
                  <div className="text-xs text-theme-text-secondary">{fmt(task?.result?.expires_at)}</div>
                  <div className="text-xs text-theme-text-secondary">{task?.result?.mode || '--'}</div>
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleDownload(task)}
                      disabled={!canDownload || busyTaskId === task.task_id}
                      className="inline-flex items-center gap-1 rounded-lg bg-theme-surface px-2.5 py-1.5 text-xs font-black text-white disabled:opacity-40"
                    >
                      <Download size={12} />
                      下载zip
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

