
import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  Terminal, 
  Database, 
  Activity, 
  RefreshCw, 
  Loader2, 
  Box, 
  Clock, 
  HardDrive,
  FileText,
  AlertCircle,
  X,
  Layers,
  ShieldCheck,
  Cpu,
  Share2,
  Lock,
  Globe,
  Settings,
  Info,
  Hash,
  User,
  History,
  ExternalLink,
  Copy,
  Key,
  Check
} from 'lucide-react';
import { SecurityProject, K8sResourceList, MachineToken, NamespaceStatus } from '../types/types';
import { api } from '../clients/api';
import { authApi } from '../clients/auth';
import { StatusBadge } from '../components/StatusBadge';

interface ProjectDetailPageProps {
  projectId: string;
  projects: SecurityProject[];
  onBack: () => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ projectId, projects, onBack }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pods' | 'network' | 'storage'>('overview');
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<K8sResourceList | null>(null);
  const [nsStatus, setNsStatus] = useState<NamespaceStatus | null>(null);
  const [logView, setLogView] = useState<{ show: boolean; podName: string; logs: string }>({ show: false, podName: '', logs: '' });
  const [logLoading, setLogLoading] = useState(false);
  const [projectToken, setProjectToken] = useState<MachineToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const project = projects.find(p => p.id === projectId);

  useEffect(() => {
    loadAllData();
  }, [projectId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [resData, statusData] = await Promise.all([
        api.projects.getK8sResources(projectId),
        api.projects.getNamespaceStatus(projectId)
      ]);
      setResources(resData);
      setNsStatus(statusData);
    } catch (err) {
      console.error("Failed to load project details", err);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectToken = async () => {
    if (!project?.can_manage) {
      setProjectToken(null);
      setTokenError(null);
      return;
    }

    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.getProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setProjectToken(null);
      setTokenError(err.message || '加载项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const refreshProjectToken = async () => {
    if (projectToken?.token) {
      const confirmed = window.confirm(
        '刷新 Token 将导致当前 Token 立即失效。\n请先完成其他系统/脚本中的 Token 替换准备，再继续刷新。\n是否确认刷新？',
      );
      if (!confirmed) return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.refreshProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setTokenError(err.message || '刷新项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const copyToken = async () => {
    if (!projectToken?.token) return;
    await navigator.clipboard.writeText(projectToken.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  useEffect(() => {
    void loadProjectToken();
  }, [projectId, project?.can_manage]);

  const openLogViewer = async (podName: string) => {
    setLogView({ show: true, podName, logs: 'Initializing stream from API...' });
    setLogLoading(true);
    try {
      const { logs } = await api.projects.getPodLogs(projectId, podName, { tail_lines: 500 });
      setLogView(prev => ({ ...prev, logs }));
    } catch (err: any) {
      setLogView(prev => ({ ...prev, logs: "获取日志失败: " + err.message }));
    } finally {
      setLogLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin text-blue-600 mb-6" size={48} />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">正在同步 K8S 集群资源实时状态...</p>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group active:scale-95">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">{project?.name || '未知项目'}</h2>
              <StatusBadge status={nsStatus?.namespace.status || 'Active'} />
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <Box size={14} /> 命名空间: <span className="text-blue-600 font-black">{nsStatus?.k8s_namespace}</span>
              </div>
              <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <Clock size={14} /> 创建于: <span className="text-slate-600">{nsStatus?.namespace.created_at.split('T')[0]}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={loadAllData} className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshCw size={20} />
          </button>
          <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20">
            <Activity size={18} /> 发起渗透任务
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'POD 实例', value: resources?.pods.length, icon: <Layers size={20} />, color: 'text-blue-600' },
          { label: '服务节点', value: resources?.services.length, icon: <Share2 size={20} />, color: 'text-indigo-600' },
          { label: '存储卷', value: resources?.pvcs.length, icon: <Database size={20} />, color: 'text-amber-600' },
          { label: '外部入口', value: resources?.ingresses.length, icon: <Globe size={20} />, color: 'text-purple-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-5">
             <div className={`w-12 h-12 rounded-2xl bg-slate-50 ${stat.color} flex items-center justify-center`}>
               {stat.icon}
             </div>
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
               <h4 className="text-2xl font-black text-slate-800">{stat.value || 0}</h4>
             </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-[1.5rem] w-fit">
        {[
          { id: 'overview', label: '项目详情与概览', icon: <Info size={16} /> },
          { id: 'pods', label: '工作负载 (Pods)', icon: <Layers size={16} /> },
          { id: 'network', label: '网络服务', icon: <Share2 size={16} /> },
          { id: 'storage', label: '持久化存储', icon: <Database size={16} /> }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-xs transition-all ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden min-h-[500px]">
        
        {activeTab === 'overview' && (
          <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
               {/* Project Info Card */}
               <div className="lg:col-span-2 space-y-6">
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <Box size={20} className="text-blue-600" /> 项目元数据信息
                  </h3>
                  <div className="bg-slate-50 rounded-[2.5rem] border border-slate-100 p-8 space-y-8">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-1.5">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Hash size={10} /> 项目唯一标识 ID
                           </p>
                           <p className="text-sm font-mono font-black text-blue-600 bg-white px-3 py-2 rounded-xl border border-slate-200 w-fit">
                              {project?.id}
                           </p>
                        </div>
                        <div className="space-y-1.5">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <User size={10} /> 项目负责人
                           </p>
                           <p className="text-sm font-black text-slate-700">
                              {project?.owner_name || 'Administrator'} 
                              <span className="text-[10px] text-slate-400 ml-2 font-mono">({project?.owner_id || '-'})</span>
                           </p>
                        </div>
                        <div className="space-y-1.5">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Box size={10} /> 集群 Namespace
                           </p>
                           <p className="text-sm font-black text-slate-700">{project?.k8s_namespace || 'default'}</p>
                        </div>
                        <div className="space-y-1.5">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <History size={10} /> 最后更新时间
                           </p>
                           <p className="text-sm font-black text-slate-700">{project?.updated_at?.replace('T', ' ') || '-'}</p>
                        </div>
                     </div>
                     
                     <div className="pt-6 border-t border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                           <FileText size={10} /> 项目详细描述
                        </p>
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-inner">
                           <p className="text-sm text-slate-600 leading-relaxed font-medium">
                              {project?.description || "该项目暂未填写详细描述信息。项目空间用于隔离不同安全评估目标的 K8S 运行环境与存储卷。"}
                           </p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="space-y-8">
                 <div className="space-y-6">
                   <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                     <ShieldCheck size={20} className="text-blue-600" /> 安全审计摘要
                   </h3>
                   <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-6">
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-bold text-slate-500">隔离状态</span>
                       <span className="text-xs font-black text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase">K8S Namespaced</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-bold text-slate-500">部署策略</span>
                       <span className="text-xs font-black text-slate-700">Rolling Update</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-bold text-slate-500">关联 ConfigMaps</span>
                       <span className="text-xs font-black text-slate-800">{resources?.configmaps.length || 0}</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-bold text-slate-500">关联 Secrets</span>
                       <span className="text-xs font-black text-amber-600">{resources?.secrets.length || 0} 密文</span>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-6">
                   <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                     <Activity size={20} className="text-blue-600" /> 活跃部署拓扑
                   </h3>
                   <div className="grid grid-cols-1 gap-4">
                     {resources?.deployments.map(dep => (
                       <div key={dep.name} className="p-6 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:shadow-lg transition-all">
                         <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                             <Cpu size={18} />
                           </div>
                           <div>
                             <p className="text-sm font-black text-slate-800">{dep.name}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Deployment</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-4">
                           <div className="text-right">
                             <p className="text-xs font-black text-slate-700">{dep.ready_replica} / {dep.replica}</p>
                             <p className="text-[9px] text-slate-400 font-bold uppercase">Replicas Ready</p>
                           </div>
                           <div className={`w-2 h-2 rounded-full ${dep.ready_replica === dep.replica ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>

                 <div className="space-y-6">
                   <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                     <Key size={20} className="text-blue-600" /> 项目 SDK Token
                   </h3>
                   <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-5">
                     {!project?.can_manage && (
                       <div className="text-sm font-bold text-slate-500 leading-relaxed">
                         仅项目管理员可查看和手动刷新项目级 SDK Token。
                       </div>
                     )}
                     {project?.can_manage && (
                       <>
                         <div className="flex items-center justify-between gap-3">
                           <div>
                             <p className="text-sm font-black text-slate-700">第三方 SDK 专用项目凭证</p>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                               {projectToken?.machine_code || `project-sdk:${projectId}`}
                             </p>
                           </div>
                           <button
                             onClick={refreshProjectToken}
                             disabled={tokenLoading}
                             className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-black flex items-center gap-2 hover:bg-slate-100 transition-all"
                           >
                             {tokenLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                             手动刷新
                           </button>
                         </div>
                         <div className="space-y-2">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Token</p>
                           <div className="relative">
                             <div className="bg-slate-900 text-blue-200 text-xs font-mono break-all rounded-[1.75rem] p-5 pr-16 min-h-[96px]">
                               {tokenLoading && !projectToken ? '正在加载项目 Token...' : (projectToken?.token || '当前 Token 不可用')}
                             </div>
                             {!!projectToken?.token && (
                               <button
                                 onClick={copyToken}
                                 className="absolute top-3 right-3 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                               >
                                 {tokenCopied ? <Check size={16} /> : <Copy size={16} />}
                               </button>
                             )}
                           </div>
                         </div>
                         <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                           <span>作用域: 项目级</span>
                           <span>过期时间: {projectToken?.expires_at ? projectToken.expires_at.replace('T', ' ') : '永不过期'}</span>
                         </div>
                         {tokenError && (
                           <div className="text-xs font-bold text-red-500">{tokenError}</div>
                         )}
                       </>
                     )}
                   </div>
                 </div>
               </div>
             </div>
          </div>
        )}

        {activeTab === 'pods' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
             <table className="w-full text-left">
               <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
                 <tr>
                   <th className="px-8 py-6">Pod 实例名称</th>
                   <th className="px-6 py-6">节点 (Node)</th>
                   <th className="px-6 py-6">内网 IP</th>
                   <th className="px-6 py-6">运行状态</th>
                   <th className="px-8 py-6 text-right">操作</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {resources?.pods.map(pod => (
                   <tr key={pod.name} className="hover:bg-slate-50/50 transition-all group">
                     <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                           <Layers size={18} />
                         </div>
                         <span className="text-sm font-black text-slate-700">{pod.name}</span>
                       </div>
                     </td>
                     <td className="px-6 py-6 text-xs font-bold text-slate-500">{pod.node}</td>
                     <td className="px-6 py-6 font-mono text-xs text-blue-600 font-bold">{pod.ip}</td>
                     <td className="px-6 py-6"><StatusBadge status={pod.status} /></td>
                     <td className="px-8 py-6 text-right">
                       <button 
                         onClick={() => openLogViewer(pod.name)}
                         className="flex items-center gap-2 ml-auto px-5 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10"
                       >
                         <Terminal size={14} /> 交互式日志
                       </button>
                     </td>
                   </tr>
                 ))}
                 {(!resources?.pods || resources.pods.length === 0) && (
                   <tr><td colSpan={5} className="py-32 text-center text-slate-400 font-black uppercase text-xs tracking-widest">No active pods found in this context</td></tr>
                 )}
               </tbody>
             </table>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4">
             <div className="space-y-6">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                 <Share2 size={14} /> 内部服务暴露 (Services)
               </h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {resources?.services.map(svc => (
                   <div key={svc.name} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                     <div className="flex justify-between items-center">
                       <h5 className="text-sm font-black text-slate-800">{svc.name}</h5>
                       <span className="text-[10px] font-black px-2 py-1 bg-white border border-slate-100 rounded-lg text-slate-500">{svc.type}</span>
                     </div>
                     <div className="space-y-2">
                       <div className="flex justify-between text-xs">
                         <span className="text-slate-400">Cluster IP</span>
                         <span className="font-mono font-bold text-blue-600">{svc.cluster_ip}</span>
                       </div>
                       <div className="flex justify-between text-xs">
                         <span className="text-slate-400">暴露端口</span>
                         <span className="font-bold text-slate-700">{Array.isArray(svc.ports) ? svc.ports.join(', ') : 'N/A'}</span>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             </div>

             <div className="space-y-6 pt-6 border-t border-slate-50">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                 <Globe size={14} /> 外部网关入口 (Ingress)
               </h4>
               <div className="grid grid-cols-1 gap-4">
                 {resources?.ingresses.map(ing => (
                   <div key={ing.name} className="p-6 bg-white border border-slate-100 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                         <Globe size={18} />
                       </div>
                       <div>
                         <p className="text-sm font-black text-slate-800">{ing.name}</p>
                         <p className="text-xs font-bold text-blue-500">{ing.host}</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       {ing.tls?.length > 0 ? (
                         <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 rounded-xl text-[10px] font-black uppercase">
                           <Lock size={12} /> TLS Secured
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase">
                           <AlertCircle size={12} /> Plain HTTP
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
             <table className="w-full text-left">
               <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
                 <tr>
                   <th className="px-8 py-6">存储卷名称 (PVC)</th>
                   <th className="px-6 py-6">存储类 (Storage Class)</th>
                   <th className="px-6 py-6">容量配额</th>
                   <th className="px-6 py-6">运行状态</th>
                   <th className="px-8 py-6 text-right">操作</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {resources?.pvcs.map(pvc => (
                   <tr key={pvc.name} className="hover:bg-slate-50/50 transition-all group">
                     <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                           <Database size={18} />
                         </div>
                         <span className="text-sm font-black text-slate-700">{pvc.name}</span>
                       </div>
                     </td>
                     <td className="px-6 py-6 text-xs font-bold text-blue-600">{pvc.storage_class}</td>
                     <td className="px-6 py-6 font-mono text-xs text-slate-800 font-black">
                        {pvc.capacity?.storage || 'Calculating...'}
                     </td>
                     <td className="px-6 py-6"><StatusBadge status={pvc.status} /></td>
                     <td className="px-8 py-6 text-right">
                        <button className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="查看详情">
                           <ExternalLink size={16} />
                        </button>
                     </td>
                   </tr>
                 ))}
                 {(!resources?.pvcs || resources.pvcs.length === 0) && (
                   <tr>
                     <td colSpan={5} className="py-32 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                           <HardDrive size={32} />
                        </div>
                        <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No persistent volumes mapped</p>
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
          </div>
        )}
      </div>

      {/* Log Terminal Overlay */}
      {logView.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-[#0f172a] w-full max-w-5xl h-[80vh] rounded-[3rem] shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95">
             <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><Terminal size={20} /></div>
                 <div>
                   <h3 className="text-sm font-black text-white">实时容器日志审计 (Pod: {logView.podName})</h3>
                   <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Stream: K8S Namespaced Socket</p>
                 </div>
               </div>
               <button onClick={() => setLogView({ show: false, podName: '', logs: '' })} className="p-3 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all">
                 <X size={20} />
               </button>
             </div>
             <div className="flex-1 overflow-y-auto p-10 font-mono text-xs text-blue-300/80 space-y-1 bg-black/40 custom-scrollbar scroll-smooth">
               {logView.logs.split('\n').map((line, i) => (
                 <div key={i} className="flex gap-6 group">
                   <span className="text-slate-700 w-8 text-right select-none font-bold group-hover:text-slate-500">{i+1}</span>
                   <span className="whitespace-pre-wrap leading-relaxed">{line || ' '}</span>
                 </div>
               ))}
               {logLoading && (
                 <div className="flex items-center gap-3 text-blue-500 font-black mt-8 bg-blue-500/10 p-4 rounded-2xl w-fit">
                   <Loader2 className="animate-spin" size={16} /> 正在建立加密隧道并同步缓冲区...
                 </div>
               )}
             </div>
             <div className="px-10 py-5 bg-white/5 border-t border-white/5 flex justify-between items-center">
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-[10px] font-black text-green-500 uppercase tracking-widest">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" /> Tunnel Established
                 </div>
                 <div className="h-4 w-[1px] bg-white/10" />
                 <p className="text-[10px] font-black text-slate-500 uppercase">Lines: {logView.logs.split('\n').length}</p>
               </div>
               <button 
                onClick={() => openLogViewer(logView.podName)} 
                className="px-6 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-500 transition-all flex items-center gap-2"
               >
                 <RefreshCw size={12} /> 清理并重新捕获
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
