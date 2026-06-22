
import React, { useState, useEffect } from 'react';
import { Download, Search, FileText, HardDrive, ShieldCheck, Loader2, Info, FolderOpen, RefreshCw, Layers } from 'lucide-react';
import { StaticPackage, PackageFile } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../design-system';

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
    <div className="h-full flex flex-col items-center justify-center p-20 text-theme-text-muted">
      <Loader2 className="animate-spin text-blue-400 mb-4" size={48} />
      <p className="font-semibold uppercase tracking-widest text-[10px]">正在解析二进制包元数据...</p>
    </div>
  );

  if (!data) return (
    <div className="p-20 text-center space-y-4">
      <div className="w-20 h-20 bg-theme-elevated rounded-lg mx-auto flex items-center justify-center text-theme-text-faint">
        <Layers size={40} />
      </div>
      <h3 className="text-xl font-semibold text-theme-text-secondary">软件包未找到或已下线</h3>
      <button onClick={onBack} className="text-blue-400 font-semibold hover:underline px-6 py-2">返回资源中心</button>
    </div>
  );

  const { package: pkg } = data;

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            {pkg.name}
            <StatusBadge status={pkg.check_status} />
          </div>
        }
        description={
          <div className="flex items-center gap-2">
            <span className="text-theme-text-muted font-medium text-xs">MD5: {pkg.id}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span className="text-theme-text-muted font-medium text-xs">VER: {pkg.version}</span>
          </div>
        }
        back={{ label: '返回资源中心', onClick: onBack }}
        actions={
          <div className="flex gap-3">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="px-6 py-4 bg-theme-surface border border-theme-border text-theme-text-secondary rounded-xl font-semibold flex items-center gap-2 hover:bg-theme-elevated transition-all disabled:opacity-50"
            >
              {checking ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              完整性校验
            </button>
            <a
              href={assetApi.staticPackages.getDownloadUrl(pkg.id)}
              className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-all"
            >
              <Download size={18} /> 下载全量包
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar: Metadata */}
        <div className="lg:col-span-1 space-y-6">
 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border space-y-6">
            <h4 className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest flex items-center gap-2">
              <Info size={14} /> 资产静态属性
            </h4>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-theme-border">
                <span className="text-xs font-medium text-theme-text-muted">操作系统</span>
                <span className="text-xs font-medium text-theme-text-primary uppercase px-2 py-1 bg-theme-elevated rounded-lg">{pkg.system}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-theme-border">
                <span className="text-xs font-medium text-theme-text-muted">硬件架构</span>
                <span className="text-xs font-medium text-blue-400 uppercase px-2 py-1 bg-blue-500/15 rounded-lg">{pkg.architecture}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-theme-border">
                <span className="text-xs font-medium text-theme-text-muted">文件计数</span>
                <span className="text-xs font-medium text-theme-text-primary">{pkg.file_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-theme-border">
                <span className="text-xs font-medium text-theme-text-muted">物理大小</span>
                <span className="text-xs font-medium text-theme-text-primary">{(pkg.total_size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-medium text-theme-text-muted">下载热度</span>
                <span className="text-xs font-medium text-theme-text-primary">{pkg.download_count} 次</span>
              </div>
            </div>
          </div>

          <div className="bg-theme-surface p-8 rounded-xl text-theme-text-faint space-y-6">
            <h4 className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">底层安全信息</h4>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[9px] font-medium text-theme-text-muted uppercase">原始文件位置</p>
 <p className="text-[10px] font-mono break-all bg-slate-100/10 p-3 rounded-xl border border-slate-200/5 leading-relaxed text-theme-text-muted">
                  {pkg.original_package_path || '系统内部存储'}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-medium text-theme-text-muted uppercase">入库时间</p>
                <p className="text-xs font-medium text-white">{pkg.upload_time?.replace('T', ' ')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Section: File Browsing */}
        <div className="lg:col-span-3 space-y-6">
 <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden flex flex-col min-h-[600px]">
            <div className="p-8 border-b border-theme-border flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-blue-500/15 text-blue-400 rounded-xl">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-theme-text-primary">包内组件索引</h3>
                  <p className="text-xs text-theme-text-muted font-medium uppercase tracking-tighter">TOTAL FILES: {data.total_files}</p>
                </div>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-text-faint" size={18} />
                <input
                  placeholder="检索具体组件名称或路径..."
                  className="w-full pl-12 pr-4 py-3.5 bg-theme-elevated rounded-xl text-xs outline-none focus:ring-2 ring-blue-500/20 transition-all border-none font-medium"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 border-b border-theme-border sticky top-0 z-10">
                  <tr className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
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
                          <FileText size={18} className="text-theme-text-faint group-hover:text-blue-500 transition-colors shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-theme-text-secondary truncate">{file.name}</p>
                            <p className="text-[10px] font-mono text-theme-text-muted truncate mt-0.5">{file.path}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[11px] font-medium text-theme-text-muted bg-theme-elevated px-2 py-1 rounded-lg">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[11px] font-medium text-theme-text-muted">{file.download_count}</span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <a
                          href={assetApi.staticPackages.getFileDownloadUrl(pkg.id, file.path)}
                          className="p-3 text-theme-text-faint hover:text-blue-400 hover:bg-theme-elevated border border-transparent hover:border-blue-500/20 rounded-xl inline-flex transition-all"
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
                        <p className="text-theme-text-faint font-semibold uppercase tracking-widest text-xs">NO COMPONENTS MATCHED</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-theme-surface border-t border-theme-border flex justify-between items-center">
              <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
                显示 {filteredFiles.length} / {data.total_files} 个资源结果
              </span>
              <div className="flex gap-2">
                 <button className="px-3 py-1 bg-theme-elevated border border-theme-border rounded-lg text-[10px] font-medium text-theme-text-muted hover:text-blue-400 transition-all">PREV</button>
                 <button className="px-3 py-1 bg-theme-elevated border border-theme-border rounded-lg text-[10px] font-medium text-theme-text-muted hover:text-blue-400 transition-all">NEXT</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};