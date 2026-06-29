/* @refresh reset */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, PlayCircle, Search, ShieldAlert, Bug,
  Check, Crosshair, ListChecks, Sparkles, AlertTriangle, Layers,
} from 'lucide-react';

import { api } from '../../clients/api';
import type { CfgPipelineDetail, CfgPipelineEntry, CfgPipelineEntriesResponse, CfgPipelineFindings } from '../../clients/cfgPipeline';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

// pipeline 仍在推进的状态(非终态)→ 需要轮询。pending 是刚创建、worker 尚未接手的
// 初态:之前漏掉它导致「新建后入口不自动刷新,要退出重进」。把它纳入即可实时刷新。
const LIVE_STATUSES = new Set(['pending', 'analyzing', 'auditing']);

interface ChildRow { task_id: string; function_name: string; status: string; finding_count: number }

const CHILD_STATUS_TONE: Record<string, string> = {
  running: 'border-sky-400/40 bg-sky-500/12 text-sky-200',
  pending: 'border-sky-400/40 bg-sky-500/12 text-sky-200',
  passed: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200',
  failed: 'border-amber-400/40 bg-amber-500/12 text-amber-200',
  error: 'border-amber-400/40 bg-amber-500/12 text-amber-200',
  cancelled: 'border-theme-border bg-theme-surface text-theme-text-muted',
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'border-red-400/40 bg-red-500/15 text-red-200',
  HIGH: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
  MEDIUM: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  LOW: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
  INFO: 'border-theme-border bg-theme-surface text-theme-text-muted',
};

// 攻击面(channel)就是入口的来源通道。空值归一成「未分类」。
const UNCLASSIFIED = '未分类';
const surfaceOf = (e: CfgPipelineEntry): string => String(e.channel || '').trim().toUpperCase() || UNCLASSIFIED;

// reason buckets to help the user cut 1000s of candidates down to signal.
// "High value" highlights entries more likely to carry attacker-controlled input.
function isHighValue(e?: { reason?: string | null; channel?: string | null; entry_point_kind?: string | null } | null): boolean {
  if (!e) return false;
  const ch = (e.channel || '').toUpperCase();
  if (ch === 'NETWORK' || ch === 'IPC') return true;
  const kind = (e.entry_point_kind || '').toLowerCase();
  if (/^(net\.|ipc\.|file\.)/.test(kind)) return true;
  const reason = e.reason || '';
  return /syscall_caller|name_match|register_callback|fops_table|parse_caller|extern_c|macro_export|外部|网络|输入|gRPC|socket|recv/i.test(reason);
}

// 阶段进度小药丸:用于顶部 stepper。
type StepState = 'pending' | 'active' | 'done' | 'failed';
const STEP_DOT: Record<StepState, string> = {
  pending: 'border-theme-border bg-theme-surface text-theme-text-faint',
  active: 'border-sky-400/60 bg-sky-500/15 text-sky-300 ring-2 ring-sky-400/20',
  done: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300',
  failed: 'border-rose-400/60 bg-rose-500/15 text-rose-300',
};

type TabKey = 'entries' | 'vuln';

