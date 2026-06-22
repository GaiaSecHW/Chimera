/* @refresh reset */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, PlayCircle, Search, ShieldAlert } from 'lucide-react';

import { api } from '../../clients/api';
import type { CfgPipelineDetail, CfgPipelineEntry, CfgPipelineEntriesResponse, CfgPipelineFindings } from '../../clients/cfgPipeline';
import { useUiFeedback } from '../../components/UiFeedback';

const STAGE_LABEL: Record<string, string> = {
  entry_analysis: '入口分析',
  dataflow_vuln_scan: '数据库漏洞挖掘',
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-blue-100 text-blue-700',
  INFO: 'bg-gray-100 text-gray-600',
};

// reason buckets to help the user cut 1000s of candidates down to signal
// "High value" highlights entries more likely to carry attacker-controlled
// input. The manager-based source detector reports channel/subkind
// (NETWORK/IPC/FILE + net.*/ipc.*/file.read) plus a free-text Chinese reason,
// so match those signals; the trailing patterns keep the older rule-based
// reason tags working too.
function isHighValue(e?: { reason?: string | null; channel?: string | null; entry_point_kind?: string | null } | null): boolean {
  if (!e) return false;
  const ch = (e.channel || '').toUpperCase();
  if (ch === 'NETWORK' || ch === 'IPC') return true;
  const kind = (e.entry_point_kind || '').toLowerCase();
  if (/^(net\.|ipc\.|file\.)/.test(kind)) return true;
  const reason = e.reason || '';
  return /syscall_caller|name_match|register_callback|fops_table|parse_caller|extern_c|macro_export|外部|网络|输入|gRPC|socket|recv/i.test(reason);
}

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

  const refresh = useCallback(async () => {
    if (!taskId) return;
    try {
      const d = await appApi.getPipeline(taskId);
      setDetail(d);
      if (d.stages.entry_analysis.status === 'passed') {
        const er = await appApi.getEntries(taskId);
        setEntriesResp(er);
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

  useEffect(() => { refresh(); }, [refresh]);

  // poll while a stage is in flight
  useEffect(() => {
    if (!detail) return;
    const active = detail.status === 'analyzing' || detail.status === 'auditing';
    if (!active) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [detail, refresh]);

  const entryKey = (e: CfgPipelineEntry) => e.source_id || `${e.function_name}@${e.source_file}:${e.line}`;

  const visibleEntries = useMemo(() => {
    const all = entriesResp?.entries || [];
    const f = filter.trim().toLowerCase();
    return all.filter((e) => {
      if (onlyHighValue && !isHighValue(e)) return false;
      if (!f) return true;
      return (e.function_name || '').toLowerCase().includes(f)
        || (e.source_file || '').toLowerCase().includes(f)
        || (e.reason || '').toLowerCase().includes(f);
    });
  }, [entriesResp, filter, onlyHighValue]);

  const toggle = (e: CfgPipelineEntry) => {
    const k = entryKey(e);
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  };
  const toggleAllVisible = () => {
    const next = new Set(selected);
    const allSel = visibleEntries.every((e) => next.has(entryKey(e)));
    visibleEntries.forEach((e) => allSel ? next.delete(entryKey(e)) : next.add(entryKey(e)));
    setSelected(next);
  };

  const fanOut = async () => {
    const chosen = (entriesResp?.entries || []).filter((e) => selected.has(entryKey(e)));
    if (chosen.length === 0) { notify('请先勾选入口', 'error'); return; }
    setFanningOut(true);
    try {
      const r = await appApi.fanOut(taskId, chosen);
      notify(`已创建 ${r.created_count} 个审计子任务`, 'success');
      setSelected(new Set());
      await refresh();
    } catch (e: any) {
      notify(`下发失败：${e?.message || e}`, 'error');
    } finally {
      setFanningOut(false);
    }
  };

  if (loading) return <div className="p-10 flex justify-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!detail) return <div className="p-10 text-gray-500">未找到该任务<button className="ml-2 underline" onClick={onBack}>返回</button></div>;

  const s1 = detail.stages.entry_analysis;
  const s2 = detail.stages.dataflow_vuln_scan;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {feedbackNodes}
      <button onClick={onBack} className="text-sm text-gray-500 flex items-center gap-1 mb-3 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> 返回列表
      </button>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <button onClick={refresh} className="px-3 py-1.5 rounded border text-sm flex items-center gap-1 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* stage stepper */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {detail.stage_sequence.map((stage, i) => (
          <React.Fragment key={stage}>
            <div className="px-3 py-1.5 rounded border bg-white">
              <span className="font-medium">{STAGE_LABEL[stage] || stage}</span>
              {stage === 'entry_analysis' && <span className="ml-2 text-gray-500">{s1.status} · {s1.entry_count} 入口</span>}
              {stage === 'dataflow_vuln_scan' && <span className="ml-2 text-gray-500">{s2.summary.total} 子任务</span>}
            </div>
            {i < detail.stage_sequence.length - 1 && <span className="text-gray-300">→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Stage 1: entry analysis */}
      <section className="mb-8">
        <h2 className="font-semibold mb-2 flex items-center gap-2"><Search className="w-4 h-4" /> 入口分析</h2>
        {s1.status !== 'passed' ? (
          <div className="text-gray-500 flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> 入口分析进行中（{s1.status}）…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2 text-sm">
              <input className="form-input flex-1" placeholder="过滤函数名/文件/reason"
                     value={filter} onChange={(e) => setFilter(e.target.value)} />
              <label className="flex items-center gap-1 whitespace-nowrap">
                <input type="checkbox" checked={onlyHighValue} onChange={(e) => setOnlyHighValue(e.target.checked)} />
                仅高价值入口
              </label>
              <span className="text-gray-500 whitespace-nowrap">
                显示 {visibleEntries.length} / 共 {s1.entry_count}，已选 {selected.size}
              </span>
              <button onClick={fanOut} disabled={fanningOut || selected.size === 0}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white flex items-center gap-1 disabled:opacity-50">
                {fanningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                审计选中入口
              </button>
            </div>
            {s1.warnings?.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2">{s1.warnings.join('；')}</div>
            )}
            <div className="border rounded overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8"><input type="checkbox"
                        checked={visibleEntries.length > 0 && visibleEntries.every((e) => selected.has(entryKey(e)))}
                        onChange={toggleAllVisible} /></th>
                    <th className="text-left px-3 py-2">函数</th>
                    <th className="text-left px-3 py-2">通道/类型</th>
                    <th className="text-left px-3 py-2">文件:行</th>
                    <th className="text-left px-3 py-2">reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((e) => (
                    <tr key={entryKey(e)} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(entryKey(e))} onChange={() => toggle(e)} /></td>
                      <td className="px-3 py-1.5 font-mono">{e.function_name}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {e.channel && <span className="inline-block rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 mr-1">{e.channel}</span>}
                        <span className="text-gray-500">{e.entry_point_kind}</span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 font-mono text-xs">{e.source_file}:{e.line}</td>
                      <td className="px-3 py-1.5 text-xs">
                        <span className={isHighValue(e) ? 'text-emerald-700' : 'text-gray-400'}>{e.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Stage 2: DB vuln mining */}
      <section>
        <h2 className="font-semibold mb-2 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> 数据库漏洞挖掘</h2>
        {s2.summary.total === 0 ? (
          <div className="text-gray-400 py-3">尚未下发审计子任务。请在上方勾选入口后点击「审计选中入口」。</div>
        ) : (
          <>
            <div className="flex gap-2 mb-3 text-sm">
              {(['total', 'running', 'passed', 'failed'] as const).map((k) => (
                <span key={k} className="px-2 py-1 rounded bg-gray-100">{k}: {(s2.summary as any)[k]}</span>
              ))}
              {findings && Object.entries(findings.by_severity).map(([sev, n]) => (
                <span key={sev} className={`px-2 py-1 rounded ${SEV_COLOR[sev] || 'bg-gray-100'}`}>{sev}: {n}</span>
              ))}
            </div>
            <div className="border rounded overflow-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">入口函数</th>
                    <th className="text-left px-3 py-2">状态</th>
                    <th className="text-right px-3 py-2">发现漏洞</th>
                  </tr>
                </thead>
                <tbody>
                  {(findings?.children || s2.children.map((c: any) => ({
                    task_id: c.task_id, function_name: c.parent_stage_item_key || c.task_name, status: c.status, finding_count: 0,
                  }))).map((c: any) => (
                    <tr key={c.task_id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{c.function_name}</td>
                      <td className="px-3 py-1.5">{c.status}</td>
                      <td className="px-3 py-1.5 text-right">{c.finding_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
