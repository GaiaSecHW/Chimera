import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoCompileTask, SecOctoPagerState } from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import { Breadcrumb } from './shared/Breadcrumb';

interface Props {
  /** 返回上一级 — 通常是 SecOctoMemoriesPage('记忆进化'),由 viewRegistry 注入 */
  onBack: () => void;
}

/**
 * 时间格式 YYYY-MM-DD HH:mm:ss(到秒)— 编译任务对时间敏感,与 secocto-ui _fmtTime 等价。
 * 与 shared/format 的 fmtTimeCompact(MM-DD HH:mm,到分钟)不通用,此处保留更精确的本地版本。
 */
const fmtTime = (at: string | null | undefined): string => {
  if (at == null || at === '') return '—';
  const ms = typeof at === 'number' ? (at < 1e12 ? at * 1000 : at) : Date.parse(at);
  if (!ms || isNaN(ms)) return String(at);
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

const fmtNum = (n: number | null | undefined): string => {
  if (n == null) return '—';
  return String(n);
};

const MODE_LABEL: Record<string, string> = { run: 'run · 执行', 'dry-run': 'dry-run · 演练' };
const STATUS_LABEL: Record<string, string> = {
  succeeded: '已完成', failed: '失败', timeout: '超时',
  running: '运行中', pending: '排队中',
};

const COMPILE_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const AUTO_REFRESH_MS = 3000;

type KickMode = 'run' | 'dry-run';
type KickingState = KickMode | null;

export const SecOctoCompilePage: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<SecOctoCompileTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });
  // null = 都没在提交;'run' / 'dry-run' = 对应按钮在提交中
  const [kicking, setKicking] = useState<KickingState>(null);

  // 自增 seq,丢弃过时响应(用户快速翻页/触发新任务时常见)
  const fetchSeqRef = useRef(0);

  // 顶部 toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const offset = (pager.page - 1) * pager.size;
      const resp = await secoctoClients.memories.curateList({ limit: pager.size, offset });
      if (seq !== fetchSeqRef.current) return;
      setItems(resp.items);
      setTotal(resp.total);
      // offset 超过 total 时拉回最后一页(避免 secocto-ui 同样语义"页面截断")
      const maxPage = Math.max(1, Math.ceil(resp.total / pager.size));
      if (pager.page > maxPage) {
        setPager((prev) => ({ ...prev, page: maxPage }));
      }
    } catch (e: any) {
      if (seq !== fetchSeqRef.current) return;
      setError(e?.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [pager.page, pager.size]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 有 pending / running 任务时自动 3 秒轮询(与 secocto-ui _maybeScheduleAutoRefresh 等价)
  const hasInflight = useMemo(
    () => items.some((j) => j.status === 'pending' || j.status === 'running'),
    [items],
  );
  useEffect(() => {
    if (!hasInflight) return;
    const tid = window.setTimeout(() => void loadData(), AUTO_REFRESH_MS);
    return () => window.clearTimeout(tid);
  }, [hasInflight, loadData]);

  // 触发编译 — 与 secocto-ui _kickAndRefresh 等价:发起后跳回第 1 页 + toast
  const handleKick = useCallback(async (mode: KickMode) => {
    if (kicking) return;
    setKicking(mode);
    const label = mode === 'dry-run' ? '编译(演练)' : '编译(执行)';
    try {
      const fn = mode === 'dry-run' ? secoctoClients.memories.curateDryRun : secoctoClients.memories.curateRun;
      await fn();
      showToast(`已发起:${label}`);
      setPager((prev) => ({ ...prev, page: 1 }));
      await loadData();
    } catch (e: any) {
      console.warn('[compile] POST', mode, 'failed:', e);
      showToast(`发起失败:${e?.message || String(e)}`);
    } finally {
      setKicking(null);
    }
  }, [kicking, loadData, showToast]);

  return (
    <div className="px-6 lg:px-8 pt-5 pb-12 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
      <Breadcrumb
        items={[
          { label: '记忆进化', onClick: onBack },
          { label: '编译任务' },
        ]}
      />

      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-theme-border bg-theme-bg-elevated/40 flex-wrap">
          <span className="text-sm font-semibold text-theme-text-primary">
            编译任务 · 共 {total} 条
            {hasInflight && (
              <span className="ml-2 text-[10px] font-normal text-blue-700 bg-blue-500/15 px-1.5 py-0.5 rounded-full">自动刷新中</span>
            )}
          </span>
          <div className="flex gap-2">
            <button
              disabled={kicking !== null}
              onClick={() => handleKick('dry-run')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🧪 {kicking === 'dry-run' ? '提交中…' : '编译(演练)'}
            </button>
            <button
              disabled={kicking !== null}
              onClick={() => handleKick('run')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-primary text-theme-text-inverse hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              🚀 {kicking === 'run' ? '提交中…' : '编译(执行)'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-theme-bg-elevated/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[7%] whitespace-nowrap">任务 ID</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[11%] whitespace-nowrap">编译模式</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-theme-text-faint w-[13%] whitespace-nowrap">原始记忆(编译前)</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-theme-text-faint w-[13%] whitespace-nowrap">原始记忆(编译后)</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[8%] whitespace-nowrap">退出码</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[11%] whitespace-nowrap">状态</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint whitespace-nowrap">最后编译时间</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint whitespace-nowrap">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-theme-text-secondary text-sm">加载中…</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-red-700 text-sm">加载失败:{error}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-theme-text-faint text-sm">暂无编译任务</td></tr>
              ) : items.map((j) => <CompileRow key={j.id} job={j} />)}
            </tbody>
          </table>
        </div>
      </div>

      <SecOctoPager
        total={total}
        state={pager}
        onChange={(p) => setPager((prev) => ({ ...prev, page: p }))}
        onSizeChange={(s) => setPager({ page: 1, size: s })}
        sizeOptions={COMPILE_PAGE_SIZE_OPTIONS}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm shadow-lg animate-in fade-in duration-200">
          {toast}
        </div>
      )}
    </div>
  );
};

