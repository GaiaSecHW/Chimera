import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisPromptTemplate } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

const emptyForm = {
  name: '',
  category: 'general',
  description: '',
  content: '',
  variables: 'project_name,agent_key,agent_hostname',
  is_default: false,
  is_enabled: true,
};

export const SystemAnalysisPromptPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SystemAnalysisPromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const selected = useMemo(() => items.find((i) => i.prompt_id === selectedId), [items, selectedId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await api.systemAnalysis.listPrompts({ page: 1, per_page: 200 });
      const list = (resp.items || []) as SystemAnalysisPromptTemplate[];
      setItems(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].prompt_id);
    } catch (error: any) {
      notify(`加载 Prompt 列表失败: ${error?.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [projectId]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      name: selected.name || '',
      category: selected.category || 'general',
      description: selected.description || '',
      content: selected.content || '',
      variables: (selected.variables_json || []).join(','),
      is_default: selected.is_default,
      is_enabled: selected.is_enabled,
    });
  }, [selectedId, selected?.updated_at]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.content.trim()) {
      notify('名称和内容不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await api.systemAnalysis.createPrompt({
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim(),
        content: form.content,
        variables_json: form.variables.split(',').map((s) => s.trim()).filter(Boolean),
        is_default: form.is_default,
        is_enabled: form.is_enabled,
      });
      notify('Prompt 创建成功', 'success');
      await loadData();
      setSelectedId(created.prompt_id);
    } catch (error: any) {
      notify(`创建失败: ${error?.message || error}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.systemAnalysis.updatePrompt(selectedId, {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim(),
        content: form.content,
        variables_json: form.variables.split(',').map((s) => s.trim()).filter(Boolean),
        is_default: form.is_default,
        is_enabled: form.is_enabled,
      });
      notify('Prompt 更新成功', 'success');
      await loadData();
    } catch (error: any) {
      notify(`更新失败: ${error?.message || error}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('确认删除该 Prompt？')) return;
    setSaving(true);
    try {
      await api.systemAnalysis.deletePrompt(selectedId);
      notify('Prompt 已删除', 'success');
      setSelectedId('');
      setForm(emptyForm);
      await loadData();
    } catch (error: any) {
      notify(`删除失败: ${error?.message || error}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Prompt 管理</h1>
      </section>

      {loading ? <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><Loader2 size={15} className="animate-spin" />加载中...</div> : null}

      {!loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black text-slate-900">模板列表</h2>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs" onClick={() => { setSelectedId(''); setForm(emptyForm); }}>新建</button>
            </div>
            <div className="mt-4 max-h-[700px] space-y-2 overflow-auto pr-1">
              {items.map((item) => (
                <button key={item.prompt_id} onClick={() => setSelectedId(item.prompt_id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === item.prompt_id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <div className="text-sm font-bold text-slate-900 truncate">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.prompt_id} · v{item.version}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <label className="block text-sm text-slate-600">名称<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
            <label className="block text-sm text-slate-600">分类<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></label>
            <label className="block text-sm text-slate-600">描述<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
            <label className="block text-sm text-slate-600">变量（逗号分隔）<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={form.variables} onChange={(e) => setForm((p) => ({ ...p, variables: e.target.value }))} /></label>
            <label className="block text-sm text-slate-600">内容<textarea className="mt-1 min-h-[260px] w-full rounded-lg border border-slate-200 px-3 py-2" value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} /></label>
            <div className="flex items-center gap-4 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />默认</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm((p) => ({ ...p, is_enabled: e.target.checked }))} />启用</label>
            </div>
            <div className="flex gap-2">
              {!selectedId ? (
                <button onClick={() => void handleCreate()} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">创建</button>
              ) : (
                <>
                  <button onClick={() => void handleUpdate()} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">保存</button>
                  <button onClick={() => void handleDelete()} disabled={saving} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">删除</button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

