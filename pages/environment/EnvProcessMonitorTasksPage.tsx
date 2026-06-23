import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, RefreshCw, Square, Trash2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { ProcessMonitorNode, ProcessSyncTaskDetailResponse, ProcessSyncTaskHistoryItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';

type QueryMode = 'platform' | 'live';
type DetailTab = 'overview' | 'progress' | 'events' | 'results';

const pretty = (value: any) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
};

const readNodeStatusFromHistory = (item: ProcessSyncTaskHistoryItem): string => {
  const snapshot = item?.node_snapshot;
  if (snapshot && typeof snapshot === 'object') {
    const direct = String((snapshot as any).status || '').trim();
    if (direct) return direct;
    const taskStatus = String((snapshot as any)?.task?.status || '').trim();
    if (taskStatus) return taskStatus;
  }
  return '-';
};

export const EnvProcessMonitorTasksPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [mode, setMode] = useState<QueryMode>('platform');
  const [nodes, setNodes] = useState<ProcessMonitorNode[]>([]);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<Set<string>>(new Set());
  const [historyItems, setHistoryItems] = useState<ProcessSyncTaskHistoryItem[]>([]);
  const [liveItems, setLiveItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [detailData, setDetailData] = useState<ProcessSyncTaskDetailResponse | null>(null);
  const [selectedHistorySyncIds, setSelectedHistorySyncIds] = useState<Set<string>>(new Set());
  const [selectedLiveTaskKeys, setSelectedLiveTaskKeys] = useState<Set<string>>(new Set());

  const selectedKeysArray = useMemo(() => Array.from(selectedAgentKeys), [selectedAgentKeys]);
  const agentHostnameMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => {
      const key = String(node?.agent_key || '').trim();
      const hostname = String(node?.agent_hostname || '').trim();
      if (key && hostname && !map.has(key)) {
        map.set(key, hostname);
      }
    });
    return map;
  }, [nodes]);

  const resolveNodeName = (agentKey: string, candidateName?: string) => {
    const fallback = String(agentKey || '').trim();
    const direct = String(candidateName || '').trim();
    if (direct) return direct;
    return agentHostnameMap.get(fallback) || fallback;
  };

  const loadNodes = async () => {
    if (!projectId) {
      setNodes([]);
      return;
    }
    try {
      const data = await environmentApi.environment.listProcessMonitorNodes(projectId);
      setNodes(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error(error);
      setNodes([]);
    }
  };

  const loadData = async () => {
    if (!projectId) {
      setHistoryItems([]);
      setLiveItems([]);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'platform') {
        const data = await environmentApi.environment.getProcessMonitorSyncHistory(projectId, {
          page: 1,
          per_page: 200,
        });
        setHistoryItems(Array.isArray(data?.items) ? data.items : []);
      } else {
        const data = await environmentApi.environment.getProcessMonitorSyncLiveTasks(projectId, {
          agent_keys: selectedKeysArray.length ? selectedKeysArray : undefined,
        });
        setLiveItems(Array.isArray(data?.items) ? data.items : []);
      }
    } catch (error) {
      console.error(error);
      notify('加载任务失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNodes();
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [projectId, mode, selectedKeysArray.join(',')]);

  useEffect(() => {
    setDetailOpen(false);
    setDetailData(null);
    setDetailError('');
    setDetailTab('overview');
    setSelectedHistorySyncIds(new Set());
    setSelectedLiveTaskKeys(new Set());
  }, [mode, projectId]);

  useEffect(() => {
    if (mode !== 'platform') return;
    const valid = new Set(historyItems.map((item) => String(item.sync_id || '')));
    setSelectedHistorySyncIds((prev) => {
      const next = new Set<string>();
      prev.forEach((item) => {
        if (valid.has(item)) next.add(item);
      });
      return next;
    });
  }, [mode, historyItems]);

  useEffect(() => {
    if (mode !== 'live') return;
    const valid = new Set(
      liveItems.map((item) =>`${String(item?.agent_key || '')}:${String(item?.service_name || '')}:${String(item?.node_task_id || item?.task?.task_id || '')}`)
    );
    setSelectedLiveTaskKeys((prev) => {
      const next = new Set<string>();
      prev.forEach((item) => {
        if (valid.has(item)) next.add(item);
      });
      return next;
    });
  }, [mode, liveItems]);

  const toggleAgent = (agentKey: string) => {
    setSelectedAgentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });
  };

  const clearCurrent = async (scope: 'selected' | 'filtered' | 'all') => {
    if (!projectId) return;
    const selectedLiveItems = liveItems.filter((item) => selectedLiveTaskKeys.has(`${String(item?.agent_key || '')}:${String(item?.service_name || '')}:${String(item?.node_task_id || item?.task?.task_id || '')}`));
    const selectedLiveTaskIds = selectedLiveItems
      .map((item) => String(item?.node_task_id || item?.task?.task_id || '').trim())
      .filter(Boolean);
    const selectedLiveAgentKeys = Array.from(new Set(selectedLiveItems.map((item) => String(item?.agent_key || '').trim()).filter(Boolean)));
    if (mode === 'platform' && scope === 'selected' && selectedHistorySyncIds.size === 0) {
      notify('请先选择要清理的任务记录', 'warning');
      return;
    }
    if (mode === 'live' && scope === 'selected' && selectedLiveTaskIds.length === 0) {
      notify('请先选择要清理的实时任务', 'warning');
      return;
    }
    const ok = await confirm({
      title:
        mode === 'platform'
          ? (scope === 'selected' ? '清理选中平台记录' : '全量清理平台记录')
          : (scope === 'selected' ? '清理选中实时任务' : scope === 'filtered' ? '清理筛选节点任务' : '全量清理实时任务'),
      message:
        mode === 'platform'
          ? (scope === 'selected'
            ?`将清理选中的 ${selectedHistorySyncIds.size} 条平台记录（仅已结束任务），确认继续？`
            : '将全量清理平台记录中的已结束任务，确认继续？')
          : (scope === 'selected'
            ?`将清理选中的 ${selectedLiveTaskIds.length} 个实时任务（仅已结束任务），确认继续？`
            : scope === 'filtered'
              ? '将清理当前筛选节点上的已结束任务，确认继续？'
              : '将清理全部节点上的已结束任务，确认继续？'),
      confirmText: '确认清理',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      if (mode === 'platform') {
        await environmentApi.environment.clearProcessMonitorSyncHistory({
          project_id: projectId,
          sync_ids: scope === 'selected' ? Array.from(selectedHistorySyncIds) : undefined,
          include_running: false,
        });
      } else {
        await environmentApi.environment.clearProcessMonitorSyncLiveTasks({
          project_id: projectId,
          agent_keys:
            scope === 'selected'
              ? (selectedLiveAgentKeys.length ? selectedLiveAgentKeys : undefined)
              : scope === 'filtered'
                ? (selectedKeysArray.length ? selectedKeysArray : undefined)
                : undefined,
          task_ids: scope === 'selected' ? selectedLiveTaskIds : undefined,
          include_running: false,
        });
      }
      notify('清理完成', 'success');
      await loadData();
    } catch (error) {
      console.error(error);
      notify('清理失败', 'error');
    } finally {
      setClearing(false);
    }
  };

  const openPlatformDetail = async (item: ProcessSyncTaskHistoryItem) => {
    if (!projectId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailTab('overview');
    try {
      const detail = await environmentApi.environment.getProcessMonitorSyncHistoryDetail(projectId, item.sync_id);
      setDetailData(detail || null);
    } catch (error: any) {
      console.error(error);
      setDetailData(null);
      setDetailError(error?.message || '加载任务详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openLiveDetail = async (item: any) => {
    if (!projectId) return;
    const agentKey = String(item?.agent_key || '').trim();
    const serviceName = String(item?.service_name || '').trim();
    const taskId = String(item?.node_task_id || item?.task?.task_id || '').trim();
    if (!agentKey || !serviceName || !taskId) {
      setDetailOpen(true);
      setDetailData(null);
      setDetailError('实时任务缺少 agent/service/task_id，无法查询详情');
      setDetailLoading(false);
      return;
    }
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailTab('overview');
    try {
      const live = await environmentApi.environment.getProcessMonitorSyncLiveTaskDetail(projectId, agentKey, serviceName, taskId);
      setDetailData({
        project_id: projectId,
        sync_id: taskId,
        node_task_id: taskId,
        id_consistent: true,
        platform: {
          sync_id: taskId,
          project_id: projectId,
          agent_key: agentKey,
          service_name: serviceName,
          mode: String(item?.task?.mode || ''),
          status: String(item?.task?.status || ''),
          created_at: item?.task?.created_at,
          request: {},
          node_snapshot: item?.task || {},
        },
        live: {
          task: live?.task || {},
          progress: live?.progress || {},
          events: live?.events || {},
          results: live?.results || {},
          errors: [],
        },
      });
    } catch (error: any) {
      console.error(error);
      setDetailData(null);
      setDetailError(error?.message || '加载实时任务详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <>
      <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4">
        <PageHeader
          title="节点进程监控 - 任务管理"
          description="支持平台记录查询与指定节点实时任务查询"
          actions={<div className="flex items-center gap-2">
              <button onClick={() => void loadData()} disabled={loading || !projectId} className="px-4 py-3 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-elevated text-theme-text-secondary text-xs font-medium uppercase tracking-wider flex items-center gap-2">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}刷新</button>
              <button onClick={() => void clearCurrent('selected')} disabled={!projectId || clearing || (mode === 'platform' ? selectedHistorySyncIds.size === 0 : selectedLiveTaskKeys.size === 0)} className="px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/15 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">{clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}清理选中</button>
              {mode === 'live' && (<button onClick={() => void clearCurrent('filtered')} disabled={!projectId || clearing} className="px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/15 hover:bg-amber-600 hover:text-white text-amber-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">{clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}清理筛选节点</button>)}
              <button onClick={() => void clearCurrent('all')} disabled={!projectId || clearing} className="px-4 py-3 rounded-lg border border-rose-300 bg-theme-elevated hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">{clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}全量清理</button>
            </div>}
        />

        <div className="flex gap-2">
          <button
            onClick={() => setMode('platform')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${mode === 'platform' ? 'bg-blue-600 text-white' : 'bg-theme-elevated text-theme-text-secondary'}`}
          >
            平台记录模式
          </button>
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${mode === 'live' ? 'bg-blue-600 text-white' : 'bg-theme-elevated text-theme-text-secondary'}`}
          >
            节点实时模式
          </button>
        </div>

        {mode === 'live' && (
          <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-theme-text-muted mb-3">节点筛选（可多选）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {nodes.map((node) => {
                const checked = selectedAgentKeys.has(node.agent_key);
                return (
                  <button
                    key={`${node.agent_key}:${node.service_name}`}
                    type="button"
                    onClick={() => toggleAgent(node.agent_key)}
                    className={`text-left p-3 rounded-xl border ${checked ? 'border-blue-400 bg-blue-500/15' : 'border-theme-border bg-theme-elevated hover:bg-theme-elevated'}`}
                  >
                    <div className="flex items-center gap-2">
                      {checked ? <CheckSquare size={14} className="text-blue-400" /> : <Square size={14} className="text-theme-text-muted" />}
                      <div className="text-sm font-medium text-theme-text-secondary">{node.agent_key}</div>
                    </div>
                    <div className="text-xs text-theme-text-muted mt-1">{resolveNodeName(node.agent_key, node.agent_hostname)} / {node.service_name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-theme-elevated text-[11px] uppercase tracking-widest text-theme-text-muted">
              <tr>
                {mode === 'platform' ? (
                  <>
                    <th className="px-4 py-4 w-10">
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(historyItems.map((item) => String(item.sync_id || '')));
                          setSelectedHistorySyncIds((prev) => (prev.size === all.size ? new Set() : all));
                        }}
                        className="text-theme-text-muted hover:text-blue-400"
                        title="全选/取消全选"
                      >
                        {historyItems.length > 0 && selectedHistorySyncIds.size === historyItems.length ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </th>
                    <th className="px-5 py-4">sync_id</th>
                    <th className="px-4 py-4">节点</th>
                    <th className="px-4 py-4">服务</th>
                    <th className="px-4 py-4">模式</th>
                    <th className="px-4 py-4">平台状态</th>
                    <th className="px-4 py-4">节点状态</th>
                    <th className="px-4 py-4">ID一致</th>
                    <th className="px-4 py-4">创建时间</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-4 w-10">
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(liveItems.map((item) =>`${String(item?.agent_key || '')}:${String(item?.service_name || '')}:${String(item?.node_task_id || item?.task?.task_id || '')}`));
                          setSelectedLiveTaskKeys((prev) => (prev.size === all.size ? new Set() : all));
                        }}
                        className="text-theme-text-muted hover:text-blue-400"
                        title="全选/取消全选"
                      >
                        {liveItems.length > 0 && selectedLiveTaskKeys.size === liveItems.length ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </th>
                    <th className="px-5 py-4">节点</th>
                    <th className="px-4 py-4">服务</th>
                    <th className="px-4 py-4">task_id</th>
                    <th className="px-4 py-4">模式</th>
                    <th className="px-4 py-4">平台状态</th>
                    <th className="px-4 py-4">节点状态</th>
                    <th className="px-4 py-4">创建时间</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={mode === 'platform' ? 9 : 8} className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></td></tr>
              ) : mode === 'platform' ? (
                historyItems.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-theme-text-muted">暂无记录</td></tr>
                ) : historyItems.map((item) => (
                  <tr
                    key={item.sync_id}
                    className="border-t border-theme-border hover:bg-theme-elevated cursor-pointer"
                    onClick={() => void openPlatformDetail(item)}
                    title="单击查看任务详情"
                  >
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedHistorySyncIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.sync_id)) next.delete(item.sync_id);
                            else next.add(item.sync_id);
                            return next;
                          });
                        }}
                        className="text-theme-text-muted hover:text-blue-400"
                        title="选择任务"
                      >
                        {selectedHistorySyncIds.has(item.sync_id) ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-theme-text-secondary">{item.sync_id}</td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold text-theme-text-secondary">{resolveNodeName(item.agent_key, (item as any)?.agent_hostname)}</div>
                      <div className="text-[11px] font-mono text-theme-text-muted">{item.agent_key}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-theme-text-secondary">{item.service_name}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{item.mode}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{item.status || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{readNodeStatusFromHistory(item)}</td>
                    <td className="px-4 py-4 text-xs">
                      {item.id_consistent === false ? (
                        <span className="inline-flex rounded-full bg-rose-500/15 px-2 py-1 text-rose-400 font-medium">不一致</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400 font-medium">一致</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-theme-text-muted">{item.created_at || '-'}</td>
                  </tr>
                ))
              ) : (
                liveItems.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-theme-text-muted">暂无实时任务</td></tr>
                ) : liveItems.map((item) => (
                  <tr
                    key={`${item.agent_key}:${item.service_name}:${item.node_task_id || ''}`}
                    className="border-t border-theme-border hover:bg-theme-elevated cursor-pointer"
                    onClick={() => void openLiveDetail(item)}
                    title="单击查看任务详情"
                  >
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rowKey =`${String(item?.agent_key || '')}:${String(item?.service_name || '')}:${String(item?.node_task_id || item?.task?.task_id || '')}`;
                          setSelectedLiveTaskKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(rowKey)) next.delete(rowKey);
                            else next.add(rowKey);
                            return next;
                          });
                        }}
                        className="text-theme-text-muted hover:text-blue-400"
                        title="选择任务"
                      >
                        {selectedLiveTaskKeys.has(`${String(item?.agent_key || '')}:${String(item?.service_name || '')}:${String(item?.node_task_id || item?.task?.task_id || '')}`) ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm font-semibold text-theme-text-secondary">{resolveNodeName(String(item?.agent_key || ''), String(item?.agent_hostname || ''))}</div>
                      <div className="text-[11px] font-mono text-theme-text-muted">{item.agent_key}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-theme-text-secondary">{item.service_name}</td>
                    <td className="px-4 py-4 text-xs font-mono text-theme-text-secondary">{item.node_task_id || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{item.task?.mode || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{item.platform_status || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-theme-text-secondary">{item.task?.status || '-'}</td>
                    <td className="px-4 py-4 text-xs text-theme-text-muted">{item.task?.created_at || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setDetailOpen(false)}>
 <div className="absolute inset-y-0 right-0 w-[min(980px,92vw)] bg-theme-elevated border-l border-theme-border flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">同步任务详情</h3>
                <p className="text-xs text-theme-text-muted font-mono">
                  {(detailData?.sync_id || detailData?.platform?.sync_id || detailData?.node_task_id || '-') as string}
                </p>
              </div>
              <button className="p-2 rounded-xl hover:bg-theme-elevated" onClick={() => setDetailOpen(false)}><X size={18} /></button>
            </div>

            <div className="px-6 pt-3 border-b border-theme-border flex items-center gap-2">
              {[
                { id: 'overview', label: '概览' },
                { id: 'progress', label: '进度' },
                { id: 'events', label: '事件' },
                { id: 'results', label: '结果(成功+失败)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id as DetailTab)}
                  className={`px-3 py-2 rounded-t-xl text-xs font-medium uppercase tracking-wider ${
                    detailTab === tab.id ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20 border-b-0' : 'text-theme-text-muted hover:text-theme-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-6">
              {detailLoading ? (
                <div className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></div>
              ) : detailError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 text-rose-400 px-4 py-3 text-sm">{detailError}</div>
              ) : !detailData ? (
                <div className="py-16 text-center text-theme-text-muted">暂无详情数据</div>
              ) : (
                <>
                  {detailTab === 'overview' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">平台ID</div><div className="mt-1 text-xs font-mono break-all text-theme-text-secondary">{detailData.sync_id || detailData.platform?.sync_id || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">节点ID</div><div className="mt-1 text-xs font-mono break-all text-theme-text-secondary">{detailData.node_task_id || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">状态</div><div className="mt-1 text-sm font-medium text-theme-text-secondary">{detailData.platform?.status || detailData.live?.task?.status || '-'}</div></div>
                        <div className="rounded-xl border border-theme-border p-4"><div className="text-xs text-theme-text-muted">ID一致性</div><div className="mt-1 text-sm font-medium text-theme-text-secondary">{detailData.id_consistent === false ? '不一致' : '一致'}</div></div>
                      </div>
                      <div className="rounded-xl border border-theme-border p-4">
                        <div className="text-xs uppercase tracking-wider text-theme-text-muted">错误摘要</div>
                        <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.failure_summary || detailData.live?.errors || [])}</pre>
                      </div>
                      <div className="rounded-xl border border-theme-border p-4">
                        <div className="text-xs uppercase tracking-wider text-theme-text-muted">平台请求</div>
                        <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.platform?.request || {})}</pre>
                      </div>
                    </div>
                  )}

                  {detailTab === 'progress' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-theme-border p-4">
                        <div className="text-xs uppercase tracking-wider text-theme-text-muted">节点进度</div>
                        <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.live?.progress || {})}</pre>
                      </div>
                      <div className="rounded-xl border border-theme-border p-4">
                        <div className="text-xs uppercase tracking-wider text-theme-text-muted">平台快照</div>
                        <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.platform?.node_snapshot || {})}</pre>
                      </div>
                    </div>
                  )}

                  {detailTab === 'events' && (
                    <div className="rounded-xl border border-theme-border p-4">
                      <div className="text-xs uppercase tracking-wider text-theme-text-muted">Events</div>
                      <pre className="mt-2 max-h-[58vh] overflow-auto text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.live?.events || {})}</pre>
                    </div>
                  )}

                  {detailTab === 'results' && (
                    <div className="rounded-xl border border-theme-border p-4">
                      <div className="text-xs uppercase tracking-wider text-theme-text-muted">Results</div>
                      <pre className="mt-2 max-h-[58vh] overflow-auto text-xs font-mono whitespace-pre-wrap break-all text-theme-text-secondary">{pretty(detailData.live?.results || {})}</pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {feedbackNodes}
    </>
  );
};