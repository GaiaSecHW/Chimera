import React, { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, Settings, FileText } from 'lucide-react';
import { framaCApi } from '../../clients/framaCVerify';
import { getHeaders, handleResponse } from '../../clients/base';

interface ThreatModelEntry {
  key: string;
  name: string;
  is_active: boolean;
  content?: string;
  created_at?: string;
}

const BASE = '/api/app/frama-c';

export const FramaCAdminPage: React.FC = () => {
  const [modelConfig, setModelConfig] = useState<string>('');
  const [threatModels, setThreatModels] = useState<ThreatModelEntry[]>([]);
  const [selectedTM, setSelectedTM] = useState<ThreatModelEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const modelResp = await framaCApi.getHealth();
      const [mcResp, tmResp] = await Promise.all([
        handleResponse(await fetch(`${BASE}/admin/model-config`, { headers: getHeaders() })),
        handleResponse(await fetch(`${BASE}/admin/threat-models`, { headers: getHeaders() })),
      ]);
      setModelConfig(mcResp?.default_model || '');
      setThreatModels(tmResp || []);
    } catch (e) { console.error('loadAdminData error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAdminData(); }, [loadAdminData]);

  const saveModelConfig = useCallback(async () => {
    setSavingModel(true);
    try {
      await handleResponse(await fetch(`${BASE}/admin/model-config`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ default_model: modelConfig }),
      }));
    } catch (e) { console.error(e); }
    finally { setSavingModel(false); }
  }, [modelConfig]);

  const loadThreatModel = useCallback(async (key: string) => {
    try {
      const resp = await handleResponse(await fetch(`${BASE}/admin/threat-models/${encodeURIComponent(key)}`, { headers: getHeaders() }));
      setSelectedTM(resp);
    } catch (e) { console.error(e); }
  }, []);

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Settings className="w-5 h-5" />
        形式化验证 - 管理端
      </h1>

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">模型配置</h2>
        <div className="flex items-center gap-3">
          <input value={modelConfig} onChange={(e) => setModelConfig(e.target.value)} className="border rounded px-3 py-1.5 text-sm w-64" placeholder="默认模型名称" />
          <button onClick={saveModelConfig} disabled={savingModel} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
            {savingModel ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">威胁模型版本库</h2>
        {threatModels.length === 0 && <p className="text-sm text-slate-400">暂无威胁模型</p>}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Key</th>
              <th className="px-3 py-1.5 text-left font-medium">名称</th>
              <th className="px-3 py-1.5 text-left font-medium">活跃</th>
              <th className="px-3 py-1.5 text-left font-medium">创建时间</th>
              <th className="px-3 py-1.5 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {threatModels.map((tm) => (
              <tr key={tm.key} className="border-b hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-xs truncate max-w-[160px]">{tm.key.slice(0, 16)}...</td>
                <td className="px-3 py-1.5">{tm.name}</td>
                <td className="px-3 py-1.5">{tm.is_active ? <span className="text-emerald-600">✓</span> : <span className="text-slate-400">✗</span>}</td>
                <td className="px-3 py-1.5">{tm.created_at ? new Date(tm.created_at).toLocaleString('zh-CN') : '—'}</td>
                <td className="px-3 py-1.5"><button onClick={() => loadThreatModel(tm.key)} className="text-blue-600 hover:underline text-xs">查看内容</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        {selectedTM && (
          <div className="mt-3 border rounded p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{selectedTM.name} ({selectedTM.key.slice(0, 16)}...)</span>
              <button onClick={() => setSelectedTM(null)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">{selectedTM.content || '—'}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
