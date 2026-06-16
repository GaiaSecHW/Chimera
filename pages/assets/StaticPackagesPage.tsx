
import React, { useState, useEffect } from 'react';
import { Package, CheckCircle2, Upload, Layers, Download, Trash2, CheckSquare, Square, Server, Search, Globe, AlertTriangle, Loader2, X, RefreshCw, ShieldCheck } from 'lucide-react';
import { StaticPackage, PackageStats } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { api } from '../../clients/api';

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
      // Fix: Explicitly cast id to string to avoid "unknown" type error in map
      await Promise.all(ids.map((id: string) => assetApi.staticPackages.check(id)));
      alert(`已完成 ${ids.length} 个软件包的完整性校验`);
      fetchStaticPackages();
    } catch (err) {
      alert("部分校验任务失败: " + (err instanceof Error ? err.message : "未知错误"));
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
      alert("删除失败: " + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setIsDeleting(false);
      setShowConfirm({ show: false, ids: [] });
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 md:px-6 2xl:px-8">
      <div className="w-full space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black text-slate-900">静态软件包管理</h1>
            <p className="text-sm text-slate-500">多架构二进制资产库与安全一致性底座</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
             <button
               onClick={handleRefresh}
               disabled={isRefreshing}
               className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
               title="手动刷新列表"
             >
               <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
               刷新
             </button>
             <button
               onClick={() => assetApi.staticPackages.checkAll().then(fetchStaticPackages)}
               className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
             >
               <CheckCircle2 size={16} /> 全量校验
             </button>
             <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white hover:bg-slate-800">
               <Upload size={16} /> 极速上传
             </button>
          </div>
        </div>

        {/* Stats Section */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <article className="rounded-xl border bg-gradient-to-br p-4 shadow-sm from-slate-50 via-white to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-slate-500">存储总量</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-slate-900">{packageStats?.summary.total_size_human || '0.00 GB'}</div>
          </article>
          <article className="rounded-xl border bg-gradient-to-br p-4 shadow-sm from-slate-50 via-white to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-slate-500">组件总数</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-slate-900">{packageStats?.summary.total_packages ?? 0}</div>
          </article>
          <article className="rounded-xl border bg-gradient-to-br p-4 shadow-sm from-sky-50 via-white to-sky-100/70 border-sky-200/70">
            <div className="truncate text-center text-xs font-bold text-slate-500">累计下载</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-slate-900">{packageStats?.summary.total_downloads.toLocaleString() || 0}</div>
          </article>
          <article className="rounded-xl border bg-gradient-to-br p-4 shadow-sm from-slate-50 via-white to-slate-100/70 border-slate-200/70">
            <div className="truncate text-center text-xs font-bold text-slate-500">架构种类数</div>
            <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-slate-900">{packageStats?.by_architecture.length ?? 0}</div>
          </article>
        </section>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="搜索软件包名称、版本..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 ring-slate-300/40 font-medium"
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
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 text-indigo-600 px-3 py-2 text-sm font-black hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isValidating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  验证选中 ({selectedIds.size})
                </button>
                <button
                  onClick={() => handleDeleteClick(Array.from(selectedIds))}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm font-black hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
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
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 md:px-5">
              <h2 className="text-lg font-black text-slate-900">架构分布</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-4 md:px-5">
              {packageStats.by_architecture.slice(0, 6).map(arch => (
                <div key={arch.architecture} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase">{arch.architecture}</span>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{arch.package_count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 md:px-5">
            <h2 className="text-lg font-black text-slate-900">软件包列表</h2>
          </div>
           <table className="w-full text-left">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-5 w-10">
                    <button onClick={() => setSelectedIds(isAllSelected ? new Set() : new Set(filteredPackages.map(p => p.id)))} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                      {isAllSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                    </button>
                  </th>
                  <th className="px-4 py-5">软件包</th>
                  <th className="px-6 py-5">系统 / 架构</th>
                  <th className="px-6 py-5 text-center">统计指标</th>
                  <th className="px-6 py-5">状态</th>
                  <th className="px-6 py-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {filteredPackages.map(pkg => (
                    <tr key={pkg.id} className="hover:bg-blue-50/30 transition-all group cursor-pointer" onClick={() => { setActivePackageId(pkg.id); setCurrentView('static-package-detail'); }}>
                       <td className="px-6 py-6" onClick={e => e.stopPropagation()}>
                         <button onClick={() => {
                           const n = new Set(selectedIds);
                           if (n.has(pkg.id)) n.delete(pkg.id); else n.add(pkg.id);
                           setSelectedIds(n);
                         }} className="p-2">
                           {selectedIds.has(pkg.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-300 hover:text-slate-400" />}
                         </button>
                       </td>
                       <td className="px-4 py-6">
                         <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white border border-slate-200 text-blue-600 rounded-xl flex items-center justify-center font-black shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
                             {pkg.name[0].toUpperCase()}
                           </div>
                           <div className="min-w-0">
                             <p className="text-sm font-black text-slate-800 truncate">{pkg.name}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">VERSION: {pkg.version}</p>
                           </div>
                         </div>
                       </td>
                       <td className="px-6 py-6">
                         <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase">
                            <Globe size={12} /> {pkg.system || 'linux'}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase">
                            <Server size={14} className="text-blue-500" /> {pkg.architecture}
                          </div>
                         </div>
                       </td>
                       <td className="px-6 py-6 text-center">
                         <div className="flex flex-col items-center">
                           <span className="text-xs font-black text-slate-700">{(pkg.total_size / 1024 / 1024).toFixed(1)}MB</span>
                           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{pkg.download_count} 下载</span>
                         </div>
                       </td>
                       <td className="px-6 py-6"><StatusBadge status={pkg.check_status} /></td>
                       <td className="px-6 py-6 text-right" onClick={e => e.stopPropagation()}>
                         <div className="flex justify-end gap-1">
                           <a href={assetApi.staticPackages.getDownloadUrl(pkg.id)} className="p-3 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl border border-transparent hover:border-indigo-100 transition-all">
                             <Download size={18} />
                           </a>
                           <button
                              onClick={(e) => handleDeleteClick([pkg.id], e)}
                              className="p-3 text-slate-400 hover:text-red-600 bg-slate-50 rounded-xl border border-transparent hover:border-red-100 transition-all"
                           >
                             <Trash2 size={18} />
                           </button>
                         </div>
                       </td>
                    </tr>
                 ))}
                 {filteredPackages.length === 0 && (
                   <tr><td colSpan={6} className="py-24 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">未找到匹配的软件包</td></tr>
                 )}
              </tbody>
           </table>
        </section>

        {/* Delete Confirmation Modal */}
        {showConfirm.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={40} />
                </div>
                <h3 className="text-lg font-black text-slate-900">确认删除资产？</h3>
                <p className="text-sm text-slate-500 mt-3 font-medium leading-relaxed">
                  您正准备移除 <span className="text-red-600 font-black">{showConfirm.ids.length}</span> 个受信任的软件包资产。
                  此操作将永久清理二进制文件及其所有分发记录，且<span className="font-black">无法撤回</span>。
                </p>
              </div>
              <div className="px-8 pb-8 flex gap-3">
                <button
                  onClick={() => setShowConfirm({ show: false, ids: [] })}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  立即删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
