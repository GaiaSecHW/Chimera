/**
 * dataflow-v2 漏洞图谱视图 (DFS 路径树 + 四库指标 + findings)。
 *
 * 与 v1 TraceTreeNodeCard 解耦: v1 剥离后本组件独立保留。
 * 后端 GET /tasks/{id}/vuln-graph mode='dataflow_v2' 时返回的数据结构:
 *   summary: {runs, nodes, edges, followups, paths, findings}
 *   graph.v2_paths: [{path_id, steps:[{function,depth,order,status,from}]}]
 *   trace_tree: {function,children:[...]}  (DFS 路径树)
 *   graph.vulnerability_findings: [...]
 */
import { useMemo } from 'react';
import { ScrollText, BarChart3, ChevronDown, XCircle, Bug, GitBranch, RefreshCw } from 'lucide-react';
import type {
  DataflowVulnGraphResponse,
  DataflowVulnV2TraceTreeNode,
} from '../../clients/appDataflowVulnScan';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '-';
  return Number(n).toLocaleString();
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-theme-text-primary">{value}</div>
    </div>
  );
}

function V2PathTreeNode({ node, level = 0, isLast = false, ancestors = [] }: {
  node: DataflowVulnV2TraceTreeNode; level?: number; isLast?: boolean; ancestors?: boolean[];
}) {
  const children = node.children || [];
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1 py-0.5">
        {ancestors.map((a, i) => (
          <span key={i} className="inline-block w-4 text-theme-text-muted">{a ? '│' : ' '}</span>
        ))}
        {level > 0 && <span className="inline-block w-4 text-theme-text-muted">{isLast ? '└' : '├'}</span>}
        <span className={`rounded px-1.5 py-0.5 ${MONO} ${node.status === 'done' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-theme-elevated text-theme-text-secondary'}`}>
          {node.function || '(root)'}
        </span>
        {node.status && node.status !== 'done' && (
          <span className="text-[10px] text-theme-text-muted">{node.status}</span>
        )}
        {node.depth !== undefined && (
          <span className="text-[10px] text-theme-text-muted">d{node.depth}</span>
        )}
      </div>
      {children.map((c, i) => (
        <V2PathTreeNode key={i} node={c} level={level + 1} isLast={i === children.length - 1}
          ancestors={[...ancestors, !isLast]} />
      ))}
    </div>
  );
}

export function DataflowVulnV2GraphView({ graph, onRefresh, loading }: {
  graph: DataflowVulnGraphResponse | null;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  const summary = graph?.summary || {};
  const traceTree: any = graph?.trace_tree;
  const findings = useMemo(() => (graph?.graph?.vulnerability_findings || []) as any[], [graph]);
  const paths = useMemo(() => (graph?.graph?.v2_paths || []) as any[], [graph]);

  if (loading) {
    return <section className="rounded-2xl border border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">加载漏洞图谱中...</section>;
  }
  if (!graph?.available) {
    return <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">当前任务尚未生成 v2 漏洞图谱。</section>;
  }

  return (
    <section className="space-y-4">
      {/* 指标 */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="函数" value={formatNumber(summary.runs)} icon={<ScrollText size={18} />} />
        <MetricCard label="污点" value={formatNumber(summary.nodes)} icon={<BarChart3 size={18} />} />
        <MetricCard label="传播" value={formatNumber(summary.edges)} icon={<BarChart3 size={18} />} />
        <MetricCard label="DFS 路径" value={formatNumber(summary.paths)} icon={<GitBranch size={18} />} />
        <MetricCard label="编排边" value={formatNumber(summary.followups)} icon={<ChevronDown size={18} />} />
        <MetricCard label="漏洞数" value={formatNumber(summary.findings)} icon={<XCircle size={18} />} />
      </section>

      {/* 刷新 + 图数据库 */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">
          v2 模式 · 四库: functions/taints/propagations/orchestration
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="inline-flex items-center gap-1 rounded-lg border border-theme-border px-2 py-1 text-[11px] font-semibold text-theme-text-muted hover:bg-theme-elevated">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />刷新
          </button>
        )}
      </div>

      {/* DFS 路径树 */}
      {traceTree ? (
        <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">DFS 调用路径树</div>
          <V2PathTreeNode node={traceTree} />
        </section>
      ) : paths.length > 0 ? (
        <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">DFS 路径 ({paths.length})</div>
          <div className="space-y-2">
            {paths.map((p, i) => (
              <div key={p.path_id || i} className="text-xs">
                <span className="text-theme-text-muted">路径 {i + 1}: </span>
                <span className={MONO}>
                  {(p.steps || []).map((s: any, j: number) => (j === 0 ? s.from || s.function : s.function)).join(' → ')}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* findings */}
      {findings.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center">
          <Bug size={28} className="mx-auto text-theme-text-muted" />
          <p className="mt-4 text-sm font-semibold text-theme-text-primary">暂未发现漏洞</p>
          <p className="mt-1 text-xs text-theme-text-muted">v2 污点追踪 + 漏洞挖掘完成后自动生成报告。</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-theme-border bg-theme-surface">
          <div className="border-b border-theme-border px-5 py-4 text-sm font-semibold text-theme-text-primary">
            漏洞报告 ({findings.length})
          </div>
          <div className="divide-y divide-theme-border">
            {findings.map((f: any) => (
              <div key={f.finding_id} className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">{f.severity}</span>
                  <span className="text-sm font-semibold text-theme-text-primary">{f.title || f.finding_id}</span>
                </div>
                <div className="mt-1 text-xs text-theme-text-muted">
                  {f.function_name} · {f.source_file} · {f.line} · {f.vuln_type}
                </div>
                {f.summary && <p className="mt-2 text-xs text-theme-text-secondary">{f.summary}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
