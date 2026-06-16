
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Download, Search, FileText, HardDrive, ShieldCheck, Loader2, Info, FolderOpen, RefreshCw, Layers } from 'lucide-react';
import { StaticPackage, PackageFile } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';

interface StaticPackageDetailPageProps {
  packageId: string;
  onBack: () => void;
}

export const StaticPackageDetailPage: React.FC<StaticPackageDetailPageProps> = ({ packageId, onBack }) => {
  const assetApi = api.domains.assets;
  const [data, setData] = useState<{ package: StaticPackage; files: PackageFile[]; total_files: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filesPerPage] = useState(50);

  useEffect(() => {
    loadDetail();
  }, [packageId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await assetApi.staticPackages.getDetail(packageId);
      setData(res);
    } catch (err) {
      console.error("Failed to load package details", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await assetApi.staticPackages.check(packageId);
      loadDetail(); // Refresh after check
    } catch (err) {
      alert("校验失败");
    } finally {
      setChecking(false);
    }
  };

  const filteredFiles = data?.files.filter(f =>
    f.path.toLowerCase().includes(fileSearch.toLowerCase()) ||
    f.name.toLowerCase().includes(fileSearch.toLowerCase())
  ) || [];

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
      <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
      <p className="font-bold uppercase tracking-widest text-[10px]">正在解析二进制包元数据...</p>
    </div>
  );

  if (!data) return (
    <div className="p-20 text-center space-y-4">
      <div className="w-20 h-20 bg-slate-100 rounded-3xl mx-auto flex items-center justify-center text-slate-300">
        <Layers size={40} />
      </div>
      <h3 className="text-xl font-black text-slate-600">软件包未找到或已下线</h3>
      <button onClick={onBack} className="text-blue-600 font-black hover:underline px-6 py-2">返回资源中心</button>
    </div>
  );

  const { package: pkg } = data;

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
 <button onClick={onBack} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-all group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">{pkg.name}</h2>
              <StatusBadge status={pkg.check_status} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 font-bold text-xs">MD5: {pkg.id}</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-slate-500 font-bold text-xs">VER: {pkg.version}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="px-6 py-4 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            {checking ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
            完整性校验
          </button>
          <a
            href={assetApi.staticPackages.getDownloadUrl(pkg.id)}
 className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Download size={18} /> 下载全量包
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar: Metadata */}
        <div className="lg:col-span-1 space-y-6">
 <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Info size={14} /> 资产静态属性
            </h4>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-500">操作系统</span>
                <span className="text-xs font-black text-slate-800 uppercase px-2 py-1 bg-slate-50 rounded-lg">{pkg.system}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-500">硬件架构</span>
                <span className="text-xs font-black text-blue-600 uppercase px-2 py-1 bg-blue-50 rounded-lg">{pkg.architecture}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-500">文件计数</span>
                <span className="text-xs font-black text-slate-800">{pkg.file_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-500">物理大小</span>
                <span className="text-xs font-black text-slate-800">{(pkg.total_size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-bold text-slate-500">下载热度</span>
                <span className="text-xs font-black text-slate-800">{pkg.download_count} 次</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-slate-300 space-y-6">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">底层安全信息</h4>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-slate-500 uppercase">原始文件位置</p>
 <p className="text-[10px] font-mono break-all bg-slate-100/10 p-3 rounded-xl border border-slate-200/5 leading-relaxed text-slate-400">
                  {pkg.original_package_path || '系统内部存储'}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-slate-500 uppercase">入库时间</p>
                <p className="text-xs font-black text-white">{pkg.upload_time?.replace('T', ' ')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Section: File Browsing */}
        <div className="lg:col-span-3 space-y-6">
 <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">包内组件索引</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">TOTAL FILES: {data.total_files}</p>
                </div>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input
                  placeholder="检索具体组件名称或路径..."
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 rounded-2xl text-xs outline-none focus:ring-2 ring-blue-500/20 transition-all border-none font-medium"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 border-b border-slate-100 sticky top-0 z-10">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">路径标识 (Relative Path)</th>
                    <th className="px-6 py-5">物理大小</th>
                    <th className="px-6 py-5">下载频次</th>
                    <th className="px-8 py-5 text-right">分发</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredFiles.map((file, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/20 transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <FileText size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-700 truncate">{file.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{file.path}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[11px] font-black text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[11px] font-black text-slate-400">{file.download_count}</span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <a
                          href={assetApi.staticPackages.getFileDownloadUrl(pkg.id, file.path)}
                          className="p-3 text-slate-300 hover:text-blue-600 hover:bg-slate-50 border border-transparent hover:border-blue-100 rounded-xl inline-flex transition-all"
                          title="独立分发此组件"
                        >
                          <Download size={16} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {filteredFiles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-24 text-center">
                        <p className="text-slate-300 font-black uppercase tracking-widest text-xs">NO COMPONENTS MATCHED</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                显示 {filteredFiles.length} / {data.total_files} 个资源结果
              </span>
              <div className="flex gap-2">
                 <button className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:text-blue-600 transition-all">PREV</button>
                 <button className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:text-blue-600 transition-all">NEXT</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
