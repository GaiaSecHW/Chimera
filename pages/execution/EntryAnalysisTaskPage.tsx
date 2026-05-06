import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Loader2, Plus, RefreshCw, RotateCcw, X } from 'lucide-react';

import { api } from '../../clients/api';
import { AppEaTaskDetail, AppEaTaskItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

const emptyForm = {
  task_name: '',
  input_path: '',
  output_path: '',
  task_description: '',
  prompt_content: '',
};

type PanelMode = 'none' | 'create' | 'detail';

export const EntryAnalysisTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const appApi = api.domains.execution.appEntryAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [tasks, setTasks] = useState<AppEaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<AppEaTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const promptGenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'output'>('input');

  useEffect(() => {
    const stored = sessionStorage.getItem('secflow:entryAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('secflow:entryAnalysisInputPath');
      setPanelMode('create');
      setSelectedTaskId('');
      setForm({ ...emptyForm, input_path: stored });
      handleInputPathChange(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await appApi.listTasks({ project_id: projectId, page: p, per_page: PER_PAGE });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => { void loadTasks(page); }, [projectId, page]);

  const loadDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const d = await appApi.getTask(taskId);
      setDetail(d);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setPanelMode('detail');
    void loadDetail(taskId);
  };

  const handleInputPathChange = (value: string) => {
    setForm((prev) => ({ ...prev, input_path: value }));
    if (promptGenTimer.current) clearTimeout(promptGenTimer.current);
    promptGenTimer.current = setTimeout(async () => {
      if (!value.trim()) return;
      setGeneratingPrompt(true);
      try {
        const result = await appApi.generatePrompt(value.trim());
        setForm((prev) => ({ ...prev, prompt_content: result.prompt }));
      } catch {
        // silently ignore
      } finally {
        setGeneratingPrompt(false);
      }
    }, 600);
  };

  const handleCreate = async () => {
    if (!form.task_name.trim()) { notify('任务名称不能为空', 'error'); return; }
    if (!form.input_path.trim()) { notify('输入路径不能为空', 'error'); return; }
    if (!form.output_path.trim()) { notify('输出路径不能为空', 'error'); return; }
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
        prompt_content: form.prompt_content.trim() || undefined,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
      setForm({ ...emptyForm });
      setPanelMode('none');
      setPage(1);
      await loadTasks(1);
    } catch (err: any) {
      notify(`任务创建失败: ${err?.message || err}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await appApi.cancelTask(taskId);
      notify('任务已取消', 'success');
      if (selectedTaskId === taskId) void loadDetail(taskId);
      await loadTasks(page);
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleRestart = async (taskId: string) => {
    setRestarting(true);
    try {
      const newTask = await appApi.restartTask(taskId);
      notify(`已创建新任务: ${newTask.task_id}`, 'success');
      setPage(1);
      await loadTasks(1);
      handleSelectTask(newTask.task_id);
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'output') {
            setForm((p) => ({ ...p, output_path: containerPath }));
          } else {
            handleInputPathChange(containerPath);
          }
        }}
      />
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">入口分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">指定目标模块路径，自动生成 Prompt 并启动入口点分析任务。</p>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: '总任务', value: total, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
          { label: '运行中', value: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
          { label: '已通过', value: tasks.filter((t) => t.status === 'passed').length, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
          { label: '失败/取消', value: tasks.filter((t) => t.status === 'failed' || t.status === 'error' || t.status === 'cancelled').length, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex flex-col gap-1 shadow-sm`}>
            <p className={`text-3xl font-black ${s.text}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── Task list ───────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
            <div className="flex items-center gap-2">
              <button onClick={() => void loadTasks(page)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <RefreshCw size={14} />
              </button>
              <button onClick={() => { setPanelMode('create'); setSelectedTaskId(''); setForm({ ...emptyForm }); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                <Plus size={13} />新建任务
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-6"><Loader2 size={14} className="animate-spin" />加载中...</div>
          ) : tasks.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">暂无任务，点击右上角「新建任务」创建</div>
          ) : (
            <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
              {tasks.map((t) => (
                <button
                  key={t.task_id}
                  onClick={() => handleSelectTask(t.task_id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedTaskId === t.task_id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{t.task_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 truncate font-mono">{t.input_path}</div>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                    <span>创建: {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}</span>
                    <span>耗时: {formatDuration(t.started_at, t.finished_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">上一页</button>
              <span className="text-slate-500">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">下一页</button>
            </div>
          ) : null}
        </section>

        {/* ── Right panel ───────────────────────────────────────────────── */}
        {panelMode === 'none' ? (
          <div className="hidden xl:flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 text-sm text-slate-400">
            选择任务查看详情，或点击「新建任务」
          </div>
        ) : panelMode === 'create' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">新建任务</h2>
              <button onClick={() => setPanelMode('none')} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>

            <label className="block text-sm text-slate-600">
              任务名称 <span className="text-red-500">*</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.task_name}
                onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))}
                placeholder="例：分析IPSec模块入口-2025"
              />
            </label>

            <label className="block text-sm text-slate-600">
              目标模块路径 <span className="text-red-500">*</span>
              <div className="mt-1 flex gap-1">
                <input
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={form.input_path}
                  onChange={(e) => handleInputPathChange(e.target.value)}
                  placeholder="/data/fileserver/files/<project>/<module>"
                />
                <button
                  type="button"
                  title="从文件资源中选择目录"
                  onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                >
                  <FolderOpen size={13} />浏览
                </button>
              </div>
            </label>

            <label className="block text-sm text-slate-600">
              输出路径 <span className="text-red-500">*</span>
              <div className="mt-1 flex gap-1">
                <input
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={form.output_path}
                  onChange={(e) => setForm((p) => ({ ...p, output_path: e.target.value }))}
                  placeholder="/data/fileserver/files/<project>/output"
                />
                <button
                  type="button"
                  title="从文件资源中选择目录"
                  onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                >
                  <FolderOpen size={13} />浏览
                </button>
              </div>
            </label>

            <label className="block text-sm text-slate-600">
              任务描述 <span className="text-slate-400 text-xs">(可选)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.task_description}
                onChange={(e) => setForm((p) => ({ ...p, task_description: e.target.value }))}
                placeholder="简要说明分析目标或背景"
              />
            </label>

            <label className="block text-sm text-slate-600">
              <span className="flex items-center gap-2">
                分析 Prompt
                {generatingPrompt ? <Loader2 size={12} className="animate-spin text-violet-500" /> : <span className="text-xs text-slate-400">(根据路径自动生成，可手动修改)</span>}
              </span>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.prompt_content}
                onChange={(e) => setForm((p) => ({ ...p, prompt_content: e.target.value }))}
                placeholder="留空将根据路径自动生成"
              />
            </label>

            <button
              onClick={() => void handleCreate()}
              disabled={creating || !form.task_name.trim() || !form.input_path.trim() || !form.output_path.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : null}
              创建分析任务
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 overflow-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black text-slate-900">任务详情</h2>
              <div className="flex items-center gap-2">
                {detail && (detail.status === 'running' || detail.status === 'pending') ? (
                  <button onClick={() => void handleCancel(detail.task_id)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">取消</button>
                ) : null}
                {detail && !['pending', 'running'].includes(detail.status) ? (
                  <button
                    onClick={() => void handleRestart(detail.task_id)}
                    disabled={restarting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                  >
                    {restarting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    重新运行
                  </button>
                ) : null}
                <button onClick={() => detail && void loadDetail(detail.task_id)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700"><RefreshCw size={14} /></button>
                <button onClick={() => { setPanelMode('none'); setSelectedTaskId(''); setDetail(null); }}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>

            {detailLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4"><Loader2 size={14} className="animate-spin" />加载中...</div>
            ) : detail ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">{detail.task_name}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>

                <InfoRow label="任务 ID" value={<span className="font-mono text-xs">{detail.task_id}</span>} />
                <InfoRow label="目标路径" value={<span className="font-mono text-xs break-all">{detail.input_path}</span>} />
                {detail.output_path ? <InfoRow label="输出路径" value={<span className="font-mono text-xs break-all">{detail.output_path}</span>} /> : null}
                {detail.task_description ? <InfoRow label="描述" value={detail.task_description} /> : null}
                <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                {detail.started_at ? <InfoRow label="开始时间" value={new Date(detail.started_at).toLocaleString('zh-CN')} /> : null}
                {detail.finished_at ? <InfoRow label="完成时间" value={new Date(detail.finished_at).toLocaleString('zh-CN')} /> : null}
                {detail.started_at ? <InfoRow label="耗时" value={formatDuration(detail.started_at, detail.finished_at)} /> : null}

                {detail.error ? (
                  <div>
                    <div className="text-xs font-semibold text-red-600 mb-1">错误信息</div>
                    <pre className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap break-all max-h-40 overflow-auto">{detail.error}</pre>
                  </div>
                ) : null}

                {detail.result_json ? (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1">分析结果</div>
                    <pre className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-auto">{JSON.stringify(detail.result_json, null, 2)}</pre>
                  </div>
                ) : null}

                {detail.prompt_content ? (
                  <details className="rounded-lg border border-slate-200">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">分析 Prompt</summary>
                    <pre className="px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap break-all max-h-48 overflow-auto">{detail.prompt_content}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700">{value}</span>
    </div>
  );
}
