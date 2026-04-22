import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ExternalLink, 
  RefreshCw, 
  Loader2, 
  Terminal, 
  Database, 
  Activity, 
  ShieldCheck, 
  Box, 
  Network, 
  Cpu, 
  HardDrive, 
  Clock, 
  X, 
  Trash2, 
  ArrowUpRight, 
  Lock, 
  Eye, 
  EyeOff, 
  Key, 
  FileCode,
  AlertTriangle,
  Info,
  Calendar,
  CheckCircle2,
  Server,
  Copy,
  Check,
  ShieldAlert,
  Search,
  ArrowRightLeft,
  ChevronRight,
  Monitor,
  Globe,
  Bot
} from 'lucide-react';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';

const executionApi = api.domains.execution;

interface ExecutionCodeAuditDetailPageProps {
  projectId: string;
  instanceName: string;
  onBack: () => void;
}
type DetailTab = 'overview' | 'mounts' | 'llm' | 'logs';

const CredentialItem: React.FC<{ label: string; value?: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!value) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{label}</span>
      <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between group relative overflow-hidden shadow-sm hover:border-blue-200 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Key size={14} className="text-blue-500 shrink-0" />
          <span className="text-sm font-mono font-black text-slate-700 truncate">
            {isVisible ? value : '••••••••••••••••'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
           <button 
             onClick={() => setIsVisible(!isVisible)} 
             className="p-2 text-slate-300 hover:text-blue-600 transition-colors rounded-xl hover:bg-blue-50"
             title={isVisible ? "Hide Password" : "Show Password"}
           >
             {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
           </button>
           <button 
             onClick={handleCopy} 
             className={`p-2 rounded-xl transition-all ${copied ? 'bg-green-50 text-green-600' : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50'}`}
             title="Copy to Clipboard"
           >
             {copied ? <Check size={16} /> : <Copy size={16} />}
           </button>
        </div>
        {copied && (
          <div className="absolute top-0 right-0 h-full w-1.5 bg-green-500 animate-in fade-in slide-in-from-right-1" />
        )}
      </div>
    </div>
  );
};

