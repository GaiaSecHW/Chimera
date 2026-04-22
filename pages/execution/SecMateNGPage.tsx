import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronRight,
  ExternalLink,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  RotateCcw,
  Cpu,
  Globe,
  Server,
  X,
  Copy,
  Check,
  FolderTree
} from 'lucide-react';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { XTerminal } from '../../components/XTerminal';
import { ProjectResource } from '../../types/types';

const executionApi = api.domains.execution;
const assetApi = api.domains.assets;

interface SecMateNGPageProps {
  projectId: string;
}

interface MountItem {
  pvc_name: string;
  mount_path: string;
}

interface EnvItem {
  key: string;
  value: string;
}

interface SecmateEnvConfig {
  common_env: Record<string, string>;
  default_secmate_env: Record<string, string>;
  merged_default_env: Record<string, string>;
}

const ENV_PRESETS = [
  { key: 'OPENAI_BASE_URL', value: '' },
  { key: 'OPENAI_API_KEY', value: '' },
  { key: 'OPENAI_MODEL', value: '' }
];

const CopyableValue: React.FC<{ value?: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-left hover:border-blue-200 hover:bg-blue-50/50 transition-all"
    >
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-mono font-bold text-slate-700 truncate max-w-[180px]">{value}</span>
      {copied ? <Check size={12} className="text-green-500 shrink-0" /> : <Copy size={12} className="text-slate-400 shrink-0" />}
    </button>
  );
};

