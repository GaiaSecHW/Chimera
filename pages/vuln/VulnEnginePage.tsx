import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, RefreshCw, Sparkles } from 'lucide-react';
import { Modal, PageHeader } from '../../design-system';
import { api } from '../../clients/api';
import { ServiceBuildVersionBadge, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';

const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
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
  fullscreenLayout?: boolean;
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
  fullscreenLayout = false,
  showPhasePreset = true,
  listEntryMode = false,
  preserveLifecycleProgressBand = false,
  detailTargetView,
  detailStorageKey,
  detailEntryLabel = '查看详情',
  summaryCards = [],
}) => {
  const buildVersion = useServiceBuildVersion(vulnApi.vuln.getHealth);
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
  const [validationStatusFilter, setValidationStatusFilter] = useState('all');
  const [validationConclusionFilter, setValidationConclusionFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
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
  const [batchSyncingAutoVerify, setBatchSyncingAutoVerify] = useState(false);
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
              className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg px-3 py-3 text-xs" style={{ backgroundColor: LK.surfaceRaised, border: `1px dashed ${LK.border}`, color: LK.muted }}>
          {emptyLabel}
        </div>
      );

    if (stage === 'triage') {
      return (
        <div className="space-y-3">
          <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>研判结论</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>
              {labelOf(selectedCaseDetail.decision_status, DECISION_LABELS)}
            </div>
            <div className="mt-1 text-xs" style={{ color: LK.body }}>
              准入 Gate：{labelOf(selectedCaseDetail.triage_gate, TRIAGE_GATE_LABELS)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>推荐动作</div>
              <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{recommendedActions.length}</div>
            </div>
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>待处理人工任务</div>
              <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{openTaskCount}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>推荐动作清单</div>
            {chips(recommendedActionTags, '当前还没有推荐动作，可先从报告与证据中补齐研判依据。')}
          </div>
        </div>
      );
    }

    if (stage === 'validation') {
      return (
        <div className="space-y-3">
          <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>验证结论</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>
              {labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}
            </div>
            <div className="mt-1 text-xs" style={{ color: LK.body }}>
              最新验证反馈：{latestValidationLikeResult?.summary || latestResult?.summary || '暂无回传结果'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>运行中动作</div>
              <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{runningActionCount}</div>
            </div>
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>人工验证任务</div>
              <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{openTaskCount}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>已覆盖能力</div>
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
          <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>最终结论</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>
              {labelOf(selectedCaseDetail.decision_status, DECISION_LABELS)}
            </div>
            <div className="mt-1 text-xs" style={{ color: LK.body }}>
              结束原因：{labelOf(selectedCaseDetail.finished_reason, FINISHED_REASON_LABELS)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>验证结果</div>
              <div className="mt-2 text-sm font-semibold" style={{ color: LK.ink }}>
                {labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}
              </div>
            </div>
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>历史报告数</div>
              <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{caseReports.length}</div>
            </div>
          </div>
          <div className="rounded-lg px-4 py-3 text-sm leading-6" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}>
            {latestResult?.summary || selectedCaseDetail.summary || '当前案例已结束，但暂无额外的终态摘要。'}
          </div>
        </div>
      );
    }

    return null;
  }, [actionItems, caseReports.length, recommendedActions, resultItems, selectedCaseDetail, taskItems]);
  const automationEvents = selectedTimeline.filter((item) => item.item_type === 'event' && item.payload?.event_type === 'automation_rule_applied');
  const allowedStageOptions = stageScope?.length ? ['all', ...stageScope] : STAGE_OPTIONS;
  const stageScopeKey = stageScope?.join('|') || '';
  const effectiveListEntryMode = listEntryMode;
  const effectiveCompactCaseLayout = compactCaseLayout || effectiveListEntryMode;
  const showValidationListFilters = Boolean(
    stageScope?.includes('validation') || currentViewId === 'vuln-verification' || defaultStageFilter === 'validation',
  );
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
      const scopedStage = stageScope?.length === 1
        ? stageScope[0]
        : stageFilter !== 'all' && (!stageScope?.length || stageScope.includes(stageFilter))
          ? stageFilter
          : undefined;
      const caseListParams = {
        project_id: projectId,
        current_stage: scopedStage,
        ...(scopedStage || effectiveListEntryMode ? { limit: 1000, page_size: 1000 } : {}),
      };
      const [overviewResp, caseResp, serviceResp, taskResp] = await Promise.all([
        vulnApi.vuln.getOverview(projectId),
        vulnApi.vuln.listCases(caseListParams),
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

  const handleBatchSyncAutoVerify = async (caseIds: string[]) => {
    const uniqueCaseIds = Array.from(new Set(caseIds.filter(Boolean)));
    if (!projectId || !uniqueCaseIds.length) {
      setError('没有可同步的验证案例。');
      return;
    }
    if (uniqueCaseIds.length > 100) {
      setError('批量同步一次最多支持 100 个案例，请减少选择后重试。');
      return;
    }
    setBatchSyncingAutoVerify(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await vulnApi.vuln.syncAutoVerifyTasksBatch({
        project_id: projectId,
        case_ids: uniqueCaseIds,
        only_with_auto_verify_task: true,
        max_concurrency: 3,
      });
      await refreshAll();
      setSuccessMessage(`批量同步完成：成功 ${response.synced}，跳过 ${response.skipped}，失败 ${response.failed}。`);
    } catch (err: any) {
      setError(err?.message || '批量同步自动化验证结果失败');
    } finally {
      setBatchSyncingAutoVerify(false);
    }
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
        title: evolutionForm.title.trim() ||`Evolution of ${selectedEvolutionCaseIds.length} cases`,
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
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
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
  }, [projectId, actionQueueFilter, stageFilter, stageScopeKey, effectiveListEntryMode]);

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
        report_id:`manual-${Date.now()}`,
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
      setSuccessMessage(`能力服务"${serviceForm.service_name}" 已${exists ? '更新' : '注册'}，并绑定到 ${serviceForm.bind_stage} 阶段。`);
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
      setSuccessMessage(`已为当前案例派发${dispatchForm.action_type ?`“${labelOf(dispatchForm.action_type, ACTION_TYPE_LABELS)}”` : '默认'}动作。`);
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
      setSuccessMessage(`人工任务"${taskForm.title}" 已创建。`);
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
      setSuccessMessage(`已提交验证结论：${labelOf(validationForm.validation_result, VALIDATION_RESULT_LABELS)}。`);
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
        summary:`${labelOf(action.action_type, ACTION_TYPE_LABELS)}${status === 'succeeded' ? '执行成功' : '模拟执行失败'}`,
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
    if (showValidationListFilters) {
      if (validationStatusFilter !== 'all' && item.current_status !== validationStatusFilter) return false;
      if (validationConclusionFilter !== 'all') {
        if (item.current_status !== 'validation_completed' || item.validation_result !== validationConclusionFilter) return false;
      }
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
    }
    if (!caseSearch.trim()) return true;
    const keyword = caseSearch.trim().toLowerCase();
    return [
      item.title,
      item.summary,
      item.severity,
      item.decision_status,
      item.current_status,
      item.validation_result,
      item.subject?.locator,
      item.reporter?.name,
    ]
      .filter(Boolean)
      .some((field: string) => String(field).toLowerCase().includes(keyword));
  });

  const currentBatchSyncCaseIds = filteredCases.map((item) => item.id).filter(Boolean).slice(0, 100);

  const nextStageMap: Record<string, string[]> = {
    receive: ['validation'],
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

  const handleOpenAutoVerifyCreate = (caseId: string) => {
    localStorage.setItem('chimera-vuln-auto-verify-case-id', caseId);
    localStorage.setItem('chimera-vuln-open-case-id', caseId);
    onNavigateToView?.('vuln-analysis-verify-create');
  };

  return (
    <div className={`${
      fullscreenLayout
        ? 'px-5 py-5 pb-12 space-y-5 xl:px-6 2xl:px-8'
        : effectiveListEntryMode
          ? 'p-6 pb-16 space-y-5'
          : 'px-5 py-5 md:px-6 2xl:px-8 pb-24 space-y-4'
      }`} style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      <PageHeader
        title={(
          <span className="inline-flex flex-wrap items-center gap-3">
            <span>{pageTitle}</span>
            <ServiceBuildVersionBadge version={buildVersion} />
          </span>
        )}
        description={pageDescription}
        actions={<button
          onClick={refreshAll}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
        >
          <RefreshCw size={16} />
          刷新工作台
        </button>}
      />

      {error && (
        <div className="rounded-xl px-6 py-4 text-sm" style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl px-6 py-4 text-sm" style={{ backgroundColor: `${LK.success}14`, border: `1px solid ${LK.success}40`, color: LK.success }}>
          {successMessage}
        </div>
      )}

      {(!effectiveListEntryMode || preserveLifecycleProgressBand) && !hideLifecycleChrome && <div className="rounded-xl px-5 py-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>生命周期进度带</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {LIFECYCLE_STAGE_FLOW.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigateToView?.(item.view)}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: currentViewId === item.view ? LK.primary : LK.surfaceRaised,
                color: currentViewId === item.view ? '#ffffff' : LK.body,
              }}
              onMouseEnter={(e) => { if (currentViewId !== item.view) e.currentTarget.style.backgroundColor = LK.surface; }}
              onMouseLeave={(e) => { if (currentViewId !== item.view) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>}

      {!effectiveListEntryMode && summaryCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {summaryCards.map((card) => (
            <div key={`${card.label}-${card.source}`} className="rounded-xl px-5 py-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>{card.label}</div>
              <div className="mt-3 text-4xl font-semibold tabular-nums" style={{ color: LK.ink }}>{resolveSummaryValue(card.source)}</div>
              {card.helper && <div className="mt-2 text-sm" style={{ color: LK.body }}>{card.helper}</div>}
            </div>
          ))}
        </div>
      )}

      {!effectiveListEntryMode && !hideLifecycleChrome && <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-4 items-start">
        <div className="rounded-xl p-5" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>生命周期导航</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {LIFECYCLE_NAV_ITEMS.map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigateToView?.(item.view)}
                className="rounded-lg px-4 py-4 text-left transition-colors"
                style={{
                  backgroundColor: currentViewId === item.view ? LK.primaryMuted : LK.surface,
                  border: `1px solid ${currentViewId === item.view ? LK.primary : LK.border}`,
                }}
                onMouseEnter={(e) => { if (currentViewId !== item.view) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                onMouseLeave={(e) => { if (currentViewId !== item.view) e.currentTarget.style.backgroundColor = LK.surface; }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold" style={{ color: currentViewId === item.view ? LK.primary : LK.ink }}>{item.label}</div>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider" style={{
                    backgroundColor: currentViewId === item.view ?`${LK.primary}22` : LK.surfaceRaised,
                    color: currentViewId === item.view ? LK.primary : LK.muted,
                  }}>
                    {countForLifecycleView(item.view)}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5" style={{ color: currentViewId === item.view ? LK.primarySoft : LK.body }}>{item.description}</div>
              </button>
            ))}
          </div>
        </div>
        {showWorkspaceTabs && (
          <div className="rounded-xl p-5" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>页面分区</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {WORKSPACE_VIEWS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setWorkspaceView(item.key)}
                  className="px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: workspaceView === item.key ? LK.primary : LK.surface,
                    color: workspaceView === item.key ? '#ffffff' : LK.body,
                    border: workspaceView === item.key ? 'none' :`1px solid ${LK.border}`,
                  }}
                  onMouseEnter={(e) => { if (workspaceView !== item.key) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { if (workspaceView !== item.key) e.currentTarget.style.color = LK.body; }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>}

      {!effectiveListEntryMode && !hidePhaseContext && (phaseHighlights.length > 0 || phaseActions.length > 0 || stageScope?.length) && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-xl p-6" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>阶段关注点</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(stageScope?.length ? stageScope : [defaultStageFilter]).filter(Boolean).map((stage) => (
                <span key={`scope-${stage}`} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>
                  {stage}
                </span>
              ))}
            </div>
            {stageScope?.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>阶段内案例</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{stageScopeCount}</div>
                </div>
                <div className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>覆盖阶段数</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{stageScope.length}</div>
                </div>
              </div>
            ) : null}
            <div className="mt-5 space-y-3">
              {phaseHighlights.map((item) => (
                <div key={item} className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl p-6" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>推荐动作</div>
            <div className="mt-4 space-y-3">
              {phaseActions.map((item) => (
                <div key={item} className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: `${LK.primary}14`, border: `1px solid ${LK.primary}40`, color: LK.inkSoft }}>
                  {item}
                </div>
              ))}
            </div>
            {phaseActionLinks.length > 0 && (
              <div className="mt-5">
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>快捷跳转</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {phaseActionLinks.map((item) => (
                    <button
                      key={`${item.view}-${item.label}`}
                      type="button"
                      onClick={() => onNavigateToView?.(item.view)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
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
          showValidationFilters={showValidationListFilters}
          validationStatusFilter={validationStatusFilter}
          setValidationStatusFilter={setValidationStatusFilter}
          validationConclusionFilter={validationConclusionFilter}
          setValidationConclusionFilter={setValidationConclusionFilter}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
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
          fullscreenLayout={fullscreenLayout}
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
              onCreateAutoVerify={selectedCaseDetail?.current_stage === 'triage' ? () => handleOpenAutoVerifyCreate(selectedCaseDetail.id) : undefined}
              stageActionContent={stageSpecificPanel}
            />
          ) : undefined}
          enableBulkSelection={!hideCasePool}
          selectedBulkCaseIds={selectedEvolutionCaseIds}
          onToggleBulkCaseId={toggleEvolutionCaseId}
          onToggleAllVisibleCaseIds={toggleAllVisibleEvolutionCaseIds}
          onClearBulkSelection={clearEvolutionSelection}
          bulkActionBar={showValidationListFilters ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-theme-text-secondary">
                使用 vuln-verification 批量同步接口拉取当前自动化验证任务结果。
                {filteredCases.length > 100 &&` 当前筛选 ${filteredCases.length} 条，本次最多同步前 100 条。`}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleBatchSyncAutoVerify(selectedEvolutionCaseIds)}
                  disabled={batchSyncingAutoVerify || selectedEvolutionCaseIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={14} className={batchSyncingAutoVerify ? 'animate-spin' : ''} />
                  {batchSyncingAutoVerify ? '同步中...' : '同步选中'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBatchSyncAutoVerify(currentBatchSyncCaseIds)}
                  disabled={batchSyncingAutoVerify || currentBatchSyncCaseIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-medium text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={14} className={batchSyncingAutoVerify ? 'animate-spin' : ''} />
                  {batchSyncingAutoVerify ? '同步中...' : '同步当前筛选前100条'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-theme-text-secondary">
                支持从已人工收敛的数据流漏洞案例中，整批预览并创建进化任务。
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEvolutionDialog(true);
                  setEvolutionPreview(null);
                }}
                disabled={selectedEvolutionCaseIds.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
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

      <Modal
        open={showEvolutionDialog}
        onClose={() => {
          setShowEvolutionDialog(false);
          setEvolutionPreview(null);
        }}
        className="max-w-4xl w-full"
      >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.warning}14`, color: LK.warning }}>
                  <Sparkles size={14} />
                  漏洞台账 {'->'} 进化中心
                </div>
                <h2 className="mt-3 text-2xl font-bold" style={{ color: LK.ink }}>从已选案例创建进化任务</h2>
                <p className="mt-2 text-sm" style={{ color: LK.body }}>先预览整批，再确认创建。若同一 normal 任务存在遗漏案例，预览会自动补齐。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEvolutionDialog(false);
                  setEvolutionPreview(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
                onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
              >
                关闭
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                  <div className="text-sm font-semibold" style={{ color: LK.ink }}>已选案例</div>
                  <div className="mt-2 text-xs" style={{ color: LK.body }}>共 {selectedEvolutionCaseIds.length} 个。</div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {selectedEvolutionCases.map((item) => (
                      <div key={item.id} className="rounded-lg px-3 py-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                        <div className="font-semibold" style={{ color: LK.ink }}>{item.title}</div>
                        <div className="mt-1 text-[11px]" style={{ fontFamily: MONO, color: LK.muted }}>{item.id}</div>
                        <div className="mt-1 text-xs" style={{ color: LK.body }}>{item.summary || '暂无摘要'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold" style={{ color: LK.ink }}>任务标题</div>
                  <input
                    value={evolutionForm.title}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, title: event.target.value }))}
                    className="w-full px-4 py-3 text-sm outline-none rounded-lg"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    placeholder="例如：DFVS 误报率压降 - 研判批次 A"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-semibold" style={{ color: LK.ink }}>进化目标</div>
                  <textarea
                    value={evolutionForm.objective}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, objective: event.target.value }))}
                    className="min-h-[8rem] w-full px-4 py-3 text-sm outline-none resize-none rounded-lg"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    placeholder="说明本次重点优化漏报、误报还是发现轮次。"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" min={1} max={100} value={evolutionForm.minRounds} onChange={(event) => setEvolutionForm((current) => ({ ...current, minRounds: Number(event.target.value || 1) }))} className="px-4 py-3 text-sm outline-none rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }} onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)} onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)} />
                  <input type="number" min={1} max={100} value={evolutionForm.maxRounds} onChange={(event) => setEvolutionForm((current) => ({ ...current, maxRounds: Number(event.target.value || 1) }))} className="px-4 py-3 text-sm outline-none rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }} onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)} onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)} />
                  <input type="number" min={1} max={64} value={evolutionForm.maxConcurrentSourceTasks} onChange={(event) => setEvolutionForm((current) => ({ ...current, maxConcurrentSourceTasks: Number(event.target.value || 1) }))} className="px-4 py-3 text-sm outline-none rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }} onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)} onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={evolutionSubmitting || selectedEvolutionCaseIds.length === 0}
                    onClick={() => void handlePreviewEvolution()}
                    className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                    onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
                  >
                    <RefreshCw size={15} />
                    预览整批
                  </button>
                  <button
                    type="button"
                    disabled={evolutionSubmitting || !evolutionPreview?.can_create}
                    onClick={() => void handleCreateEvolution()}
                    className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: `${LK.success}22`, color: LK.success, border: `1px solid ${LK.success}40` }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor =`${LK.success}3a`; }}
                    onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor =`${LK.success}22`; }}
                  >
                    <CheckCircle2 size={15} />
                    确认创建
                  </button>
                </div>

                {!evolutionPreview ? (
                  <div className="rounded-xl px-4 py-8 text-sm" style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}>
                    预览结果会在这里展示。
                  </div>
                ) : (
                  <div className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                    <div className="flex items-center gap-2">
                      {evolutionPreview.can_create ? <CheckCircle2 size={16} style={{ color: LK.success }} /> : <AlertTriangle size={16} style={{ color: LK.error }} />}
                      <div className="font-semibold" style={{ color: LK.ink }}>{evolutionPreview.can_create ? '预览通过，可创建' : '预览未通过'}</div>
                    </div>
                    <div className="mt-3 text-sm" style={{ color: LK.body }}>请求 {evolutionPreview.requested_case_ids.length} 个案例，整批后 {evolutionPreview.effective_case_ids.length} 个，涉及 {evolutionPreview.sources.length} 个原始任务。</div>
                    {evolutionPreview.blocked_reasons.length > 0 && (
                      <div className="mt-3 space-y-2 text-sm" style={{ color: LK.error }}>
                        {evolutionPreview.blocked_reasons.map((reason: string) => <div key={reason}>{reason}</div>)}
                      </div>
                    )}
                    <div className="mt-4 space-y-3">
                      {evolutionPreview.sources.map((source: any) => (
                        <div key={source.source_task_id} className="rounded-lg px-4 py-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold" style={{ color: LK.ink }}>{source.source_title || source.source_task_id}</div>
                            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{
                              backgroundColor: source.replay_ready ?`${LK.success}22` :`${LK.error}22`,
                              color: source.replay_ready ? LK.success : LK.error,
                              border: source.replay_ready ?`1px solid ${LK.success}40` :`1px solid ${LK.error}40`,
                            }}>
                              {source.replay_ready ? 'ready' : 'blocked'}
                            </span>
                          </div>
                          <div className="mt-2 text-xs" style={{ color: LK.body }}>已选 {source.selected_case_ids.length} / 整批 {source.all_case_ids.length}</div>
                          {source.auto_expanded_case_ids.length > 0 && <div className="mt-1 text-xs" style={{ color: LK.warning }}>自动补齐 {source.auto_expanded_case_ids.length} 个遗漏案例。</div>}
                          {source.blocked_reasons.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs" style={{ color: LK.error }}>
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
        </Modal>
    </div>
  );
};
