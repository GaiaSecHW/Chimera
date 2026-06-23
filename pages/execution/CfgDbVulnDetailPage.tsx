/* @refresh reset */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, Controls, Edge, Handle, MarkerType, Node, NodeProps, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Loader2, RefreshCw, PlayCircle, Search, ShieldAlert, Network, Table2, Bug, ShieldCheck } from 'lucide-react';

import { api } from '../../clients/api';
import type { CfgPipelineDetail, CfgPipelineEntry, CfgPipelineEntriesResponse, CfgPipelineFindings } from '../../clients/cfgPipeline';
import { useUiFeedback } from '../../components/UiFeedback';

const STAGE_LABEL: Record<string, string> = {
  entry_analysis: '入口分析',
  dataflow_vuln_scan: '数据库漏洞挖掘',
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

// ── Dispatch tree (xyflow): pipeline root → fan-out child audit tasks ────────
interface ChildRow { task_id: string; function_name: string; status: string; finding_count: number }

function childTone(c: ChildRow): { node: string; badge: string } {
  if (c.finding_count > 0) return { node: 'border-rose-300 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-700' };
  if (c.status === 'running' || c.status === 'pending') return { node: 'border-blue-300 bg-blue-50 text-blue-800', badge: 'bg-blue-100 text-blue-700' };
  if (c.status === 'failed' || c.status === 'error' || c.status === 'cancelled') return { node: 'border-amber-300 bg-amber-50 text-amber-800', badge: 'bg-amber-100 text-amber-700' };
  if (c.status === 'passed') return { node: 'border-emerald-300 bg-emerald-50 text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' };
  return { node: 'border-slate-300 bg-white text-slate-700', badge: 'bg-slate-100 text-slate-600' };
}

interface RootNodeData extends Record<string, unknown> { label: string; total: number; passed: number }
function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-white shadow-md">
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border !border-slate-600 !bg-slate-400" />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="mt-0.5 text-[11px] text-slate-300">{data.passed}/{data.total} 子任务完成</div>
    </div>
  );
}

interface ChildNodeData extends Record<string, unknown> { row: ChildRow }
function ChildNode({ data }: NodeProps<Node<ChildNodeData>>) {
  const c = data.row;
  const tone = childTone(c);
  return (
    <div className={`min-w-[180px] rounded-lg border px-3 py-2 shadow-sm ${tone.node}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-slate-300 !bg-slate-400" />
      <div className="truncate text-xs font-semibold" style={{ fontFamily: MONO }}>{c.function_name}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone.badge}`}>{c.status}</span>
        {c.finding_count > 0
          ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700"><Bug size={10} />{c.finding_count}</span>
          : c.status === 'passed' ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600"><ShieldCheck size={10} />0</span> : null}
      </div>
    </div>
  );
}

const dispatchNodeTypes = { rootNode: RootNode, childNode: ChildNode };

function buildDispatchGraph(name: string, total: number, passed: number, children: ChildRow[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{
    id: '__root__', type: 'rootNode', position: { x: 0, y: Math.max(0, (children.length - 1) * 33) },
    data: { label: name || '挖掘任务', total, passed } as RootNodeData,
  }];
  const edges: Edge[] = [];
  children.forEach((c, i) => {
    nodes.push({ id: c.task_id, type: 'childNode', position: { x: 320, y: i * 66 }, data: { row: c } as ChildNodeData });
    edges.push({
      id: `e_${c.task_id}`, source: '__root__', target: c.task_id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#cbd5e1' },
      style: { stroke: '#cbd5e1' },
    });
  });
  return { nodes, edges };
}

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
  const [s2View, setS2View] = useState<'graph' | 'table'>('graph');

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

  // Merge fan-out children: prefer findings.children (has finding_count),
  // fall back to the pipeline's stage children list.
  const childRows: ChildRow[] = (findings?.children && findings.children.length > 0)
    ? findings.children
    : (s2.children || []).map((c: any) => ({
        task_id: c.task_id,
        function_name: c.parent_stage_item_key || c.task_name || c.function_name || c.task_id,
        status: c.status,
        finding_count: 0,
      }));
  const dispatchGraph = buildDispatchGraph(detail.name, s2.summary.total, s2.summary.passed, childRows);

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
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> 数据库漏洞挖掘</h2>
          {s2.summary.total > 0 && (
            <div className="flex gap-1 rounded-lg border bg-gray-50 p-0.5 text-sm">
              <button onClick={() => setS2View('graph')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${s2View === 'graph' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500'}`}><Network className="w-3.5 h-3.5" />派发树</button>
              <button onClick={() => setS2View('table')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${s2View === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500'}`}><Table2 className="w-3.5 h-3.5" />表格</button>
            </div>
          )}
        </div>
        {s2.summary.total === 0 ? (
          <div className="text-gray-400 py-3">尚未下发审计子任务。请在上方勾选入口后点击「审计选中入口」。</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3 text-sm">
              {(['total', 'running', 'passed', 'failed'] as const).map((k) => (
                <span key={k} className="px-2 py-1 rounded bg-gray-100">{k}: {(s2.summary as any)[k]}</span>
              ))}
              {findings && Object.entries(findings.by_severity).map(([sev, n]) => (
                <span key={sev} className={`px-2 py-1 rounded ${SEV_COLOR[sev] || 'bg-gray-100'}`}>{sev}: {n}</span>
              ))}
            </div>
            {s2View === 'graph' ? (
              <div className="border rounded-lg overflow-hidden bg-theme-elevated" style={{ height: Math.min(620, Math.max(260, childRows.length * 70 + 40)) }}>
                <ReactFlow
                  nodes={dispatchGraph.nodes}
                  edges={dispatchGraph.edges}
                  nodeTypes={dispatchNodeTypes}
                  onNodeClick={(_, node) => { if (node.id !== '__root__') openChild(node.id); }}
                  fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag zoomOnScroll
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#e2e8f0" gap={18} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            ) : (
              <div className="border rounded overflow-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">入口函数</th>
                      <th className="text-left px-3 py-2">状态</th>
                      <th className="text-right px-3 py-2">发现漏洞</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childRows.map((c) => (
                      <tr key={c.task_id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openChild(c.task_id)}>
                        <td className="px-3 py-1.5 font-mono text-blue-700">{c.function_name}</td>
                        <td className="px-3 py-1.5">{c.status}</td>
                        <td className="px-3 py-1.5 text-right">{c.finding_count > 0 ? <span className="font-semibold text-rose-600">{c.finding_count}</span> : c.finding_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
