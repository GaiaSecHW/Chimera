import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Play, RefreshCw, RotateCcw, ShieldCheck, Square, XCircle } from 'lucide-react';
import { vulnVerifyApi, VulnVerifyArtifact, VulnVerifyResult, VulnVerifyTask, VulnVerifyTaskDetail } from '../../clients/vulnVerify';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';

const DEFAULT_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const TERMINAL = new Set(['success', 'failed', 'cancelled']);

const statusLabel: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  cancelling: '取消中',
};

function statusClass(status?: string) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'cancelled' || status === 'cancelling') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function formatBytes(value?: number) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'slate' }) => (
  <div className={`rounded-2xl border bg-white p-4 shadow-sm border-${tone}-100`}>
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
    <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
  </div>
);

export const VulnVerifyTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyApi.getHealth);
  const [tasks, setTasks] = useState<VulnVerifyTask[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<VulnVerifyTaskDetail | null>(null);
  const [result, setResult] = useState<VulnVerifyResult | null>(null);
  const [artifacts, setArtifacts] = useState<VulnVerifyArtifact[]>([]);
  const [artifactContent, setArtifactContent] = useState<{ path: string; content: string; truncated: boolean } | null>(null);
  const [health, setHealth] = useState<string>('unknown');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '漏洞验证任务',
    reports_dir: '',
    source_root: '',
    binary_root: '',
    threat_path: '',
    model: DEFAULT_MODEL,
    concurrency: 1,
  });

  const summary = useMemo(() => {
    const counts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    return {
      total,
      running: counts.running || 0,
      success: counts.success || 0,
      failed: counts.failed || 0,
    };
  }, [tasks, total]);

  const refreshList = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [healthPayload, list] = await Promise.all([
        vulnVerifyApi.getHealth().catch(() => ({ status: 'unhealthy' })),
        vulnVerifyApi.listTasks(projectId, { limit: 50 }),
      ]);
      setHealth(healthPayload.status || 'unknown');
      setTasks(list.items || []);
      setTotal(list.total || 0);
      if (!selectedId && list.items?.[0]) setSelectedId(list.items[0].id);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedId]);

  const refreshDetail = useCallback(async (taskId: string) => {
    if (!projectId || !taskId) return;
    try {
      const [nextDetail, nextResult, nextArtifacts] = await Promise.all([
        vulnVerifyApi.getTask(projectId, taskId),
        vulnVerifyApi.getResult(projectId, taskId).catch(() => null),
        vulnVerifyApi.listArtifacts(projectId, taskId).catch(() => ({ items: [] })),
      ]);
      setDetail(nextDetail);
      setResult(nextResult);
      setArtifacts(nextArtifacts.items || []);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    }
  }, [projectId]);

  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { if (selectedId) refreshDetail(selectedId); }, [selectedId, refreshDetail]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshList();
      if (selectedId) refreshDetail(selectedId);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshList, refreshDetail, selectedId]);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setCreating(true);
    setMessage(null);
    try {
      const created = await vulnVerifyApi.createTask(projectId, {
        name: form.name,
        reports_dir: form.reports_dir,
        source_root: form.source_root,
        binary_root: form.binary_root,
        threat_path: form.threat_path,
        model: form.model || DEFAULT_MODEL,
        concurrency: Number(form.concurrency || 1),
        resume: false,
      });
      setSelectedId(created.id);
      await refreshList();
      await refreshDetail(created.id);
      setMessage(`任务已创建: ${created.id}`);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setCreating(false);
    }
  };

  const terminate = async () => {
    if (!selectedId || !projectId) return;
    await vulnVerifyApi.terminateTask(projectId, selectedId);
    await refreshDetail(selectedId);
    await refreshList();
  };

  const rerun = async () => {
    if (!selectedId || !projectId) return;
    await vulnVerifyApi.rerunTask(projectId, selectedId);
    await refreshDetail(selectedId);
    await refreshList();
  };

  const openArtifact = async (path: string) => {
    if (!selectedId || !projectId) return;
    const payload = await vulnVerifyApi.getArtifactContent(projectId, selectedId, path);
    setArtifactContent({ path, content: payload.content, truncated: payload.truncated });
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">漏洞验证原子能力</p>
              <ServicePageTitle title="漏洞验证任务" version={buildVersion} />
              <p className="mt-2 max-w-3xl text-sm text-slate-500">封装 vuln-verify：输入扫描报告、源码、二进制根目录与威胁模型，自动执行 Router → Verifier，输出 JSON 研判结果与执行产物。</p>
            </div>
            <button onClick={refreshList} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
            </button>
          </div>
        </header>

        {message ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{message}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="服务健康" value={<span className={health === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{health}</span>} />
          <StatCard label="任务总数" value={summary.total} />
          <StatCard label="运行中" value={summary.running} />
          <StatCard label="成功 / 失败" value={`${summary.success} / ${summary.failed}`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <form onSubmit={createTask} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-600 p-3 text-white"><Play size={18} /></div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">新建验证任务</h2>
                  <p className="text-xs text-slate-500">所有路径必须位于当前项目 /data/files/{projectId} 下。</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ['name', '任务名称', '漏洞验证任务'],
                  ['reports_dir', '报告目录', `/data/files/${projectId}/vuln-verify/reports`],
                  ['source_root', '源码根目录', `/data/files/${projectId}/source`],
                  ['binary_root', '二进制根目录', `/data/files/${projectId}/binary`],
                  ['threat_path', '威胁模型文件', `/data/files/${projectId}/vuln-verify/threat_model.md`],
                  ['model', '模型', DEFAULT_MODEL],
                ].map(([key, label, placeholder]) => (
                  <label key={key} className="block">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:bg-white"
                      value={(form as any)[key]}
                      placeholder={placeholder}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      required={key !== 'model'}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">并发</span>
                  <input type="number" min={1} max={16} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" value={form.concurrency} onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value || 1) })} />
                </label>
                <button disabled={creating} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-violet-700 disabled:opacity-60">
                  {creating ? <Loader2 className="mx-auto animate-spin" size={18} /> : '创建漏洞验证任务'}
                </button>
              </div>
            </form>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="px-2 text-lg font-black text-slate-900">任务列表</h2>
              <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                {tasks.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">暂无任务</div> : tasks.map((task) => (
                  <button key={task.id} onClick={() => setSelectedId(task.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === task.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{task.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400">{task.id}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-black ${statusClass(task.status)}`}>{statusLabel[task.status] || task.status}</span>
                    </div>
                    <div className="mt-2 truncate text-xs text-slate-500">{task.progress?.message || task.error_reason || task.output_dir}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {!detail ? (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-16 text-center text-slate-400">请选择任务查看详情</div>
            ) : (
              <>
                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        {detail.status === 'success' ? <CheckCircle2 className="text-emerald-500" /> : detail.status === 'failed' ? <XCircle className="text-rose-500" /> : detail.status === 'running' ? <Loader2 className="animate-spin text-blue-500" /> : <ShieldCheck className="text-violet-500" />}
                        <h2 className="text-xl font-black text-slate-900">{detail.name}</h2>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(detail.status)}`}>{statusLabel[detail.status] || detail.status}</span>
                      </div>
                      <p className="mt-2 font-mono text-xs text-slate-400">{detail.id}</p>
                    </div>
                    <div className="flex gap-2">
                      {!TERMINAL.has(detail.status) ? <button onClick={terminate} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700"><Square size={14} />取消</button> : null}
                      {TERMINAL.has(detail.status) ? <button onClick={rerun} className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-700"><RotateCcw size={14} />重跑</button> : null}
                    </div>
                  </div>
                  {detail.error_reason ? <div className="mt-4 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700"><AlertCircle size={16} />{detail.error_reason}</div> : null}
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {[
                      ['模型', detail.model || '-'], ['Worker', detail.worker_id || '-'], ['输出目录', detail.output_dir], ['创建时间', formatDate(detail.created_at)], ['开始时间', formatDate(detail.started_at)], ['结束时间', formatDate(detail.finished_at)],
                    ].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div><div className="mt-1 break-all text-xs font-bold text-slate-700">{value}</div></div>)}
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-4">
                  <StatCard label="报告结果" value={result?.result_count ?? 0} />
                  <StatCard label="分组" value={result?.summary?.group_count ?? detail.result_summary?.group_count ?? 0} />
                  <StatCard label="完成分组" value={result?.summary?.done_group_count ?? detail.result_summary?.done_group_count ?? 0} />
                  <StatCard label="产物数" value={artifacts.length} />
                </section>

                <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">产物文件</h3>
                    <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                      {artifacts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">暂无产物</div> : artifacts.map((file) => (
                        <button key={file.path} onClick={() => openArtifact(file.path)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50">
                          <div className="flex items-center gap-2 text-xs font-black text-slate-700"><FileText size={14} /> <span className="break-all">{file.path}</span></div>
                          <div className="mt-1 text-[10px] text-slate-400">{formatBytes(file.size)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900">{artifactContent?.path || '结果预览'}</h3>
                    {artifactContent ? (
                      <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{artifactContent.content}{artifactContent.truncated ? '\n\n... truncated ...' : ''}</pre>
                    ) : result?.results?.length ? (
                      <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{JSON.stringify(result.results, null, 2)}</pre>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">选择左侧产物或等待任务生成结果。</div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