export const CfgDbVulnDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.cfgPipeline;
  const { notify, feedbackNodes } = useUiFeedback();

  const [detail, setDetail] = useState<CfgPipelineDetail | null>(null);
  const [entriesResp, setEntriesResp] = useState<CfgPipelineEntriesResponse | null>(null);
  const [findings, setFindings] = useState<CfgPipelineFindings | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fanningOut, setFanningOut] = useState(false);
  const [filter, setFilter] = useState('');
  const [onlyHighValue, setOnlyHighValue] = useState(false);
  const [activeSurface, setActiveSurface] = useState<string>('ALL');
  const [tab, setTab] = useState<TabKey>('entries');

  const openChild = useCallback((childTaskId: string) => {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: { view: 'cfg-guided-explore-detail', cfgGuidedExploreTaskId: childTaskId },
    }));
  }, []);

  const refresh = useCallback(async () => {
    if (!taskId) return;
    try {
      const d = await appApi.getPipeline(taskId);
      setDetail(d);
      const s1 = d.stages.entry_analysis;
      if (s1.status === 'passed' || d.status === 'entries_ready' || s1.entry_count > 0) {
        try { setEntriesResp(await appApi.getEntries(taskId)); } catch { /* 入口尚未落盘,下次轮询再取 */ }
      }
      if (d.stages.dataflow_vuln_scan.summary.total > 0) {
        setFindings(await appApi.getFindings(taskId));
      }
    } catch (e: any) {
      notify(`加载失败：${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [appApi, taskId, notify]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // 轮询:只要 pipeline 还在推进(pending/analyzing/auditing)就每 4s 刷新。
  // 关键修复:之前只在 analyzing/auditing 轮询,漏了 pending(刚创建时的初态),
  // 导致入口分析完成也不自动刷新,必须退出重进。
  useEffect(() => {
    if (!detail) return;
    if (!LIVE_STATUSES.has(detail.status)) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [detail, refresh]);

  const entryKey = (e: CfgPipelineEntry) => e.source_id || `${e.function_name}@${e.source_file}:${e.line}`;

  const allEntries = entriesResp?.entries || [];

  // 攻击面分组:统计每个通道的入口数,用于「按攻击面批量选择」。
  const surfaces = useMemo(() => {
    const m = new Map<string, number>();
    allEntries.forEach((e) => m.set(surfaceOf(e), (m.get(surfaceOf(e)) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [allEntries]);

  const visibleEntries = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (activeSurface !== 'ALL' && surfaceOf(e) !== activeSurface) return false;
      if (onlyHighValue && !isHighValue(e)) return false;
      if (!f) return true;
      return (e.function_name || '').toLowerCase().includes(f)
        || (e.source_file || '').toLowerCase().includes(f)
        || (e.reason || '').toLowerCase().includes(f);
    });
  }, [allEntries, filter, onlyHighValue, activeSurface]);

  const toggle = (e: CfgPipelineEntry) => {
    const k = entryKey(e);
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  };
  const toggleAllVisible = () => {
    const next = new Set(selected);
    const allSel = visibleEntries.length > 0 && visibleEntries.every((e) => next.has(entryKey(e)));
    visibleEntries.forEach((e) => allSel ? next.delete(entryKey(e)) : next.add(entryKey(e)));
    setSelected(next);
  };

  // 按攻击面批量选择:勾选该通道下全部入口(若已全选则全部取消)。
  const selectSurface = (surface: string) => {
    const group = allEntries.filter((e) => surfaceOf(e) === surface);
    const allSel = group.length > 0 && group.every((e) => selected.has(entryKey(e)));
    const next = new Set(selected);
    group.forEach((e) => allSel ? next.delete(entryKey(e)) : next.add(entryKey(e)));
    setSelected(next);
  };
  const surfaceSelectedCount = (surface: string) =>
    allEntries.filter((e) => surfaceOf(e) === surface && selected.has(entryKey(e))).length;

  const fanOut = async () => {
    const chosen = allEntries.filter((e) => selected.has(entryKey(e)));
    if (chosen.length === 0) { notify('请先勾选入口', 'error'); return; }
    setFanningOut(true);
    try {
      const r = await appApi.fanOut(taskId, chosen);
      notify(`已创建 ${r.created_count} 个审计子任务`, 'success');
      setSelected(new Set());
      await refresh();
      setTab('vuln');
    } catch (e: any) {
      notify(`下发失败：${e?.message || e}`, 'error');
    } finally {
      setFanningOut(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24 text-theme-text-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!detail) {
    return (
      <div className="px-6 py-24 text-center text-theme-text-muted">
        未找到该任务
        <button className="ml-2 text-indigo-400 underline hover:text-indigo-300" onClick={onBack}>返回</button>
      </div>
    );
  }

  const s1 = detail.stages.entry_analysis;
  const s2 = detail.stages.dataflow_vuln_scan;
  const entryReady = s1.status === 'passed' || detail.status === 'entries_ready' || s1.entry_count > 0;
  const entryFailed = s1.status === 'failed' || s1.status === 'error';

  const step1: StepState = entryReady ? 'done' : entryFailed ? 'failed' : 'active';
  const step2: StepState = s2.summary.total === 0
    ? (entryReady ? 'active' : 'pending')
    : (detail.status === 'auditing' ? 'active'
      : detail.status === 'completed' ? 'done'
      : detail.status === 'completed_with_errors' ? 'failed' : 'done');

  const childRows: ChildRow[] = (findings?.children && findings.children.length > 0)
    ? findings.children
    : (s2.children || []).map((c: any) => ({
        task_id: c.task_id,
        function_name: c.parent_stage_item_key || c.task_name || c.function_name || c.task_id,
        status: c.status,
        finding_count: 0,
      }));

  const steps: { key: string; label: string; state: StepState; meta: string }[] = [
    { key: 'entry_analysis', label: '入口分析', state: step1, meta: entryReady ? `${s1.entry_count} 入口` : entryFailed ? '失败' : '分析中…' },
    { key: 'dataflow_vuln_scan', label: '漏洞挖掘', state: step2, meta: s2.summary.total > 0 ? `${s2.summary.total} 子任务` : '待下发' },
  ];

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'entries', label: '攻击入口', icon: <Crosshair className="h-4 w-4" />, badge: entryReady ? s1.entry_count : undefined },
    { key: 'vuln', label: '漏洞挖掘', icon: <ShieldAlert className="h-4 w-4" />, badge: s2.summary.total || undefined },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {feedbackNodes}

      <PageHeader
        back={{ label: '返回列表', onClick: onBack }}
        title={detail.name}
        description="入口分析 → 勾选攻击入口 → 漏洞挖掘"
        actions={
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary transition-colors hover:bg-theme-elevated"
          >
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
        }
      />

      {/* stage stepper */}
      <div className="mt-5 flex items-center gap-3">
        {steps.map((st, i) => (
          <React.Fragment key={st.key}>
            <div className="flex items-center gap-2.5 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5">
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-semibold ${STEP_DOT[st.state]}`}>
                {st.state === 'done' ? <Check size={13} strokeWidth={2.5} />
                  : st.state === 'active' ? <Loader2 size={13} className="animate-spin" />
                  : st.state === 'failed' ? <AlertTriangle size={12} /> : i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-theme-text-primary">{st.label}</div>
                <div className="text-xs text-theme-text-muted">{st.meta}</div>
              </div>
            </div>
            {i < steps.length - 1 && <div className={`h-px w-8 ${st.state === 'done' ? 'bg-emerald-400/50' : 'bg-theme-border'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* tab bar */}
      <div className="mt-6 flex items-center gap-1 border-b border-theme-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative -mb-px inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-b-2 border-indigo-400 text-theme-text-primary'
                : 'border-b-2 border-transparent text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tab === t.key ? 'bg-indigo-500/20 text-indigo-200' : 'bg-theme-elevated text-theme-text-muted'}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ───────────────── Tab 1: 攻击入口 ───────────────── */}
      {tab === 'entries' && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          {!entryReady ? (
            entryFailed ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 text-rose-300"><AlertTriangle className="h-5 w-5" /></div>
                <div className="text-sm font-medium text-theme-text-secondary">入口分析失败</div>
                {s1.warnings?.length > 0 && <div className="max-w-md text-xs text-theme-text-faint">{s1.warnings.join('；')}</div>}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/15 text-sky-300"><Loader2 className="h-5 w-5 animate-spin" /></div>
                <div className="text-sm font-medium text-theme-text-secondary">正在分析攻击入口…</div>
                <div className="text-xs text-theme-text-faint">页面会自动刷新，分析完成后入口将出现在这里</div>
              </div>
            )
          ) : (
            <div className="p-5">
              {/* attack-surface batch selectors */}
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-theme-text-muted">
                  <Layers className="h-3.5 w-3.5" /> 按攻击面批量选择
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveSurface('ALL')}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeSurface === 'ALL'
                        ? 'border-indigo-400/60 bg-indigo-500/12 text-indigo-200'
                        : 'border-theme-border bg-theme-app text-theme-text-secondary hover:bg-theme-elevated'
                    }`}
                  >
                    全部 <span className="tabular-nums opacity-70">{allEntries.length}</span>
                  </button>
                  {surfaces.map(([surface, count]) => {
                    const selCount = surfaceSelectedCount(surface);
                    const filtering = activeSurface === surface;
                    return (
                      <div
                        key={surface}
                        className={`inline-flex items-center overflow-hidden rounded-lg border ${
                          filtering ? 'border-indigo-400/60' : 'border-theme-border'
                        }`}
                      >
                        {/* 点标签 = 仅筛选该攻击面 */}
                        <button
                          onClick={() => setActiveSurface(filtering ? 'ALL' : surface)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                            filtering ? 'bg-indigo-500/12 text-indigo-200' : 'bg-theme-app text-theme-text-secondary hover:bg-theme-elevated'
                          }`}
                        >
                          {surface}
                          <span className="tabular-nums opacity-70">{count}</span>
                          {selCount > 0 && <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-300">{selCount}</span>}
                        </button>
                        {/* 勾选按钮 = 批量选/反选该攻击面全部入口 */}
                        <button
                          onClick={() => selectSurface(surface)}
                          title="选中 / 取消该攻击面全部入口"
                          className="border-l border-theme-border bg-theme-surface px-2 py-1.5 text-theme-text-muted transition-colors hover:bg-theme-elevated hover:text-emerald-300"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* toolbar */}
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-faint" />
                  <input
                    className="w-full rounded-lg border border-theme-border bg-theme-app py-2 pl-9 pr-3 text-sm text-theme-text-primary placeholder:text-theme-text-faint focus:border-indigo-400/60 focus:outline-none"
                    placeholder="过滤函数名 / 文件 / reason"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => setOnlyHighValue((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    onlyHighValue
                      ? 'border-emerald-400/50 bg-emerald-500/12 text-emerald-300'
                      : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> 仅高价值入口
                </button>
                <span className="text-xs text-theme-text-muted">
                  显示 <span className="tabular-nums text-theme-text-secondary">{visibleEntries.length}</span> / 共 <span className="tabular-nums text-theme-text-secondary">{s1.entry_count}</span> · 已选 <span className="tabular-nums text-indigo-300">{selected.size}</span>
                </span>
                <button
                  onClick={fanOut}
                  disabled={fanningOut || selected.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:from-indigo-400 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {fanningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  审计选中入口
                </button>
              </div>
              {s1.warnings?.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                  {s1.warnings.join('；')}
                </div>
              )}

              {/* entry table */}
              <div className="overflow-auto rounded-xl border border-theme-border" style={{ maxHeight: 520 }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-theme-elevated text-xs uppercase tracking-wide text-theme-text-faint">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="accent-indigo-500"
                          checked={visibleEntries.length > 0 && visibleEntries.every((e) => selected.has(entryKey(e)))}
                          onChange={toggleAllVisible}
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">函数</th>
                      <th className="px-3 py-2.5 text-left font-medium">攻击面 / 类型</th>
                      <th className="px-3 py-2.5 text-left font-medium">文件:行</th>
                      <th className="px-3 py-2.5 text-left font-medium">理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-theme-text-faint">没有匹配的入口</td></tr>
                    ) : visibleEntries.map((e) => {
                      const sel = selected.has(entryKey(e));
                      const hv = isHighValue(e);
                      return (
                        <tr
                          key={entryKey(e)}
                          onClick={() => toggle(e)}
                          className={`cursor-pointer border-t border-theme-border-subtle align-top transition-colors ${sel ? 'bg-indigo-500/10' : 'hover:bg-theme-elevated'}`}
                        >
                          <td className="px-3 py-2.5"><input type="checkbox" className="accent-indigo-500" checked={sel} readOnly /></td>
                          <td className="px-3 py-2.5 font-mono text-theme-text-primary">
                            <span className="inline-flex items-center gap-1.5">
                              {hv && <span className="h-1.5 w-1.5 flex-none rounded-full bg-emerald-400" title="高价值入口" />}
                              {e.function_name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="inline-block rounded-md border border-indigo-400/30 bg-indigo-500/12 px-1.5 py-0.5 font-medium text-indigo-200">{surfaceOf(e)}</span>
                            {e.entry_point_kind && <span className="ml-1.5 text-theme-text-muted">{e.entry_point_kind}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-theme-text-muted">{e.source_file}:{e.line}</td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className={`block max-w-[360px] leading-relaxed ${hv ? 'text-emerald-200' : 'text-theme-text-secondary'}`}>
                              {e.reason || <span className="text-theme-text-faint">—</span>}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ───────────────── Tab 2: 漏洞挖掘 ───────────────── */}
      {tab === 'vuln' && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
          {s2.summary.total === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-theme-elevated text-theme-text-faint"><ListChecks className="h-5 w-5" /></div>
              <div className="text-sm text-theme-text-secondary">尚未下发审计子任务</div>
              <div className="text-xs text-theme-text-faint">在「攻击入口」页勾选入口后点击「审计选中入口」</div>
              <button onClick={() => setTab('entries')} className="mt-1 text-xs font-medium text-indigo-300 hover:text-indigo-200">前往攻击入口 →</button>
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {(['total', 'running', 'passed', 'failed'] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-app px-2.5 py-1 text-theme-text-secondary">
                    <span className="text-theme-text-faint">{k}</span>
                    <span className="tabular-nums font-semibold text-theme-text-primary">{(s2.summary as any)[k]}</span>
                  </span>
                ))}
                {findings && Object.entries(findings.by_severity).map(([sev, n]) => (
                  <span key={sev} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium ${SEV_COLOR[sev] || 'border-theme-border bg-theme-app text-theme-text-muted'}`}>
                    {sev} <span className="tabular-nums font-semibold">{n}</span>
                  </span>
                ))}
              </div>

              <div className="overflow-auto rounded-xl border border-theme-border" style={{ maxHeight: 520 }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-theme-elevated text-xs uppercase tracking-wide text-theme-text-faint">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">入口函数</th>
                      <th className="px-3 py-2.5 text-left font-medium">状态</th>
                      <th className="px-3 py-2.5 text-right font-medium">发现漏洞</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childRows.map((c) => (
                      <tr key={c.task_id} className="cursor-pointer border-t border-theme-border-subtle transition-colors hover:bg-theme-elevated" onClick={() => openChild(c.task_id)}>
                        <td className="px-3 py-2.5 font-mono text-indigo-300">{c.function_name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CHILD_STATUS_TONE[c.status] || 'border-theme-border bg-theme-surface text-theme-text-muted'}`}>{c.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {c.finding_count > 0
                            ? <span className="inline-flex items-center gap-1 font-semibold text-rose-300"><Bug className="h-3.5 w-3.5" />{c.finding_count}</span>
                            : <span className="text-theme-text-faint">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
