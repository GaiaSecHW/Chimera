import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Play, RefreshCw, ShieldCheck, Wand2 } from 'lucide-react';
import { PageHeader } from '../../design-system';
import { api } from '../../clients/api';
import type { VulnAutoVerifyContext, VulnAutoVerifyTaskCreateResponse, VulnThreatModelTemplate } from '../../clients/vuln';

interface VulnAutoVerifyCreatePageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const CASE_ID_KEY = 'chimera-vuln-auto-verify-case-id';
const ANALYSIS_DETAIL_TARGET_KEY = 'chimera-vuln-open-case-id';
const DEFAULT_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const DEFAULT_THREAT_MODEL =`# 威胁模型

## 攻击者假设
<!-- 攻击者在哪里？拥有什么能力？ -->

## 攻击面
<!-- 哪些入口点暴露给攻击者？无需前置认证的协议解析入口、网络包处理路径等 -->

## 信任边界与补偿控制
<!-- 可信域范围，已知的防御措施（认证门、输入校验层、W^X 等） -->

## 排除范围
<!-- 不在分析范围内的代码：测试代码、mock 文件、第三方库、debug 路径等 -->`;

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const statusTone = (ok?: boolean) => ok
  ? { border: LK.success, bg:`${LK.success}14`, text: LK.success }
  : { border: LK.error, bg:`${LK.error}14`, text: LK.error };

const normalizeConcurrency = (value: number) => Math.max(1, Math.min(64, Math.floor(Number(value) || 1)));

