/* @refresh reset */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, GitBranch, ChevronRight } from 'lucide-react';

import { api } from '../../clients/api';
import type { CfgPipelineListItem } from '../../clients/cfgPipeline';
import { useUiFeedback } from '../../components/UiFeedback';
import { saveExecutionReturnContext } from '../../utils/executionReturnContext';

const STATUS_LABEL: Record<string, string> = {
  analyzing: '入口分析中',
  entries_ready: '入口就绪',
  auditing: '漏洞挖掘中',
  completed: '已完成',
  completed_with_errors: '完成(含错误)',
  failed: '失败',
  error: '错误',
  pending: '等待中',
};

const STATUS_COLOR: Record<string, string> = {
  analyzing: 'bg-blue-100 text-blue-700',
  entries_ready: 'bg-amber-100 text-amber-700',
  auditing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  completed_with_errors: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-600',
};

export const CfgDbVulnToolPage: React.FC<{ projectId: string; onOpenTask?: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.cfgPipeline;
  const { notify, feedbackNodes } = useUiFeedback();

  const [items, setItems] = useState<CfgPipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', input_path: '' });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await appApi.listPipelines({ project_id: projectId, per_page: 100 });
      setItems(r.items || []);
    } catch (e: any) {
      notify(`加载失败：${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [appApi, projectId, notify]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    if (!form.name.trim() || !form.input_path.trim()) {
      notify('请填写名称和源码路径', 'error');
      return;
    }
    setCreating(true);
    try {
      const created = await appApi.createPipeline({
        project_id: projectId, name: form.name.trim(), input_path: form.input_path.trim(),
      });
      setCreateOpen(false);
      setForm({ name: '', input_path: '' });
      notify('已创建，入口分析进行中', 'success');
      await refresh();
      if (onOpenTask) onOpenTask(created.pipeline_id);
    } catch (e: any) {
      notify(`创建失败：${e?.message || e}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {feedbackNodes}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5" /> 数据库漏洞挖掘（CFG 两阶段）
          </h1>
          <p className="text-sm text-gray-500 mt-1">入口分析 → 选择入口 → 数据流漏洞挖掘。基于 CFG Guided Explore 引擎。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="px-3 py-2 rounded border text-sm flex items-center gap-1 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-1 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> 加载中</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-16 border rounded">暂无任务，点击「新建」开始</div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">名称</th>
                <th className="text-left px-4 py-2">状态</th>
                <th className="text-right px-4 py-2">候选入口</th>
                <th className="text-right px-4 py-2">审计子任务</th>
                <th className="text-left px-4 py-2">创建时间</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.pipeline_id} className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => { saveExecutionReturnContext({ view: 'cfg-db-vuln-tool' }); onOpenTask?.(it.pipeline_id); }}>
                  <td className="px-4 py-2 font-medium">{it.name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[it.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[it.status] || it.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{it.entry_count}</td>
                  <td className="px-4 py-2 text-right">{it.audit_child_count}</td>
                  <td className="px-4 py-2 text-gray-500">{it.created_at || '-'}</td>
                  <td className="px-4 py-2 text-right"><ChevronRight className="w-4 h-4 text-gray-400 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => !creating && setCreateOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-[520px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">新建数据库漏洞挖掘任务</h2>
            <label className="block text-sm font-medium mb-1">任务名称</label>
            <input className="form-input w-full mb-3" value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：openGauss 数据流审计" />
            <label className="block text-sm font-medium mb-1">源码路径（NFS）</label>
            <input className="form-input w-full mb-4 font-mono" value={form.input_path}
                   onChange={(e) => setForm({ ...form, input_path: e.target.value })}
                   placeholder="/data/files/<project>/.../src" />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border text-sm" onClick={() => setCreateOpen(false)} disabled={creating}>取消</button>
              <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-1" onClick={submit} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 animate-spin" />} 创建并开始入口分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
