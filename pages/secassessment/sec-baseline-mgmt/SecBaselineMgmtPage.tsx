import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Eye, Pencil, Plus, RefreshCw, Search, Share2, AlertTriangle, Percent } from 'lucide-react';
import { PageHeader, StatisticCard, DataTable, EmptyState } from '../../../design-system';
import type { DataTableColumn } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secBaselineApi } from './client';
import { SyncBadge, coveragePercent } from './constants';
import type { BaselineWithProduct, OrgTreeNode, SyncStatus } from './types';
import { OrgTreePanel } from './components/OrgTreePanel';

interface SecBaselineMgmtPageProps {
  onNavigateToView?: (view: string) => void;
}

export const SecBaselineMgmtPage: React.FC<SecBaselineMgmtPageProps> = ({ onNavigateToView }) => {
  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [list, setList] = useState<BaselineWithProduct[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [syncFilter, setSyncFilter] = useState<SyncStatus | 'all'>('all');
  const [syncing, setSyncing] = useState<number | null>(null);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const data = await secBaselineApi.getOrgTree();
      setTree(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await secBaselineApi.listBaselines({
        product_org_id: selectedOrgId ?? undefined,
        keyword: keyword.trim() || undefined,
        sync_status: syncFilter === 'all' ? undefined : syncFilter,
      });
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [selectedOrgId, keyword, syncFilter]);

  useEffect(() => { fetchTree(); }, [fetchTree]);
  useEffect(() => { fetchList(); }, [fetchList]);

  // 选中组织节点变化时立即取数(不等 keyword 防抖,组织切换要即时)
  const handleSelectOrg = (id: number | null) => {
    setSelectedOrgId(id);
  };

  const handleSync = async (b: BaselineWithProduct) => {
    const confirmed = await showConfirm({
      title: '同步基线到外部系统',
      message: `确认将基线「${b.baseline_name}」同步到外部系统?同步将推送基线元数据及全部节点,过程约 2-5 秒。`,
      confirmText: '确认同步',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setSyncing(b.id);
    try {
      const r = await secBaselineApi.syncBaseline(b.id);
      await showAlert({
        title: r.success ? '同步成功' : '同步失败',
        message: r.message || (r.success ? `基线「${b.baseline_name}」已同步` : '同步失败,请重试'),
        tone: r.success ? 'success' : 'error',
      });
      fetchList();
    } catch (e: any) {
      await showAlert({ message: e.message || '同步失败', tone: 'error' });
    } finally {
      setSyncing(null);
    }
  };

  // 统计(基于当前过滤集合)
  const stats = useMemo(() => {
    const total = list.length;
    const pending = list.filter((b) => b.sync_status === 'unsync' || b.sync_status === 'sync_failed').length;
    const failed = list.filter((b) => b.sync_status === 'sync_failed').length;
    const avgCov = total ? list.reduce((s, b) => s + coveragePercent(b.mapping_coverage_percent), 0) / total : 0;
    return { total, pending, failed, avgCov };
  }, [list]);

  // 面包屑(选中组织)
  const orgBreadcrumb = useMemo(() => {
    if (selectedOrgId == null) return '全部产品';
    const find = (nodes: OrgTreeNode[], parents: string[]): string | null => {
      for (const n of nodes) {
        const path = [...parents, n.name];
        if (n.id === selectedOrgId) return path.join(' / ');
        const c = find(n.children || [], path);
        if (c) return c;
      }
      return null;
    };
    return find(tree, []) || '全部产品';
  }, [selectedOrgId, tree]);

  const columns = useMemo<DataTableColumn<BaselineWithProduct>[]>(() => [
    {
      key: 'baseline', header: '基线',
      render: (b) => (
        <div>
          <div className="text-theme-text-primary font-medium">
            {b.baseline_name}
            {b.version ? <span className="ml-2 text-xs font-mono text-theme-text-faint">v{b.version}</span> : null}
          </div>
          <div className="text-xs text-theme-text-faint font-mono mt-0.5 truncate">{b.baseline_code || '—'} · {b.uuid}</div>
        </div>
      ),
    },
    {
      key: 'product', header: '所属产品',
      render: (b) => (
        <div>
          <div className="text-theme-text-secondary">{b.product_org_name || '—'}</div>
          <div className="text-xs text-theme-text-faint mt-0.5 truncate">{[b.bg_name, b.bu_name].filter(Boolean).join(' / ') || '—'}</div>
        </div>
      ),
    },
    { key: 'category', header: '分类', render: (b) => <span className="text-xs px-2 py-0.5 rounded border border-theme-border bg-theme-elevated text-theme-text-secondary">{b.category || '—'}</span> },
    {
      key: 'coverage', header: '覆盖率', width: 120,
      render: (b) => {
        const pct = coveragePercent(b.mapping_coverage_percent);
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-theme-elevated overflow-hidden">
              <div className="h-full bg-brand-primary" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-xs text-theme-text-secondary tabular-nums">{pct.toFixed(1)}%</span>
          </div>
        );
      },
    },
    {
      key: 'sync', header: '同步状态',
      render: (b) => (
        <div>
          <SyncBadge status={b.sync_status} />
          <div className="text-xs text-theme-text-faint mt-1 font-mono">{b.last_sync_time || '—'}</div>
        </div>
      ),
    },
    { key: 'person', header: '创建人', render: (b) => <span className="text-theme-text-secondary">{b.person_name || '—'}</span> },
    { key: 'create_time', header: '创建时间', render: (b) => <span className="text-xs text-theme-text-muted font-mono">{b.create_time}</span> },
    {
      key: 'actions', header: '操作', align: 'right', width: 120,
      render: (b) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="查看" onClick={() => onNavigateToView?.(`sec-baseline-detail-${b.id}`)}><Eye size={14} /></button>
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="同步" disabled={syncing === b.id} onClick={() => handleSync(b)}>
            {syncing === b.id ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />}
          </button>
          <button className="btn-ghost p-1.5 rounded hover:bg-theme-elevated text-theme-text-faint hover:text-brand-primary" title="编辑" onClick={() => onNavigateToView?.(`sec-baseline-detail-${b.id}`)}><Pencil size={14} /></button>
        </div>
      ),
    },
  ], [onNavigateToView, syncing, handleSync]);

  return (
    <div className="flex h-full">
      <OrgTreePanel
        tree={tree}
        selectedId={selectedOrgId}
        onSelect={handleSelectOrg}
        onManage={() => onNavigateToView?.('sec-baseline-org-tree')}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
            <PageHeader
              title="基线列表"
              description="管理安全功能基线,查看基线节点结构与同步状态"
              actions={
                <div className="flex items-center gap-2">
                  <button className="btn-icon" title="刷新" onClick={fetchList}><RefreshCw size={16} className={listLoading ? 'animate-spin' : ''} /></button>
                  <button className="btn btn-primary" onClick={() => onNavigateToView?.('sec-baseline-create')}><Plus size={16} /> 新增基线</button>
                </div>
              }
            />

            <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
              <StatisticCard label="基线总数" value={stats.total} icon={<Database size={16} />} />
              <StatisticCard label="待同步" value={stats.pending} tone="warning" icon={<RefreshCw size={16} />} />
              <StatisticCard label="同步失败" value={stats.failed} tone="danger" icon={<AlertTriangle size={16} />} />
              <StatisticCard label="平均覆盖率" value={`${stats.avgCov.toFixed(1)}%`} tone="success" icon={<Percent size={16} />} />
            </div>

            <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-theme-border-subtle flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={14} />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索基线名称 / 编码..."
                    className="form-input text-sm pl-8"
                  />
                </div>
                <select
                  value={syncFilter}
                  onChange={(e) => setSyncFilter(e.target.value as SyncStatus | 'all')}
                  className="form-select text-sm w-auto"
                >
                  <option value="all">全部同步状态</option>
                  <option value="unsync">未同步</option>
                  <option value="syncing">同步中</option>
                  <option value="synced">已同步</option>
                  <option value="sync_failed">同步失败</option>
                </select>
                <div className="flex items-center gap-3 ml-auto">
                  <span className="text-xs text-theme-text-muted truncate">{orgBreadcrumb}</span>
                  <span className="text-xs text-theme-text-faint">共 {list.length} 条</span>
                </div>
              </div>
              <DataTable
                columns={columns}
                data={list}
                rowKey={(b) => String(b.id)}
                loading={listLoading && list.length === 0}
                showRowNumber
                minWidth={860}
                onRowClick={(b) => onNavigateToView?.(`sec-baseline-detail-${b.id}`)}
                empty={<EmptyState variant="inline" title="暂无匹配的基线" />}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecBaselineMgmtPage;
