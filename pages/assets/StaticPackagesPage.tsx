
import React, { useState, useEffect } from 'react';
import { Package, CheckCircle2, Upload, Layers, Download, Trash2, CheckSquare, Square, Server, Search, Globe, AlertTriangle, Loader2, X, RefreshCw, ShieldCheck } from 'lucide-react';
import { StaticPackage, PackageStats } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { api } from '../../clients/api';
import { DataTable, DataTableColumn, Modal, PageHeader } from '../../design-system';

interface StaticPackagesPageProps {
  staticPackages: StaticPackage[];
  packageStats: PackageStats | null;
  fetchStaticPackages: () => void;
  setActivePackageId: (id: string) => void;
  setCurrentView: (view: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}

export const StaticPackagesPage: React.FC<StaticPackagesPageProps> = ({
  staticPackages, packageStats, fetchStaticPackages, setActivePackageId, setCurrentView, selectedIds, setSelectedIds
}) => {
  const assetApi = api.domains.assets;
  const [localSearch, setLocalSearch] = useState('');
  const [filterArch, setFilterArch] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConfirm, setShowConfirm] = useState<{show: boolean, ids: string[]}>({ show: false, ids: [] });

  const filteredPackages = staticPackages.filter(p =>
    p.name.toLowerCase().includes(localSearch.toLowerCase()) &&
    (filterArch === '' || p.architecture === filterArch)
  );

