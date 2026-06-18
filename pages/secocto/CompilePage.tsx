import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoCompileTask, SecOctoPagerState } from '../../types/secocto';
import { SecOctoPager, PAGE_SIZE_OPTIONS } from './shared/Pager';

interface Props {
  onBack: () => void;
}

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

export const SecOctoCompilePage: React.FC<Props> = ({ onBack }) => {
  const [items, setItems] = useState<SecOctoCompileTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });
  const [submitting, setSubmitting] = useState(false);

  const fetchSeq = useMemo(() => ({ current: 0 }), []);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const offset = (pager.page - 1) * pager.size;
      const resp = await secoctoClients.memories.curateList({ limit: pager.size, offset });
      if (seq !== fetchSeq.current) return;
      setItems(resp.items);
      setTotal(resp.total);
      const maxPage = Math.max(1, Math.ceil(resp.total / pager.size));
      if (pager.page > maxPage) {
        setPager((prev) => ({ ...prev, page: maxPage }));
      }
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setError(e?.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [pager.page, pager.size]);

  useEffect(() => { void loadData(); }, [loadData]);

  const hasInflight = useMemo(
    () => items.some((j) => j.status === 'pending' || j.status === 'running'),
    [items],
  );

  useEffect(() => {
    if (!hasInflight) return;
    const timer = window.setTimeout(() => void loadData(), 3000);
    return () => window.clearTimeout(timer);
  }, [hasInflight, loadData]);

  const handleKick = useCallback(async (mode: 'run' | 'dry-run') => {
    setSubmitting(true);
    try {
      const fn = mode === 'dry-run' ? secoctoClients.memories.curateDryRun : secoctoClients.memories.curateRun;
      await fn();
      setPager((prev) => ({ ...prev, page: 1 }));
      await loadData();
    } catch (e: any) {
      console.warn('[compile] POST', mode, 'failed:', e);
    } finally {
      setSubmitting(false);
    }
  }, [loadData]);

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <nav className="flex items-center gap-2 text-sm text-theme-text-secondary mb-4">
        <button onClick={onBack} className="hover:text-brand-primary transition-colors">记忆进化</button>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="m9 18 6-6-6-6" /></svg>
        <span className="text-theme-text-primary font-medium">编译任务</span>
      </nav>

      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-theme-border bg-theme-elevated/5">
          <span className="text-sm font-semibold text-theme-text-primary">编译任务 · 共 {total} 条</span>
          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={() => handleKick('dry-run')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border bg-theme-surface hover:bg-theme-elevated transition-colors disabled:opacity-50"
            >🧪 编译（演练）</button>
            <button
              disabled={submitting}
              onClick={() => handleKick('run')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border bg-theme-surface hover:bg-theme-elevated transition-colors disabled:opacity-50"
            >🚀 编译（执行）</button>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead className="bg-theme-elevated/5">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[7%]">任务 ID</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[11%]">编译模式</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-theme-text-faint w-[13%]">原始记忆（编译前）</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-theme-text-faint w-[13%]">原始记忆（编译后）</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[8%]">退出码</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint w-[11%]">状态</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint">最后编译时间</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-theme-text-faint">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-theme-text-secondary">加载中…</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-theme-text-secondary">加载失败：{error}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-theme-text-secondary">暂无编译任务</td></tr>
            ) : items.map((j) => {
              const modeCls = j.mode === 'run'
                ? 'bg-indigo-500/12 text-indigo-700'
                : 'bg-amber-500/15 text-amber-700';
              const statusCls = j.status === 'succeeded' ? 'bg-emerald-500/15 text-emerald-700'
                : (j.status === 'failed' || j.status === 'timeout') ? 'bg-red-500/15 text-red-700'
                : j.status === 'running' ? 'bg-blue-500/15 text-blue-700 animate-pulse'
                : 'bg-gray-500/15 text-gray-600';
              const exitCls = j.exit_code === 0 ? 'text-emerald-600 font-semibold' : j.exit_code != null ? 'text-red-600 font-semibold' : '';
              return (
                <tr key={j.id} className="border-b border-theme-border last:border-b-0 hover:bg-brand-soft/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">#<span className="font-semibold">{j.id}</span></td>
                  <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${modeCls}`}>{MODE_LABEL[j.mode] || j.mode}</span></td>
                  <td className="px-3 py-2 font-mono text-xs text-right">{fmtNum(j.before_raw_pending)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right">{fmtNum(j.after_raw_pending)}</td>
                  <td className="px-3 py-2 font-mono text-xs"><span className={exitCls}>{j.exit_code != null ? j.exit_code : '—'}</span></td>
                  <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{STATUS_LABEL[j.status] || j.status}</span></td>
                  <td className="px-3 py-2 text-xs text-theme-text-secondary">{fmtTime(j.last_compile)}</td>
                  <td className="px-3 py-2 text-xs text-theme-text-secondary">{fmtTime(j.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SecOctoPager total={total} state={pager} onChange={(p) => setPager((prev) => ({ ...prev, page: p }))} onSizeChange={(s) => setPager({ page: 1, size: s })} sizeOptions={[5, 10, 20, 50]} />
    </div>
  );
};
