/* @refresh reset */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, RefreshCw, GitBranch, ChevronRight, X, Search,
  FileCode, Check, AlertTriangle, Sparkles, Database, Clock,
} from 'lucide-react';

import { api } from '../../clients/api';
import type { CfgPipelineListItem } from '../../clients/cfgPipeline';
import type { CodemapTaskStatus } from '../../clients/codemapManager';
import { buildManagerTargetDir, IN_PROGRESS_STATUSES } from '../../clients/codemapManager';
import type { ProjectInputUploadRecord } from '../../types/types';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import { useUiFeedback } from '../../components/UiFeedback';
import { CodemapMetroProgress } from '../../components/CodemapMetroProgress';
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

const STATUS_DOT: Record<string, string> = {
  analyzing: 'bg-sky-400',
  entries_ready: 'bg-amber-400',
  auditing: 'bg-sky-400',
  completed: 'bg-emerald-400',
  completed_with_errors: 'bg-orange-400',
  failed: 'bg-rose-400',
  error: 'bg-rose-400',
  pending: 'bg-slate-400',
};

const getLocalUserInfo = (): { username?: string } | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

/* ── 攻击入口分析就绪度:从 codemap manager 任务状态派生,供新建弹窗里
 *    每条代码上传记录显示「能不能拿来挖掘」+ 入口数。与详情页/测试对象页同口径:
 *    attack.status 是入口分析的权威信号(重跑只动它)。 */
type EntryTier = 'ready' | 'in_progress' | 'failed' | 'none';

interface EntryReadiness {
  tier: EntryTier;
  label: string;
  entries: number | null;
}

function deriveEntryReadiness(status: CodemapTaskStatus | null | undefined): EntryReadiness {
  if (status === undefined) return { tier: 'in_progress', label: '查询中…', entries: null };
  if (status === null) return { tier: 'none', label: '未构建知识图谱', entries: null };
  const attack = status.attack?.status ?? null;
  const entries = status.attack?.entries ?? null;
  // SS4/SS5: 整体态读 overall(回退 status);attack done/ok 都认(SS3 改名)。
  const overall = status.overall ?? status.status;
  if (attack === 'done' || attack === 'ok') return { tier: 'ready', label: '入口就绪', entries };
  if (attack === 'running' || overall === 'building_attack_surface') {
    return { tier: 'in_progress', label: '入口分析中', entries };
  }
  if (IN_PROGRESS_STATUSES.has(overall)) return { tier: 'in_progress', label: '图谱构建中', entries };
  if (attack === 'failed') return { tier: 'failed', label: '入口分析失败', entries };
  if (overall === 'failed') return { tier: 'failed', label: '图谱构建失败', entries };
  if (overall === 'completed') return { tier: 'ready', label: '图谱已就绪', entries };
  return { tier: 'none', label: '未构建知识图谱', entries: null };
}

