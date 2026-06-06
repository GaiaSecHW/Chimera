import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  KeyRound,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Rocket,
  Shield,
  Siren,
  Waypoints,
  XCircle,
} from 'lucide-react';
import { api } from '../../clients/api';
import { showAlert, showConfirm } from '../../components/DialogService';
import {
  ScheduleExecution,
  ScheduleExecutionEvent,
  ScheduleJobDetail,
  ScheduleRuntimeOverview,
  SecurityProject,
  VirtualKey,
  VirtualKeyCreateResult,
} from '../../types/types';

interface ChirmeraScheduleCenterPageProps {
  projects: SecurityProject[];
  initialProjectId?: string;
}

type JobDraft = {
  name: string;
  description: string;
  enabled: boolean;
  trigger_type: 'manual' | 'interval' | 'cron';
  cron_expr: string;
  interval_seconds: number | '';
  timezone: string;
  target_method: string;
  target_url: string;
  auth_mode: 'none' | 'bearer_passthrough' | 'machine_token' | 'static_bearer';
  static_bearer_token: string;
  response_task_id_path: string;
  dedupe_window_seconds: number | '';
  success_status_codes: string;
  target_headers: string;
  target_query: string;
  target_body_template: string;
};

type KeyDraft = {
  name: string;
  alias: string;
  models: string;
  metadata: string;
  duration: string;
  max_budget: string;
};

const createJobDraft = (): JobDraft => ({
  name: '',
  description: '',
  enabled: true,
  trigger_type: 'manual',
  cron_expr: '',
  interval_seconds: '',
  timezone: 'UTC',
  target_method: 'POST',
  target_url: '',
  auth_mode: 'machine_token',
  static_bearer_token: '',
  response_task_id_path: 'task_id',
  dedupe_window_seconds: 0,
  success_status_codes: '200,201,202',
  target_headers: '{\n  "Content-Type": "application/json"\n}',
  target_query: '{}',
  target_body_template: '{\n  "project_id": "{project_id}",\n  "execution_id": "{execution_id}"\n}',
});

const createKeyDraft = (): KeyDraft => ({
  name: '',
  alias: '',
  models: 'gpt-4o-mini',
  metadata: '{\n  "owner": "platform"\n}',
  duration: '30d',
  max_budget: '10',
});

const safeParseJson = (raw: string, fallback: any) => {
  try {
    const value = JSON.parse(raw || '');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
};

const parseStatuses = (raw: string) =>
  raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

const executionTone = (status: string) => {
  if (status === 'succeeded') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['queued', 'leased', 'dispatching', 'retry_wait'].includes(status)) return 'bg-sky-100 text-sky-700 border-sky-200';
  if (status === 'timeout') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-rose-100 text-rose-700 border-rose-200';
};

const keyTone = (status: string) => {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'disabled') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};