export const VulnAutoVerifyCreatePage: React.FC<VulnAutoVerifyCreatePageProps> = ({ projectId, onNavigateToView }) => {
  const vulnApi = api.domains.vuln.vuln;
  const [caseId, setCaseId] = useState(() => localStorage.getItem(CASE_ID_KEY) || localStorage.getItem(ANALYSIS_DETAIL_TARGET_KEY) || '');
  const [context, setContext] = useState<VulnAutoVerifyContext | null>(null);
  const [templates, setTemplates] = useState<VulnThreatModelTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [concurrency, setConcurrency] = useState(1);
  const [advanceToValidation, setAdvanceToValidation] = useState(true);
  const [threatModel, setThreatModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<VulnAutoVerifyTaskCreateResponse | null>(null);

  const canCreate = useMemo(() => {
    if (!context || submitting) return false;
    if (!taskName.trim()) return false;
    return Boolean(context.path_status?.source_root?.ok);
  }, [context, submitting, taskName]);

  const loadContext = async (targetCaseId = caseId) => {
    if (!targetCaseId.trim()) {
      setError('未找到案例 ID，请从验证复现工作台选择单个案例后再创建自动化验证任务。');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess(null);
    try {
      const [ctx, tplResponse] = await Promise.all([
        vulnApi.getAutoVerifyContext(targetCaseId.trim()),
        vulnApi.listThreatModelTemplates(projectId),
      ]);
      setContext(ctx);
      setTemplates(Array.isArray(tplResponse.items) ? tplResponse.items : []);
      setTaskName(ctx.default_task_name ||`自动化验证-${ctx.case_title || targetCaseId}`);
      setModel(ctx.default_model || DEFAULT_MODEL);
      setConcurrency(normalizeConcurrency(ctx.default_concurrency || 1));
      const firstTemplate = (tplResponse.items || [])[0];
      if (firstTemplate?.id) {
        setSelectedTemplateId(firstTemplate.id);
        await renderTemplate(firstTemplate.id, targetCaseId.trim(), false);
      } else {
        setThreatModel(DEFAULT_THREAT_MODEL);
      }
    } catch (err: any) {
      setError(err?.message || '加载自动化验证上下文失败');
    } finally {
      setLoading(false);
    }
  };

  const renderTemplate = async (templateId: string, targetCaseId = caseId, showLoading = true) => {
    if (!templateId || !targetCaseId.trim()) return;
    if (showLoading) setTemplateLoading(true);
    setError('');
    try {
      const rendered = await vulnApi.renderThreatModelTemplate(templateId, { case_id: targetCaseId.trim() });
      setThreatModel(rendered.content || DEFAULT_THREAT_MODEL);
    } catch (err: any) {
      setThreatModel(DEFAULT_THREAT_MODEL);
      setError(err?.message || '渲染威胁模型模板失败');
    } finally {
      if (showLoading) setTemplateLoading(false);
    }
  };

  useEffect(() => {
    void loadContext(caseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTemplateChange = async (value: string) => {
    setSelectedTemplateId(value);
    await renderTemplate(value);
  };

  const handleSubmit = async () => {
    if (!context || !canCreate) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = await vulnApi.createAutoVerifyTask(context.case_id, {
        name: taskName.trim(),
        threat_model_markdown: threatModel.trim() || null,
        template_id: selectedTemplateId || null,
        model: model.trim() || DEFAULT_MODEL,
        concurrency: normalizeConcurrency(concurrency),
        advance_to_validation: advanceToValidation,
      });
      setSuccess(payload);
    } catch (err: any) {
      setError(err?.message || '创建自动化验证任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (context?.case_id) localStorage.setItem(ANALYSIS_DETAIL_TARGET_KEY, context.case_id);
    localStorage.setItem('chimera-vuln-open-verification-case-id', context?.case_id || caseId);
    onNavigateToView?.('vuln-verification-detail');
  };

  return (
    <div
      className="min-h-full p-6 xl:p-8"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PageHeader
          title="新建自动化验证任务"
          description="从单个验证案例自动获取源码/二进制路径，编辑威胁模型后创建漏洞验证任务。"
          back={{ label: '返回验证详情', onClick: goBack }}
          actions={<button
            type="button"
            onClick={() => void loadContext(caseId)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = LK.primary;
              e.currentTarget.style.color = LK.ink;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = LK.border;
              e.currentTarget.style.color = LK.body;
            }}
          >
            <RefreshCw size={14} />
            重新加载
          </button>}
        />

        {error ? (
          <div
            className="rounded-lg px-4 py-3 text-sm font-semibold"
            style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{ backgroundColor: `${LK.success}14`, border: `1px solid ${LK.success}40`, color: LK.success }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} /> 自动化验证任务已创建
            </div>
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
              <div>任务 ID：<span className="font-mono">{success.vuln_verify_task_id || '-'}</span></div>
              <div>报告数据：<span className="font-mono">{success.report_data_url || '-'}</span></div>
              <div className="md:col-span-2">威胁模型：<span className="font-mono">{success.threat_path || '-'}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigateToView?.('pentest-vuln-verify')}
                className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.success, color: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3aa060')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = LK.success)}
              >
                查看验证任务
              </button>
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{ backgroundColor: 'transparent', border: `1px solid ${LK.success}`, color: LK.success }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor =`${LK.success}14`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                返回验证详情
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div
            className="flex h-80 items-center justify-center rounded-xl"
            style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surface, color: LK.muted }}
          >
            <Loader2 className="mr-3 animate-spin" size={20} /> 加载案例验证上下文...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <section className="space-y-4 rounded-xl p-5" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: LK.muted }}>
                  案例上下文
                </div>
                <h2 className="mt-2 text-lg font-semibold" style={{ color: LK.ink }}>
                  {context?.case_title || caseId || '未选择案例'}
                </h2>
                <div className="mt-2 text-xs" style={{ color: LK.muted }}>
                  Case ID：<span className="font-mono">{context?.case_id || caseId}</span>
                </div>
              </div>

              <div className="space-y-3">
                <PathCard label="源码路径 source_root" value={context?.source_root} status={context?.path_status?.source_root} missingLabel="未解析（必需）" />
                <PathCard label="二进制路径 binary_root" value={context?.binary_root} status={context?.path_status?.binary_root} optional missingLabel="未提供（可选）" />
              </div>

              <div className="rounded-lg p-4" style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>
                  <FileText size={14} /> 报告预览
                </div>
                <pre
                  className="max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs leading-5"
                  style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surface, color: LK.body, fontFamily: MONO }}
                >
                  {context?.report_preview || '暂无报告预览'}
                </pre>
              </div>
            </section>

            <section className="rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="px-5 py-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: LK.muted }}>
                      Threat Model
                    </div>
                    <h3 className="mt-1 text-lg font-semibold" style={{ color: LK.ink }}>
                      威胁模型编辑
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTemplateId}
                      onChange={(event) => void handleTemplateChange(event.target.value)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-colors"
                      style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    >
                      <option value="">选择模板</option>
                      {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => void renderTemplate(selectedTemplateId)}
                      disabled={!selectedTemplateId || templateLoading}
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                      onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                    >
                      {templateLoading ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                      渲染模板
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <textarea
                  value={threatModel}
                  onChange={(event) => setThreatModel(event.target.value)}
                  rows={28}
                  className="min-h-[620px] w-full resize-y rounded-lg px-4 py-4 text-sm leading-6 outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}`, fontFamily: MONO }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  placeholder="请填写威胁模型 Markdown..."
                />
              </div>
            </section>

            <section className="space-y-4 rounded-xl p-5" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: LK.muted }}>
                  任务配置
                </div>
                <h3 className="mt-1 text-lg font-semibold" style={{ color: LK.ink }}>
                  漏洞验证任务
                </h3>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>
                  任务名称
                </span>
                <input
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>
                  模型
                </span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}`, fontFamily: MONO }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: LK.muted }}>
                  并发数
                </span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={concurrency}
                  onChange={(event) => setConcurrency(normalizeConcurrency(Number(event.target.value)))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                />
              </label>
              <label className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold" style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.body }}>
                <input type="checkbox" checked={advanceToValidation} onChange={(event) => setAdvanceToValidation(event.target.checked)} />
                创建后推进案例到验证阶段
              </label>

              <div className="rounded-lg p-4 text-xs" style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.body }}>
                <div className="mb-2 flex items-center gap-2 font-semibold" style={{ color: LK.ink }}>
                  <ShieldCheck size={14} /> 创建前校验
                </div>
                <ul className="space-y-1">
                  <li>源码路径：{context?.path_status?.source_root?.ok ? '已解析' : '缺失'}</li>
                  <li>二进制路径：{context?.path_status?.binary_root?.ok ? '已解析' : '未提供（可选）'}</li>
                  <li>威胁模型：{threatModel.trim() ? `${threatModel.length} 字符` : '未填写（将使用内置威胁模型）'}</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canCreate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                创建自动化验证任务
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

function PathCard({
  label,
  value,
  status,
  optional = false,
  missingLabel,
}: {
  label: string;
  value?: string | null;
  status?: { ok: boolean; source?: string | null; message?: string | null };
  optional?: boolean;
  missingLabel?: string;
}) {
  const ok = Boolean(status?.ok || value);
  const tone = optional && !ok
    ? { border: LK.border, bg: LK.surfaceRaised, text: LK.mutedSoft }
    : statusTone(ok);
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ border: `1px solid ${tone.border}`, backgroundColor: tone.bg, color: tone.text }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 break-all text-xs font-semibold" style={{ fontFamily: MONO }}>
        {value || missingLabel || (optional ? '未提供（可选）' : '未解析（必需）')}
      </div>
      {status?.source ? <div className="mt-2 text-[11px] opacity-70">来源：{status.source}</div> : null}
    </div>
  );
}