const TIER_STYLE: Record<EntryTier, { chip: string; dot: string; icon: React.ReactNode }> = {
  ready: { chip: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-300', dot: 'bg-emerald-400', icon: <Check size={12} strokeWidth={2.5} /> },
  in_progress: { chip: 'border-sky-400/40 bg-sky-500/12 text-sky-300', dot: 'bg-sky-400', icon: <Loader2 size={12} className="animate-spin" /> },
  failed: { chip: 'border-rose-400/40 bg-rose-500/12 text-rose-300', dot: 'bg-rose-400', icon: <X size={12} strokeWidth={2.5} /> },
  none: { chip: 'border-theme-border bg-theme-surface text-theme-text-faint', dot: 'bg-slate-500', icon: <AlertTriangle size={12} /> },
};

export const CfgDbVulnToolPage: React.FC<{ projectId: string; onOpenTask?: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.cfgPipeline;
  const { notify, feedbackNodes } = useUiFeedback();
  const currentUser = useMemo(() => getLocalUserInfo(), []);

  const [items, setItems] = useState<CfgPipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-7">
      {feedbackNodes}

      {/* ── header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/90 to-sky-500/90 shadow-lg shadow-indigo-500/20">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-theme-text-primary">知识图谱-源码（CFG/DFG）</h1>
            <p className="mt-1 text-sm text-theme-text-muted">
              选择已构建知识图谱的代码上传记录，自动执行两阶段挖掘：
              <span className="text-theme-text-secondary"> 入口分析 → 数据流漏洞挖掘</span>。
            </p>
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary transition-colors hover:bg-theme-elevated"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:from-indigo-400 hover:to-sky-400 hover:shadow-lg hover:shadow-indigo-500/30"
          >
            <Plus className="h-4 w-4" /> 新建任务
          </button>
        </div>
      </div>

      {/* ── task list ── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-theme-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-theme-border bg-theme-surface/40 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-theme-elevated text-theme-text-faint">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-theme-text-secondary">还没有挖掘任务</div>
          <div className="text-xs text-theme-text-faint">点击右上角「新建任务」，选择一条代码记录开始</div>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:from-indigo-400 hover:to-sky-400"
          >
            <Plus className="h-4 w-4" /> 新建任务
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme-border text-xs uppercase tracking-wide text-theme-text-faint">
                <th className="px-5 py-3 text-left font-medium">名称</th>
                <th className="px-5 py-3 text-left font-medium">状态</th>
                <th className="px-5 py-3 text-right font-medium">候选入口</th>
                <th className="px-5 py-3 text-right font-medium">审计子任务</th>
                <th className="px-5 py-3 text-left font-medium">创建时间</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.pipeline_id}
                  className="group cursor-pointer border-b border-theme-border-subtle transition-colors last:border-0 hover:bg-theme-elevated"
                  onClick={() => { saveExecutionReturnContext({ view: 'cfg-db-vuln-tool' }); onOpenTask?.(it.pipeline_id); }}
                >
                  <td className="px-5 py-3.5 font-medium text-theme-text-primary">{it.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-surface px-2.5 py-1 text-xs font-medium text-theme-text-secondary">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[it.status] || 'bg-slate-400'}`} />
                      {STATUS_LABEL[it.status] || it.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-theme-text-secondary">{it.entry_count}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-theme-text-secondary">{it.audit_child_count}</td>
                  <td className="px-5 py-3.5 text-theme-text-muted">{it.created_at || '-'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <ChevronRight className="inline h-4 w-4 text-theme-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-theme-text-secondary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateTaskModal
          projectId={projectId}
          createdBy={currentUser?.username}
          onClose={() => setCreateOpen(false)}
          onCreated={async (pipelineId) => {
            setCreateOpen(false);
            notify('已创建，入口分析进行中', 'success');
            await refresh();
            onOpenTask?.(pipelineId);
          }}
          notify={notify}
        />
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 *  新建任务弹窗:选择项目下「代码」上传记录(含攻击入口分析状态),命名后创建。
 * ────────────────────────────────────────────────────────────────────────── */
const CreateTaskModal: React.FC<{
  projectId: string;
  createdBy?: string;
  onClose: () => void;
  onCreated: (pipelineId: string) => void | Promise<void>;
  notify: (msg: string, kind: 'success' | 'error' | 'info') => void;
}> = ({ projectId, createdBy, onClose, onCreated, notify }) => {
  const fileserverApi = api.domains.assets.fileserver;
  const managerApi = api.codemapManager;

  const [records, setRecords] = useState<ProjectInputUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // upload_id -> codemap 状态。undefined=查询中,null=未派发(404)。
  const [statuses, setStatuses] = useState<Record<string, CodemapTaskStatus | null>>({});
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchStatuses = useCallback(async (recs: ProjectInputUploadRecord[]) => {
    const entries = await Promise.all(recs.map(async (r) => {
      try {
        const s = await managerApi.getTaskStatus(r.upload_id);
        return [r.upload_id, s] as const;
      } catch {
        return [r.upload_id, null] as const; // 404 → 尚未构建图谱
      }
    }));
    setStatuses((prev) => {
      const next = { ...prev };
      for (const [id, s] of entries) next[id] = s;
      return next;
    });
  }, [managerApi]);

  // 初次加载:取 code 类型上传记录 + 各自 codemap 状态。
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const resp = await fileserverApi.listProjectInputUploads(projectId, { inputType: 'code', pageSize: 200 });
        const recs = (resp.items || []).filter((r) => String(r.input_type).toLowerCase() === 'code');
        if (!alive) return;
        setRecords(recs);
        setStatuses(Object.fromEntries(recs.map((r) => [r.upload_id, undefined as any])));
        void fetchStatuses(recs);
      } catch (e: any) {
        if (alive) setLoadError(e?.message || '加载代码上传记录失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId, fileserverApi, fetchStatuses]);

  // 轮询仍在构建/入口分析中的记录,直到全部终态。
  useEffect(() => {
    const inflight = records.filter((r) => {
      const t = deriveEntryReadiness(statuses[r.upload_id]).tier;
      return t === 'in_progress';
    });
    if (!inflight.length) {
      if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setTimeout(() => { void fetchStatuses(inflight); }, 4000);
    return () => { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; } };
  }, [records, statuses, fetchStatuses]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return records;
    return records.filter((r) =>
      getUploadRecordDisplayName(r).toLowerCase().includes(kw) ||
      String(r.target_path || '').toLowerCase().includes(kw) ||
      String(r.upload_id || '').toLowerCase().includes(kw));
  }, [records, search]);

  const selected = useMemo(() => records.find((r) => r.upload_id === selectedId) || null, [records, selectedId]);
  const selectedReadiness = selected ? deriveEntryReadiness(statuses[selected.upload_id]) : null;

  const selectRecord = (r: ProjectInputUploadRecord) => {
    setSelectedId(r.upload_id);
    if (!nameTouched) setName(`${getUploadRecordDisplayName(r)} - 数据流审计`);
  };

  const canCreate = Boolean(selected && name.trim() && !creating);

  const submit = async () => {
    if (!selected || !name.trim()) return;
    setCreating(true);
    try {
      const created = await api.cfgPipeline.createPipeline({
        project_id: projectId,
        name: name.trim(),
        input_path: buildManagerTargetDir(projectId, selected.target_path),
        created_by: createdBy,
      });
      await onCreated(created.pipeline_id);
    } catch (e: any) {
      notify(`创建失败：${e?.message || e}`, 'error');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => !creating && onClose()}>
      <div
        className="flex max-h-[88vh] w-[680px] flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between border-b border-theme-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-theme-text-primary">新建挖掘任务</h2>
            <p className="mt-1 text-xs text-theme-text-muted">选择一条已构建知识图谱的代码上传记录作为测试对象</p>
          </div>
          <button onClick={() => !creating && onClose()} className="rounded-lg p-1.5 text-theme-text-faint transition-colors hover:bg-theme-elevated hover:text-theme-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* search */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-faint" />
            <input
              className="w-full rounded-lg border border-theme-border bg-theme-app py-2 pl-9 pr-3 text-sm text-theme-text-primary placeholder:text-theme-text-faint focus:border-indigo-400/60 focus:outline-none"
              placeholder="搜索代码记录名称 / 路径 / upload_id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* record list */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-theme-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载代码上传记录…
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <FileCode className="h-7 w-7 text-theme-text-faint" />
              <div className="text-sm text-theme-text-secondary">{records.length === 0 ? '该项目下还没有「代码」类型的上传记录' : '没有匹配的记录'}</div>
              {records.length === 0 && <div className="text-xs text-theme-text-faint">请先在「测试对象 → 代码」中上传源码并构建知识图谱</div>}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const readiness = deriveEntryReadiness(statuses[r.upload_id]);
                const ts = TIER_STYLE[readiness.tier];
                const active = selectedId === r.upload_id;
                return (
                  <button
                    key={r.upload_id}
                    onClick={() => selectRecord(r)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      active
                        ? 'border-indigo-400/70 bg-indigo-500/10 ring-1 ring-indigo-400/40'
                        : 'border-theme-border bg-theme-app hover:border-theme-border hover:bg-theme-elevated'
                    }`}
                  >
                    <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-theme-elevated text-theme-text-muted'}`}>
                      <FileCode className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-theme-text-primary">{getUploadRecordDisplayName(r)}</span>
                        {active && <Check className="h-3.5 w-3.5 flex-none text-indigo-300" strokeWidth={2.5} />}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-theme-text-faint">
                        <span className="inline-flex items-center gap-1"><FileCode className="h-3 w-3" />{r.stored_file_count} 文件</span>
                        {r.created_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{r.created_at.slice(0, 10)}</span>}
                        <span className="truncate font-mono opacity-70">{r.target_path}</span>
                      </div>
                    </div>
                    {/* attack-entry analysis status */}
                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ts.chip}`}>
                        {ts.icon} {readiness.label}
                      </span>
                      {readiness.entries != null && readiness.entries > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-theme-text-muted">
                          <Database className="h-3 w-3" /> {readiness.entries} 入口
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* footer: name + actions */}
        <div className="border-t border-theme-border bg-theme-app/40 px-6 py-4">
          {selected && selectedReadiness?.tier === 'none' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              该记录尚未构建知识图谱，挖掘可能无法获取入口。建议先在「测试对象」中完成图谱构建。
            </div>
          )}
          {selected && (
            <div className="mb-3">
              <CodemapMetroProgress status={statuses[selected.upload_id] ?? null} />
            </div>
          )}
          <label className="mb-1.5 block text-xs font-medium text-theme-text-muted">任务名称</label>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-theme-border bg-theme-app px-3 py-2 text-sm text-theme-text-primary placeholder:text-theme-text-faint focus:border-indigo-400/60 focus:outline-none disabled:opacity-50"
              placeholder={selected ? '为本次挖掘命名' : '请先在上方选择一条代码记录'}
              value={name}
              disabled={!selected}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
            />
            <button
              onClick={onClose}
              disabled={creating}
              className="rounded-lg border border-theme-border bg-theme-surface px-4 py-2 text-sm font-medium text-theme-text-secondary transition-colors hover:bg-theme-elevated disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!canCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:from-indigo-400 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} 创建并开始
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
