import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../../clients/api';
import {
  BinaryEvolutionPreviewResponse,
  BinaryEvolutionTaskSummary,
} from '../../clients/binaryEvolution';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  APPLY_STYLE,
  fmtTime,
  normalizeTaskList,
  StatCard,
  STATUS_LABEL,
  STATUS_STYLE,
} from './BinaryEvolutionShared';
import { BinaryEvolutionTaskDetailPage } from './BinaryEvolutionTaskDetailPage';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface Props {
  projectId: string;
}

const executionApi = api.domains.execution;

const BinaryEvolutionTaskListView: React.FC<Props> = ({ projectId }) => {
  const navigate = useNavigate();
  const { notify, feedbackNodes } = useUiFeedback();
  const [tasks, setTasks] = useState<BinaryEvolutionTaskSummary[]>([]);
  const [preview, setPreview] = useState<BinaryEvolutionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [form, setForm] = useState({
    title: '',
    objective: '',
    caseIdsText: '',
    minRounds: 1,
    maxRounds: 3,
    maxConcurrentSourceTasks: 4,
  });

  const caseIds = useMemo(
    () => Array.from(new Set(form.caseIdsText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))),
    [form.caseIdsText],
  );

  const filteredTasks = useMemo(
    () => (statusFilter ? tasks.filter((item) => item.status === statusFilter) : tasks),
    [tasks, statusFilter],
  );

  const activeCount = useMemo(
    () => tasks.filter((item) => item.status === 'running' || item.status === 'pending').length,
    [tasks],
  );

  const succeededCount = useMemo(
    () => tasks.filter((item) => item.status === 'succeeded').length,
    [tasks],
  );

  const failedCount = useMemo(
    () => tasks.filter((item) => item.status === 'failed' || item.status === 'cancelled').length,
    [tasks],
  );

  const loadTasks = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const items = normalizeTaskList(await executionApi.binaryEvolution.listTasks(projectId));
      setTasks(items);
    } catch (err: any) {
      notify(`加载进化任务失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!tasks.some((item) => item.status === 'running' || item.status === 'pending')) return;
    const timer = window.setInterval(() => {
      void loadTasks();
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSec, tasks, projectId]);

  const handlePreview = async () => {
    if (caseIds.length === 0) {
      notify('请先输入至少一个案例 ID', 'warning');
      return;
    }
    setSubmitting(true);
    setPreview(null);
    try {
      const payload = await executionApi.binaryEvolution.previewTask(projectId, caseIds);
      setPreview(payload);
      notify(payload.can_create ? '预览通过，可创建进化任务' : '预览已返回，请检查阻塞原因', payload.can_create ? 'success' : 'warning');
    } catch (err: any) {
      notify(`预览失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const created = await executionApi.binaryEvolution.createTask(projectId, {
        case_ids: preview?.effective_case_ids?.length ? preview.effective_case_ids : caseIds,
        title: form.title.trim() ||`Evolution ${new Date().toLocaleString()}`,
        objective: form.objective.trim(),
        min_rounds: Math.max(1, Number(form.minRounds) || 1),
        max_rounds: Math.max(1, Number(form.maxRounds) || 1),
        max_concurrent_source_tasks: Math.max(1, Number(form.maxConcurrentSourceTasks) || 1),
        metrics: {
          false_negative_rate: true,
          false_positive_rate: true,
          avg_discovery_round: true,
        },
      });
      notify(`已创建进化任务 ${created.task_id}`, 'success');
      setShowCreate(false);
      setPreview(null);
      await loadTasks();
      navigate(`/binary-evolution-dataflow-vuln/${encodeURIComponent(created.task_id)}`);
    } catch (err: any) {
      notify(`创建失败: ${err?.message || err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingLeft: '32px', paddingBottom: '40px', paddingTop: '32px' }}>
      {feedbackNodes}

 <section style={{ borderRadius: '24px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '24px' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3em', color: LK.warning }}>Binary Evolution</p>
        <h1 style={{ marginTop: '12px', fontSize: '30px', fontWeight: 600, letterSpacing: '-0.025em', color: LK.ink }}>进化中心任务</h1>
        <p style={{ marginTop: '8px', maxWidth: '56rem', fontSize: '14px', color: LK.body }}>
          集中管理进化任务的创建与历史回看。点击任意任务可进入独立详情页查看轮次收敛、产物应用与事件轨迹。
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
        <StatCard label="总任务" value={tasks.length} />
        <StatCard label="运行中" value={activeCount} tone="bg-blue-50 border-blue-200 text-blue-700" />
        <StatCard label="已完成" value={succeededCount} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
        <StatCard label="失败/取消" value={failedCount} tone="bg-red-50 border-red-200 text-red-700" />
      </div>

      <section style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: LK.ink }}>
            任务列表 <span style={{ fontSize: '14px', fontWeight: 400, color: LK.muted }}>({filteredTasks.length})</span>
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', color: LK.body }}>
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              自动刷新
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', color: LK.body }}>
              间隔
              <input
                type="number"
                min={5}
                step={1}
                value={refreshIntervalSec}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRefreshIntervalSec(Number.isFinite(value) ? Math.max(5, Math.floor(value)) : 5);
                }}
                style={{ width: '64px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '8px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', color: LK.inkSoft }}
              />
              秒
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '8px', paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', color: LK.body }}
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadTasks()}
              style={{ borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, padding: '8px', color: LK.body, cursor: 'pointer', backgroundColor: 'transparent' }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', backgroundColor: LK.surface, paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', fontWeight: 600, color: LK.ink, cursor: 'pointer', border: `1px solid ${LK.border}` }}
            >
              <Plus size={13} />
              新建任务
            </button>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12px', color: LK.body }}>
          <span>项目：{projectId}</span>
          <span>活跃任务：{activeCount}</span>
          {autoRefreshEnabled ? <span style={{ color: LK.primary }}>自动刷新已开启（{Math.max(5, refreshIntervalSec)}s）</span> : null}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '40px', paddingBottom: '40px', fontSize: '14px', color: LK.body }}>
            <Loader2 size={14} className="animate-spin" />
            加载中...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ paddingTop: '40px', paddingBottom: '40px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>暂无进化任务，点击右上角「新建任务」创建</div>
        ) : (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredTasks.map((task) => (
              <button
                key={task.task_id}
                type="button"
                onClick={() => navigate(`/binary-evolution-dataflow-vuln/${encodeURIComponent(task.task_id)}`)}
                style={{ width: '100%', borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, paddingLeft: '16px', paddingRight: '16px', paddingTop: '16px', paddingBottom: '16px', textAlign: 'left', transition: 'background-color 0.2s', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '16px', fontWeight: 600, color: LK.ink }}>{task.title}</div>
                    <div style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: '12px', color: LK.body }}>{task.task_id}</div>
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ borderRadius: '9999px', paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '11px', fontWeight: 600, ...(STATUS_STYLE[task.status] ? { className: STATUS_STYLE[task.status] } : {}) }}>
                        {STATUS_LABEL[task.status] || task.status}
                      </span>
                      <span style={{ borderRadius: '9999px', paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '11px', fontWeight: 600, ...(APPLY_STYLE[task.apply_status] ? { className: APPLY_STYLE[task.apply_status] } : { backgroundColor: LK.surfaceRaised, color: LK.body }) }}>
                        {task.apply_status || 'pending'}
                      </span>
                      <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '11px', fontWeight: 600, color: LK.body }}>
                        round {task.current_round}/{task.config?.max_rounds || '-'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: LK.body }}>
                    <div>{fmtTime(task.updated_at)}</div>
                    <div style={{ marginTop: '8px', fontWeight: 600, color: LK.inkSoft }}>score {task.overall_score ?? '-'}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {showCreate ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2, 6, 23, 0.4)', padding: '24px' }}>
          <div style={{ maxHeight: '92vh', width: '100%', maxWidth: '72rem', overflowY: 'auto', borderRadius: '32px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '9999px', backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingLeft: '12px', paddingRight: '12px', paddingTop: '4px', paddingBottom: '4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.warning }}>
                  <Sparkles size={14} />
                  创建进化任务
                </div>
                <h2 style={{ marginTop: '12px', fontSize: '24px', fontWeight: 600, color: LK.ink }}>先预览整批样本，再确认创建</h2>
                <p style={{ marginTop: '8px', fontSize: '14px', color: LK.body }}>沿用入口分析任务页的创建风格，把输入参数和预览结果放在同一个弹窗里完成确认。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setPreview(null);
                }}
                style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '8px', paddingBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.body, cursor: 'pointer', backgroundColor: 'transparent' }}
              >
                关闭
              </button>
            </div>

            <div style={{ marginTop: '24px', display: 'grid', gap: '24px', gridTemplateColumns: '0.92fr 1.08fr' }}>
              <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '20px' }}>
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>任务标题</div>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    style={{ width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }}
                    placeholder="例如：DFVS 漏报率优化 - 批次 A"
                  />
                </div>
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>进化目标</div>
                  <textarea
                    value={form.objective}
                    onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
                    style={{ minHeight: '9rem', width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink, fontFamily: MONO }}
                    placeholder="说明本次主要想优化漏报、误报，还是更早发现。"
                  />
                </div>
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>案例 ID 列表</div>
                  <textarea
                    value={form.caseIdsText}
                    onChange={(event) => setForm((current) => ({ ...current, caseIdsText: event.target.value }))}
                    style={{ minHeight: '12rem', width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink, fontFamily: MONO }}
                    placeholder="每行一个 case id，也支持空格/逗号分隔"
                  />
                  <div style={{ marginTop: '8px', fontSize: '12px', color: LK.body }}>已解析 {caseIds.length} 个案例 ID。</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>最小轮次</div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.minRounds}
                      onChange={(event) => setForm((current) => ({ ...current, minRounds: Number(event.target.value || 1) }))}
                      style={{ width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>最大轮次</div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.maxRounds}
                      onChange={(event) => setForm((current) => ({ ...current, maxRounds: Number(event.target.value || 1) }))}
                      style={{ width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>轮内并发</div>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.maxConcurrentSourceTasks}
                      onChange={(event) => setForm((current) => ({ ...current, maxConcurrentSourceTasks: Number(event.target.value || 1) }))}
                      style={{ width: '100%', borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', backgroundColor: LK.surfaceRaised, color: LK.ink }}
                    />
                  </div>
                </div>
                <div style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <button
                      type="button"
                      disabled={submitting || caseIds.length === 0}
                      onClick={() => void handlePreview()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '16px', backgroundColor: LK.surface, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', fontWeight: 600, color: LK.ink, cursor: 'pointer', border: `1px solid ${LK.border}`, opacity: (submitting || caseIds.length === 0) ? 0.5 : 1 }}
                    >
                      <RefreshCw size={15} />
                      预览整批
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !preview?.can_create}
                      onClick={() => void handleCreate()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '16px', border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.1)', paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', fontWeight: 600, color: LK.success, cursor: 'pointer', opacity: (submitting || !preview?.can_create) ? 0.5 : 1 }}
                    >
                      <Play size={15} />
                      确认创建
                    </button>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '12px', color: LK.body }}>如果同一原始 normal 任务的 case 不完整，预览会自动补齐并展示阻塞原因。</div>
                </div>
              </section>

              <section style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '20px' }}>
                {!preview ? (
                  <div style={{ borderRadius: '16px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '48px', paddingBottom: '48px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>
                    预览结果会在这里展示。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {preview.can_create ? <CheckCircle2 size={16} style={{ color: LK.success }} /> : <AlertTriangle size={16} style={{ color: LK.error }} />}
                      <div style={{ fontWeight: 600, color: LK.ink }}>{preview.can_create ? '预览通过，可创建' : '预览未通过'}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
                      <StatCard label="请求案例" value={preview.requested_case_ids.length} />
                      <StatCard label="生效案例" value={preview.effective_case_ids.length} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
                      <StatCard label="涉及任务" value={preview.sources.length} tone="bg-sky-50 border-sky-200 text-sky-700" />
                      <StatCard label="可创建" value={preview.can_create ? '是' : '否'} tone={preview.can_create ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-red-50 border-red-200 text-red-700'} />
                    </div>
                    {preview.blocked_reasons.length > 0 ? (
                      <div style={{ borderRadius: '16px', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.1)', paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', color: LK.error }}>
                        {preview.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {preview.sources.map((source) => (
                        <div key={source.source_task_id} style={{ borderRadius: '16px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ fontWeight: 600, color: LK.inkSoft }}>{source.source_title || source.source_task_id}</div>
                            <span style={{ borderRadius: '9999px', paddingLeft: '10px', paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: source.replay_ready ? 'rgba(69, 192, 111, 0.2)' : 'rgba(241, 93, 93, 0.2)', color: source.replay_ready ? LK.success : LK.error }}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px', color: LK.body }}>已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}</div>
                          {source.auto_expanded_case_ids.length > 0 ? (
                            <div style={{ marginTop: '4px', fontSize: '12px', color: LK.warning }}>自动补齐 {source.auto_expanded_case_ids.length} 个遗漏 case。</div>
                          ) : null}
                          {source.blocked_reasons.length > 0 ? (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: LK.error }}>
                              {source.blocked_reasons.map((reason) => <div key={reason}>{reason}</div>)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const BinaryEvolutionCenterPage: React.FC<Props> = ({ projectId }) => {
  const { taskId } = useParams<{ taskId?: string }>();

  if (taskId) {
    return (
      <BinaryEvolutionTaskDetailPage
        projectId={projectId}
        taskId={decodeURIComponent(taskId)}
      />
    );
  }

  return <BinaryEvolutionTaskListView projectId={projectId} />;
};
