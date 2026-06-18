import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FileText, KeyRound, Layers3, RefreshCw, Route, ServerCog, Settings } from 'lucide-react';
import { api } from '../../clients/api';
import { DataTable, DataTableColumn, StatisticCard } from '../../design-system';
import {
  AiGatewayBackendUnit,
  AiGatewayCapacityPool,
  AiGatewayLlmKey,
  AiGatewayLogListResponse,
  AiGatewayLogSummary,
  AiGatewayModelAlias,
  AiGatewayModelAliasBinding,
  AiGatewayProviderStat,
} from '../../types/types';

interface AiGatewayDashboardPageProps {
  onNavigate: (view: string) => void;
}

const numberText = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; hint: string }> = ({ icon, label, value, hint }) => (
  <StatisticCard label={label} value={value} icon={icon} hint={hint} />
);

export const AiGatewayDashboardPage: React.FC<AiGatewayDashboardPageProps> = ({ onNavigate }) => {
  const platformApi = api.domains.platform;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [providerStats, setProviderStats] = useState<AiGatewayProviderStat[]>([]);
  const [modelAliases, setModelAliases] = useState<AiGatewayModelAlias[]>([]);
  const [backendUnits, setBackendUnits] = useState<AiGatewayBackendUnit[]>([]);
  const [bindings, setBindings] = useState<AiGatewayModelAliasBinding[]>([]);
  const [capacityPools, setCapacityPools] = useState<AiGatewayCapacityPool[]>([]);
  const [llmKeys, setLlmKeys] = useState<AiGatewayLlmKey[]>([]);
  const [logs, setLogs] = useState<AiGatewayLogSummary[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);

  const loadDashboard = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [providerItems, aliases, units, bindingItems, poolItems, keyItems, logResponse] = await Promise.all([
        platformApi.aigw.listProviderStats(),
        platformApi.aigw.listModelAliases(),
        platformApi.aigw.listBackendUnits(),
        platformApi.aigw.listBindings(),
        platformApi.aigw.listCapacityPools(),
        platformApi.aigw.listLlmKeys(),
        platformApi.aigw.listRequestLogs({ page: 1, page_size: 8 }),
      ]);
      const parsedLogs = logResponse as AiGatewayLogListResponse;
      setProviderStats(Array.isArray(providerItems) ? providerItems : []);
      setModelAliases(Array.isArray(aliases) ? aliases : []);
      setBackendUnits(Array.isArray(units) ? units : []);
      setBindings(Array.isArray(bindingItems) ? bindingItems : []);
      setCapacityPools(Array.isArray(poolItems) ? poolItems : []);
      setLlmKeys(Array.isArray(keyItems) ? keyItems : []);
      setLogs(Array.isArray(parsedLogs?.logs) ? parsedLogs.logs : []);
      setLogsTotal(Number(parsedLogs?.total || 0));
    } catch (err: any) {
      setError(err?.message || '加载 AI 网关 Dashboard 失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const summary = useMemo(() => {
    const activeRequests = providerStats.reduce((sum, item) => sum + Number(item.active_requests || 0), 0);
    const waitingRequests = providerStats.reduce((sum, item) => sum + Number(item.waiting_requests || 0), 0);
    const enabledAliases = modelAliases.filter((item) => item.enabled).length;
    const enabledUnits = backendUnits.filter((item) => item.enabled).length;
    const enabledKeys = llmKeys.filter((item) => item.enabled).length;
    const errorLogs = logs.filter((item) => Number(item.status_code || 0) >= 400).length;
    return {
      activeRequests,
      waitingRequests,
      enabledAliases,
      enabledUnits,
      enabledKeys,
      errorLogs,
    };
  }, [backendUnits, llmKeys, logs, modelAliases, providerStats]);

  return (
    <div className="flex min-h-full flex-col gap-6 p-8">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-theme-text-primary">Dashboard</h1>
        </div>
        <button
          onClick={() => void loadDashboard(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Layers3 className="h-5 w-5" />} label="公开模型" value={loading ? '-' : modelAliases.length} hint={`${summary.enabledAliases} 个启用，${bindings.length} 条真实路由`} />
        <MetricCard icon={<ServerCog className="h-5 w-5" />} label="真实模型" value={loading ? '-' : backendUnits.length} hint={`${summary.enabledUnits} 个启用，${capacityPools.length} 个算力池`} />
        <MetricCard icon={<Activity className="h-5 w-5" />} label="实时队列" value={loading ? '-' : numberText(summary.activeRequests)} hint={`${numberText(summary.waitingRequests)} 个请求等待调度`} />
        <MetricCard icon={<KeyRound className="h-5 w-5" />} label="调用密钥" value={loading ? '-' : llmKeys.length} hint={`${summary.enabledKeys} 个启用密钥`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-muted">近期请求</div>
              <h2 className="mt-2 text-xl font-black text-theme-text-primary">网关调用日志</h2>
            </div>
            <button onClick={() => onNavigate('aigw-logs')} className="inline-flex items-center gap-2 rounded-2xl bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated">
              <FileText className="h-4 w-4" />
              查看全部
            </button>
          </div>
          <div className="mt-5 overflow-auto">
            {(() => {
              type LogRow = AiGatewayLogSummary;
              const columns: DataTableColumn<LogRow>[] = [
                {
                  key: 'created_at',
                  header: '时间',
                  render: (log) => <span className="text-theme-text-secondary">{formatDateTime(log.created_at)}</span>,
                },
                {
                  key: 'model_name',
                  header: '模型',
                  render: (log) => (
                    <div>
                      <div className="font-bold text-theme-text-primary">{log.model_name || '-'}</div>
                      <div className="text-xs text-theme-text-muted">{log.backend_model_name || '-'}</div>
                    </div>
                  ),
                },
                {
                  key: 'status_code',
                  header: '状态',
                  render: (log) => (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(log.status_code || 0) >= 200 && Number(log.status_code || 0) < 300 ? 'bg-emerald-500/15 text-emerald-400' : Number(log.status_code || 0) >= 400 ? 'bg-rose-500/15 text-rose-400' : 'bg-theme-elevated text-theme-text-secondary'}`}>
                      {log.status_code || '-'}
                    </span>
                  ),
                },
                {
                  key: 'response_time',
                  header: '延迟',
                  render: (log) => <span className="text-theme-text-secondary">{log.response_time || 0} ms</span>,
                },
              ];
              return (
                <DataTable<LogRow>
                  columns={columns}
                  data={logs}
                  rowKey={(log) => String(log.id)}
                  loading={loading && logs.length === 0}
                  empty={<div className="text-center py-8 text-theme-text-muted">暂无请求日志</div>}
                  minWidth={600}
                />
              );
            })()}
          </div>
          <div className="mt-4 text-xs font-bold text-theme-text-muted">共 {numberText(logsTotal)} 条日志，当前预览 {logs.length} 条，错误预览 {summary.errorLogs} 条。</div>
        </section>

        <aside className="space-y-4">
 <button onClick={() => onNavigate('aigw-config')} className="flex w-full items-center justify-between rounded-[1.5rem] border border-theme-border bg-theme-bg-app p-5 text-left hover:bg-theme-elevated">
            <span>
              <span className="block text-sm font-black text-theme-text-primary">网关配置</span>
              <span className="mt-1 block text-xs font-medium text-theme-text-muted">模型别名、真实路由、算力池</span>
            </span>
            <Settings className="h-5 w-5 text-theme-text-muted" />
          </button>
 <button onClick={() => onNavigate('aigw-keys')} className="flex w-full items-center justify-between rounded-[1.5rem] border border-theme-border bg-theme-bg-app p-5 text-left hover:bg-theme-elevated">
            <span>
              <span className="block text-sm font-black text-theme-text-primary">密钥管理</span>
              <span className="mt-1 block text-xs font-medium text-theme-text-muted">任务密钥、工作密钥、授权范围</span>
            </span>
            <KeyRound className="h-5 w-5 text-theme-text-muted" />
          </button>
 <div className="rounded-[1.5rem] border border-theme-border bg-theme-bg-app p-5">
            <div className="flex items-center gap-2 text-sm font-black text-theme-text-primary"><Route className="h-4 w-4" /> 路由健康</div>
            <div className="mt-4 space-y-3">
              {providerStats.slice(0, 5).map((item, index) => (
                <div key={`${item.backend_unit_id || item.backend_config_id || index}`} className="rounded-2xl bg-theme-bg-app px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-theme-text-primary">{item.model_name || item.backend_model_name ||`Backend #${item.backend_unit_id || item.backend_config_id || index + 1}`}</span>
                    <span className="font-mono text-xs text-theme-text-muted">{Number(item.success_rate || 0).toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-theme-text-muted">活跃 {numberText(item.active_requests)} / 等待 {numberText(item.waiting_requests)}</div>
                </div>
              ))}
              {!providerStats.length && !loading ? <div className="rounded-2xl bg-theme-bg-app px-4 py-8 text-center text-sm text-theme-text-muted">暂无路由统计</div> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
