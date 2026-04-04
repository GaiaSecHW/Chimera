import React, { useState } from 'react';
import { ChevronUp, ChevronDown, UploadCloud, Loader2, XCircle, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { useUploadCenter, useUploadCenterStore, UploadTask } from '../../services/uploadCenter';

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[idx]}`;
};

const formatSpeed = (bytesPerSec: number): string => {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s';
  return `${formatSize(bytesPerSec)}/s`;
};

const percent = (uploaded: number, total: number): number => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (uploaded / total) * 100));
};

const statusLabel = (task: UploadTask): string => {
  switch (task.status) {
    case 'queued':
      return '排队中';
    case 'uploading':
      return '上传中';
    case 'processing':
      return '处理中';
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
    case 'canceled':
      return '已取消';
    default:
      return task.status;
  }
};

const statusClass = (task: UploadTask): string => {
  switch (task.status) {
    case 'uploading':
      return 'text-blue-700 bg-blue-100';
    case 'processing':
      return 'text-amber-700 bg-amber-100';
    case 'success':
      return 'text-emerald-700 bg-emerald-100';
    case 'failed':
      return 'text-red-700 bg-red-100';
    case 'canceled':
      return 'text-slate-600 bg-slate-100';
    default:
      return 'text-slate-700 bg-slate-100';
  }
};

export const GlobalUploadWidget: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const snapshot = useUploadCenterStore();
  const center = useUploadCenter();
  const totalProgress = percent(snapshot.totalUploadedBytes, snapshot.totalBytes);

  const summaryText = snapshot.activeCount > 0
    ? `进行中 ${snapshot.activeCount} / 总计 ${snapshot.totalCount}`
    : snapshot.totalCount > 0
      ? `全部完成 ${snapshot.totalCount}`
      : '暂无上传任务';

  if (snapshot.activeCount === 0) {
    return null;
  }

  const renderTaskIcon = (task: UploadTask) => {
    if (task.status === 'uploading' || task.status === 'processing' || task.status === 'queued') {
      return <Loader2 size={14} className="animate-spin text-blue-600" />;
    }
    if (task.status === 'success') return <CheckCircle2 size={14} className="text-emerald-600" />;
    if (task.status === 'failed') return <AlertTriangle size={14} className="text-red-600" />;
    return <XCircle size={14} className="text-slate-500" />;
  };

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[360px] max-w-[calc(100vw-1rem)]">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30 overflow-hidden">
        <button
          type="button"
          className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <UploadCloud size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800">{summaryText}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                上传中请勿刷新页面，否则上传可能失败
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                总进度 {totalProgress.toFixed(0)}% · 实时速度 {formatSpeed(snapshot.totalSpeedBps)}
              </div>
            </div>
          </div>
          <div className="shrink-0 mt-1 text-slate-500">
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </button>

        <div className="h-1 bg-slate-100">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${totalProgress}%` }} />
        </div>

        {expanded && (
          <div className="border-t border-slate-100">
            <div className="px-4 py-2.5 flex items-center justify-between bg-slate-50">
              <div className="text-[11px] text-slate-500">
                队列 {snapshot.queuedCount} · 上传 {snapshot.runningCount} · 处理 {snapshot.processingCount}
              </div>
              <button
                type="button"
                onClick={() => center.clearFinished()}
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
              >
                <Trash2 size={12} />
                清理已完成
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2 space-y-2">
              {snapshot.tasks.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-slate-500">暂无上传任务</div>
              )}
              {snapshot.tasks.map((task) => {
                const taskProgress = percent(task.uploadedBytes, task.totalBytes || task.size);
                return (
                  <div key={task.id} className="p-2.5 rounded-xl border border-slate-100 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{task.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{task.source}</div>
                      </div>
                      <div className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${statusClass(task)}`}>
                        {statusLabel(task)}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${taskProgress}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1">
                        {renderTaskIcon(task)}
                        <span>{taskProgress.toFixed(0)}%</span>
                      </div>
                      <div>
                        {formatSize(task.uploadedBytes)} / {formatSize(task.totalBytes || task.size)}
                        {' · '}
                        {formatSpeed(task.speedBps)}
                      </div>
                    </div>
                    {task.message && task.status !== 'failed' && (
                      <div className="mt-1 text-[11px] text-slate-500">{task.message}</div>
                    )}
                    {task.error && (
                      <div className="mt-1 text-[11px] text-red-600 break-all">{task.error}</div>
                    )}
                    {(task.status === 'queued' || task.status === 'uploading') && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => center.cancelUpload(task.id)}
                          className="text-[11px] text-red-600 hover:text-red-700"
                        >
                          取消任务
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