export const ExecutionCodeAuditDetailPage: React.FC<ExecutionCodeAuditDetailPageProps> = ({ projectId, instanceName, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<any>(null);
  const [k8sStatus, setK8sStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string>('');
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [tailLines, setTailLines] = useState(200);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Confirmation Modals State
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isActionProcessing, setIsActionProcessing] = useState(false);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadRuntimeInfo, 5000); 
    return () => clearInterval(interval);
  }, [projectId, instanceName]);

  useEffect(() => {
    setActiveTab('overview');
  }, [instanceName]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const detail = await loadDetail();
      await Promise.all([
        loadRuntimeInfo(),
        loadLogs(detail)
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async () => {
    const res = await executionApi.codeServer.getDetail(projectId, instanceName);
    setInstance(res);
    return res;
  };

  const loadRuntimeInfo = async () => {
    const res = await executionApi.codeServer.getStatus(projectId, instanceName);
    setK8sStatus(res);
  };

  const loadLogs = async (targetInstance?: any) => {
    const effectiveInstance = targetInstance || instance;
    if (!effectiveInstance?.deployment_name) {
      setLogs('Deployment 尚未就绪，暂无可用日志。');
      return;
    }
    setIsRefreshingLogs(true);
    try {
      const res = await executionApi.codeServer.getLogs(projectId, instanceName, tailLines);
      setLogs(res.logs || '');
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Code Server没有关联的Deployment')) {
        setLogs('Deployment 尚未关联，暂无可用日志。');
        return;
      }
      throw err;
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  const handleRestart = async () => {
    setIsActionProcessing(true);
    try {
      await executionApi.codeServer.restart(projectId, instanceName);
      setShowRebuildConfirm(false);
      onBack();
    } catch (err: any) {
      alert("重建失败: " + err.message);
    } finally {
      setIsActionProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsActionProcessing(true);
    try {
      await executionApi.codeServer.delete(projectId, instanceName);
      setShowDeleteConfirm(false);
      onBack();
    } catch (err: any) {
      alert("删除失败: " + err.message);
    } finally {
      setIsActionProcessing(false);
    }
  };

  if (loading && !instance) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin text-blue-600 mb-6" size={64} />
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]"> Establishing Encrypted Session with K8S Engine...</p>
      </div>
    );
  }

  const currentStatus = k8sStatus?.status || instance?.status || 'Unknown';
  const podStatus = k8sStatus?.pod_status;
  const isPending = podStatus?.toLowerCase() === 'pending';
  const llmProviderKeys = Array.isArray(instance?.llm_provider_keys)
    ? instance.llm_provider_keys.filter((item: any) => String(item || '').trim())
    : (instance?.llm_provider_key ? [instance.llm_provider_key] : []);
  const llmProviderSnapshots = Array.isArray(instance?.llm_provider_snapshots) && instance.llm_provider_snapshots.length > 0
    ? instance.llm_provider_snapshots
    : (instance?.llm_provider_snapshot ? [instance.llm_provider_snapshot] : []);
  const llmSnapshot = llmProviderSnapshots[llmProviderSnapshots.length - 1] || null;
  const llmMappedEnvKeys = Array.isArray(instance?.llm_provider_mapped_env_keys) ? instance.llm_provider_mapped_env_keys : [];
  const llmFileBindings = Array.isArray(instance?.llm_file_bindings) ? instance.llm_file_bindings : [];

  return (
    <div className="p-10 space-y-8 animate-in slide-in-from-right duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      {/* Detail Header - More Compact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack}
            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white hover:shadow-lg transition-all shadow-sm group active:scale-95"
          >
            <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform text-slate-600" />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-black text-slate-800 tracking-tighter">{instanceName}</h2>
              <StatusBadge status={currentStatus} />
              {podStatus && podStatus !== 'Running' && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border uppercase animate-pulse ${
                  isPending ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'
                }`}>
                   {podStatus}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 pt-1">
               <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                 <Box size={14} className="text-blue-500" /> UUID: <span className="text-slate-700 font-mono">{(k8sStatus?.id || instance?.id)?.slice(0, 8)}</span>
               </div>
               <div className="w-1 h-1 bg-slate-200 rounded-full" />
               <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                 <Calendar size={14} className="text-indigo-500" /> DEPLOYED: <span className="text-slate-700">{instance?.created_at?.split('T')[0]}</span>
               </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 self-end md:self-center">
          {instance?.access_url && currentStatus === 'running' && (
            <a 
              href={instance.access_url} target="_blank" rel="noreferrer"
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-blue-700 transition-all flex items-center gap-2 shadow-xl shadow-blue-500/20 active:scale-95"
            >
              LAUNCH VSCODE <ArrowUpRight size={16} />
            </a>
          )}
          
          <div className="flex items-center gap-2">
             <button 
               onClick={loadAll}
               className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all shadow-sm group"
               title="Refresh Remote Context"
             >
               <RefreshCw size={18} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
             </button>
             <button 
               onClick={() => setShowRebuildConfirm(true)}
               disabled={isPending || isActionProcessing}
               className="px-5 py-3 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl font-black text-xs hover:bg-amber-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
             >
               <RefreshCw size={14} /> REBUILD
             </button>
             <button 
               onClick={() => setShowDeleteConfirm(true)}
               className="px-5 py-3 bg-red-600 text-white rounded-2xl font-black text-xs hover:bg-red-700 transition-all flex items-center gap-2 shadow-xl shadow-red-500/20"
             >
               <Trash2 size={14} /> DESTROY
             </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { key: 'overview' as const, label: '概览' },
            { key: 'mounts' as const, label: '挂载' },
            { key: 'llm' as const, label: 'LLM' },
            { key: 'logs' as const, label: '日志' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest transition ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area - Vertical Stack */}
      <div className="flex flex-col gap-10">
        {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
           {/* Telemetry Section */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                   <Activity size={16} className="text-blue-500" /> K8S Telemetry
                 </h4>
                 {currentStatus === 'running' && <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-[8px] font-black uppercase"><div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" /> Live</div>}
              </div>
              
              <div className="space-y-4">
                 <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase">POD IP Address</span>
                    <span className={`text-xs font-mono font-black ${k8sStatus?.pod_ip ? 'text-blue-600' : 'text-slate-300'}`}>
                       {k8sStatus?.pod_ip || 'PENDING...'}
                    </span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Host Node</span>
                    <span className={`text-[10px] font-black ${k8sStatus?.node_name ? 'text-slate-700' : 'text-slate-300'}`}>
                       {k8sStatus?.node_name || 'SCHEDULING...'}
                    </span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Instance Replicas</span>
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-black text-slate-700">
                          {k8sStatus?.ready_replicas ?? 0} / {k8sStatus?.total_replicas ?? 1}
                       </span>
                       <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                             className="h-full bg-blue-600 transition-all duration-700" 
                             style={{ width: `${(k8sStatus?.ready_replicas / k8sStatus?.total_replicas) * 100 || 0}%` }} 
                          />
                       </div>
                    </div>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Access Endpoint</span>
                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-end ml-4">
                       <Globe size={12} className="text-blue-500 shrink-0" />
                       <span className="text-[10px] font-mono font-bold text-slate-600 truncate hover:text-blue-600 transition-colors">
                          {k8sStatus?.access_url || 'ALLOCATING...'}
                       </span>
                    </div>
                 </div>
              </div>
           </div>

           {/* Credentials Section */}
           <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                <Lock size={16} className="text-amber-500" /> Access Credentials
              </h4>
              
              <div className="grid grid-cols-1 gap-4">
                 <CredentialItem label="Workspace Password" value={instance?.code_server_env?.PASSWORD} />
                 <CredentialItem label="Sudo Privileges" value={instance?.code_server_env?.SUDO_PASSWORD} />
              </div>
           </div>

           {/* Storage Persistence */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6 overflow-hidden relative">
              <Database className="absolute right-[-10px] bottom-[-10px] w-20 h-20 opacity-5" />
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                <HardDrive size={16} className="text-indigo-500" /> Persistence Mapping
              </h4>
              
              <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                 {instance?.source_pvcs?.map((pvc: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <FileCode size={14} className="text-blue-500 shrink-0" />
                       <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-700 truncate">{pvc.pvc_name}</p>
                          <p className="text-[8px] font-mono text-slate-400 uppercase truncate">MT: {pvc.mount_path}</p>
                       </div>
                    </div>
                 ))}
                 {instance?.output_pvcs?.map((pvc: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl text-white">
                       <Database size={14} className="text-indigo-400 shrink-0" />
                       <div className="min-w-0">
                          <p className="text-[10px] font-black truncate">{pvc.pvc_name}</p>
                          <p className="text-[8px] font-mono text-slate-500 uppercase truncate">MT: {pvc.mount_path}</p>
                       </div>
                    </div>
                 ))}
                 {(!instance?.source_pvcs?.length && !instance?.output_pvcs?.length) && (
                    <div className="p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-400 italic text-center">No storage attached</div>
                 )}
              </div>
           </div>
        </div>
        )}

        {activeTab === 'mounts' && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
              <HardDrive size={16} className="text-indigo-500" /> 挂载明细
            </h4>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">输入挂载（源码）</p>
                {(instance?.source_pvcs || []).length > 0 ? (instance.source_pvcs || []).map((pvc: any, i: number) => (
                  <div key={`source-${i}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-700">{pvc.pvc_name || '-'}</p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">{pvc.mount_path || '-'}</p>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-400">无输入挂载</div>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">输出挂载（结果）</p>
                {(instance?.output_pvcs || []).length > 0 ? (instance.output_pvcs || []).map((pvc: any, i: number) => (
                  <div key={`output-${i}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-700">{pvc.pvc_name || '-'}</p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">{pvc.mount_path || '-'}</p>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-400">无输出挂载</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'llm' && (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
              <Bot size={16} className="text-violet-500" /> LLM Provider Binding
            </h4>
            {llmProviderKeys.length > 0 ? (
              <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-[10px] font-black uppercase tracking-widest">
                Bound
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                Not Bound
              </span>
            )}
          </div>
          {llmProviderKeys.length > 0 ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider Keys</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {llmProviderKeys.map((key: string) => (
                    <span key={key} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">
                      {key}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {llmProviderSnapshots.map((snapshot: any, idx: number) => (
                  <div key={`${snapshot?.provider_key || 'provider'}-${idx}`} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider {idx + 1}</p>
                    <p className="mt-2 text-xs font-black text-slate-700">{snapshot?.display_name || snapshot?.provider_key || '-'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{snapshot?.provider_type || '-'} · {snapshot?.model || '-'}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider Key</p>
                <p className="mt-2 text-xs font-mono font-black text-slate-700 break-all">{instance?.llm_provider_key || '-'}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</p>
                <p className="mt-2 text-xs font-black text-slate-700">{llmSnapshot?.display_name || '-'}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider Type</p>
                <p className="mt-2 text-xs font-black text-slate-700">{llmSnapshot?.provider_type || '-'}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model</p>
                <p className="mt-2 text-xs font-black text-slate-700">{llmSnapshot?.model || '-'}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mapped Env Keys</p>
                <p className="mt-2 text-xs font-black text-slate-700">{llmMappedEnvKeys.length}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">File Bindings</p>
                <p className="mt-2 text-xs font-black text-slate-700">{llmFileBindings.length}</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2 xl:col-span-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ConfigMap</p>
                <p className="mt-2 text-xs font-mono font-black text-slate-700 break-all">{instance?.llm_configmap_name || '-'}</p>
              </div>
            </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
              当前实例未绑定 LLM Provider。
            </div>
          )}
        </div>
        )}

        {/* Full-width Terminal Section */}
        {activeTab === 'logs' && (
        <div className="flex flex-col h-[750px] bg-[#0d1117] rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/5">
           {/* Terminal Header */}
           <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
              <div className="flex items-center gap-5">
                 <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/40">
                    <Terminal size={24} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-white tracking-wide">实时运行日志</h3>
                    <div className="flex items-center gap-3 mt-1">
                       <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`} />
                          Remote Context Stream
                       </div>
                       <span className="w-1 h-1 bg-white/10 rounded-full" />
                       <span className="text-[9px] font-mono text-slate-600 uppercase">Buffer: {tailLines} lines</span>
                    </div>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex gap-1">
                    {[200, 500, 1000].map(val => (
                       <button 
                         key={val}
                         onClick={() => setTailLines(val)}
                         className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${tailLines === val ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                       >
                         {val} Lines
                       </button>
                    ))}
                 </div>
                 <button 
                    onClick={loadLogs}
                    disabled={isRefreshingLogs}
                    className="p-3 bg-white/5 text-slate-400 hover:text-white rounded-xl border border-white/5 hover:border-white/10 transition-all disabled:opacity-50"
                 >
                    <RefreshCw size={18} className={isRefreshingLogs ? 'animate-spin' : ''} />
                 </button>
              </div>
           </div>

           {/* Terminal Content */}
           <div className="flex-1 overflow-y-auto p-10 font-mono text-[12px] leading-relaxed custom-scrollbar bg-black/40">
              {logs ? (
                <div className="space-y-1">
                   {logs.split('\n').map((line, i) => (
                     <div key={i} className="flex gap-6 group hover:bg-white/5 px-3 py-0.5 -mx-3 rounded-lg transition-colors">
                        <span className="text-slate-700 w-10 shrink-0 text-right select-none opacity-40 group-hover:opacity-100 font-black">{i + 1}</span>
                        <span className={`break-all whitespace-pre-wrap ${
                          line.toLowerCase().includes('error') ? 'text-red-400 font-bold bg-red-400/5' : 
                          line.toLowerCase().includes('warn') ? 'text-amber-300' : 
                          line.toLowerCase().includes('success') ? 'text-green-400' :
                          'text-blue-100/90'
                        }`}>
                          {line || ' '}
                        </span>
                     </div>
                   ))}
                   <div ref={logEndRef} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-6">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center animate-pulse">
                      <Monitor size={40} className="text-slate-700" />
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-700">Awaiting Log Buffer Sync...</p>
                </div>
              )}
           </div>

           {/* Terminal Footer */}
           <div className="px-10 py-5 bg-white/5 border-t border-white/5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-8">
                 <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${logs ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-slate-700'}`} />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Connection: Established</span>
                 </div>
                 <div className="flex items-center gap-2 text-slate-600">
                    <Clock size={12} />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Last Poll: {new Date().toLocaleTimeString()}</span>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <p className="text-[9px] font-black text-slate-600 uppercase">Rows: {logs ? logs.split('\n').length : 0}</p>
                 <button onClick={() => setLogs('')} className="text-[9px] font-black text-blue-500/60 hover:text-blue-400 uppercase tracking-widest transition-colors">Clear Interface</button>
              </div>
           </div>
        </div>
        )}
      </div>

      {/* Confirmation Modals */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 text-center space-y-8">
              <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner">
                <Trash2 size={48} />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">销毁审计会话？</h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed italic px-2">
                  确认永久移除实例 <span className="font-black text-slate-800 underline">"{instanceName}"</span>？<br/>
                  该操作将中断所有 Ingress 连接并回收 K8S 负载资源。已保存至 PVC 的源码不受影响。
                </p>
              </div>
            </div>
            <div className="px-10 pb-10 flex gap-4">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                disabled={isActionProcessing}
                className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                保留实例
              </button>
              <button 
                onClick={handleDelete} 
                disabled={isActionProcessing} 
                className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 flex items-center justify-center gap-3 shadow-2xl shadow-red-500/30 active:scale-95 transition-all"
              >
                {isActionProcessing ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={20} />} 
                确认销毁
              </button>
            </div>
          </div>
        </div>
      )}

      {showRebuildConfirm && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 text-center space-y-8">
              <div className="w-24 h-24 bg-amber-50 text-amber-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner">
                <RefreshCw size={48} className="animate-spin-slow" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">彻底重建容器？</h3>
                <div className="p-5 bg-red-50 rounded-3xl border border-red-100">
                  <p className="text-red-500 text-xs font-black leading-relaxed text-left flex gap-3">
                    <ShieldAlert size={18} className="shrink-0" />
                    <span>警告：重建过程将重新部署 Pod。容器内的所有本地环境修改、插件及临时配置都会重置。</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="px-10 pb-10 flex gap-4">
              <button 
                onClick={() => setShowRebuildConfirm(false)} 
                disabled={isActionProcessing}
                className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                放弃操作
              </button>
              <button 
                onClick={handleRestart} 
                disabled={isActionProcessing} 
                className="flex-1 py-5 bg-amber-600 text-white rounded-2xl font-black hover:bg-amber-700 flex items-center justify-center gap-3 shadow-2xl shadow-amber-500/30 active:scale-95 transition-all"
              >
                {isActionProcessing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={20} />} 
                执行重建
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
      `}</style>
    </div>
  );
};
