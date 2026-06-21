
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, RefreshCw, Loader2, Trash2, Edit3, Activity, ServerCog, Hash, Clock, X, Link as LinkIcon, Wrench } from 'lucide-react';
import { vulnApi } from '../../clients/vuln';
import { showConfirm } from '../../components/DialogService';
import { Modal, DataTable, DataTableColumn, PageHeader } from '../../design-system';

interface VulnConfirmEngine {
  engine_name: string;
  endpoint: string;
  version: string;
  bind_tools: string[];
  status: string;
  last_heartbeat_at: string | null;
  registered_at: string;
  updated_at: string;
}

interface EngineFormData {
  engine_name: string;
  endpoint: string;
  version: string;
  bind_tools_text: string;
}

const EMPTY_FORM: EngineFormData = { engine_name: '', endpoint: '', version: '', bind_tools_text: '' };

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—');

const parseBindTools = (text: string): string[] =>
  text.split('\n').map((s) => s.trim()).filter(Boolean);

export const VulnConfirmEnginesPage: React.FC = () => {
  const [engines, setEngines] = useState<VulnConfirmEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEngine, setEditingEngine] = useState<VulnConfirmEngine | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState<EngineFormData>(EMPTY_FORM);

  useEffect(() => { fetchEngines(); }, []);

  const fetchEngines = async () => {
    setLoading(true);
    try {
      const data = await vulnApi.listConfirmEngines();
      setEngines(data.engines || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingEngine(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (engine: VulnConfirmEngine) => {
    setEditingEngine(engine);
    setFormData({
      engine_name: engine.engine_name,
      endpoint: engine.endpoint,
      version: engine.version,
      bind_tools_text: (engine.bind_tools || []).join('\n'),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bind_tools = parseBindTools(formData.bind_tools_text);
    if (bind_tools.length === 0) {
      alert('bind_tools 至少需要一项');
      return;
    }
    setFormLoading(true);
    try {
      if (editingEngine) {
        await vulnApi.updateConfirmEngine(editingEngine.engine_name, {
          endpoint: formData.endpoint,
          version: formData.version,
          bind_tools,
        });
      } else {
        await vulnApi.createConfirmEngine({
          engine_name: formData.engine_name.trim(),
          endpoint: formData.endpoint.trim(),
          version: formData.version.trim(),
          bind_tools,
        });
      }
      setIsModalOpen(false);
      setEditingEngine(null);
      setFormData(EMPTY_FORM);
      await fetchEngines();
    } catch (err: any) {
      console.error('[VulnConfirmEnginesPage] submit failed:', err);
      alert(err.message || '提交失败');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (engine: VulnConfirmEngine) => {
    const confirmed = await showConfirm({
      title: '注销漏洞确认引擎',
      message: `确认彻底注销引擎「${engine.engine_name}」？此操作不可恢复。`,
      confirmText: '确认注销',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await vulnApi.deleteConfirmEngine(engine.engine_name);
      await fetchEngines();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const columns: DataTableColumn<VulnConfirmEngine>[] = [
    {
      key: 'engine_name',
      header: '引擎名称',
      render: (engine) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <ServerCog size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-theme-text-primary font-mono tracking-tight">{engine.engine_name}</p>
            <p className="text-[10px] text-theme-text-muted mt-0.5 flex items-center gap-1"><Hash size={10} />{engine.version || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'endpoint',
      header: 'Endpoint',
      render: (engine) => (
        <div className="flex items-center gap-2 text-xs text-theme-text-secondary font-mono max-w-[320px] truncate">
          <LinkIcon size={12} className="shrink-0 text-theme-text-faint" />
          <span className="truncate" title={engine.endpoint}>{engine.endpoint || '—'}</span>
        </div>
      ),
    },
    {
      key: 'bind_tools',
      header: '绑定工具',
      render: (engine) => (
        <div className="flex flex-wrap gap-1.5 max-w-[300px]">
          {(engine.bind_tools || []).length === 0 ? (
            <span className="text-[10px] text-theme-text-faint italic">未绑定</span>
          ) : (
            (engine.bind_tools || []).map((tool) => (
              <span key={tool} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/10 text-indigo-300 rounded text-[10px] font-mono border border-indigo-500/20">
                <Wrench size={10} /> {tool}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      align: 'center',
      render: (engine) => {
        const active = engine.status === 'active';
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
            {engine.status || 'unknown'}
          </span>
        );
      },
    },
    {
      key: 'last_heartbeat_at',
      header: '最近心跳',
      render: (engine) => (
        <div className="flex items-center gap-2 text-[10px] font-bold text-theme-text-muted uppercase">
          <Clock size={12} /> {formatDateTime(engine.last_heartbeat_at)}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (engine) => (
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={() => openEdit(engine)}
            className="p-3 bg-theme-surface border border-theme-border text-theme-text-muted hover:text-indigo-400 rounded-xl transition-all"
            title="编辑引擎"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => void handleDelete(engine)}
            className="p-3 bg-red-500/15 text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all"
            title="注销引擎"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const activeCount = engines.filter((e) => e.status === 'active').length;

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      <PageHeader
        title={<><div className="p-3 bg-indigo-600 text-white rounded-lg shadow-indigo-500/20 inline-flex"><ShieldCheck size={28} /></div> 漏洞确认引擎管理</>}
        actions={<div className="flex gap-4">
          <button onClick={fetchEngines} className="p-4 bg-theme-surface border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-medium flex items-center gap-3 shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95">
            <Plus size={20} /> 注册新引擎
          </button>
        </div>}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-theme-surface p-8 rounded-xl text-white flex flex-col justify-between group overflow-hidden relative">
          <ShieldCheck className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-theme-text-muted text-[10px] font-semibold uppercase tracking-widest relative z-10">已注册引擎</p>
          <h3 className="text-5xl font-bold mt-4 relative z-10">{engines.length}</h3>
        </div>
        <div className="bg-theme-surface p-8 rounded-xl border border-theme-border col-span-3 flex items-center gap-8">
          <div className="w-16 h-16 bg-emerald-500/15 text-emerald-400 rounded-lg flex items-center justify-center shrink-0">
            <Activity size={32} />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-theme-text-primary">活跃引擎 <span className="text-emerald-400">{activeCount}</span> / {engines.length}</h4>
            <p className="text-sm text-theme-text-muted mt-1 font-medium leading-relaxed">
              漏洞确认引擎接收平台派发的研判任务，按心跳上报活跃状态。单一工具不能同时绑定到多个引擎，否则后端会拒绝并返回冲突错误。
            </p>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={engines}
        rowKey={(engine) => engine.engine_name}
        loading={loading && engines.length === 0}
        empty={
          <div className="py-40 text-center">
            <div className="w-20 h-20 bg-theme-bg-app rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
              <ServerCog size={40} />
            </div>
            <p className="text-sm font-semibold text-theme-text-muted uppercase tracking-widest">尚未注册任何漏洞确认引擎</p>
          </div>
        }
        minWidth={1000}
      />

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-lg">
        <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-500/20">
              {editingEngine ? <Edit3 size={24} /> : <Plus size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-theme-text-primary">{editingEngine ? '更新引擎配置' : '注册新引擎'}</h3>
              <p className="text-[10px] text-theme-text-muted font-bold uppercase mt-0.5">Vuln Confirm Engine Registry</p>
            </div>
          </div>
          <button onClick={() => setIsModalOpen(false)} className="p-3 text-theme-text-faint hover:text-theme-text-secondary"><X size={28} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-10 space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">引擎名称 *</label>
            <input
              required
              disabled={!!editingEngine}
              placeholder="e.g. loki-triage-prod"
              className="w-full px-6 py-4 bg-theme-bg-app rounded-lg border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary font-mono disabled:opacity-60 disabled:cursor-not-allowed"
              value={formData.engine_name}
              onChange={(e) => setFormData({ ...formData, engine_name: e.target.value })}
            />
            {editingEngine && <p className="text-[10px] text-theme-text-faint ml-1">引擎名称创建后不可修改</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">Endpoint *</label>
            <input
              required
              placeholder="http://engine-host:port"
              className="w-full px-6 py-4 bg-theme-bg-app rounded-lg border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary font-mono"
              value={formData.endpoint}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">版本 *</label>
            <input
              required
              placeholder="v1.0.0"
              className="w-full px-6 py-4 bg-theme-bg-app rounded-lg border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary font-mono"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest ml-1">绑定工具 (bind_tools) *</label>
            <textarea
              rows={4}
              placeholder={'每行一个工具名，例如：\nloki-triage\nloki-validate'}
              className="w-full px-6 py-4 bg-theme-bg-app rounded-lg border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary font-mono resize-none"
              value={formData.bind_tools_text}
              onChange={(e) => setFormData({ ...formData, bind_tools_text: e.target.value })}
            />
            <p className="text-[10px] text-theme-text-faint ml-1">每个工具名不能同时绑定到其他引擎，否则后端返回冲突错误</p>
          </div>
          <div className="flex gap-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 bg-theme-elevated text-theme-text-secondary rounded-lg font-medium hover:bg-theme-elevated transition-all">取消</button>
            <button disabled={formLoading} className="flex-1 py-5 bg-indigo-600 text-white rounded-lg font-medium shadow-indigo-500/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {formLoading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
              {editingEngine ? '应用更改' : '立即注册'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
