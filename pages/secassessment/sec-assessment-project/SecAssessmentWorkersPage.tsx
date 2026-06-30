import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Server, Activity, Settings } from 'lucide-react';
import { PageHeader, StatisticCard, DataTable, EmptyState } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secAssessmentApi } from './client';
import { WorkerStatusBadge, fmtTime, heartbeartStale, ENGINE_MAP, TIMEOUT_UNIT_MAP } from './constants';
import type { WorkerInfo, SystemConfigRead } from './types';

interface SecAssessmentWorkersPageProps {
  onNavigateToView?: (view: string) => void;
}

export const SecAssessmentWorkersPage: React.FC<SecAssessmentWorkersPageProps> = ({ onNavigateToView }) => {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<SystemConfigRead | null>(null);
  const [actionName, setActionName] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await secAssessmentApi.listWorkers();
      setWorkers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      setConfig(await secAssessmentApi.getConfig());
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => { fetchWorkers(); fetchConfig(); }, [fetchWorkers, fetchConfig]);

  const stats = useMemo(() => ({
    online: workers.filter((w) => w.worker_status === 'online').length,
    draining: workers.filter((w) => w.worker_status === 'draining').length,
    offline: workers.filter((w) => w.worker_status === 'offline').length,
  }), [workers]);

  const handleDrain = async (w: WorkerInfo) => {
    const confirmed = await showConfirm({
      title: 'Drain Worker',
      message: `确认将 worker「${w.worker_name}」标记为 draining?标记后不再抢占新任务,等当前任务完成后退出。提示:kubectl scale statefulset worker --replicas=N-1 移除 pod。`,
      confirmText: '确认 drain', cancelText: '取消',
    });
    if (!confirmed) return;
    setActionName(w.worker_name);
    try {
      const r = await secAssessmentApi.drainWorker(w.worker_name);
      await showAlert({ title: 'Drain 已触发', message: r.message || '操作成功', tone: 'success' });
      fetchWorkers();
    } catch (e: any) {
      await showAlert({ message: e.message || '操作失败', tone: 'error' });
    } finally {
      setActionName(null);
    }
  };

  const columns = useMemo<DataTableColumn<WorkerInfo>[]>(() => [
    {
      key: 'worker', header: 'Worker',
      render: (w) => (
        <div>
          <div className="text-theme-text-primary font-medium">{w.worker_name}</div>
          {w.create_time && <div className="text-xs text-theme-text-faint font-mono mt-0.5">创建于 {fmtTime(w.create_time)}</div>}
        </div>
      ),
    },
    { key: 'status', header: '状态', width: 90, render: (w) => <WorkerStatusBadge status={w.worker_status} /> },
    {
      key: 'task', header: '当前任务',
      render: (w) => w.current_project_id ? (
        <button className="text-xs text-brand-primary hover:underline" onClick={() => onNavigateToView?.(`sec-assessment-project-detail-${w.current_project_id}`)}>
          项目 #{w.current_project_id}
        </button>
      ) : <span className="text-xs text-theme-text-faint">—</span>,
    },
    {
      key: 'hb', header: '最后心跳', width: 150,
      render: (w) => {
        const stale = heartbeartStale(w.last_heartbeat_time);
        return (
          <span className={`text-xs font-mono ${stale ? 'text-rose-400' : 'text-theme-text-muted'}`}>
            {fmtTime(w.last_heartbeat_time)}
          </span>
        );
      },
    },
    {
      key: 'hbst', header: '心跳状态', width: 90,
      render: (w) => {
        const stale = heartbeartStale(w.last_heartbeat_time);
        return stale
          ? <span className="text-xs px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/15 text-rose-400">超时</span>
          : <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/15 text-emerald-400">正常</span>;
      },
    },
    { key: 'uuid', header: 'UUID', render: (w) => <span className="text-xs text-theme-text-faint font-mono truncate">{w.uuid}</span> },
    {
      key: 'actions', header: '操作', align: 'right', width: 100,
      render: (w) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          {w.worker_status === 'online' && (
            <button className="btn btn-secondary text-xs" disabled={actionName === w.worker_name} onClick={() => handleDrain(w)}>
              {actionName === w.worker_name ? <RefreshCw size={13} className="animate-spin" /> : null} Drain
            </button>
          )}
        </div>
      ),
    },
  ], [onNavigateToView, actionName, handleDrain]);

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
          <PageHeader
            title="Worker 管理"
            description="评估执行 Worker 注册与心跳监控"
            actions={
              <button className="btn-icon" title="刷新" onClick={() => { fetchWorkers(); fetchConfig(); }}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            }
          />

          {config && (
            <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-theme-text-primary flex items-center gap-2"><Settings size={14} /> 配置摘要</span>
                <button className="text-xs text-brand-primary hover:underline" onClick={() => onNavigateToView?.('sec-assessment-config')}>前往配置 →</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                <div><span className="text-theme-text-faint">agent 引擎</span><div className="text-theme-text-secondary mt-0.5">{ENGINE_MAP[config.agent_engine_type]?.label || config.agent_engine_type}</div></div>
                <div><span className="text-theme-text-faint">基线执行并发</span><div className="text-theme-text-secondary mt-0.5 tabular-nums">{config.concurrency}</div></div>
                <div><span className="text-theme-text-faint">warp 最大重试</span><div className="text-theme-text-secondary mt-0.5 tabular-nums">{config.max_retry}</div></div>
                <div><span className="text-theme-text-faint">agent 最大执行</span><div className="text-theme-text-secondary mt-0.5 tabular-nums">{config.max_agent_exec_count}</div></div>
                <div><span className="text-theme-text-faint">最大超时</span><div className="text-theme-text-secondary mt-0.5 tabular-nums">{config.max_timeout_value} {TIMEOUT_UNIT_MAP[config.max_timeout_unit]}</div></div>
              </div>
              <div className="text-xs text-theme-text-faint mt-2">Worker 抢占任务前读取(全局)</div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-3">
            <StatisticCard label="在线" value={stats.online} icon={<Server size={16} />} tone="success" />
            <StatisticCard label="下线中" value={stats.draining} icon={<Activity size={16} />} tone="warning" />
            <StatisticCard label="离线" value={stats.offline} icon={<Server size={16} />} tone="default" />
          </div>

          <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
            <DataTable
              columns={columns}
              data={workers}
              rowKey={(w) => String(w.id)}
              loading={loading && workers.length === 0}
              showRowNumber
              minWidth={900}
              empty={<EmptyState variant="inline" title="暂无注册的 Worker" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecAssessmentWorkersPage;
