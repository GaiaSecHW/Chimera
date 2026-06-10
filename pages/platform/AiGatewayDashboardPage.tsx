import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FileText, KeyRound, Layers3, RefreshCw, Route, ServerCog, Settings } from 'lucide-react';
import { api } from '../../clients/api';
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

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
      <div className="text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
    </div>
    <div className="mt-5 text-3xl font-black tracking-tight text-slate-900">{value}</div>
    <div className="mt-2 text-sm font-medium text-slate-500">{hint}</div>
  </div>
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
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
        </div>
        <button
          onClick={() => void loadDashboard(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Layers3 className="h-5 w-5" />} label="公开模型" value={loading ? '-' : modelAliases.length} hint={`${summary.enabledAliases} 个启用，${bindings.length} 条真实路由`} />
        <MetricCard icon={<ServerCog className="h-5 w-5" />} label="真实模型" value={loading ? '-' : backendUnits.length} hint={`${summary.enabledUnits} 个启用，${capacityPools.length} 个算力池`} />
        <MetricCard icon={<Activity className="h-5 w-5" />} label="实时队列" value={loading ? '-' : numberText(summary.activeRequests)} hint={`${numberText(summary.waitingRequests)} 个请求等待调度`} />
        <MetricCard icon={<KeyRound className="h-5 w-5" />} label="调用密钥" value={loading ? '-' : llmKeys.length} hint={`${summary.enabledKeys} 个启用密钥`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">近期请求</div>
              <h2 className="mt-2 text-xl font-black text-slate-900">网关调用日志</h2>
            </div>
            <button onClick={() => onNavigate('aigw-logs')} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
              <FileText className="h-4 w-4" />
              查看全部
            </button>
          </div>
          <div className="mt-5 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-bold">时间</th>
                  <th className="px-3 py-3 font-bold">模型</th>
                  <th className="px-3 py-3 font-bold">状态</th>
                  <th className="px-3 py-3 font-bold">延迟</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 text-slate-700">{formatDateTime(log.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900">{log.model_name || '-'}</div>
                      <div className="text-xs text-slate-500">{log.backend_model_name || '-'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(log.status_code || 0) >= 200 && Number(log.status_code || 0) < 300 ? 'bg-emerald-100 text-emerald-700' : Number(log.status_code || 0) >= 400 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{log.status_code || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{log.response_time || 0} ms</td>
                  </tr>
                ))}
                {!logs.length && !loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-slate-400">暂无请求日志</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs font-bold text-slate-400">共 {numberText(logsTotal)} 条日志，当前预览 {logs.length} 条，错误预览 {summary.errorLogs} 条。</div>
        </section>

        <aside className="space-y-4">
          <button onClick={() => onNavigate('aigw-config')} className="flex w-full items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-sm hover:bg-slate-50">
            <span>
              <span className="block text-sm font-black text-slate-900">网关配置</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">模型别名、真实路由、算力池</span>
            </span>
            <Settings className="h-5 w-5 text-slate-500" />
          </button>
          <button onClick={() => onNavigate('aigw-keys')} className="flex w-full items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-sm hover:bg-slate-50">
            <span>
              <span className="block text-sm font-black text-slate-900">密钥管理</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">任务密钥、工作密钥、授权范围</span>
            </span>
            <KeyRound className="h-5 w-5 text-slate-500" />
          </button>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Route className="h-4 w-4" /> 路由健康</div>
            <div className="mt-4 space-y-3">
              {providerStats.slice(0, 5).map((item, index) => (
                <div key={`${item.backend_unit_id || item.backend_config_id || index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-slate-900">{item.model_name || item.backend_model_name || `Backend #${item.backend_unit_id || item.backend_config_id || index + 1}`}</span>
                    <span className="font-mono text-xs text-slate-500">{Number(item.success_rate || 0).toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">活跃 {numberText(item.active_requests)} / 等待 {numberText(item.waiting_requests)}</div>
                </div>
              ))}
              {!providerStats.length && !loading ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">暂无路由统计</div> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
