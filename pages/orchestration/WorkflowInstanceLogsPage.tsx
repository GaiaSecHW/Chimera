import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, RefreshCw, Search, TerminalSquare } from 'lucide-react';
import { api } from '../../clients/api';
import { WorkflowInstance, WorkflowInstanceNodeLogRecord } from '../../types/types';
import { PageHeader } from '../../design-system';

const formatTime = (value?: string) => {
  if (!value) return '暂无';
  return value.replace('T', ' ').split('.')[0];
};

const renderLogText = (record: WorkflowInstanceNodeLogRecord, key: 'init_logs' | 'execution_logs') => {
  return record[key]?.logs || '暂无日志';
};

export const WorkflowInstanceLogsPage: React.FC<{ instanceId: string; onBack: () => void }> = ({ instanceId, onBack }) => {
  const orchestrationApi = api.domains.orchestration;
  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [records, setRecords] = useState<WorkflowInstanceNodeLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const availableNodes = useMemo(() => instance?.nodes || [], [instance]);

  const loadInstance = async () => {
    const data = await orchestrationApi.workflow.getInstance(instanceId);
    setInstance(data);
  };

  const loadLogs = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await orchestrationApi.workflow.getInstanceNodeLogs(instanceId, {
        node_id: selectedNodeId || undefined,
        page,
        page_size: pageSize,
      });
      setRecords(result.items || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error(error);
      alert('加载工作流实例日志失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!instanceId) return;
    loadInstance().catch(error => {
      console.error(error);
      alert('加载工作流实例信息失败');
    });
  }, [instanceId]);

  useEffect(() => {
    if (!instanceId) return;
    loadLogs();
  }, [instanceId, selectedNodeId, page, pageSize]);

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="实例节点日志"
        description={instance ? `${instance.name} · ${instance.id}` : '加载实例信息中...'}
        back={{ label: '返回工作流实例', onClick: onBack }}
        actions={
          <button
            onClick={() => loadLogs(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-theme-surface border border-theme-border text-theme-text-secondary rounded-xl hover:bg-theme-elevated transition-all font-medium"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            刷新日志
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_140px]">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={18} />
          <select
            value={selectedNodeId}
            onChange={(e) => {
              setSelectedNodeId(e.target.value);
              setPage(1);
            }}
 className="w-full pl-14 pr-5 py-4 bg-theme-bg-app border border-theme-border rounded-xl text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium appearance-none"
          >
            <option value="">全部节点日志</option>
            {availableNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.id})
              </option>
            ))}
          </select>
        </div>

 <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 text-sm font-semibold text-theme-text-secondary">
          共 {total} 条记录
        </div>

        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
 className="bg-theme-bg-app border border-theme-border rounded-xl px-5 py-4 text-sm font-semibold text-theme-text-secondary outline-none focus:ring-4 ring-blue-500/5"
        >
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-5">
        {loading ? (
 <div className="bg-theme-surface border border-theme-border rounded-xl p-16 text-center text-theme-text-muted font-semibold">
            日志加载中...
          </div>
        ) : records.length === 0 ? (
 <div className="bg-theme-surface border border-theme-border rounded-xl p-16 text-center text-theme-text-muted font-semibold">
            当前筛选条件下暂无日志记录
          </div>
        ) : (
          records.map((record) => (
 <div key={record.id} className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden">
              <div className="px-7 py-6 border-b border-theme-border bg-slate-50/70">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                        <TerminalSquare size={20} />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-theme-text-primary">{record.node_name || record.node_id}</div>
                        <div className="text-xs font-mono text-theme-text-muted uppercase">节点ID: {record.node_id}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-medium text-theme-text-muted">
                      <span className="px-3 py-1 rounded-full bg-theme-elevated text-theme-text-secondary">任务ID: {record.task_id || '暂无'}</span>
                      <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400">状态: {record.status}</span>
                      <span className="px-3 py-1 rounded-full bg-theme-elevated text-theme-text-secondary">类型: {record.node_type}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs font-semibold text-theme-text-muted xl:text-right">
                    <div>创建时间: {formatTime(record.created_at)}</div>
                    <div>日志更新时间: {formatTime(record.log_updated_at)}</div>
                    <div>资源名称: {record.k8s_resource_name || '暂无'}</div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-theme-text-secondary">
                  {record.message || '暂无状态说明'}
                </div>
              </div>

              <div className="grid gap-px bg-theme-elevated lg:grid-cols-2">
                <div className="bg-theme-bg-app p-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
                    <FileText size={16} />
                    初始化日志
                  </div>
                  <div className="text-xs font-semibold text-theme-text-muted">
                    抓取时间: {formatTime(record.init_logs?.fetched_at)}
                  </div>
                  <pre className="min-h-[220px] max-h-[420px] overflow-auto rounded-xl border border-theme-border bg-theme-surface text-theme-text-primary p-5 text-xs leading-6 whitespace-pre-wrap break-words">
                    {renderLogText(record, 'init_logs')}
                  </pre>
                </div>

                <div className="bg-theme-bg-app p-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
                    <FileText size={16} />
                    执行日志
                  </div>
                  <div className="text-xs font-semibold text-theme-text-muted">
                    抓取时间: {formatTime(record.execution_logs?.fetched_at)}
                  </div>
                  <pre className="min-h-[220px] max-h-[420px] overflow-auto rounded-xl border border-theme-border bg-theme-surface text-theme-text-primary p-5 text-xs leading-6 whitespace-pre-wrap break-words">
                    {renderLogText(record, 'execution_logs')}
                  </pre>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

 <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-theme-surface border border-theme-border rounded-xl px-6 py-5">
        <div className="text-sm font-semibold text-theme-text-muted">
          第 {page} / {totalPages} 页
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
            className="w-11 h-11 rounded-lg border border-theme-border text-theme-text-muted hover:bg-theme-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage(page + 1)}
            className="w-11 h-11 rounded-lg border border-theme-border text-theme-text-muted hover:bg-theme-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};