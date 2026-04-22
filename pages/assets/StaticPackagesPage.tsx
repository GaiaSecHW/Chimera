
import React, { useState, useEffect } from 'react';
import { Package, CheckCircle2, Upload, HardDrive, Layers, Download, Trash2, CheckSquare, Square, Server, Search, Globe, Activity, AlertTriangle, Loader2, X, RefreshCw, ShieldCheck } from 'lucide-react';
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
    <div className="p-10 space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">静态软件包管理</h2>
          <p className="text-slate-500 mt-1 font-medium">多架构二进制资产库与安全一致性底座</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={handleRefresh}
             disabled={isRefreshing}
             className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
             title="手动刷新列表"
           >
             <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
           </button>
           <button onClick={() => assetApi.staticPackages.checkAll().then(fetchStaticPackages)} className="bg-white border border-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-50 transition-all">
             <CheckCircle2 size={18} /> 全量校验
           </button>
           <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all">
             <Upload size={18} /> 极速上传
           </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
          <HardDrive className="absolute right-[-10px] bottom-[-10px] w-32 h-32 opacity-10 rotate-12" />
          <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest">存储总量</p>
          <h3 className="text-3xl font-black mt-2">{packageStats?.summary.total_size_human || '0.00 GB'}</h3>
          <p className="text-blue-200 text-xs mt-1 font-bold">共 {packageStats?.summary.total_packages} 个组件</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">累计下载</p>
          <h3 className="text-3xl font-black mt-2 text-slate-800">{packageStats?.summary.total_downloads.toLocaleString() || 0}</h3>
          <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold mt-1">
            <Activity size={12} /> 实时分发中
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm md:col-span-2">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">架构分布</p>
          <div className="flex flex-wrap gap-2">
            {packageStats?.by_architecture.slice(0, 6).map(arch => (
              <div key={arch.architecture} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-700 uppercase">{arch.architecture}</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{arch.package_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            type="text" 
            placeholder="搜索软件包名称、版本..." 
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500/20 transition-all font-medium"
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
                className="bg-indigo-50 text-indigo-600 px-6 py-3.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all shadow-sm shadow-indigo-500/5 animate-in slide-in-from-right-2 disabled:opacity-50"
              >
                {isValidating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                验证选中 ({selectedIds.size})
              </button>
              <button 
                onClick={() => handleDeleteClick(Array.from(selectedIds))}
                disabled={isDeleting}
                className="bg-red-50 text-red-600 px-6 py-3.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-red-600 hover:text-white transition-all shadow-sm shadow-red-500/5 animate-in slide-in-from-right-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                删除选中 ({selectedIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
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
                         <div className="w-12 h-12 bg-white border border-slate-200 text-blue-600 rounded-2xl flex items-center justify-center font-black shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
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
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <AlertTriangle size={48} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">确认删除资产？</h3>
              <p className="text-slate-500 mt-4 font-medium leading-relaxed">
                您正准备移除 <span className="text-red-600 font-black">{showConfirm.ids.length}</span> 个受信任的软件包资产。
                此操作将永久清理二进制文件及其所有分发记录，且<span className="font-black">无法撤回</span>。
              </p>
            </div>
            <div className="px-10 pb-10 flex gap-3">
              <button 
                onClick={() => setShowConfirm({ show: false, ids: [] })}
                disabled={isDeleting}
                className="flex-1 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
              >
                取消
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 shadow-xl shadow-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                立即删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