const triggerLabel = (job: ScheduleJobDetail) => {
  if (job.trigger_type === 'cron') return job.cron_expr || 'Cron';
  if (job.trigger_type === 'interval') return `${job.interval_seconds || 0}s`;
  return 'Manual';
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

export const ChirmeraScheduleCenterPage: React.FC<ChirmeraScheduleCenterPageProps> = ({
  projects,
  initialProjectId,
}) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [jobs, setJobs] = useState<ScheduleJobDetail[]>([]);
  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [executions, setExecutions] = useState<ScheduleExecution[]>([]);
  const [executionEvents, setExecutionEvents] = useState<ScheduleExecutionEvent[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedExecutionId, setSelectedExecutionId] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [jobDraft, setJobDraft] = useState<JobDraft>(createJobDraft());
  const [keyDraft, setKeyDraft] = useState<KeyDraft>(createKeyDraft());
  const [health, setHealth] = useState<{ status?: string; service_name?: string } | null>(null);
  const [runtimeOverview, setRuntimeOverview] = useState<ScheduleRuntimeOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId],
  );

  const selectedExecution = useMemo(
    () => executions.find((execution) => execution.id === selectedExecutionId) || null,
    [executions, selectedExecutionId],
  );

  const selectedKey = useMemo(
    () => keys.find((item) => item.id === selectedKeyId) || null,
    [keys, selectedKeyId],
  );

  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, label: project.name || project.id })),
    [projects],
  );

  const applyJobToDraft = (job: ScheduleJobDetail | null) => {
    if (!job) {
      setJobDraft(createJobDraft());
      return;
    }
    setJobDraft({
      name: job.name,
      description: job.description || '',
      enabled: job.enabled,
      trigger_type: job.trigger_type,
      cron_expr: job.cron_expr || '',
      interval_seconds: job.interval_seconds || '',
      timezone: job.timezone || 'UTC',
      target_method: job.target_method,
      target_url: job.target_url,
      auth_mode: job.auth_mode,
      static_bearer_token: job.static_bearer_token || '',
      response_task_id_path: job.response_task_id_path || '',
      dedupe_window_seconds: job.dedupe_window_seconds ?? 0,
      success_status_codes: (job.success_status_codes || []).join(','),
      target_headers: JSON.stringify(job.target_headers || {}, null, 2),
      target_query: JSON.stringify(job.target_query || {}, null, 2),
      target_body_template: JSON.stringify(job.target_body_template || {}, null, 2),
    });
  };

  const loadHealth = async () => {
    try {
      const [payload, runtime] = await Promise.all([
        scheduleApi.getHealth(),
        scheduleApi.getRuntimeOverview().catch(() => null),
      ]);
      setHealth(payload);
      setRuntimeOverview(runtime);
    } catch {
      setHealth({ status: 'error' });
      setRuntimeOverview(null);
    }
  };

  const loadProjectData = async (nextProjectId: string, nextSelectedJobId?: string) => {
    if (!nextProjectId) {
      setJobs([]);
      setKeys([]);
      setExecutions([]);
      setExecutionEvents([]);
      setSelectedJobId('');
      setSelectedExecutionId('');
      setSelectedKeyId('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [jobResp, keyResp] = await Promise.all([
        scheduleApi.listJobs(nextProjectId),
        scheduleApi.listKeys(nextProjectId),
      ]);
      const nextJobs = jobResp.items || [];
      const nextKeys = keyResp.items || [];
      setJobs(nextJobs);
      setKeys(nextKeys);
      const resolvedJobId = nextSelectedJobId && nextJobs.some((item: ScheduleJobDetail) => item.id === nextSelectedJobId)
        ? nextSelectedJobId
        : nextJobs[0]?.id || '';
      setSelectedJobId(resolvedJobId);
      setSelectedKeyId(nextKeys[0]?.id || '');
      const resolvedJob = nextJobs.find((item: ScheduleJobDetail) => item.id === resolvedJobId) || null;
      applyJobToDraft(resolvedJob);
      if (resolvedJobId) {
        const executionResp = await scheduleApi.listExecutions(nextProjectId, resolvedJobId);
        const nextExecutions = executionResp.items || [];
        setExecutions(nextExecutions);
        const nextExecutionId = nextExecutions[0]?.id || '';
        setSelectedExecutionId(nextExecutionId);
        if (nextExecutionId) {
          const eventResp = await scheduleApi.listExecutionEvents(nextProjectId, nextExecutionId);
          setExecutionEvents(eventResp.items || []);
        } else {
          setExecutionEvents([]);
        }
      } else {
        setExecutions([]);
        setExecutionEvents([]);
        applyJobToDraft(null);
      }
    } catch (err: any) {
      setError(err.message || '加载调度中心数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();
  }, []);

  useEffect(() => {
    void loadProjectData(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!selectedJobId || !projectId) {
      setExecutions([]);
      setExecutionEvents([]);
      applyJobToDraft(null);
      return;
    }
    const currentJob = jobs.find((job) => job.id === selectedJobId) || null;
    applyJobToDraft(currentJob);
    void (async () => {
      try {
        const executionResp = await scheduleApi.listExecutions(projectId, selectedJobId);
        const nextExecutions = executionResp.items || [];
        setExecutions(nextExecutions);
        const nextExecutionId = nextExecutions[0]?.id || '';
        setSelectedExecutionId(nextExecutionId);
        if (nextExecutionId) {
          const eventResp = await scheduleApi.listExecutionEvents(projectId, nextExecutionId);
          setExecutionEvents(eventResp.items || []);
        } else {
          setExecutionEvents([]);
        }
      } catch (err: any) {
        setError(err.message || '加载执行记录失败');
      }
    })();
  }, [selectedJobId, projectId, jobs]);

  useEffect(() => {
    if (!selectedExecutionId || !projectId) {
      setExecutionEvents([]);
      return;
    }
    void (async () => {
      try {
        const eventResp = await scheduleApi.listExecutionEvents(projectId, selectedExecutionId);
        setExecutionEvents(eventResp.items || []);
      } catch (err: any) {
        setError(err.message || '加载执行事件失败');
      }
    })();
  }, [selectedExecutionId, projectId]);

  const jobStats = useMemo(() => {
    const running = executions.filter((item) => ['queued', 'leased', 'dispatching', 'retry_wait'].includes(item.status)).length;
    const success = executions.filter((item) => item.status === 'succeeded').length;
    const failed = executions.filter((item) => item.status === 'failed' || item.status === 'timeout').length;
    return { running, success, failed };
  }, [executions]);

  const handleSaveJob = async () => {
    if (!projectId) {
      setError('请先选择项目');
      return;
    }
    setSavingJob(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        name: jobDraft.name,
        description: jobDraft.description,
        enabled: jobDraft.enabled,
        trigger_type: jobDraft.trigger_type,
        cron_expr: jobDraft.trigger_type === 'cron' ? jobDraft.cron_expr : null,
        interval_seconds: jobDraft.trigger_type === 'interval' ? Number(jobDraft.interval_seconds || 0) : null,
        timezone: jobDraft.timezone,
        target_method: jobDraft.target_method,
        target_url: jobDraft.target_url,
        auth_mode: jobDraft.auth_mode,
        static_bearer_token: jobDraft.auth_mode === 'static_bearer' ? jobDraft.static_bearer_token : null,
        response_task_id_path: jobDraft.response_task_id_path || null,
        dedupe_window_seconds: Number(jobDraft.dedupe_window_seconds || 0),
        success_status_codes: parseStatuses(jobDraft.success_status_codes),
        target_headers: safeParseJson(jobDraft.target_headers, {}),
        target_query: safeParseJson(jobDraft.target_query, {}),
        target_body_template: safeParseJson(jobDraft.target_body_template, {}),
      };
      let savedJob: ScheduleJobDetail;
      if (selectedJob) {
        savedJob = await scheduleApi.updateJob(projectId, selectedJob.id, payload);
      } else {
        savedJob = await scheduleApi.createJob(projectId, payload);
      }
      setMessage(selectedJob ? '调度任务已更新' : '调度任务已创建');
      await loadProjectData(projectId, savedJob.id);
    } catch (err: any) {
      setError(err.message || '保存调度任务失败');
    } finally {
      setSavingJob(false);
    }
  };

  const handleToggleJob = async (job: ScheduleJobDetail, enable: boolean) => {
    if (!projectId) return;
    try {
      if (enable) {
        await scheduleApi.enableJob(projectId, job.id);
      } else {
        await scheduleApi.disableJob(projectId, job.id);
      }
      await loadProjectData(projectId, job.id);
    } catch (err: any) {
      setError(err.message || '更新调度任务状态失败');
    }
  };

  const handleTriggerJob = async (job: ScheduleJobDetail) => {
    if (!projectId) return;
    try {
      await scheduleApi.triggerJob(projectId, job.id, { trigger_source: 'manual' });
      setMessage('手动触发成功，正在刷新执行记录');
      await loadProjectData(projectId, job.id);
    } catch (err: any) {
      setError(err.message || '手动触发失败');
    }
  };

  const handleCreateKey = async () => {
    if (!projectId) {
      setError('请先选择项目');
      return;
    }
    setSavingKey(true);
    setError('');
    setMessage('');
    try {
      const result: VirtualKeyCreateResult = await scheduleApi.createKey(projectId, {
        name: keyDraft.name,
        alias: keyDraft.alias || null,
        models: keyDraft.models.split(',').map((item) => item.trim()).filter(Boolean),
        metadata: safeParseJson(keyDraft.metadata, {}),
        duration: keyDraft.duration,
        budget_config: { max_budget: Number(keyDraft.max_budget || 0) || null },
      });
      setMessage('LiteLLM Key 创建成功');
      setRevealedKey(result.plain_text_key || null);
      setKeyDraft(createKeyDraft());
      await loadProjectData(projectId, selectedJobId || undefined);
      if (result.id) {
        setSelectedKeyId(result.id);
      }
    } catch (err: any) {
      setError(err.message || '创建 LiteLLM Key 失败');
    } finally {
      setSavingKey(false);
    }
  };

  const handleDisableKey = async (item: VirtualKey) => {
    if (!projectId) return;
    const confirmed = await showConfirm({
      title: '禁用 Key',
      message: `确认禁用虚拟 Key「${item.name}」吗？`,
      confirmText: '禁用',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await scheduleApi.disableKey(projectId, item.id);
      await loadProjectData(projectId, selectedJobId || undefined);
    } catch (err: any) {
      setError(err.message || '禁用 Key 失败');
    }
  };

  const handleSyncKey = async (item: VirtualKey) => {
    if (!projectId) return;
    try {
      await scheduleApi.syncKey(projectId, item.id);
      await loadProjectData(projectId, selectedJobId || undefined);
    } catch (err: any) {
      setError(err.message || '同步 Key 失败');
    }
  };

  const handleShowKeyEvents = async (item: VirtualKey) => {
    if (!projectId) return;
    try {
      const payload = await scheduleApi.listKeyEvents(projectId, item.id);
      await showAlert({
        title: `${item.name} 事件流`,
        message: JSON.stringify(payload.items || [], null, 2),
        confirmText: '关闭',
        tone: 'info',
      });
    } catch (err: any) {
      setError(err.message || '加载 Key 事件失败');
    }
  };

  return (
    <div className="min-h-full bg-theme-app p-6 md:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <section className="overflow-hidden rounded-[2.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(30,41,59,0.94)_34%,rgba(15,118,110,0.88)_100%)] p-8 text-white shadow-[0_40px_120px_rgba(15,23,42,0.32)]">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100">
                <Waypoints size={14} />
                Chirmera Control Tower
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
                调度中心
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                用一个平台页管理 REST 调度任务、执行轨迹和 LiteLLM 虚拟 Key。它更像一座调度舱，而不是普通后台表格页。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">任务总数</div>
                <div className="mt-3 text-3xl font-black">{runtimeOverview?.stats.jobs_total ?? jobs.length}</div>
                <div className="mt-2 text-xs text-slate-200">运行 {runtimeOverview?.workers.inflight_executions ?? jobStats.running} · 成功 {runtimeOverview?.stats.succeeded_total ?? jobStats.success}</div>
              </div>
              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Key 总数</div>
                <div className="mt-3 text-3xl font-black">{keys.length}</div>
                <div className="mt-2 text-xs text-slate-200">激活 {keys.filter((item) => item.status === 'active').length}</div>
              </div>
              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">服务健康</div>
                <div className="mt-3 flex items-center gap-2 text-2xl font-black">
                  {health?.status === 'ok' ? <CheckCircle2 className="text-emerald-300" /> : <Siren className="text-amber-300" />}
                  {health?.status || 'unknown'}
                </div>
                <div className="mt-2 text-xs text-slate-200">{runtimeOverview?.redis_available ? 'Redis Ready' : 'Redis Fallback'} · {runtimeOverview?.leader.is_local ? 'Leader Local' : 'Follower'}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Ready Queue</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{runtimeOverview?.queue.length ?? 0}</div>
            <div className="mt-2 text-xs text-slate-500">backend {runtimeOverview?.queue.backend || 'unknown'}</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Oldest Age</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{Math.round(runtimeOverview?.queue.oldest_age_seconds ?? 0)}s</div>
            <div className="mt-2 text-xs text-slate-500">队列最老等待时间</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Worker Concurrency</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{runtimeOverview?.workers.concurrency ?? 0}</div>
            <div className="mt-2 text-xs text-slate-500">本实例并发槽位</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Failures</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{runtimeOverview?.stats.failed_total ?? jobStats.failed}</div>
            <div className="mt-2 text-xs text-slate-500">累计失败/超时执行</div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur md:grid-cols-[minmax(220px,320px)_1fr_auto] md:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Project Context</div>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300"
            >
              {!projectOptions.length ? <option value="">暂无项目</option> : null}
              {projectOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-800 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-300">
              <Shield size={16} className="text-cyan-400" />
              当前页面为项目级控制台
              <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                {projectId || 'No Project'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              切换项目会重置当前选中的调度任务、执行记录与 Key 视图。
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void loadHealth();
                void loadProjectData(projectId, selectedJobId || undefined);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}
        {revealedKey ? (
          <div className="rounded-[2rem] border border-amber-500/30 bg-amber-950 px-6 py-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <KeyRound className="text-amber-500" />
              <div className="text-sm font-black text-amber-200">一次性明文 Key</div>
              <div className="rounded-full bg-amber-900/50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">Only Once</div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 font-mono text-sm text-emerald-300">
              {revealedKey}
            </div>
            <div className="mt-3 text-xs font-bold text-amber-700">
              该明文 Key 只在本次创建成功后展示一次，离开后不可再次查看。
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Schedule Jobs</div>
                <h2 className="mt-2 text-2xl font-black text-slate-900">调度任务</h2>
              </div>
              <button
                onClick={() => {
                  setSelectedJobId('');
                  setJobDraft(createJobDraft());
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Plus size={16} />
                新建
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full rounded-[1.6rem] border p-4 text-left transition ${
                    selectedJobId === job.id
                      ? 'border-cyan-300 bg-cyan-50 shadow-[0_12px_30px_rgba(8,145,178,0.12)]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">{job.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{job.description || '未填写描述'}</div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${job.enabled ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                      {job.enabled ? 'Active' : 'Paused'}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>{triggerLabel(job)}</span>
                    <span>{formatTime(job.next_run_at)}</span>
                  </div>
                </button>
              ))}
              {!jobs.length ? (
                <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-bold text-slate-500">
                  还没有调度任务。先创建一个 REST 调度入口。
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Mission Editor</div>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">
                    {selectedJob ? `编辑 · ${selectedJob.name}` : '新建调度任务'}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedJob ? (
                    <>
                      <button
                        onClick={() => void handleTriggerJob(selectedJob)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500"
                      >
                        <Rocket size={16} />
                        手动触发
                      </button>
                      <button
                        onClick={() => void handleToggleJob(selectedJob, !selectedJob.enabled)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        {selectedJob.enabled ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                        {selectedJob.enabled ? '禁用' : '启用'}
                      </button>
                    </>
                  ) : null}
                  <button
                    onClick={() => void handleSaveJob()}
                    disabled={savingJob}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingJob ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    保存任务
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <input value={jobDraft.name} onChange={(e) => setJobDraft((v) => ({ ...v, name: e.target.value }))} placeholder="任务名称" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300" />
                <input value={jobDraft.target_url} onChange={(e) => setJobDraft((v) => ({ ...v, target_url: e.target.value }))} placeholder="目标 URL" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300" />
                <textarea value={jobDraft.description} onChange={(e) => setJobDraft((v) => ({ ...v, description: e.target.value }))} placeholder="任务描述" rows={3} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300 md:col-span-2" />
                <select value={jobDraft.trigger_type} onChange={(e) => setJobDraft((v) => ({ ...v, trigger_type: e.target.value as JobDraft['trigger_type'] }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300">
                  <option value="manual">manual</option>
                  <option value="interval">interval</option>
                  <option value="cron">cron</option>
                </select>
                <select value={jobDraft.target_method} onChange={(e) => setJobDraft((v) => ({ ...v, target_method: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300">
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={jobDraft.auth_mode} onChange={(e) => setJobDraft((v) => ({ ...v, auth_mode: e.target.value as JobDraft['auth_mode'] }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300">
                  <option value="machine_token">machine_token</option>
                  <option value="bearer_passthrough">bearer_passthrough</option>
                  <option value="none">none</option>
                  <option value="static_bearer">static_bearer</option>
                </select>
                <input value={jobDraft.timezone} onChange={(e) => setJobDraft((v) => ({ ...v, timezone: e.target.value }))} placeholder="Timezone" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300" />
                {jobDraft.trigger_type === 'cron' ? (
                  <input value={jobDraft.cron_expr} onChange={(e) => setJobDraft((v) => ({ ...v, cron_expr: e.target.value }))} placeholder="*/10 * * * *" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300 md:col-span-2" />
                ) : null}
                {jobDraft.trigger_type === 'interval' ? (
                  <input value={jobDraft.interval_seconds} onChange={(e) => setJobDraft((v) => ({ ...v, interval_seconds: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="间隔秒数" type="number" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300 md:col-span-2" />
                ) : null}
                {jobDraft.auth_mode === 'static_bearer' ? (
                  <input value={jobDraft.static_bearer_token} onChange={(e) => setJobDraft((v) => ({ ...v, static_bearer_token: e.target.value }))} placeholder="静态 Bearer Token" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300 md:col-span-2" />
                ) : null}
                <input value={jobDraft.response_task_id_path} onChange={(e) => setJobDraft((v) => ({ ...v, response_task_id_path: e.target.value }))} placeholder="task_id / data.task_id" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300" />
                <input value={jobDraft.dedupe_window_seconds} onChange={(e) => setJobDraft((v) => ({ ...v, dedupe_window_seconds: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="去重窗口秒数" type="number" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-300" />
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-3">
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Headers</div>
                  <textarea value={jobDraft.target_headers} onChange={(e) => setJobDraft((v) => ({ ...v, target_headers: e.target.value }))} rows={10} className="w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Query</div>
                  <textarea value={jobDraft.target_query} onChange={(e) => setJobDraft((v) => ({ ...v, target_query: e.target.value }))} rows={10} className="w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Body Template</div>
                  <textarea value={jobDraft.target_body_template} onChange={(e) => setJobDraft((v) => ({ ...v, target_body_template: e.target.value }))} rows={10} className="w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400" />
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Execution Deck</div>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">执行记录</h2>
                </div>
                <div className="flex gap-3">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-sky-700">Running {jobStats.running}</div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Succeeded {jobStats.success}</div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-rose-700">Failed {jobStats.failed}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-3">
                  {executions.map((execution) => (
                    <button
                      key={execution.id}
                      onClick={() => setSelectedExecutionId(execution.id)}
                      className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                        selectedExecutionId === execution.id ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">{execution.downstream_task_id || execution.id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {execution.trigger_source} · {formatTime(execution.started_at || execution.created_at)}
                          </div>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${executionTone(execution.status)}`}>
                          {execution.status}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-slate-600">
                        <span>HTTP {execution.http_status || '—'}</span>
                        <span>时长 {execution.duration_ms ?? '—'} ms</span>
                        <span>下游 {execution.downstream_task_name || execution.downstream_task_id || '—'}</span>
                      </div>
                    </button>
                  ))}
                  {!executions.length ? (
                    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-bold text-slate-500">
                      当前任务还没有执行记录。
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-slate-800 p-5">
                  <div className="flex items-center gap-2 text-sm font-black text-slate-200">
                    <Eye size={16} />
                    选中执行详情
                  </div>
                  {selectedExecution ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-700 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Request Snapshot</div>
                        <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-cyan-200">{JSON.stringify(selectedExecution.request_snapshot || {}, null, 2)}</pre>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Response Snapshot</div>
                        <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-emerald-200">{JSON.stringify(selectedExecution.response_snapshot || {}, null, 2)}</pre>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Event Timeline</div>
                        <div className="mt-3 space-y-3">
                          {executionEvents.map((event) => (
                            <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-700">{event.event_type}</div>
                                <div className="text-[11px] font-bold text-slate-500">{formatTime(event.created_at)}</div>
                              </div>
                              <div className="mt-2 text-xs font-medium text-slate-600">{event.message}</div>
                            </div>
                          ))}
                          {!executionEvents.length ? <div className="text-xs font-bold text-slate-500">暂无事件</div> : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                      选择一条执行记录查看请求、响应与时间线。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">LiteLLM Vault</div>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">虚拟 Key</h2>
                </div>
                <div className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">One-time Reveal</div>
              </div>
              <div className="mt-5 space-y-3">
                {keys.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedKeyId(item.id)}
                    className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                      selectedKeyId === item.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">suffix {item.key_suffix || '—'} · {item.alias || 'no-alias'}</div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${keyTone(item.status)}`}>
                        {item.status}
                      </div>
                    </div>
                  </button>
                ))}
                {!keys.length ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-bold text-slate-500">
                    当前项目还没有 LiteLLM 虚拟 Key。
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                <KeyRound size={16} />
                新建虚拟 Key
              </div>
              <div className="mt-4 space-y-3">
                <input value={keyDraft.name} onChange={(e) => setKeyDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Key 名称" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-300" />
                <input value={keyDraft.alias} onChange={(e) => setKeyDraft((v) => ({ ...v, alias: e.target.value }))} placeholder="Alias" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-300" />
                <input value={keyDraft.models} onChange={(e) => setKeyDraft((v) => ({ ...v, models: e.target.value }))} placeholder="gpt-4o-mini,deepseek-chat" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-300" />
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={keyDraft.duration} onChange={(e) => setKeyDraft((v) => ({ ...v, duration: e.target.value }))} placeholder="30d" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-300" />
                  <input value={keyDraft.max_budget} onChange={(e) => setKeyDraft((v) => ({ ...v, max_budget: e.target.value }))} placeholder="10" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-300" />
                </div>
                <textarea value={keyDraft.metadata} onChange={(e) => setKeyDraft((v) => ({ ...v, metadata: e.target.value }))} rows={8} className="w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs text-violet-200 outline-none focus:border-violet-400" />
                <button
                  onClick={() => void handleCreateKey()}
                  disabled={savingKey}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  {savingKey ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  创建 Key
                </button>
              </div>
            </div>

            {selectedKey ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Selected Key</div>
                    <h3 className="mt-2 text-xl font-black text-slate-900">{selectedKey.name}</h3>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${keyTone(selectedKey.status)}`}>
                    {selectedKey.status}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm font-bold text-slate-700">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Suffix: {selectedKey.key_suffix || '—'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Alias: {selectedKey.alias || '—'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Models: {(selectedKey.models || []).join(', ') || '—'}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">Last Sync: {formatTime(selectedKey.last_synced_at)}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={() => void handleSyncKey(selectedKey)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                    <RefreshCw size={16} />
                    同步
                  </button>
                  <button onClick={() => void handleShowKeyEvents(selectedKey)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                    <Activity size={16} />
                    查看事件
                  </button>
                  {selectedKey.status !== 'disabled' ? (
                    <button onClick={() => void handleDisableKey(selectedKey)} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500">
                      <XCircle size={16} />
                      禁用
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {loading ? (
          <div className="fixed bottom-6 right-6 inline-flex items-center gap-3 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl">
            <Loader2 className="animate-spin" size={16} />
            同步调度舱数据中
          </div>
        ) : null}
      </div>
    </div>
  );
};
