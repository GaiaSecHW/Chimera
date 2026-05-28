import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../../clients/api';
import {
  ACTION_TYPE_LABELS,
  DECISION_LABELS,
  STAGE_LABELS,
  DEFAULT_CASE_FORM,
  DEFAULT_DECISION_FORM,
  DEFAULT_DISPATCH_FORM,
  DEFAULT_SERVICE_FORM,
  DEFAULT_TASK_FORM,
  DEFAULT_VALIDATION_FORM,
  FINISHED_REASON_LABELS,
  FINISHED_REASON_OPTIONS,
  LIFECYCLE_NAV_ITEMS,
  LIFECYCLE_STAGE_FLOW,
  LIFECYCLE_VIEW_STAGE_MAP,
  REPRO_ACTION_TYPES,
  STAGE_OPTIONS,
  StatCards,
  TRIAGE_GATE_LABELS,
  VALIDATION_RESULT_LABELS,
  VALIDATION_RESULT_OPTIONS,
  WORKSPACE_VIEWS,
  WorkspaceViewKey,
  labelOf,
} from './vuln-engine/shared';

const vulnApi = api.domains.vuln;
const executionApi = api.domains.execution;
import {
  OverviewWorkspace,
  QueueWorkspace,
  ReproConfigWorkspace,
  ServicesWorkspace,
  TasksWorkspace,
} from './vuln-engine/WorkspaceViews';
import { CasesWorkspace } from './vuln-engine/CasesWorkspace';
import { VulnCaseDetailLayout } from './vuln-engine/VulnCaseDetailLayout';

interface VulnEnginePageProps {
  projectId: string;
  currentViewId?: string;
  onNavigateToView?: (view: string) => void;
  initialWorkspaceView?: WorkspaceViewKey;
  initialSelectedCaseId?: string;
  hideLifecycleChrome?: boolean;
  hidePhaseContext?: boolean;
  hideCasePool?: boolean;
  pageTitle?: string;
  pageDescription?: string;
  showWorkspaceTabs?: boolean;
  showStats?: boolean;
  casePoolTitle?: string;
  casePoolDescription?: string;
  stageScope?: string[];
  defaultStageFilter?: string;
  lockStageFilter?: boolean;
  hideStageFilter?: boolean;
  showCreateCaseForm?: boolean;
  initialServiceForm?: Partial<typeof DEFAULT_SERVICE_FORM>;
  phaseHighlights?: string[];
  phaseActions?: string[];
  phaseActionLinks?: Array<{ label: string; view: string }>;
  phasePresetLabel?: string;
  preferredActionType?: string;
  preferredTaskType?: string;
  compactCaseLayout?: boolean;
  showPhasePreset?: boolean;
  listEntryMode?: boolean;
  preserveLifecycleProgressBand?: boolean;
  detailTargetView?: string;
  detailStorageKey?: string;
  detailEntryLabel?: string;
  summaryCards?: Array<{
    label: string;
    source: string;
    helper?: string;
  }>;
}

