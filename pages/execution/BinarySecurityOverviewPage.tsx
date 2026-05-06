import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Play, RefreshCw, ShieldAlert } from 'lucide-react';

import { BinarySecurityTask } from '../../clients/binarySecurity';
import { api } from '../../clients/api';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled']);
const STAGES = ['firmware_unpack', 'system_analysis', 'binary_to_source', 'entry_analysis', 'dataflow_analysis', 'vuln_scan'];

const statusTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial_success':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const formatStageLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    firmware_unpack: '固件解包',
    system_analysis: '系统分析',
    binary_to_source: '二进制反编译',
    entry_analysis: '入口分析',
    dataflow_analysis: '数据流分析',
    vuln_scan: '漏洞扫描',
  };
  return map[value || ''] || (value || '-');
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');

export const BinarySecurityOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const [items, setItems] = useState<BinarySecurityTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [firmwarePath, setFirmwarePath] = useState('');
  const [maxParallel, setMaxParallel] = useState(4);
  const [maxRetries, setMaxRetries] = useState(2);
  const [continueOnFailure, setContinueOnFailure] = useState(true);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executionApi.binarySecurity.listTasks(projectId);
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const hasActive = useMemo(() => items.some((item) => !TERMINAL.has(item.status)), [items]);
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [hasActive, projectId]);

  const submitTask = async () => {
    if (!projectId) return;
    setCreateError(null);
    if (!name.trim()) {
      setCreateError('请输入任务名称');
      return;
    }
    if (!firmwarePath.trim()) {
      setCreateError('请输入固件路径');
      return;
    }
    setSubmitting(true);
    try {
      const prepared = await executionApi.binarySecurity.prepareTask(projectId);
      await executionApi.binarySecurity.createTask(projectId, {
        task_id: prepared.task_id,
        name: name.trim(),
        description: description.trim() || undefined,
        firmware_input: {
          source: 'project_filesystem',
          path: firmwarePath.trim(),
        },
        policy_overrides: {
          max_stage_parallelism: maxParallel,
          max_retries_per_item: maxRetries,
          continue_on_item_failure: continueOnFailure,
        },
      });
      setName('');
      setDescription('');
      setFirmwarePath('');
      await load();
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">二进制安全</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              为当前项目统一编排固件解包、系统分析、反编译、入口分析、数据流分析和漏洞扫描，聚合查看各阶段状态与结果。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-600" />
          <h2 className="text-xl font-black text-slate-900">创建统一任务</h2>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <input value={firmwarePath} onChange={(e) => setFirmwarePath(e.target.value)} placeholder="固件项目路径，例如 /uploads/fw.bin" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="任务描述（可选）" className="rounded-xl border border-slate-200 px-4 py-3 text-sm xl:col-span-2" />
          <input type="number" min={1} max={16} value={maxParallel} onChange={(e) => setMaxParallel(Number(e.target.value || 1))} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <input type="number" min={0} max={10} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value || 0))} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={continueOnFailure} onChange={(e) => setContinueOnFailure(e.target.checked)} />
          子任务失败时继续推进其他子任务
        </label>
        {createError && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{createError}</div>}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => void submitTask()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            <Play size={16} />
            {submitting ? '提交中...' : '创建任务'}
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-black text-slate-900">任务列表</h2>
          <div className="text-sm text-slate-500">共 {items.length} 条</div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {loading && items.length === 0 ? (
          <div className="mt-6 text-sm text-slate-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">当前项目还没有二进制安全任务。</div>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenTask(item.id)}
                className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-500">{item.firmware_path}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 xl:grid-cols-5">
                      <div>当前阶段：<span className="font-bold text-slate-900">{formatStageLabel(item.current_stage)}</span></div>
                      <div>高危模块：<span className="font-bold text-slate-900">{item.high_risk_module_count}</span></div>
                      <div>入口数：<span className="font-bold text-slate-900">{item.entry_count}</span></div>
                      <div>漏洞结果：<span className="font-bold text-slate-900">{item.vuln_result_count}</span></div>
                      <div>开始时间：<span className="font-bold text-slate-900">{fmt(item.started_at)}</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {STAGES.map((stage) => {
                        const summary = item.stage_summaries.find((current) => current.stage_name === stage);
                        return (
                          <span key={stage} className={`rounded-xl px-3 py-1 text-xs font-bold ${summary ? statusTone(summary.status) : 'bg-slate-100 text-slate-400'}`}>
                            {formatStageLabel(stage)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    查看详情
                    <ChevronRight size={18} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