/* ===================== Compile 行 ===================== */

const CompileRow: React.FC<{ job: SecOctoCompileTask }> = ({ job }) => {
  // 与 secocto-ui cp-mode-* / cp-st-* class 等价 — 但用 Chimera theme tokens
  const modeCls = job.mode === 'run'
    ? 'bg-indigo-500/12 text-indigo-700'
    : 'bg-amber-500/15 text-amber-700';
  const statusCls = job.status === 'succeeded' ? 'bg-emerald-500/15 text-emerald-700'
    : (job.status === 'failed' || job.status === 'timeout') ? 'bg-red-500/15 text-red-700'
    : job.status === 'running' ? 'bg-blue-500/15 text-blue-700 animate-pulse'
    : 'bg-theme-bg-elevated text-theme-text-secondary';
  const exitCls = job.exit_code === 0 ? 'text-emerald-700 font-semibold'
    : job.exit_code != null ? 'text-red-700 font-semibold'
    : 'text-theme-text-faint';

  return (
    <tr className="border-t border-theme-border hover:bg-theme-bg-elevated/30 transition-colors">
      <td className="px-3 py-2 font-mono text-xs text-theme-text-primary">#{job.id}</td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${modeCls}`}>
          {MODE_LABEL[job.mode] || job.mode}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-right text-theme-text-secondary">{fmtNum(job.before_raw_pending)}</td>
      <td className="px-3 py-2 font-mono text-xs text-right text-theme-text-secondary">{fmtNum(job.after_raw_pending)}</td>
      <td className="px-3 py-2 font-mono text-xs">
        <span className={exitCls}>{job.exit_code != null ? job.exit_code : '—'}</span>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${statusCls}`}>
          {STATUS_LABEL[job.status] || job.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-theme-text-secondary whitespace-nowrap">{fmtTime(job.last_compile)}</td>
      <td className="px-3 py-2 text-xs text-theme-text-secondary whitespace-nowrap">{fmtTime(job.created_at)}</td>
    </tr>
  );
};
