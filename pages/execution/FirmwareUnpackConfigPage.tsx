import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Loader2,
  RefreshCw, Save, Settings,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareConfigEntry } from '../../clients/firmwareUnpacker';

interface Props { projectId: string; }

const fwApi = api.domains.execution.firmwareUnpacker;

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

// ──────────────────────────────────────────────────────────
// Config editor row
// ──────────────────────────────────────────────────────────
function ConfigRow({
  entry, onSave,
}: { entry: FirmwareConfigEntry; onSave: (key: string, value: string) => Promise<void> }) {
  const [val, setVal]       = useState(entry.value);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const dirty = val !== entry.value;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(entry.key, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(`保存失败: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black font-mono text-slate-700">{entry.key}</span>
          <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">{entry.value_type}</span>
          {saved && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5"><CheckCircle2 size={10} /> 已保存</span>}
        </div>
        {entry.description && (
          <p className="text-[11px] text-slate-400 mb-2">{entry.description}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-mono outline-none transition ${
              dirty ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
            } bg-white`}
          />
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            保存
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          更新于 {fmtTime(entry.updated_at)}
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackConfigPage: React.FC<Props> = ({ projectId }) => {
  const [configs,       setConfigs]       = useState<FirmwareConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError,   setConfigError]   = useState('');
  const configItems = Array.isArray(configs) ? configs : [];

  // ── load ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError('');
    try {
      const r = await fwApi.getConfig();
      setConfigs(r.items);
    } catch (e: any) {
      setConfigError(e?.message || '加载配置失败');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, []);

  // ── save config ───────────────────────────────────────────
  const handleSaveConfig = async (key: string, value: string) => {
    await fwApi.updateConfig(key, value);
    // Update local cache
    setConfigs(prev => prev.map(e => e.key === key ? { ...e, value, updated_at: new Date().toISOString() } : e));
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-violet-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">固件解包 · 配置</h2>
            <p className="text-xs text-slate-400">动态配置参数</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { loadConfig(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* Config editor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Settings size={13} className="text-amber-600" />
            动态配置参数
          </div>
          <button onClick={loadConfig} disabled={configLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {configLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} 刷新
          </button>
        </div>

        {configError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={13} /> {configError}
          </div>
        )}

        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
          💡 配置立即生效于后端服务，所有集群实例共享。修改后无需重启。
        </div>

        {configLoading && configItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载配置中...
          </div>
        ) : configItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-400">
            暂无配置项
          </div>
        ) : (
          <div className="space-y-2">
            {configItems.map(e => (
              <ConfigRow key={e.key} entry={e} onSave={handleSaveConfig} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
