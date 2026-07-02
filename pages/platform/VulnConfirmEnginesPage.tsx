
import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Plus, RefreshCw, Loader2, Trash2, Edit3, Activity, ServerCog, Hash, Clock, X, Link as LinkIcon, Wrench, Bell, Save, Send } from 'lucide-react';
import { vulnApi, NotifyConfig, NotifyTestResult } from '../../clients/vuln';
import { toolRegistryApi } from '../../clients/toolRegistry';
import { showConfirm } from '../../components/DialogService';
import { Modal, DataTable, DataTableColumn, DropdownSelect, DropdownSelectOption, PageHeader } from '../../design-system';

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
  bind_tools: string[];
}

const EMPTY_FORM: EngineFormData = { engine_name: '', endpoint: '', version: '', bind_tools: [] };

// 工具状态下拉标签：仅 online 工具可被新引擎绑定；非 online 的仅在已绑定时回显
const TOOL_STATUS_LABEL: Record<string, string> = { draft: '草稿', pending: '待审核', online: '已上线', offline: '已下架' };

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—');

export const VulnConfirmEnginesPage: React.FC = () => {
  const [engines, setEngines] = useState<VulnConfirmEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEngine, setEditingEngine] = useState<VulnConfirmEngine | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState<EngineFormData>(EMPTY_FORM);
  const [allTools, setAllTools] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [idToName, setIdToName] = useState<Map<string, string>>(new Map());

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyConfig, setNotifyConfig] = useState<NotifyConfig | null>(null);
  const [notifyForm, setNotifyForm] = useState<NotifyConfig>({
    webhook_url: '',
    auth: '',
    receiver: '',
    sender: '',
    timeout_seconds: 10,
    enabled: true,
  });
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyTesting, setNotifyTesting] = useState(false);
  const [notifyTestResult, setNotifyTestResult] = useState<NotifyTestResult | null>(null);

  useEffect(() => {
    fetchEngines();
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      const data = await toolRegistryApi.list();
      const items = (data.items || []) as Array<{ id: string; name: string; status: string }>;
      setAllTools(items);
      setIdToName(new Map(items.map((t) => [t.id, t.name] as [string, string])));
    } catch (e: any) {
      console.error('[VulnConfirmEnginesPage] load tools failed:', e);
    }
  };

  // 下拉只提供「已上线」工具；编辑时若已绑定工具后来下架了，仍保留可见（标注状态）以便解绑
  const toolOptions = useMemo<DropdownSelectOption[]>(() => {
    const selectedIds = new Set(formData.bind_tools);
    const knownIds = new Set(allTools.map((t) => t.id));
    const onlineOrBound = allTools
      .filter((t) => t.status === 'online' || selectedIds.has(t.id))
      .map((t) => ({
        value: t.id,
        label: t.status === 'online' ? t.name : `${t.name}（${TOOL_STATUS_LABEL[t.status] || t.status}）`,
      }));
    // 已绑定但已从注册中心删除的工具：仍展示（标"已失效"）以便在面板看到勾选并解绑
    const orphan = formData.bind_tools
      .filter((id) => !knownIds.has(id))
      .map((id) => ({ value: id, label: `${id}（已失效）` }));
    return [...onlineOrBound, ...orphan];
  }, [allTools, formData.bind_tools]);

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
      bind_tools: engine.bind_tools || [],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { bind_tools } = formData;
    if (bind_tools.length === 0) {
      alert('请至少选择一个绑定工具（bind_tools 不能为空）。');
      return;
    }
    // 客户端预检：一个工具不能同时绑给多个引擎（路由是 工具→引擎 1:1）
    const selfName = editingEngine?.engine_name;
    const conflictTool = bind_tools.find((tool) =>
      engines.some((eng) => eng.engine_name !== selfName && (eng.bind_tools || []).includes(tool)),
    );
    if (conflictTool) {
      const holder = engines.find(
        (eng) => eng.engine_name !== selfName && (eng.bind_tools || []).includes(conflictTool),
      )?.engine_name;
      alert(`工具「${conflictTool}」已绑定到引擎「${holder}」。\n一个工具不能同时绑给多个引擎（路由按 工具→引擎 1:1 匹配），请先在该引擎解绑，或选其它工具。`);
      return;
    }
    setFormLoading(true);
    try {
      if (editingEngine) {
        await vulnApi.updateConfirmEngine(editingEngine.engine_name, {
          engine_name: formData.engine_name.trim(),
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

  const openNotifyModal = async () => {
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    setNotifyTestResult(null);
    try {
      const cfg = await vulnApi.getNotifyConfig();
      setNotifyConfig(cfg);
      setNotifyForm(cfg);
    } catch (e) {
      console.error('[VulnConfirmEnginesPage] load notify config failed:', e);
      setNotifyForm({
        webhook_url: 'http://xiaoluban.rnd.huawei.com:80/',
        auth: '',
        receiver: '',
        sender: '',
        timeout_seconds: 10,
        enabled: true,
      });
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleNotifySave = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifySaving(true);
    setNotifyTestResult(null);
    try {
      const updated = await vulnApi.updateNotifyConfig(notifyForm);
      setNotifyConfig(updated);
      setNotifyForm(updated);
    } catch (err: any) {
      console.error('[VulnConfirmEnginesPage] save notify config failed:', err);
      alert('保存失败: ' + (err?.message || '未知错误'));
    } finally {
      setNotifySaving(false);
    }
  };

  const handleNotifyTest = async () => {
    setNotifyTesting(true);
    setNotifyTestResult(null);
    try {
      const result = await vulnApi.testNotify(notifyForm);
      setNotifyTestResult(result);
    } catch (err: any) {
      setNotifyTestResult({ success: false, status_code: null, detail: err?.message || '请求失败' });
    } finally {
      setNotifyTesting(false);
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
                <Wrench size={10} /> {idToName.get(tool) || tool}
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
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-theme-elevated text-theme-text-muted border-theme-border'}`}>
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
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      <PageHeader
        title={<><div className="p-3 bg-indigo-600 text-white rounded-lg shadow-indigo-500/20 inline-flex"><ShieldCheck size={28} /></div> 漏洞确认引擎管理</>}
        actions={<div className="flex gap-4">
          <button onClick={fetchEngines} className="p-4 bg-theme-surface border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openNotifyModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-all text-sm font-medium"
          >
            <Bell size={16} /> 通知配置
          </button>
          <button onClick={openCreate} className="btn-primary btn-lg flex items-center gap-3">
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
            <div className="w-20 h-20 bg-theme-elevated rounded-full flex items-center justify-center mx-auto mb-4 text-theme-text-secondary">
              <ServerCog size={40} />
            </div>
            <p className="text-sm font-semibold text-theme-text-muted uppercase tracking-widest">尚未注册任何漏洞确认引擎</p>
          </div>
        }
        minWidth={1000}
      />

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-lg">
        <div className="p-6 pb-4 border-b border-theme-border flex items-center justify-between">
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="form-label">引擎名称 <span className="required"> *</span></label>
            <input
              required
              placeholder="e.g. loki-triage-prod"
              className="form-input w-full font-mono"
              value={formData.engine_name}
              onChange={(e) => setFormData({ ...formData, engine_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Endpoint <span className="required"> *</span></label>
            <input
              required
              placeholder="http://engine-host:port"
              className="form-input w-full font-mono"
              value={formData.endpoint}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">版本 <span className="required"> *</span></label>
            <input
              required
              placeholder="v1.0.0"
              className="form-input w-full font-mono"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">绑定工具 (bind_tools) <span className="required"> *</span></label>
            <DropdownSelect
              multiple
              value={formData.bind_tools}
              onChange={(v) => setFormData({ ...formData, bind_tools: v as string[] })}
              options={toolOptions}
              placeholder="选择工具（可多选）"
              emptyText="暂无可用工具"
              containerClassName="mt-1"
            />
            <p className="text-[10px] text-theme-text-faint ml-1">选项来自工具注册中心；每个工具不能同时绑定到其他引擎，否则后端返回冲突错误</p>
          </div>
          <div className="flex gap-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary btn-lg">取消</button>
            <button disabled={formLoading} className="btn-primary btn-lg flex items-center justify-center gap-3">
              {formLoading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
              {editingEngine ? '应用更改' : '立即注册'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={notifyModalOpen} onClose={() => setNotifyModalOpen(false)} className="max-w-lg">
        <div className="p-6 pb-4 border-b border-theme-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-500/20">
              <Bell size={24} />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-theme-text-primary">小鲁班通知配置</h3>
              <p className="text-[10px] text-theme-text-muted font-bold uppercase mt-0.5">Webhook Notify Config</p>
            </div>
          </div>
          <button onClick={() => setNotifyModalOpen(false)} className="p-3 text-theme-text-faint hover:text-theme-text-secondary"><X size={28} /></button>
        </div>
        {notifyLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-400" size={28} />
          </div>
        ) : (
          <form onSubmit={handleNotifySave} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Webhook URL <span className="required"> *</span></label>
              <input
                required
                type="text"
                placeholder="http://xiaoluban.rnd.huawei.com:80/"
                className="form-input w-full font-mono"
                value={notifyForm.webhook_url}
                onChange={(e) => setNotifyForm({ ...notifyForm, webhook_url: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Auth Token</label>
              <input
                type="password"
                placeholder="auth token"
                className="form-input w-full font-mono"
                value={notifyForm.auth}
                onChange={(e) => setNotifyForm({ ...notifyForm, auth: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Receiver <span className="required"> *</span></label>
              <input
                required
                type="text"
                placeholder="接收者 ID"
                className="form-input w-full font-mono"
                value={notifyForm.receiver}
                onChange={(e) => setNotifyForm({ ...notifyForm, receiver: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Sender (可选)</label>
              <input
                type="text"
                placeholder="发送者 ID（可留空）"
                className="form-input w-full font-mono"
                value={notifyForm.sender || ''}
                onChange={(e) => setNotifyForm({ ...notifyForm, sender: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">超时 (秒)</label>
                <input
                  type="number"
                  min={1}
                  className="form-input w-full font-mono"
                  value={notifyForm.timeout_seconds}
                  onChange={(e) => setNotifyForm({ ...notifyForm, timeout_seconds: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">启用</label>
                <button
                  type="button"
                  onClick={() => setNotifyForm({ ...notifyForm, enabled: !notifyForm.enabled })}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-all ${notifyForm.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-theme-surface text-theme-text-muted border-theme-border'}`}
                >
                  {notifyForm.enabled ? '已启用' : '已停用'}
                </button>
              </div>
            </div>

            {notifyTestResult && (
              <div className={`px-3 py-2 rounded-lg text-xs border ${notifyTestResult.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {notifyTestResult.success
                  ? `✓ 发送成功 (HTTP ${notifyTestResult.status_code})`
                  : `✗ 发送失败${notifyTestResult.status_code ? ` (HTTP ${notifyTestResult.status_code})` : ''}: ${notifyTestResult.detail || '未知错误'}`}
              </div>
            )}

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={notifySaving}
                className="btn-primary btn-lg flex items-center justify-center gap-3"
              >
                {notifySaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                保存配置
              </button>
              <button
                type="button"
                onClick={handleNotifyTest}
                disabled={notifyTesting}
                className="btn-secondary btn-lg flex items-center justify-center gap-3"
              >
                {notifyTesting ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                发送测试
              </button>
              <button
                type="button"
                onClick={() => setNotifyModalOpen(false)}
                className="ml-auto px-4 py-2 text-theme-text-muted hover:text-theme-text text-sm"
              >
                关闭
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