  const isAllSelected = filteredPackages.length > 0 && selectedIds.size === filteredPackages.length;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchStaticPackages();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBatchCheck = async () => {
    if (selectedIds.size === 0) return;
    setIsValidating(true);
    try {
      const ids = Array.from(selectedIds);
      // Fix: Explicitly cast id to string to avoid"unknown" type error in map
      await Promise.all(ids.map((id: string) => assetApi.staticPackages.check(id)));
      alert(`已完成 ${ids.length} 个软件包的完整性校验`);
      fetchStaticPackages();
    } catch (err) {
      alert("部分校验任务失败:" + (err instanceof Error ? err.message :"未知错误"));
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteClick = (ids: string[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowConfirm({ show: true, ids });
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (showConfirm.ids.length === 1) {
        await assetApi.staticPackages.delete(showConfirm.ids[0]);
      } else {
        await assetApi.staticPackages.batchDelete(showConfirm.ids);
      }
      setSelectedIds(new Set());
      fetchStaticPackages();
    } catch (err) {
      alert("删除失败:" + (err instanceof Error ? err.message :"未知错误"));
    } finally {
      setIsDeleting(false);
      setShowConfirm({ show: false, ids: [] });
    }
  };

  return (
    <div className="min-h-full bg-theme-bg-app px-4 py-5 md:px-6 2xl:px-8">
      <div className="w-full space-y-4">
        <PageHeader
          title="静态软件包管理"
          description="多架构二进制资产库与安全一致性底座"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
                title="手动刷新列表"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                刷新
              </button>
              <button
                onClick={() => assetApi.staticPackages.checkAll().then(fetchStaticPackages)}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated"
              >
                <CheckCircle2 size={16} /> 全量校验
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-semibold text-white hover:bg-theme-elevated">
                <Upload size={16} /> 极速上传
              </button>
            </div>
          }
        />

        {/* Stats Section */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-medium text-theme-text-muted">存储总量</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{packageStats?.summary.total_size_human || '0.00 GB'}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-medium text-theme-text-muted">组件总数</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{packageStats?.summary.total_packages ?? 0}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-sky-50 via-slate-50 to-sky-100/70 border-sky-200/70">
            <div className="truncate text-center text-xs font-medium text-theme-text-muted">累计下载</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{packageStats?.summary.total_downloads.toLocaleString() || 0}</div>
          </article>
 <article className="rounded-xl border bg-gradient-to-br p-4 from-slate-50 via-slate-50 to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-medium text-theme-text-muted">架构种类数</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary">{packageStats?.by_architecture.length ?? 0}</div>
          </article>
        </section>

        {/* Filter Bar */}
 <div className="flex flex-col md:flex-row gap-3 items-center justify-between rounded-xl border border-theme-border bg-theme-surface p-3">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" size={16} />
            <input
              type="text"
              placeholder="搜索软件包名称、版本..."
              className="w-full pl-9 pr-3 py-2 bg-theme-elevated border border-theme-border rounded-xl text-sm outline-none focus:ring-2 ring-slate-300/40 font-medium"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleBatchCheck}
                  disabled={isValidating}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/15 text-indigo-400 px-3 py-2 text-sm font-semibold hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isValidating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  验证选中 ({selectedIds.size})
                </button>
                <button
                  onClick={() => handleDeleteClick(Array.from(selectedIds))}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 text-red-400 px-3 py-2 text-sm font-semibold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  删除选中 ({selectedIds.size})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Architecture chips panel */}
        {packageStats && packageStats.by_architecture.length > 0 && (
 <section className="overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
            <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
              <h2 className="text-lg font-semibold text-theme-text-primary">架构分布</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-4 md:px-5">
              {packageStats.by_architecture.slice(0, 6).map(arch => (
                <div key={arch.architecture} className="px-3 py-1.5 bg-theme-surface border border-theme-border rounded-xl flex items-center gap-2">
                  <span className="text-[10px] font-medium text-theme-text-secondary uppercase">{arch.architecture}</span>
                  <span className="text-[10px] font-medium text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full">{arch.package_count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

 <section className="overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
          <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
            <h2 className="text-lg font-semibold text-theme-text-primary">软件包列表</h2>
          </div>
           {(() => {
              const columns: DataTableColumn<StaticPackage>[] = [
                {
                  key: 'select',
                  header: (
                    <button onClick={() => setSelectedIds(isAllSelected ? new Set() : new Set(filteredPackages.map(p => p.id)))} className="p-2 hover:bg-theme-elevated rounded-lg transition-colors">
                      {isAllSelected ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} />}
                    </button>
                  ),
                  render: (pkg) => (
                    <span onClick={e => e.stopPropagation()}>
                      <button onClick={() => {
                        const n = new Set(selectedIds);
                        if (n.has(pkg.id)) n.delete(pkg.id); else n.add(pkg.id);
                        setSelectedIds(n);
                      }} className="p-2">
                        {selectedIds.has(pkg.id) ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} className="text-theme-text-faint hover:text-theme-text-muted" />}
                      </button>
                    </span>
                  ),
                },
                {
                  key: 'name',
                  header: '软件包',
                  render: (pkg) => (
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-theme-surface border border-theme-border text-blue-400 rounded-xl flex items-center justify-center font-semibold group-hover:bg-blue-600 group-hover:text-white transition-all">
                        {pkg.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-theme-text-primary truncate">{pkg.name}</p>
                        <p className="text-[10px] text-theme-text-muted font-medium uppercase tracking-tighter">VERSION: {pkg.version}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'system',
                  header: '系统 / 架构',
                  render: (pkg) => (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[10px] font-medium text-theme-text-muted uppercase">
                        <Globe size={12} /> {pkg.system || 'linux'}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-theme-text-secondary uppercase">
                        <Server size={14} className="text-blue-500" /> {pkg.architecture}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'stats',
                  header: '统计指标',
                  render: (pkg) => (
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-medium text-theme-text-secondary">{(pkg.total_size / 1024 / 1024).toFixed(1)}MB</span>
                      <span className="text-[10px] text-theme-text-muted font-medium uppercase tracking-tighter">{pkg.download_count} 下载</span>
                    </div>
                  ),
                },
                {
                  key: 'check_status',
                  header: '状态',
                  render: (pkg) => <StatusBadge status={pkg.check_status} />,
                },
                {
                  key: 'actions',
                  header: '操作',
                  render: (pkg) => (
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <a href={assetApi.staticPackages.getDownloadUrl(pkg.id)} className="p-3 text-theme-text-muted hover:text-indigo-400 bg-theme-elevated rounded-xl border border-transparent hover:border-indigo-500/20 transition-all">
                        <Download size={18} />
                      </a>
                      <button
                        onClick={(e) => handleDeleteClick([pkg.id], e)}
                        className="p-3 text-theme-text-muted hover:text-red-400 bg-theme-elevated rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ),
                },
              ];
              return (
                <DataTable
                  columns={columns}
                  data={filteredPackages}
                  rowKey={(r) => String(r.id)}
                  onRowClick={(pkg) => { setActivePackageId(pkg.id); setCurrentView('static-package-detail'); }}
                  empty={<div className="text-center py-8 text-theme-text-muted">未找到匹配的软件包</div>}
                />
              );
           })()}
        </section>

        {/* Delete Confirmation Modal */}
        <Modal
          open={showConfirm.show}
          onClose={() => setShowConfirm({ show: false, ids: [] })}
          className="max-w-md"
        >
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-lg flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-lg font-semibold text-theme-text-primary">确认删除资产？</h3>
            <p className="text-sm text-theme-text-muted mt-3 font-medium leading-relaxed">
              您正准备移除 <span className="text-red-400 font-semibold">{showConfirm.ids.length}</span> 个受信任的软件包资产。
              此操作将永久清理二进制文件及其所有分发记录，且<span className="font-semibold">无法撤回</span>。
            </p>
          </div>
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={() => setShowConfirm({ show: false, ids: [] })}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl border border-theme-border bg-theme-surface text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
              立即删除
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
};