export const VulnEnginePage: React.FC<VulnEnginePageProps> = ({
  projectId,
  currentViewId,
  onNavigateToView,
  initialWorkspaceView = 'overview',
  initialSelectedCaseId,
  hideLifecycleChrome = false,
  hidePhaseContext = false,
  hideCasePool = false,
  pageTitle = '漏洞编排控制台',
  pageDescription = '统一观察案例阶段推进、外部能力服务注册、动作派发、人工任务与裁决动作，让漏洞生命周期真正跑起来。',
  showWorkspaceTabs = true,
  showStats,
  casePoolTitle = '案例池',
  casePoolDescription = '按阶段和关键词过滤，快速切换当前运行中的案例',
  stageScope,
  defaultStageFilter = 'all',
  lockStageFilter = false,
  hideStageFilter = false,
  showCreateCaseForm = true,
  initialServiceForm,
  phaseHighlights = [],
  phaseActions = [],
  phaseActionLinks = [],
  phasePresetLabel,
  preferredActionType,
  preferredTaskType,
  compactCaseLayout = false,
  showPhasePreset = true,
  listEntryMode = false,
  preserveLifecycleProgressBand = false,
  detailTargetView,
  detailStorageKey,
  detailEntryLabel = '查看详情',
  summaryCards = [],
}) => {
  const mergedServiceForm = useMemo(
    () => ({ ...DEFAULT_SERVICE_FORM, ...(initialServiceForm || {}) }),
    [initialServiceForm],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<any | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [manualTasks, setManualTasks] = useState<any[]>([]);
  const [projectActions, setProjectActions] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<any | null>(null);
  const [selectedCaseTimeline, setSelectedCaseTimeline] = useState<any[]>([]);
  const [recommendedActions, setRecommendedActions] = useState<any[]>([]);
  const [caseReports, setCaseReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [reportDocument, setReportDocument] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceViewKey>(initialWorkspaceView);
  const [caseSearch, setCaseSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(defaultStageFilter);
  const [actionQueueFilter, setActionQueueFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'timeline' | 'results' | 'tasks' | 'actions'>('timeline');
  const [caseForm, setCaseForm] = useState(DEFAULT_CASE_FORM);
  const [serviceForm, setServiceForm] = useState(mergedServiceForm);
  const [dispatchForm, setDispatchForm] = useState({
    ...DEFAULT_DISPATCH_FORM,
    action_type: preferredActionType || '',
  });
  const [taskForm, setTaskForm] = useState({
    ...DEFAULT_TASK_FORM,
    task_type: preferredTaskType || DEFAULT_TASK_FORM.task_type,
  });
  const [decisionForm, setDecisionForm] = useState(DEFAULT_DECISION_FORM);
  const [validationForm, setValidationForm] = useState(DEFAULT_VALIDATION_FORM);
  const [submittingCase, setSubmittingCase] = useState(false);
  const [submittingService, setSubmittingService] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [submittingValidation, setSubmittingValidation] = useState(false);
  const [submittingFinish, setSubmittingFinish] = useState(false);
  const [transitioningStage, setTransitioningStage] = useState(false);
  const [serviceOperatingId, setServiceOperatingId] = useState<string | null>(null);
  const [taskOperatingId, setTaskOperatingId] = useState<string | null>(null);
  const [callbackingActionId, setCallbackingActionId] = useState<string | null>(null);
  const [actionOperatingId, setActionOperatingId] = useState<string | null>(null);
  const [autoOrchestrating, setAutoOrchestrating] = useState(false);
  const [finishForm, setFinishForm] = useState({
    finished_reason: FINISHED_REASON_OPTIONS[FINISHED_REASON_OPTIONS.length - 1] || 'manual_terminated',
    summary: '',
  });
  const [selectedEvolutionCaseIds, setSelectedEvolutionCaseIds] = useState<string[]>([]);
  const [showEvolutionDialog, setShowEvolutionDialog] = useState(false);
  const [evolutionPreview, setEvolutionPreview] = useState<any | null>(null);
  const [evolutionSubmitting, setEvolutionSubmitting] = useState(false);
  const [evolutionForm, setEvolutionForm] = useState({
    title: '',
    objective: '',
    minRounds: 1,
    maxRounds: 3,
    maxConcurrentSourceTasks: 4,
  });
  const selectedCase = cases.find((item) => item.id === selectedCaseId) || null;
  const selectedEvolutionCases = cases.filter((item) => selectedEvolutionCaseIds.includes(item.id));
  const selectedTimeline = selectedCaseTimeline || [];
  const resultItems = selectedCaseDetail?.results || [];
  const taskItems = selectedCaseDetail?.manual_tasks || [];
  const actionItems = selectedCaseDetail?.actions || [];
  const stageSpecificPanel = useMemo(() => {
    if (!selectedCaseDetail) return null;
    const stage = selectedCaseDetail.current_stage;
    const latestResult = resultItems[0] || null;
    const latestValidationLikeResult = resultItems.find((item) =>
      ['validation', 'proof_verification', 'timeout'].includes(item.result_type),
    );
    const recommendedActionTags = recommendedActions
      .slice(0, 4)
      .map((item) => labelOf(item.action_type, ACTION_TYPE_LABELS));
    const openTaskCount = taskItems.filter((item) => !['completed', 'closed'].includes(item.status)).length;
    const runningActionCount = actionItems.filter((item) => ['queued', 'running'].includes(item.execution_status)).length;

    const chips = (items: string[], emptyLabel: string) =>
      items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-400">
          {emptyLabel}
        </div>
      );

    if (stage === 'triage') {
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">研判结论</div>
            <div className="mt-2 text-sm font-black text-slate-900">
              {labelOf(selectedCaseDetail.decision_status, DECISION_LABELS)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              准入 Gate：{labelOf(selectedCaseDetail.triage_gate, TRIAGE_GATE_LABELS)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">推荐动作</div>
              <div className="mt-2 text-lg font-black text-slate-900">{recommendedActions.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">待处理人工任务</div>
              <div className="mt-2 text-lg font-black text-slate-900">{openTaskCount}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">推荐动作清单</div>
            {chips(recommendedActionTags, '当前还没有推荐动作，可先从报告与证据中补齐研判依据。')}
          </div>
        </div>
      );
    }

    if (stage === 'validation') {
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">验证结论</div>
            <div className="mt-2 text-sm font-black text-slate-900">
              {labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              最新验证反馈：{latestValidationLikeResult?.summary || latestResult?.summary || '暂无回传结果'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">运行中动作</div>
              <div className="mt-2 text-lg font-black text-slate-900">{runningActionCount}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">人工验证任务</div>
              <div className="mt-2 text-lg font-black text-slate-900">{openTaskCount}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">已覆盖能力</div>
            {chips(
              actionItems.slice(0, 5).map((item) => labelOf(item.action_type, ACTION_TYPE_LABELS)),
              '当前还没有验证类动作记录。',
            )}
          </div>
        </div>
      );
    }

    if (stage === 'finished') {
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">最终结论</div>
            <div className="mt-2 text-sm font-black text-slate-900">
              {labelOf(selectedCaseDetail.decision_status, DECISION_LABELS)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              结束原因：{labelOf(selectedCaseDetail.finished_reason, FINISHED_REASON_LABELS)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">验证结果</div>
              <div className="mt-2 text-sm font-black text-slate-900">
                {labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">历史报告数</div>
              <div className="mt-2 text-lg font-black text-slate-900">{caseReports.length}</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-xs leading-6 text-slate-600">
            {latestResult?.summary || selectedCaseDetail.summary || '当前案例已结束，但暂无额外的终态摘要。'}
          </div>
        </div>
      );
    }

    return null;
  }, [actionItems, caseReports.length, recommendedActions, resultItems, selectedCaseDetail, taskItems]);
  const automationEvents = selectedTimeline.filter((item) => item.item_type === 'event' && item.payload?.event_type === 'automation_rule_applied');
  const allowedStageOptions = stageScope?.length ? ['all', ...stageScope] : STAGE_OPTIONS;
  const effectiveListEntryMode = listEntryMode;
  const effectiveCompactCaseLayout = compactCaseLayout || effectiveListEntryMode;
  const effectiveShowStats = showStats ?? (workspaceView === 'overview' || workspaceView === 'cases');
  const stageScopeCount = (stageScope?.length ? stageScope : []).reduce(
    (acc, stage) => acc + Number(overview?.stage_counts?.[stage] || 0),
    0,
  );
  const resolveSummaryValue = (source: string) => {
    if (source.startsWith('stage:')) {
      return Number(overview?.stage_counts?.[source.slice(6)] || 0);
    }
    if (source.startsWith('metric:')) {
      return Number(overview?.metrics?.[source.slice(7)] || 0);
    }
    if (source === 'scope_count') {
      return stageScopeCount;
    }
    if (source === 'scope_size') {
      return stageScope?.length || 0;
    }
    return 0;
  };
  const countForLifecycleView = (view: string) => {
    const stages = LIFECYCLE_VIEW_STAGE_MAP[view] || [];
    if (stages.length === 0) {
      if (view === 'vuln-queue') return Number(overview?.metrics?.queued_actions || 0);
      if (view === 'vuln-services') return Number(overview?.metrics?.registered_services || 0);
      return 0;
    }
    return stages.reduce((acc, stage) => acc + Number(overview?.stage_counts?.[stage] || 0), 0);
  };

  const loadWorkspace = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      await vulnApi.vuln.reconcileActionTimeouts({ project_id: projectId });
      const [overviewResp, caseResp, serviceResp, taskResp] = await Promise.all([
        vulnApi.vuln.getOverview(projectId),
        vulnApi.vuln.listCases({ project_id: projectId }),
        vulnApi.vuln.listServices(),
        vulnApi.vuln.listManualTasks({ project_id: projectId }),
      ]);
      setOverview(overviewResp);
      setCases(caseResp.items || []);
      setSelectedEvolutionCaseIds((current) => current.filter((caseId) => (caseResp.items || []).some((item: any) => item.id === caseId)));
      setServices(serviceResp.items || []);
      setManualTasks(taskResp.items || []);
      const actionResp = await vulnApi.vuln.listActionQueue({
        project_id: projectId,
        execution_status: actionQueueFilter === 'all' ? undefined : actionQueueFilter,
      });
      setProjectActions(actionResp.items || []);
      if (!effectiveListEntryMode && !selectedCaseId && caseResp.items?.length > 0) {
        setSelectedCaseId(caseResp.items[0].id);
      }
    } catch (err: any) {
      setError(err?.message || '加载漏洞引擎工作台失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCaseDetail = async (caseId: string) => {
    if (!caseId) {
      setSelectedCaseDetail(null);
      setSelectedCaseTimeline([]);
      setRecommendedActions([]);
      return;
    }
    try {
      const [detail, timeline, recommendations, reports] = await Promise.all([
        vulnApi.vuln.getCaseDetail(caseId),
        vulnApi.vuln.getCaseTimeline(caseId),
        vulnApi.vuln.getRecommendedActions(caseId),
        vulnApi.vuln.listCaseReports(caseId),
      ]);
      setSelectedCaseDetail(detail);
      setSelectedCaseTimeline(timeline.items || []);
      setRecommendedActions(recommendations.items || []);
      const reportItems = reports.items || [];
      setCaseReports(reportItems);
      const initialReportId = reports.current_report_id || detail?.report_summary?.report_id || reportItems[0]?.report_id || '';
      setSelectedReportId(initialReportId);
    } catch (err: any) {
      setError(err?.message || '加载案例详情失败');
    }
  };

  const loadCaseReport = async (caseId: string, reportId: string) => {
    if (!caseId || !reportId) {
      setReportDocument(null);
      return;
    }
    setReportLoading(true);
    setReportError(null);
    try {
      const payload = await vulnApi.vuln.getCaseReport(caseId, reportId);
      setReportDocument(payload);
    } catch (err: any) {
      setReportError(err?.message || '加载报告失败');
      setReportDocument(null);
    } finally {
      setReportLoading(false);
    }
  };

  const toggleEvolutionCaseId = (caseId: string, checked: boolean) => {
    setSelectedEvolutionCaseIds((current) => {
      if (checked) return Array.from(new Set([...current, caseId]));
      return current.filter((item) => item !== caseId);
    });
  };

  const toggleAllVisibleEvolutionCaseIds = (checked: boolean, caseIds: string[]) => {
    setSelectedEvolutionCaseIds((current) => {
      const visibleIds = Array.from(new Set(caseIds.filter(Boolean)));
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((item) => !visibleIds.includes(item));
    });
  };

  const clearEvolutionSelection = () => {
    setSelectedEvolutionCaseIds([]);
  };

  const handlePreviewEvolution = async () => {
    if (!selectedEvolutionCaseIds.length) return;
    setEvolutionSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = await executionApi.binaryEvolution.previewTask(projectId, selectedEvolutionCaseIds);
      setEvolutionPreview(payload);
    } catch (err: any) {
      setError(err?.message || '进化任务预览失败');
    } finally {
      setEvolutionSubmitting(false);
    }
  };

  const handleCreateEvolution = async () => {
    const effectiveCaseIds = evolutionPreview?.effective_case_ids?.length ? evolutionPreview.effective_case_ids : selectedEvolutionCaseIds;
    if (!effectiveCaseIds.length) return;
    setEvolutionSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await executionApi.binaryEvolution.createTask(projectId, {
        case_ids: effectiveCaseIds,
        title: evolutionForm.title.trim() || `Evolution of ${selectedEvolutionCaseIds.length} cases`,
        objective: evolutionForm.objective.trim(),
        min_rounds: Math.max(1, Number(evolutionForm.minRounds) || 1),
        max_rounds: Math.max(1, Number(evolutionForm.maxRounds) || 1),
        max_concurrent_source_tasks: Math.max(1, Number(evolutionForm.maxConcurrentSourceTasks) || 1),
        metrics: {
          false_negative_rate: true,
          false_positive_rate: true,
          avg_discovery_round: true,
        },
      });
      setSuccessMessage(`已创建进化任务 ${created.task_id}`);
      setShowEvolutionDialog(false);
      setEvolutionPreview(null);
      setSelectedEvolutionCaseIds([]);
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', {
        detail: {
          view: 'binary-evolution-dataflow-vuln',
          binaryEvolutionTaskId: created.task_id,
        },
      }));
    } catch (err: any) {
      setError(err?.message || '创建进化任务失败');
    } finally {
      setEvolutionSubmitting(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [projectId, actionQueueFilter]);

  useEffect(() => {
    setWorkspaceView(initialWorkspaceView);
  }, [initialWorkspaceView]);

  useEffect(() => {
    if (initialSelectedCaseId) {
      setSelectedCaseId(initialSelectedCaseId);
    }
  }, [initialSelectedCaseId]);

  useEffect(() => {
    setStageFilter(defaultStageFilter);
  }, [defaultStageFilter]);

  useEffect(() => {
    setServiceForm(mergedServiceForm);
  }, [mergedServiceForm]);

  useEffect(() => {
    setDispatchForm((prev) => ({
      ...prev,
      action_type: preferredActionType || '',
    }));
  }, [preferredActionType]);

  useEffect(() => {
    setTaskForm((prev) => ({
      ...prev,
      task_type: preferredTaskType || DEFAULT_TASK_FORM.task_type,
    }));
  }, [preferredTaskType]);

  useEffect(() => {
    setValidationForm(DEFAULT_VALIDATION_FORM);
  }, [selectedCaseId]);

  useEffect(() => {
    if (effectiveListEntryMode) return;
    if (selectedCaseId) {
      loadCaseDetail(selectedCaseId);
    }
  }, [selectedCaseId, effectiveListEntryMode]);

  useEffect(() => {
    if (!selectedCaseId || !selectedReportId) {
      setReportDocument(null);
      return;
    }
    loadCaseReport(selectedCaseId, selectedReportId);
  }, [selectedCaseId, selectedReportId]);

  const refreshAll = async () => {
    await loadWorkspace();
    if (selectedCaseId) {
      await loadCaseDetail(selectedCaseId);
    }
  };

  const handleCreateCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSubmittingCase(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await vulnApi.vuln.createCase({
        project_id: projectId,
        report_id: `manual-${Date.now()}`,
        title: caseForm.title,
        summary: caseForm.summary,
        severity: caseForm.severity,
        confidence: Number(caseForm.confidence),
        state: 'suspected',
        category: 'manual_suspicion',
        reporter: {
          name: caseForm.source_service || 'manual-console',
          version: '1.0.0',
          type: 'human',
        },
        subject: {
          type: caseForm.asset_type,
          locator: caseForm.asset_locator,
        },
        evidence: {
          summary: caseForm.summary,
          references: [],
        },
        artifacts: [],
        metadata: {
          source: {
            source_service: caseForm.source_service,
            source_kind: 'manual',
          },
        },
      });
      setCaseForm(DEFAULT_CASE_FORM);
      await loadWorkspace();
      setSelectedCaseId(created.id);
      setSuccessMessage(`案例“${created.title || caseForm.title}”已创建并进入漏洞生命周期。`);
    } catch (err: any) {
      setError(err?.message || '创建案例失败');
    } finally {
      setSubmittingCase(false);
    }
  };

  const handleRegisterService = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittingService(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const exists = services.some((item) => item.service_id === serviceForm.service_id);
      await vulnApi.vuln.registerService({
        service_id: serviceForm.service_id,
        service_name: serviceForm.service_name,
        service_type: serviceForm.service_type,
        endpoint: serviceForm.endpoint,
        healthcheck_url: serviceForm.healthcheck_url || undefined,
        callback_mode: serviceForm.callback_mode,
        auth_mode: serviceForm.auth_mode,
        version: serviceForm.version,
        meta: {
          module_role: serviceForm.module_role,
          bind_stage: serviceForm.bind_stage,
          report_channel: serviceForm.report_channel,
          association_note: serviceForm.association_note,
        },
        capabilities: [
          {
            capability_code: serviceForm.capability_code,
            action_type: serviceForm.action_type,
            priority: Number(serviceForm.priority) || 100,
            timeout_seconds: Number(serviceForm.timeout_seconds) || 300,
            concurrency_limit: Number(serviceForm.concurrency_limit) || 1,
            input_schema_meta: {},
            output_schema_meta: {},
            meta: {
              bind_stage: serviceForm.bind_stage,
              report_channel: serviceForm.report_channel,
              module_role: serviceForm.module_role,
            },
          },
        ],
      });
      setServiceForm(mergedServiceForm);
      await loadWorkspace();
      setSuccessMessage(`能力服务 "${serviceForm.service_name}" 已${exists ? '更新' : '注册'}，并绑定到 ${serviceForm.bind_stage} 阶段。`);
    } catch (err: any) {
      setError(err?.message || '注册能力服务失败');
    } finally {
      setSubmittingService(false);
    }
  };

  const handleDispatch = async () => {
    if (!selectedCaseId) return;
    setDispatching(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.dispatchActions(selectedCaseId, {
        action_type: dispatchForm.action_type || undefined,
        service_id: dispatchForm.service_id || undefined,
      });
      await refreshAll();
      setSuccessMessage(`已为当前案例派发${dispatchForm.action_type ? `“${labelOf(dispatchForm.action_type, ACTION_TYPE_LABELS)}”` : '默认'}动作。`);
    } catch (err: any) {
      setError(err?.message || '派发动作失败');
    } finally {
      setDispatching(false);
    }
  };

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return;
    setCreatingTask(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.createManualTask(selectedCaseId, {
        task_type: taskForm.task_type,
        title: taskForm.title,
        summary: taskForm.summary,
        assignee: taskForm.assignee || undefined,
        context: {},
      });
      setTaskForm(DEFAULT_TASK_FORM);
      await refreshAll();
      setActiveTab('tasks');
      setSuccessMessage(`人工任务 "${taskForm.title}" 已创建。`);
    } catch (err: any) {
      setError(err?.message || '创建人工任务失败');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleSubmitDecision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return;
    setSubmittingDecision(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.submitDecision(selectedCaseId, decisionForm);
      await refreshAll();
      setSuccessMessage(`已提交人工裁决：${decisionForm.decision_status}。`);
    } catch (err: any) {
      setError(err?.message || '提交决策失败');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleTaskStatus = async (taskId: string, status: string) => {
    if (!selectedCaseId) return;
    setTaskOperatingId(taskId);
    setError(null);
    try {
      await vulnApi.vuln.updateManualTaskStatus(selectedCaseId, taskId, { status });
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || '更新人工任务状态失败');
    } finally {
      setTaskOperatingId(null);
    }
  };

  const handleSubmitValidationResult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return;
    setSubmittingValidation(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.submitValidationResult(selectedCaseId, {
        validation_result: validationForm.validation_result,
        summary: validationForm.summary || undefined,
      });
      await refreshAll();
      setSuccessMessage(`已提交验证结论：${labelOf(validationForm.validation_result, {
        vulnerable: '验证成立',
        not_vulnerable: '验证不成立',
        inconclusive: '结论不确定',
      })}。`);
    } catch (err: any) {
      setError(err?.message || '提交验证结论失败');
    } finally {
      setSubmittingValidation(false);
    }
  };

  const handleServiceHeartbeat = async (serviceId: string) => {
    setServiceOperatingId(serviceId);
    setError(null);
    try {
      await vulnApi.vuln.heartbeatService(serviceId);
      await loadWorkspace();
    } catch (err: any) {
      setError(err?.message || '服务心跳刷新失败');
    } finally {
      setServiceOperatingId(null);
    }
  };

  const handleServiceUnregister = async (serviceId: string) => {
    setServiceOperatingId(serviceId);
    setError(null);
    try {
      await vulnApi.vuln.unregisterService(serviceId);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || '注销能力服务失败');
    } finally {
      setServiceOperatingId(null);
    }
  };

  const handleSimulateActionResult = async (action: any, status: 'succeeded' | 'failed') => {
    setCallbackingActionId(action.id);
    setError(null);
    try {
      const actionType = action.action_type || 'analysis';
      const resultType = actionType.includes('poc') ? 'poc'
        : actionType.includes('exp') ? 'exp'
          : actionType.includes('validation') || actionType.includes('proof') ? 'validation'
            : actionType.includes('feedback') ? 'feedback'
              : 'analysis';
      const suggestedStage = status === 'failed'
        ? selectedCaseDetail?.current_stage
        : resultType === 'analysis'
          ? 'triage'
          : resultType === 'validation'
            ? 'validation'
            : resultType === 'poc' || resultType === 'exp'
              ? 'validation'
              : selectedCaseDetail?.current_stage;
      await vulnApi.vuln.submitActionCallback(action.id, {
        source_service_id: action.target_service_id,
        result_type: resultType,
        status,
        summary: `${labelOf(action.action_type, ACTION_TYPE_LABELS)}${status === 'succeeded' ? '执行成功' : '模拟执行失败'}`,
        confidence: status === 'succeeded' ? 82 : 35,
        suggested_stage: suggestedStage,
        suggested_decision: status === 'succeeded' && (resultType === 'poc' || resultType === 'exp') ? 'confirmed' : undefined,
        result_meta: {
          simulated: true,
          action_type: action.action_type,
          stage: action.stage,
        },
        raw_payload: {
          operator: 'frontend',
        },
        artifact_refs: [],
      });
      await refreshAll();
      setActiveTab('results');
    } catch (err: any) {
      setError(err?.message || '提交模拟结果失败');
    } finally {
      setCallbackingActionId(null);
    }
  };

  const handleStageTransition = async (toStage: string) => {
    if (!selectedCaseId) return;
    setTransitioningStage(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.transitionStage(selectedCaseId, {
        to_stage: toStage,
        reason: 'frontend_manual_transition',
      });
      await refreshAll();
      setSuccessMessage(`当前案例已推进到“${labelOf(toStage, STAGE_LABELS)}”阶段。`);
    } catch (err: any) {
      setError(err?.message || '阶段切换失败');
    } finally {
      setTransitioningStage(false);
    }
  };

  const handleFinishCase = async () => {
    if (!selectedCaseId) return;
    if (!finishForm.summary.trim()) {
      setError('结束漏洞时必须填写结束说明。');
      return;
    }
    setSubmittingFinish(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.finishCase(selectedCaseId, {
        finished_reason: finishForm.finished_reason,
        summary: finishForm.summary.trim(),
      });
      await refreshAll();
      setSuccessMessage('漏洞案例已结束。');
    } catch (err: any) {
      setError(err?.message || '结束漏洞失败');
    } finally {
      setSubmittingFinish(false);
    }
  };

  const filteredCases = cases.filter((item) => {
    if (stageScope?.length && !stageScope.includes(item.current_stage)) return false;
    if (stageFilter !== 'all' && item.current_stage !== stageFilter) return false;
    if (!caseSearch.trim()) return true;
    const keyword = caseSearch.trim().toLowerCase();
    return [
      item.title,
      item.summary,
      item.severity,
      item.decision_status,
      item.subject?.locator,
      item.reporter?.name,
    ]
      .filter(Boolean)
      .some((field: string) => String(field).toLowerCase().includes(keyword));
  });

  const nextStageMap: Record<string, string[]> = {
    receive: ['triage'],
    triage: ['validation', 'finished'],
    validation: ['finished'],
    finished: [],
  };

  const quickDispatchServices = services.filter((service) =>
    (service.capabilities || []).some((cap: any) =>
      !dispatchForm.action_type || cap.action_type === dispatchForm.action_type,
    ),
  );

  const reproServices = services.filter((service) =>
    (service.capabilities || []).some((cap: any) => REPRO_ACTION_TYPES.includes(cap.action_type)),
  );

  const handleActionControl = async (actionId: string, operation: 'retry' | 'cancel') => {
    setActionOperatingId(actionId);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.controlAction(actionId, { operation });
      await refreshAll();
      setSuccessMessage(`动作已执行${operation === 'retry' ? '重试' : '取消'}操作。`);
      if (operation === 'retry') {
        setActiveTab('actions');
      }
    } catch (err: any) {
      setError(err?.message || '更新动作状态失败');
    } finally {
      setActionOperatingId(null);
    }
  };

  const handleAutoOrchestrate = async () => {
    if (!selectedCaseId) return;
    setAutoOrchestrating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.autoOrchestrate(selectedCaseId);
      await refreshAll();
      setActiveTab('actions');
      setSuccessMessage('已按当前阶段和能力路由执行自动编排。');
    } catch (err: any) {
      setError(err?.message || '自动编排失败');
    } finally {
      setAutoOrchestrating(false);
    }
  };

  const handleOpenCaseDetail = (caseId: string) => {
    if (!detailTargetView || !detailStorageKey) return;
    localStorage.setItem(detailStorageKey, caseId);
    onNavigateToView?.(detailTargetView);
  };

  return (
    <div className={`${effectiveListEntryMode ? 'p-6 pb-16 space-y-5' : 'p-10 pb-24 space-y-8'} animate-in fade-in duration-500`}>
      <div className="flex flex-col 2xl:flex-row 2xl:items-end 2xl:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-xs font-black tracking-widest uppercase">
            <Cpu size={14} />
            生命周期引擎
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight mt-4">{pageTitle}</h2>
          <p className="text-slate-500 mt-2 font-medium max-w-3xl">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={refreshAll}
            className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-black flex items-center gap-2 shadow-lg shadow-slate-900/10"
          >
            <RefreshCw size={16} />
            刷新工作台
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {(!effectiveListEntryMode || preserveLifecycleProgressBand) && !hideLifecycleChrome && <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm px-4 py-3">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">生命周期进度带</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {LIFECYCLE_STAGE_FLOW.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigateToView?.(item.view)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black ${
                currentViewId === item.view
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>}

      {!effectiveListEntryMode && summaryCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {summaryCards.map((card) => (
            <div key={`${card.label}-${card.source}`} className="rounded-[2rem] border border-slate-200 bg-white shadow-sm p-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</div>
              <div className="mt-3 text-4xl font-black text-slate-800">{resolveSummaryValue(card.source)}</div>
              {card.helper && <div className="mt-2 text-sm text-slate-500">{card.helper}</div>}
            </div>
          ))}
        </div>
      )}

      {!effectiveListEntryMode && !hideLifecycleChrome && <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6 items-start">
        <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">生命周期导航</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {LIFECYCLE_NAV_ITEMS.map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigateToView?.(item.view)}
                className={`rounded-[1.5rem] border px-4 py-4 text-left transition-all ${
                  currentViewId === item.view
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className={`text-sm font-black ${currentViewId === item.view ? 'text-white' : 'text-slate-800'}`}>{item.label}</div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                    currentViewId === item.view ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {countForLifecycleView(item.view)}
                  </span>
                </div>
                <div className={`mt-2 text-xs leading-5 ${currentViewId === item.view ? 'text-slate-300' : 'text-slate-500'}`}>{item.description}</div>
              </button>
            ))}
          </div>
        </div>
        {showWorkspaceTabs && (
          <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">页面分区</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {WORKSPACE_VIEWS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setWorkspaceView(item.key)}
                  className={`px-4 py-3 rounded-2xl text-sm font-black ${workspaceView === item.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>}

      {!effectiveListEntryMode && !hidePhaseContext && (phaseHighlights.length > 0 || phaseActions.length > 0 || stageScope?.length) && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm p-6">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">阶段关注点</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(stageScope?.length ? stageScope : [defaultStageFilter]).filter(Boolean).map((stage) => (
                <span key={`scope-${stage}`} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black uppercase tracking-widest text-slate-700">
                  {stage}
                </span>
              ))}
            </div>
            {stageScope?.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">阶段内案例</div>
                  <div className="mt-1 text-2xl font-black text-slate-800">{stageScopeCount}</div>
                </div>
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">覆盖阶段数</div>
                  <div className="mt-1 text-2xl font-black text-slate-800">{stageScope.length}</div>
                </div>
              </div>
            ) : null}
            <div className="mt-5 space-y-3">
              {phaseHighlights.map((item) => (
                <div key={item} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm p-6">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">推荐动作</div>
            <div className="mt-4 space-y-3">
              {phaseActions.map((item) => (
                <div key={item} className="rounded-[1.25rem] border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
            {phaseActionLinks.length > 0 && (
              <div className="mt-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">快捷跳转</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {phaseActionLinks.map((item) => (
                    <button
                      key={`${item.view}-${item.label}`}
                      type="button"
                      onClick={() => onNavigateToView?.(item.view)}
                      className="px-3 py-2 rounded-xl bg-slate-900 text-xs font-black text-white"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!effectiveListEntryMode && effectiveShowStats && <StatCards overview={overview} />}

      {workspaceView === 'overview' && (
        <OverviewWorkspace
          overview={overview}
          projectActions={projectActions}
          manualTasks={manualTasks}
          setWorkspaceView={setWorkspaceView}
          setSelectedCaseId={setSelectedCaseId}
        />
      )}

      {workspaceView === 'cases' && (
        <CasesWorkspace
          loading={loading}
          filteredCases={filteredCases}
          cases={cases}
          casePoolTitle={casePoolTitle}
          casePoolDescription={casePoolDescription}
          phasePresetLabel={phasePresetLabel}
          preferredActionType={preferredActionType}
          preferredTaskType={preferredTaskType}
          showPhasePreset={showPhasePreset}
          stageOptions={allowedStageOptions}
          lockStageFilter={lockStageFilter}
          hideStageFilter={hideStageFilter}
          showCreateCaseForm={showCreateCaseForm}
          selectedCaseId={selectedCaseId}
          setSelectedCaseId={setSelectedCaseId}
          caseSearch={caseSearch}
          setCaseSearch={setCaseSearch}
          stageFilter={stageFilter}
          setStageFilter={setStageFilter}
          caseForm={caseForm}
          setCaseForm={setCaseForm}
          submittingCase={submittingCase}
          handleCreateCase={handleCreateCase}
          selectedCase={selectedCase}
          selectedCaseDetail={selectedCaseDetail}
          selectedTimeline={selectedTimeline}
          recommendedActions={recommendedActions}
          automationEvents={automationEvents}
          taskItems={taskItems}
          services={services}
          dispatchForm={dispatchForm}
          setDispatchForm={setDispatchForm}
          dispatching={dispatching}
          handleDispatch={handleDispatch}
          autoOrchestrating={autoOrchestrating}
          handleAutoOrchestrate={handleAutoOrchestrate}
          quickDispatchServices={quickDispatchServices}
          nextStageMap={nextStageMap}
          transitioningStage={transitioningStage}
          handleStageTransition={handleStageTransition}
          finishForm={finishForm}
          setFinishForm={setFinishForm}
          submittingFinish={submittingFinish}
          handleFinishCase={handleFinishCase}
          decisionForm={decisionForm}
          setDecisionForm={setDecisionForm}
          submittingDecision={submittingDecision}
          handleSubmitDecision={handleSubmitDecision}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          actionItems={actionItems}
          callbackingActionId={callbackingActionId}
          actionOperatingId={actionOperatingId}
          handleSimulateActionResult={handleSimulateActionResult}
          handleActionControl={handleActionControl}
          resultItems={resultItems}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          creatingTask={creatingTask}
          handleCreateTask={handleCreateTask}
          taskOperatingId={taskOperatingId}
          handleTaskStatus={handleTaskStatus}
          validationForm={validationForm}
          setValidationForm={setValidationForm}
          validationResultOptions={VALIDATION_RESULT_OPTIONS}
          submittingValidation={submittingValidation}
          handleSubmitValidationResult={handleSubmitValidationResult}
          refreshAll={refreshAll}
          overview={overview}
          compactLayout={effectiveCompactCaseLayout}
          listOnlyMode={effectiveListEntryMode}
          onOpenCaseDetail={effectiveListEntryMode && detailTargetView && detailStorageKey ? handleOpenCaseDetail : undefined}
          hideCasePool={hideCasePool}
          detailEntryLabel={detailEntryLabel}
          onOpenDedicatedDetail={detailTargetView && detailStorageKey ? handleOpenCaseDetail : undefined}
          detailContent={selectedCaseDetail ? (
            <VulnCaseDetailLayout
              projectId={projectId}
              caseDetail={selectedCaseDetail}
              timeline={selectedTimeline}
              actions={actionItems}
              results={resultItems}
              tasks={taskItems}
              recommendedActions={recommendedActions}
              reportItems={caseReports}
              reportDocument={reportDocument}
              reportLoading={reportLoading}
              reportError={reportError}
              selectedReportId={selectedReportId}
              onSelectReport={setSelectedReportId}
              onRefresh={refreshAll}
              stageActionContent={stageSpecificPanel}
            />
          ) : undefined}
          enableBulkSelection={!hideCasePool}
          selectedBulkCaseIds={selectedEvolutionCaseIds}
          onToggleBulkCaseId={toggleEvolutionCaseId}
          onToggleAllVisibleCaseIds={toggleAllVisibleEvolutionCaseIds}
          onClearBulkSelection={clearEvolutionSelection}
          bulkActionBar={(
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                支持从已人工收敛的数据流漏洞案例中，整批预览并创建进化任务。
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEvolutionDialog(true);
                  setEvolutionPreview(null);
                }}
                disabled={selectedEvolutionCaseIds.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={14} />
                创建进化任务
              </button>
            </div>
          )}
        />
      )}

      {workspaceView === 'services' && (
        <ServicesWorkspace
          serviceForm={serviceForm}
          setServiceForm={setServiceForm}
          defaultServiceForm={mergedServiceForm}
          submittingService={submittingService}
          handleRegisterService={handleRegisterService}
          services={services}
          serviceOperatingId={serviceOperatingId}
          handleServiceHeartbeat={handleServiceHeartbeat}
          handleServiceUnregister={handleServiceUnregister}
        />
      )}

      {workspaceView === 'tasks' && (
        <TasksWorkspace
          manualTasks={manualTasks}
          setSelectedCaseId={setSelectedCaseId}
          setWorkspaceView={setWorkspaceView}
          setActiveTab={setActiveTab}
        />
      )}

      {workspaceView === 'queue' && (
        <QueueWorkspace
          projectActions={projectActions}
          overview={overview}
          services={services}
          actionQueueFilter={actionQueueFilter}
          setActionQueueFilter={setActionQueueFilter}
          setSelectedCaseId={setSelectedCaseId}
          setWorkspaceView={setWorkspaceView}
          setActiveTab={setActiveTab}
          actionOperatingId={actionOperatingId}
          handleActionControl={handleActionControl}
          refreshAll={refreshAll}
        />
      )}

      {workspaceView === 'repro' && (
        <ReproConfigWorkspace
          serviceForm={serviceForm}
          setServiceForm={setServiceForm}
          defaultServiceForm={mergedServiceForm}
          submittingService={submittingService}
          handleRegisterService={handleRegisterService}
          services={reproServices}
          projectActions={projectActions}
        />
      )}

      {showEvolutionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                  <Sparkles size={14} />
                  漏洞台账 {'->'} 进化中心
                </div>
                <h2 className="mt-3 text-2xl font-black text-slate-900">从已选案例创建进化任务</h2>
                <p className="mt-2 text-sm text-slate-500">先预览整批，再确认创建。若同一 normal 任务存在遗漏案例，预览会自动补齐。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEvolutionDialog(false);
                  setEvolutionPreview(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">已选案例</div>
                  <div className="mt-2 text-xs text-slate-500">共 {selectedEvolutionCaseIds.length} 个。</div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {selectedEvolutionCases.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="font-black text-slate-800">{item.title}</div>
                        <div className="mt-1 text-[11px] font-mono text-slate-500">{item.id}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.summary || '暂无摘要'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-black text-slate-800">任务标题</div>
                  <input
                    value={evolutionForm.title}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, title: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="例如：DFVS 误报率压降 - 研判批次 A"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-black text-slate-800">进化目标</div>
                  <textarea
                    value={evolutionForm.objective}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, objective: event.target.value }))}
                    className="min-h-[8rem] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="说明本次重点优化漏报、误报还是发现轮次。"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" min={1} max={100} value={evolutionForm.minRounds} onChange={(event) => setEvolutionForm((current) => ({ ...current, minRounds: Number(event.target.value || 1) }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                  <input type="number" min={1} max={100} value={evolutionForm.maxRounds} onChange={(event) => setEvolutionForm((current) => ({ ...current, maxRounds: Number(event.target.value || 1) }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                  <input type="number" min={1} max={64} value={evolutionForm.maxConcurrentSourceTasks} onChange={(event) => setEvolutionForm((current) => ({ ...current, maxConcurrentSourceTasks: Number(event.target.value || 1) }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={evolutionSubmitting || selectedEvolutionCaseIds.length === 0}
                    onClick={() => void handlePreviewEvolution()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={15} />
                    预览整批
                  </button>
                  <button
                    type="button"
                    disabled={evolutionSubmitting || !evolutionPreview?.can_create}
                    onClick={() => void handleCreateEvolution()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} />
                    确认创建
                  </button>
                </div>

                {!evolutionPreview ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-400">
                    预览结果会在这里展示。
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2">
                      {evolutionPreview.can_create ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
                      <div className="font-black text-slate-900">{evolutionPreview.can_create ? '预览通过，可创建' : '预览未通过'}</div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">请求 {evolutionPreview.requested_case_ids.length} 个案例，整批后 {evolutionPreview.effective_case_ids.length} 个，涉及 {evolutionPreview.sources.length} 个原始任务。</div>
                    {evolutionPreview.blocked_reasons.length > 0 && (
                      <div className="mt-3 space-y-2 text-sm text-rose-600">
                        {evolutionPreview.blocked_reasons.map((reason: string) => <div key={reason}>{reason}</div>)}
                      </div>
                    )}
                    <div className="mt-4 space-y-3">
                      {evolutionPreview.sources.map((source: any) => (
                        <div key={source.source_task_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black text-slate-800">{source.source_title || source.source_task_id}</div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${source.replay_ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}</div>
                          {source.auto_expanded_case_ids.length > 0 && <div className="mt-1 text-xs text-amber-700">自动补齐 {source.auto_expanded_case_ids.length} 个遗漏案例。</div>}
                          {source.blocked_reasons.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs text-rose-600">
                              {source.blocked_reasons.map((reason: string) => <div key={reason}>{reason}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