export const SecMateNGPage: React.FC<SecMateNGPageProps> = ({ projectId }) => {
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [availableSourceResources, setAvailableSourceResources] = useState<ProjectResource[]>([]);
  const [availableOutputResources, setAvailableOutputResources] = useState<any[]>([]);
  const [defaultEnvConfig, setDefaultEnvConfig] = useState<SecmateEnvConfig | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<any>(null);
  const [logs, setLogs] = useState('');
  const [tailLines, setTailLines] = useState(200);
  const [refreshingLogs, setRefreshingLogs] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; name: string | null }>({ show: false, name: null });
  const [restartConfirm, setRestartConfirm] = useState<{ show: boolean; name: string | null }>({ show: false, name: null });
  const [actionLoading, setActionLoading] = useState(false);

  const [terminalWs, setTerminalWs] = useState<WebSocket | null>(null);
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalInstanceName, setTerminalInstanceName] = useState('');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_pvcs: [{ pvc_name: '', mount_path: '/workspace' }] as MountItem[],
    output_pvcs: [{ pvc_name: '', mount_path: '/output' }] as MountItem[],
    image: '',
    secmate_envs: ENV_PRESETS.filter((item) => item.key === 'OPENAI_MODEL').map((item) => ({ ...item })) as EnvItem[]
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    loadAll();
    const timer = setInterval(() => {
      loadInstances();
      loadTasks();
      if (selectedInstanceName) {
        loadSelectedInstance(selectedInstanceName);
        loadRuntimeStatus(selectedInstanceName);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [projectId, selectedInstanceName]);

  useEffect(() => {
    if (!selectedInstanceName) return;
    loadSelectedInstance(selectedInstanceName);
    loadRuntimeStatus(selectedInstanceName);
    loadLogs(selectedInstanceName, tailLines);
  }, [selectedInstanceName]);

  useEffect(() => {
    if (logs) {
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [logs]);

  useEffect(() => {
    return () => {
      if (terminalWs) terminalWs.close();
    };
  }, [terminalWs]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadInstances(),
        loadTasks(),
        loadDefaultEnvConfig(),
        loadSourceResources(),
        loadOutputResources()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadInstances = async () => {
    const res = await executionApi.secmateNG.list(projectId);
    setInstances(res.items || []);
    if (selectedInstanceName) {
      const match = (res.items || []).find((item: any) => item.name === selectedInstanceName);
      if (!match) {
        setSelectedInstanceName(null);
        setSelectedInstance(null);
        setRuntimeStatus(null);
        setLogs('');
      }
    }
  };

  const loadTasks = async () => {
    const res = await executionApi.secmateNG.getTasks(projectId);
    setTasks(res.items || []);
  };

  const loadDefaultEnvConfig = async () => {
    const res = await executionApi.secmateNG.getDefaultEnvConfig();
    setDefaultEnvConfig(res);
  };

  const loadSourceResources = async () => {
    const resources = await assetApi.resources.list(projectId, 'code');
    setAvailableSourceResources((resources || []).filter((item: any) => item.upload_status === 'completed'));
  };

  const loadOutputResources = async () => {
    const resources = await assetApi.resources.list(projectId, 'output_pvc');
    setAvailableOutputResources(resources || []);
  };

  const loadSelectedInstance = async (name: string) => {
    const res = await executionApi.secmateNG.getDetail(projectId, name);
    setSelectedInstance(res);
  };

  const loadRuntimeStatus = async (name: string) => {
    const res = await executionApi.secmateNG.getStatus(projectId, name);
    setRuntimeStatus(res);
  };

  const loadLogs = async (name: string, lines = tailLines) => {
    setRefreshingLogs(true);
    try {
      const res = await executionApi.secmateNG.getLogs(projectId, name, lines);
      setLogs(res.logs || '');
    } catch (error: any) {
      setLogs(error.message || '日志读取失败');
    } finally {
      setRefreshingLogs(false);
    }
  };

  const currentStatus = runtimeStatus?.status || selectedInstance?.status;
  const mergedDefaultEnvEntries = Object.entries(defaultEnvConfig?.merged_default_env || {});

  const stats = useMemo(() => ({
    total: instances.length,
    running: instances.filter((item) => item.status === 'running').length,
    activeTasks: tasks.filter((item) => item.status === 'running' || item.status === 'pending').length
  }), [instances, tasks]);

  const filteredInstances = useMemo(() => (
    instances.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  ), [instances, searchTerm]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      alert('实例名称不能为空');
      return;
    }
    if (formData.source_pvcs.some((item) => !item.pvc_name)) {
      alert('请至少选择一个源码 PVC');
      return;
    }

    setCreateLoading(true);
    try {
      const secmate_env: Record<string, string> = {};
      formData.secmate_envs.forEach((item) => {
        if (item.key.trim()) secmate_env[item.key.trim()] = item.value;
      });

      await executionApi.secmateNG.create(projectId, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        source_pvcs: formData.source_pvcs,
        output_pvcs: formData.output_pvcs.filter((item) => item.pvc_name),
        secmate_env,
        ...(formData.image.trim() ? { image: formData.image.trim() } : {})
      });

      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        description: '',
        source_pvcs: [{ pvc_name: '', mount_path: '/workspace' }],
        output_pvcs: [{ pvc_name: '', mount_path: '/output' }],
        image: '',
        secmate_envs: ENV_PRESETS.filter((item) => item.key === 'OPENAI_MODEL').map((item) => ({ ...item }))
      });
      await loadAll();
    } catch (error: any) {
      alert(`创建失败: ${error.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!restartConfirm.name) return;
    setActionLoading(true);
    try {
      await executionApi.secmateNG.restart(projectId, restartConfirm.name);
      setRestartConfirm({ show: false, name: null });
      await loadAll();
      await loadSelectedInstance(restartConfirm.name);
      await loadRuntimeStatus(restartConfirm.name);
    } catch (error: any) {
      alert(`重建失败: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.name) return;
    setActionLoading(true);
    try {
      await executionApi.secmateNG.delete(projectId, deleteConfirm.name);
      if (selectedInstanceName === deleteConfirm.name) {
        closeTerminal();
        setSelectedInstanceName(null);
        setSelectedInstance(null);
        setRuntimeStatus(null);
        setLogs('');
      }
      setDeleteConfirm({ show: false, name: null });
      await loadAll();
    } catch (error: any) {
      alert(`删除失败: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const openTerminal = (name: string) => {
    if (terminalWs) terminalWs.close();
    const ws = executionApi.secmateNG.createTerminalConnection(projectId, name);
    ws.addEventListener('open', () => setTerminalConnected(true));
    ws.addEventListener('close', () => setTerminalConnected(false));
    ws.addEventListener('error', () => setTerminalConnected(false));
    setTerminalWs(ws);
    setTerminalInstanceName(name);
    setIsTerminalOpen(true);
  };

  const closeTerminal = () => {
    if (terminalWs) terminalWs.close();
    setTerminalWs(null);
    setTerminalConnected(false);
    setTerminalInstanceName('');
    setIsTerminalOpen(false);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Loading SecMate Runtime</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-8 h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-[1.75rem] bg-amber-500 text-slate-950 shadow-2xl shadow-amber-500/20">
              <Sparkles size={28} />
            </div>
            <div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">SecMate-NG 指挥台</h2>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.22em]">Agent-driven security workspace for live projects</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadAll} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all shadow-sm">
            <RefreshCw size={20} />
          </button>
          <button onClick={() => setIsCreateModalOpen(true)} className="px-7 py-4 bg-slate-950 text-white rounded-2xl font-black flex items-center gap-3 hover:bg-slate-800 transition-all shadow-2xl">
            <Plus size={20} />
            部署 SecMate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-950 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <Bot className="absolute right-[-10px] top-[-10px] w-28 h-28 opacity-5" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">在线实例</p>
          <h3 className="text-5xl font-black text-amber-400 mt-3">{stats.running}</h3>
          <p className="text-sm font-bold text-slate-600 mt-2">/ {stats.total} Total</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">活动任务</p>
          <h3 className="text-4xl font-black text-slate-900 mt-3">{stats.activeTasks}</h3>
          <div className="flex items-center gap-2 mt-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
            <Activity size={12} /> Async Queue Healthy
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">源码资源池</p>
          <h3 className="text-4xl font-black text-slate-900 mt-3">{availableSourceResources.length}</h3>
          <div className="flex items-center gap-2 mt-4 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            <FolderTree size={12} /> Ready for mount
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">输出卷资源</p>
          <h3 className="text-4xl font-black text-slate-900 mt-3">{availableOutputResources.length}</h3>
          <div className="flex items-center gap-2 mt-4 text-[10px] font-black text-violet-600 uppercase tracking-widest">
            <HardDrive size={12} /> Persistent storage
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,minmax(0,1fr)] gap-8">
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
              <Search size={16} className="text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="搜索实例名称或描述"
                className="flex-1 bg-transparent outline-none text-sm text-slate-700"
              />
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
            {filteredInstances.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">暂无 SecMate 实例</p>
              </div>
            )}
            {filteredInstances.map((instance) => (
              <button
                key={instance.id}
                onClick={() => setSelectedInstanceName(instance.name)}
                className={`w-full text-left p-6 transition-all ${selectedInstanceName === instance.name ? 'bg-amber-50/70' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-black text-slate-900 truncate">{instance.name}</h3>
                      <StatusBadge status={instance.status} />
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{instance.description || 'No mission briefing provided.'}</p>
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>{instance.source_pvcs?.length || 0} Source</span>
                      <span>{instance.output_pvcs?.length || 0} Output</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          {!selectedInstanceName && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-20 h-20 rounded-[2rem] bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-6">
                <ShieldAlert size={36} />
              </div>
              <h3 className="text-2xl font-black text-slate-900">选择一个 SecMate 实例</h3>
              <p className="text-sm text-slate-500 mt-3">右侧会显示运行状态、日志、访问入口和终端控制。</p>
            </div>
          )}

          {selectedInstanceName && selectedInstance && (
            <>
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
                <div className="flex flex-col xl:flex-row justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">{selectedInstance.name}</h3>
                      <StatusBadge status={currentStatus || 'pending'} />
                    </div>
                    <p className="text-sm text-slate-500">{selectedInstance.description || 'No description provided.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {selectedInstance.access_url && (
                      <a
                        href={selectedInstance.access_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-5 py-3 bg-amber-500 text-slate-950 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-amber-400 transition-all"
                      >
                        打开工作台 <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => loadRuntimeStatus(selectedInstance.name)}
                      className="px-5 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-slate-600 flex items-center gap-2 hover:text-blue-600 transition-all"
                    >
                      <RefreshCw size={14} /> 刷新状态
                    </button>
                    <button
                      onClick={() => openTerminal(selectedInstance.name)}
                      className="px-5 py-3 bg-slate-950 text-white rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-800 transition-all"
                    >
                      <Terminal size={14} /> 终端
                    </button>
                    <button
                      onClick={() => setRestartConfirm({ show: true, name: selectedInstance.name })}
                      className="px-5 py-3 bg-amber-50 text-amber-700 border border-amber-100 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-amber-100 transition-all"
                    >
                      <RotateCcw size={14} /> 重建
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ show: true, name: selectedInstance.name })}
                      className="px-5 py-3 bg-red-600 text-white rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-red-700 transition-all"
                    >
                      <Trash2 size={14} /> 销毁
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pod IP</p>
                    <p className="mt-3 text-sm font-mono font-black text-slate-800">{runtimeStatus?.pod_ip || 'Pending'}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Node</p>
                    <p className="mt-3 text-sm font-black text-slate-800">{runtimeStatus?.node_name || 'Scheduling'}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Replicas</p>
                    <p className="mt-3 text-sm font-black text-slate-800">{runtimeStatus?.ready_replicas ?? 0} / {runtimeStatus?.total_replicas ?? 0}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pod Name</p>
                    <p className="mt-3 text-sm font-mono font-black text-slate-800 truncate">{selectedInstance.pod_name || 'Waiting'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),320px] gap-6">
                  <div className="bg-slate-950 rounded-[2rem] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Terminal size={16} className="text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-widest">Runtime Logs</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={tailLines}
                          onChange={(event) => setTailLines(Number(event.target.value))}
                          className="bg-slate-900 text-slate-300 border border-slate-700 rounded-lg px-2 py-1 text-xs outline-none"
                        >
                          <option value={100}>100</option>
                          <option value={200}>200</option>
                          <option value={500}>500</option>
                        </select>
                        <button
                          onClick={() => loadLogs(selectedInstance.name, tailLines)}
                          className="text-xs font-black text-slate-300 hover:text-white flex items-center gap-2"
                        >
                          {refreshingLogs ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          Refresh
                        </button>
                      </div>
                    </div>
                    <div className="p-5 font-mono text-[12px] leading-6 text-slate-300 whitespace-pre-wrap max-h-[380px] overflow-auto custom-scrollbar">
                      {logs || 'No logs available.'}
                      <div ref={logsEndRef} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                        <Cpu size={14} className="text-amber-500" /> Agent Context
                      </h4>
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Namespace</span>
                          <span className="font-black text-slate-800">{selectedInstance.namespace}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Ingress</span>
                          <span className="font-black text-slate-800 truncate ml-3">{selectedInstance.ingress_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Service</span>
                          <span className="font-black text-slate-800 truncate ml-3">{selectedInstance.service_name || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                        <Globe size={14} className="text-blue-500" /> LLM / Runtime Env
                      </h4>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <CopyableValue label="Model" value={selectedInstance.secmate_env?.OPENAI_MODEL} />
                        <CopyableValue label="Base URL" value={selectedInstance.secmate_env?.OPENAI_BASE_URL} />
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                        <Server size={14} className="text-violet-500" /> Storage Layout
                      </h4>
                      <div className="mt-4 space-y-2">
                        {[...(selectedInstance.source_pvcs || []), ...(selectedInstance.output_pvcs || [])].map((item: any, index: number) => (
                          <div key={`${item.pvc_name}-${index}`} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <p className="text-xs font-black text-slate-800">{item.pvc_name || 'Auto-created PVC'}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{item.mount_path}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Task Timeline</h4>
                </div>
                <div className="space-y-3">
                  {tasks.filter((task) => task.secmate_name === selectedInstance.name).slice(0, 8).map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-sm font-black text-slate-900">{task.type}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{task.error_message || task.result || task.created_at}</p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  ))}
                  {tasks.filter((task) => task.secmate_name === selectedInstance.name).length === 0 && (
                    <div className="p-8 text-center text-sm font-black text-slate-400 uppercase tracking-widest">暂无相关任务</div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
              <div>
                <h3 className="text-2xl font-black text-slate-900">部署 SecMate-NG</h3>
                <p className="text-sm text-slate-500 mt-1">为当前项目创建独立的 AI 安全工作实例。</p>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-3 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">实例名称</label>
                  <input
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value.toLowerCase() })}
                    className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-amber-500"
                    placeholder="例如 secmate-redteam"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">自定义镜像</label>
                  <input
                    value={formData.image}
                    onChange={(event) => setFormData({ ...formData, image: event.target.value })}
                    className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-amber-500"
                    placeholder="留空则使用默认镜像"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">任务描述</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-amber-500"
                  placeholder="描述该实例承担的扫描、分析或协同任务。"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800">源码 PVC</h4>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, source_pvcs: [...formData.source_pvcs, { pvc_name: '', mount_path: '/workspace' }] })}
                      className="text-xs font-black text-blue-600"
                    >
                      添加挂载
                    </button>
                  </div>
                  {formData.source_pvcs.map((mount, index) => (
                    <div key={`source-${index}`} className="grid grid-cols-[1fr,180px,44px] gap-3">
                      <select
                        value={mount.pvc_name}
                        onChange={(event) => {
                          const next = [...formData.source_pvcs];
                          next[index].pvc_name = event.target.value;
                          setFormData({ ...formData, source_pvcs: next });
                        }}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      >
                        <option value="">选择源码 PVC</option>
                        {availableSourceResources.map((resource) => (
                          <option key={resource.id} value={resource.name}>{resource.name}</option>
                        ))}
                      </select>
                      <input
                        value={mount.mount_path}
                        onChange={(event) => {
                          const next = [...formData.source_pvcs];
                          next[index].mount_path = event.target.value;
                          setFormData({ ...formData, source_pvcs: next });
                        }}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      />
                      <button
                        type="button"
                        disabled={formData.source_pvcs.length === 1}
                        onClick={() => setFormData({ ...formData, source_pvcs: formData.source_pvcs.filter((_, itemIndex) => itemIndex !== index) })}
                        className="rounded-2xl border border-slate-200 text-slate-400 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 size={16} className="mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800">输出 PVC</h4>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, output_pvcs: [...formData.output_pvcs, { pvc_name: '', mount_path: '/output' }] })}
                      className="text-xs font-black text-blue-600"
                    >
                      添加挂载
                    </button>
                  </div>
                  {formData.output_pvcs.map((mount, index) => (
                    <div key={`output-${index}`} className="grid grid-cols-[1fr,180px,44px] gap-3">
                      <input
                        list="secmate-output-pvcs"
                        value={mount.pvc_name}
                        onChange={(event) => {
                          const next = [...formData.output_pvcs];
                          next[index].pvc_name = event.target.value;
                          setFormData({ ...formData, output_pvcs: next });
                        }}
                        placeholder="输出 PVC 名称"
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      />
                      <input
                        value={mount.mount_path}
                        onChange={(event) => {
                          const next = [...formData.output_pvcs];
                          next[index].mount_path = event.target.value;
                          setFormData({ ...formData, output_pvcs: next });
                        }}
                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      />
                      <button
                        type="button"
                        disabled={formData.output_pvcs.length === 1}
                        onClick={() => setFormData({ ...formData, output_pvcs: formData.output_pvcs.filter((_, itemIndex) => itemIndex !== index) })}
                        className="rounded-2xl border border-slate-200 text-slate-400 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 size={16} className="mx-auto" />
                      </button>
                    </div>
                  ))}
                  <datalist id="secmate-output-pvcs">
                    {availableOutputResources.map((resource: any) => (
                      <option key={resource.id} value={resource.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800">SecMate 环境变量</h4>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, secmate_envs: [...formData.secmate_envs, { key: '', value: '' }] })}
                    className="text-xs font-black text-blue-600"
                  >
                    添加变量
                  </button>
                </div>
                {formData.secmate_envs.map((env, index) => (
                  <div key={`env-${index}`} className="grid grid-cols-[220px,1fr,44px] gap-3">
                    <input
                      value={env.key}
                      onChange={(event) => {
                        const next = [...formData.secmate_envs];
                        next[index].key = event.target.value;
                        setFormData({ ...formData, secmate_envs: next });
                      }}
                      className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      placeholder="变量名"
                    />
                    <input
                      value={env.value}
                      onChange={(event) => {
                        const next = [...formData.secmate_envs];
                        next[index].value = event.target.value;
                        setFormData({ ...formData, secmate_envs: next });
                      }}
                      className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none"
                      placeholder="变量值"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, secmate_envs: formData.secmate_envs.filter((_, itemIndex) => itemIndex !== index) })}
                      className="rounded-2xl border border-slate-200 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={16} className="mx-auto" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800">后端默认环境变量</h4>
                <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.22em]">
                    来自 secmate-ng 微服务配置文件，敏感信息已由后端脱敏
                  </p>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {mergedDefaultEnvEntries.length > 0 ? mergedDefaultEnvEntries.map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{key}</p>
                        <p className="mt-1 text-xs font-mono font-bold text-slate-700 break-all">{String(value)}</p>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-black text-slate-400 uppercase tracking-widest md:col-span-2">
                        当前未配置默认环境变量
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-600 font-black">
                  取消
                </button>
                <button type="submit" disabled={createLoading} className="px-6 py-3 rounded-2xl bg-slate-950 text-white font-black flex items-center gap-2 disabled:opacity-50">
                  {createLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  提交部署
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restartConfirm.show && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-[2rem] border border-slate-200 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-slate-900">确认重建实例</h3>
            <p className="text-sm text-slate-500 mt-3">将重启 `{restartConfirm.name}` 对应的 Deployment。</p>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setRestartConfirm({ show: false, name: null })} className="px-5 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">取消</button>
              <button onClick={handleRestart} disabled={actionLoading} className="px-5 py-3 rounded-2xl bg-amber-500 text-slate-950 font-black disabled:opacity-50">
                {actionLoading ? '处理中...' : '确认重建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-[2rem] border border-slate-200 shadow-2xl p-8">
            <h3 className="text-2xl font-black text-slate-900">确认删除实例</h3>
            <p className="text-sm text-slate-500 mt-3">将销毁 `{deleteConfirm.name}` 的运行环境，但不会默认删除输出 PVC。</p>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setDeleteConfirm({ show: false, name: null })} className="px-5 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">取消</button>
              <button onClick={handleDelete} disabled={actionLoading} className="px-5 py-3 rounded-2xl bg-red-600 text-white font-black disabled:opacity-50">
                {actionLoading ? '处理中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isTerminalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 p-6">
          <div className="h-full bg-slate-950 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${terminalConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm font-black text-slate-200">SecMate Terminal: {terminalInstanceName}</span>
              </div>
              <button onClick={closeTerminal} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <XTerminal
                ws={terminalWs}
                connected={terminalConnected}
                podName={selectedInstance?.pod_name || terminalInstanceName}
                onClose={closeTerminal}
                showHeader={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
