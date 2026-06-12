import React from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  FileClock,
  Filter,
  GitBranch,
  ListTodo,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import {
  ACTION_TYPE_LABELS,
  DECISION_LABELS,
  FINISHED_REASON_LABELS,
  FINISHED_REASON_OPTIONS,
  SEVERITY_LABELS,
  STAGE_LABELS,
  TASK_TYPE_LABELS,
  TRIAGE_GATE_LABELS,
  VALIDATION_RESULT_LABELS,
  ACTION_TYPES,
  DECISION_OPTIONS,
  CASE_STATUS_LABELS,
  cardClass,
  decisionTone,
  formatTime,
  labelOf,
  severityTone,
  stageTone,
  toneOf,
} from './shared';

export const CasesWorkspace: React.FC<any> = ({
  loading,
  filteredCases,
  cases,
  casePoolTitle = '案例池',
  casePoolDescription = '按阶段和关键词过滤，快速切换当前运行中的案例',
  phasePresetLabel,
  preferredActionType,
  preferredTaskType,
  showPhasePreset = true,
  stageOptions,
  lockStageFilter,
  hideStageFilter = false,
  showCreateCaseForm = true,
  selectedCaseId,
  setSelectedCaseId,
  caseSearch,
  setCaseSearch,
  stageFilter,
  setStageFilter,
  caseForm,
  setCaseForm,
  submittingCase,
  handleCreateCase,
  selectedCase,
  selectedCaseDetail,
  selectedTimeline,
  recommendedActions,
  automationEvents,
  taskItems,
  services,
  dispatchForm,
  setDispatchForm,
  dispatching,
  handleDispatch,
  autoOrchestrating,
  handleAutoOrchestrate,
  quickDispatchServices,
  nextStageMap,
  transitioningStage,
  handleStageTransition,
  finishForm,
  setFinishForm,
  submittingFinish,
  handleFinishCase,
  decisionForm,
  setDecisionForm,
  submittingDecision,
  handleSubmitDecision,
  activeTab,
  setActiveTab,
  actionItems,
  callbackingActionId,
  actionOperatingId,
  handleSimulateActionResult,
  handleActionControl,
  resultItems,
  taskForm,
  setTaskForm,
  creatingTask,
  handleCreateTask,
  taskOperatingId,
  handleTaskStatus,
  validationForm,
  setValidationForm,
  validationResultOptions,
  submittingValidation,
  handleSubmitValidationResult,
  refreshAll,
  overview,
  compactLayout = false,
  fullscreenLayout = false,
  listOnlyMode = false,
  hideCasePool = false,
  detailEntryLabel = '查看详情',
  onOpenCaseDetail,
  onOpenDedicatedDetail,
  detailContent,
  enableBulkSelection = false,
  selectedBulkCaseIds = [],
  onToggleBulkCaseId,
  onToggleAllVisibleCaseIds,
  onClearBulkSelection,
  bulkActionBar,
}) => {
  const panelStorageKey = `chimera-vuln-analysis-panels-${selectedCaseDetail?.project_id || selectedCase?.project_id || 'global'}`;
  const [customPanels, setCustomPanels] = React.useState<Array<{ id: string; title: string; content: string }>>([]);
  const [showPanelEditor, setShowPanelEditor] = React.useState(false);
  const [newPanelTitle, setNewPanelTitle] = React.useState('');
  const [newPanelContent, setNewPanelContent] = React.useState('');
  const emptyStateText = hideStageFilter ? '当前阶段没有案例' : '当前筛选条件下没有案例';
  const openTasks = taskItems.filter((item: any) => item.status !== 'completed' && item.status !== 'closed');
  const openManualAnalysisTasks = taskItems.filter((item: any) => ['manual_analysis', 'manual_review'].includes(item.task_type) && item.status !== 'completed' && item.status !== 'closed');
  const openManualValidationTasks = taskItems.filter((item: any) => item.task_type === 'manual_validation' && item.status !== 'completed' && item.status !== 'closed');
  const failedActionItems = actionItems.filter((item: any) => item.execution_status === 'failed');
  const runningActionItems = actionItems.filter((item: any) => ['queued', 'running'].includes(item.execution_status));
  const succeededActionItems = actionItems.filter((item: any) => item.execution_status === 'succeeded');
  const latestProofVerificationAction = [...actionItems].find((item: any) => item.action_type === 'proof_verification');
  const latestVerificationSignal = [...resultItems].find((item: any) => item.result_type === 'validation' || item.result_type === 'timeout' || item.result_type === 'proof_verification');
  const triageChecklist = [
    { key: 'recommended', label: '已有推荐动作', done: recommendedActions.length > 0, helper: `${recommendedActions.length} 个` },
    { key: 'results', label: '已有分析/自动化结果', done: resultItems.length > 0, helper: `${resultItems.length} 条` },
    { key: 'manual_tasks', label: '无待处理人工分析任务', done: openManualAnalysisTasks.length === 0, helper: openManualAnalysisTasks.length > 0 ? `${openManualAnalysisTasks.length} 个待处理` : '已清空' },
    { key: 'gate', label: '已人工确认准入', done: selectedCaseDetail?.triage_gate === 'approved_to_validation', helper: labelOf(selectedCaseDetail?.triage_gate, TRIAGE_GATE_LABELS) },
  ];
  const validationPipeline = [
    { key: 'validation', label: '验证执行', actionType: 'validation' },
    { key: 'poc_generation', label: 'POC 生成', actionType: 'poc_generation' },
    { key: 'exp_generation', label: 'EXP 生成', actionType: 'exp_generation' },
    { key: 'proof_verification', label: '结果回传', actionType: 'proof_verification' },
  ].map((step) => {
    const actions = actionItems.filter((item: any) => item.action_type === step.actionType);
    const latestAction = actions[0] || null;
    const relatedResults = resultItems.filter((item: any) => {
      if (step.actionType === 'validation') return item.result_type === 'validation' || item.result_type === 'timeout';
      if (step.actionType === 'proof_verification') return item.result_type === 'proof_verification' || item.result_type === 'timeout';
      if (step.actionType === 'poc_generation') return item.result_type === 'poc' || item.result_type === 'timeout';
      if (step.actionType === 'exp_generation') return item.result_type === 'exp' || item.result_type === 'timeout';
      return false;
    });
    return {
      ...step,
      latestAction,
      latestResult: relatedResults[0] || null,
      failedCount: actions.filter((item: any) => item.execution_status === 'failed').length,
      activeCount: actions.filter((item: any) => ['queued', 'running'].includes(item.execution_status)).length,
    };
  });
  const consistencyAlerts = [
    selectedCaseDetail?.current_stage === 'validation' && selectedCaseDetail?.triage_gate !== 'approved_to_validation'
      ? `当前案例已进入验证阶段，但研判 Gate 仍为 ${labelOf(selectedCaseDetail?.triage_gate, TRIAGE_GATE_LABELS)}。`
      : null,
    selectedCaseDetail?.current_stage === 'validation' && resultItems.length === 0
      ? '当前处于验证阶段，但还没有任何验证回传结果。'
      : null,
    selectedCaseDetail?.current_stage === 'validation' && failedActionItems.length > 0
      ? `当前验证链路存在 ${failedActionItems.length} 个失败动作，建议先处理失败或重试。`
      : null,
    selectedCaseDetail?.current_stage === 'finished' && runningActionItems.length > 0
      ? `案例已结束，但仍有 ${runningActionItems.length} 个动作处于排队或运行中。`
      : null,
    selectedCaseDetail?.current_stage === 'finished' && selectedCaseDetail?.validation_result === 'vulnerable' && selectedCaseDetail?.finished_reason === 'non_issue'
      ? '验证结论为“漏洞成立”，但结束原因是“研判非问题”，请复核终态一致性。'
      : null,
    selectedCaseDetail?.current_stage === 'finished' && !latestProofVerificationAction
      ? '案例已结束，但还没有发现结果回传动作，建议补发终态回传。'
      : null,
  ].filter(Boolean) as string[];
  const prioritizedCases = React.useMemo(() => {
    const rankCase = (item: any) => {
      if (item.current_stage === 'triage') {
        if (item.triage_gate === 'pending') return 0;
        if (item.current_status === 'manual_assessing') return 1;
      }
      if (item.current_stage === 'validation') {
        if (item.current_status === 'reproducing') return 0;
        if (item.current_status === 'evidence_collecting') return 1;
      }
      if (item.current_stage === 'finished' && item.finished_reason === 'manual_terminated') return 0;
      return 5;
    };
    return [...filteredCases].sort((left: any, right: any) => {
      const rankDiff = rankCase(left) - rankCase(right);
      if (rankDiff !== 0) return rankDiff;
      return new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime();
    });
  }, [filteredCases]);
  const getCaseAttentionBadge = (item: any) => {
    if (item.current_stage === 'triage' && item.triage_gate === 'pending') return { label: '待研判决策', tone: 'bg-amber-100 text-amber-700' };
    if (item.current_stage === 'triage' && item.current_status === 'manual_assessing') return { label: '待人工分析', tone: 'bg-blue-100 text-blue-700' };
    if (item.current_stage === 'validation' && item.current_status === 'reproducing') return { label: '复现进行中', tone: 'bg-emerald-100 text-emerald-700' };
    if (item.current_stage === 'validation' && item.current_status === 'evidence_collecting') return { label: '待补证据', tone: 'bg-amber-100 text-amber-700' };
    if (item.current_stage === 'finished' && item.finished_reason === 'manual_terminated') return { label: '人工终止', tone: 'bg-rose-100 text-rose-700' };
    return null;
  };
  const getCaseStatusLabel = (item: any) => labelOf(item.current_status, CASE_STATUS_LABELS, '') || item.current_status || '未知状态';
  const getValidationConclusionLabel = (item: any) => {
    if (item.current_stage !== 'validation') return '-';
    return item.current_status === 'validation_completed'
      ? labelOf(item.validation_result, VALIDATION_RESULT_LABELS, '') || '结论不确定'
      : '待验证';
  };
  const resultSummaryCards = React.useMemo<Array<{
    id: string;
    title: string;
    resultType: string;
    source: string;
    confidence: number;
    suggestedDecision?: string | null;
    suggestedStage?: string | null;
    createdAt?: string | null;
    status: string;
  }>>(() => {
    if (!resultItems.length) return [];
    return resultItems.slice(0, 4).map((item: any) => ({
      id: item.id,
      title: item.summary || '未填写摘要',
      resultType: item.result_type,
      source: item.source_service_id || '未知服务',
      confidence: item.confidence,
      suggestedDecision: item.suggested_decision,
      suggestedStage: item.suggested_stage,
      createdAt: item.created_at,
      status: item.status,
    }));
  }, [resultItems]);

  React.useEffect(() => {
    if (!compactLayout) return;
    try {
      const raw = localStorage.getItem(panelStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setCustomPanels(parsed.filter((item) => item && item.id && item.title));
      } else {
        setCustomPanels([]);
      }
    } catch {
      setCustomPanels([]);
    }
  }, [panelStorageKey, compactLayout]);

  React.useEffect(() => {
    if (!compactLayout) return;
    localStorage.setItem(panelStorageKey, JSON.stringify(customPanels));
  }, [panelStorageKey, customPanels, compactLayout]);

  const handleAddPanel = () => {
    const title = newPanelTitle.trim();
    const content = newPanelContent.trim();
    if (!title) return;
    setCustomPanels((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, content },
    ]);
    setNewPanelTitle('');
    setNewPanelContent('');
    setShowPanelEditor(false);
  };

  const handleDeletePanel = (panelId: string) => {
    setCustomPanels((prev) => prev.filter((item) => item.id !== panelId));
  };
  const allVisibleSelected = prioritizedCases.length > 0 && prioritizedCases.every((item: any) => selectedBulkCaseIds.includes(item.id));

  return (
  <div className={
    hideCasePool
      ? 'grid grid-cols-1 gap-4 items-start'
      : listOnlyMode
        ? 'grid grid-cols-1 gap-4 items-start'
        : fullscreenLayout
          ? 'grid grid-cols-1 min-[1680px]:grid-cols-[1.1fr_1.9fr] 2xl:grid-cols-[1fr_2.15fr] gap-5 items-start'
        : compactLayout
          ? 'grid grid-cols-1 2xl:grid-cols-[0.95fr_1.65fr] gap-4 items-start'
          : 'grid grid-cols-1 2xl:grid-cols-[1.15fr_1.45fr_1fr] gap-6 items-start'
  }>
    {!hideCasePool && <div className="space-y-6">
      <div className={cardClass}>
        <div className={compactLayout ? 'px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3' : 'px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4'}>
          <div>
            <h3 className="text-lg font-black text-slate-800">{casePoolTitle}</h3>
            {!compactLayout && <p className="text-xs text-slate-500 mt-1">{casePoolDescription}</p>}
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black">
            <Filter size={14} />
            {filteredCases.length}/{cases.length}
          </div>
        </div>
        <div className={compactLayout ? 'p-4 space-y-3' : 'p-6 space-y-4'}>
          <input
            value={caseSearch}
            onChange={(event) => setCaseSearch(event.target.value)}
            placeholder="搜索标题、摘要、资产定位"
            className={compactLayout ? 'w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none text-sm' : 'w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none'}
          />
          {enableBulkSelection && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-800">已选 {selectedBulkCaseIds.length} 个案例</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleAllVisibleCaseIds?.(!allVisibleSelected, prioritizedCases.map((item: any) => item.id))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                  >
                    {allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearBulkSelection?.()}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                  >
                    清空选择
                  </button>
                </div>
              </div>
              {bulkActionBar && <div className="mt-3">{bulkActionBar}</div>}
            </div>
          )}
          {!hideStageFilter && (
            <div className="flex flex-wrap gap-2">
              {(stageOptions || []).map((option: string) => (
                <button
                  key={option}
                  onClick={() => setStageFilter(option)}
                  disabled={lockStageFilter && option !== stageFilter}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${stageFilter === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {labelOf(option, STAGE_LABELS)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={fullscreenLayout ? 'max-h-[calc(100vh-18rem)] overflow-y-auto' : compactLayout ? 'max-h-[42rem] overflow-y-auto' : 'divide-y divide-slate-100 max-h-[38rem] overflow-y-auto'}>
          {loading ? (
            <div className={compactLayout ? 'px-4 py-6 text-sm text-slate-400' : 'px-6 py-8 text-sm text-slate-400'}>加载中...</div>
          ) : filteredCases.length === 0 ? (
            <div className={compactLayout ? 'px-4 py-6 text-sm text-slate-400' : 'px-6 py-8 text-sm text-slate-400'}>{emptyStateText}</div>
          ) : compactLayout ? (
            <div className="overflow-hidden rounded-[1.25rem] border border-slate-200">
              <div className={`grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 ${fullscreenLayout ? (enableBulkSelection ? 'grid-cols-[0.4fr_2.4fr_0.8fr_0.9fr_0.85fr_0.75fr_1fr]' : 'grid-cols-[2.4fr_0.8fr_0.9fr_0.85fr_0.75fr_1fr]') : (enableBulkSelection ? 'grid-cols-[0.4fr_1.9fr_0.75fr_0.85fr_0.8fr_0.7fr_0.95fr]' : 'grid-cols-[1.9fr_0.75fr_0.85fr_0.8fr_0.7fr_0.95fr]')}`}>
                {enableBulkSelection && (
                  <label className="flex items-center justify-center">
                    <input type="checkbox" checked={allVisibleSelected} onChange={(event) => onToggleAllVisibleCaseIds?.(event.target.checked, prioritizedCases.map((item: any) => item.id))} />
                  </label>
                )}
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">标题 / 摘要</div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">阶段</div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">状态</div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">结论</div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">等级</div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">更新时间</div>
              </div>
              {prioritizedCases.map((item: any) => (
              <button
                key={item.id}
                onClick={() => {
                  if (listOnlyMode && onOpenCaseDetail) {
                    onOpenCaseDetail(item.id);
                    return;
                  }
                  setSelectedCaseId(item.id);
                }}
                className={`grid w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0 ${
                  fullscreenLayout
                    ? (enableBulkSelection ? 'grid-cols-[0.4fr_2.4fr_0.8fr_0.9fr_0.85fr_0.75fr_1fr]' : 'grid-cols-[2.4fr_0.8fr_0.9fr_0.85fr_0.75fr_1fr]')
                    : (enableBulkSelection ? 'grid-cols-[0.4fr_1.9fr_0.75fr_0.85fr_0.8fr_0.7fr_0.95fr]' : 'grid-cols-[1.9fr_0.75fr_0.85fr_0.8fr_0.7fr_0.95fr]')
                } ${
                  selectedCaseId === item.id ? 'bg-blue-50' : 'bg-white'
                }`}
                >
                  {enableBulkSelection && (
                    <label
                      className="flex items-center justify-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBulkCaseIds.includes(item.id)}
                        onChange={(event) => onToggleBulkCaseId?.(item.id, event.target.checked)}
                      />
                    </label>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-black text-slate-900">{item.title}</div>
                      {getCaseAttentionBadge(item) && (
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getCaseAttentionBadge(item)?.tone}`}>
                          {getCaseAttentionBadge(item)?.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-mono text-slate-400">{item.id}</div>
                    {item.finding_id ? <div className="mt-1 truncate text-[11px] font-mono text-blue-600">{item.finding_id}</div> : null}
                    <div className="mt-1 line-clamp-1 text-xs text-slate-500">{item.display_summary?.current_report_title || item.summary || '暂无摘要'}</div>
                    {item.display_summary?.current_report_updated_at ? <div className="mt-1 text-[11px] text-slate-400">报告更新：{formatTime(item.display_summary.current_report_updated_at)}</div> : null}
                  </div>
                  <div className="text-sm font-black text-slate-700">{labelOf(item.current_stage, STAGE_LABELS)}</div>
                  <div className="min-w-0 text-sm font-semibold text-slate-700 truncate">{getCaseStatusLabel(item)}</div>
                  <div className="min-w-0 text-sm text-slate-500 truncate">{getValidationConclusionLabel(item)}</div>
                  <div>
                    <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneOf(item.severity, severityTone)}`}>
                      {labelOf(item.severity, SEVERITY_LABELS)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">{formatTime(item.updated_at || item.created_at)}</div>
                </button>
              ))}
            </div>
          ) : (
            prioritizedCases.map((item: any) => (
              <button
                key={item.id}
                onClick={() => {
                  if (listOnlyMode && onOpenCaseDetail) {
                    onOpenCaseDetail(item.id);
                    return;
                  }
                  setSelectedCaseId(item.id);
                }}
                className={`w-full text-left transition-colors px-6 py-5 ${selectedCaseId === item.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {enableBulkSelection && (
                    <label
                      className="mt-1 flex shrink-0 items-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBulkCaseIds.includes(item.id)}
                        onChange={(event) => onToggleBulkCaseId?.(item.id, event.target.checked)}
                      />
                    </label>
                  )}
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${toneOf(item.severity, severityTone)}`}>
                        {labelOf(item.severity, SEVERITY_LABELS)}
                      </span>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${toneOf(item.current_stage, stageTone)}`}>
                        {labelOf(item.current_stage, STAGE_LABELS)}
                      </span>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${toneOf(item.decision_status, decisionTone)}`}>
                        {labelOf(item.decision_status, DECISION_LABELS)}
                      </span>
                      {getCaseAttentionBadge(item) && (
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getCaseAttentionBadge(item)?.tone}`}>
                          {getCaseAttentionBadge(item)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-black text-slate-800 truncate">{item.title}</p>
                    <p className="text-[11px] font-mono text-slate-500 truncate">ID: {item.id}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{item.display_summary?.current_report_title || item.summary || '暂无摘要'}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                      {item.display_summary?.current_report_updated_at ? <span>报告更新：{formatTime(item.display_summary.current_report_updated_at)}</span> : null}
                      <span>状态：{getCaseStatusLabel(item)}</span>
                      {item.current_stage === 'validation' ? <span>结论：{getValidationConclusionLabel(item)}</span> : null}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {(item.subject?.type || '通用对象')} · {(item.subject?.locator || '未指定对象')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">置信度</p>
                    <p className="text-xl font-black text-slate-800">{item.confidence}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {showCreateCaseForm && (
        <div className={cardClass}>
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-lg font-black text-slate-800">创建新案例</h3>
          </div>
          <form onSubmit={handleCreateCase} className="p-6 grid grid-cols-1 gap-4">
            <input value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} placeholder="案例标题" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" required />
            <textarea value={caseForm.summary} onChange={(event) => setCaseForm({ ...caseForm, summary: event.target.value })} placeholder="摘要" className="min-h-[6rem] px-4 py-3 rounded-2xl border border-slate-200 outline-none resize-none" />
            <div className="grid grid-cols-2 gap-4">
              <select value={caseForm.severity} onChange={(event) => setCaseForm({ ...caseForm, severity: event.target.value })} className="px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white">
                <option value="critical">严重</option>
                <option value="high">高危</option>
                <option value="medium">中危</option>
                <option value="low">低危</option>
              </select>
              <input type="number" min={0} max={100} value={caseForm.confidence} onChange={(event) => setCaseForm({ ...caseForm, confidence: Number(event.target.value) })} placeholder="置信度" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input value={caseForm.source_service} onChange={(event) => setCaseForm({ ...caseForm, source_service: event.target.value })} placeholder="来源服务" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
              <input value={caseForm.asset_type} onChange={(event) => setCaseForm({ ...caseForm, asset_type: event.target.value })} placeholder="资产类型" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
            </div>
            <input value={caseForm.asset_locator} onChange={(event) => setCaseForm({ ...caseForm, asset_locator: event.target.value })} placeholder="资产定位" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
            <button type="submit" disabled={submittingCase} className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center gap-2">
              <Plus size={16} />
              {submittingCase ? '创建中...' : '创建案例'}
            </button>
          </form>
        </div>
      )}
    </div>}

    {!listOnlyMode && (
    <div className={fullscreenLayout ? 'space-y-5 min-w-0' : 'space-y-6'}>
      <div className={cardClass}>
        <div className={compactLayout ? 'px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3' : 'px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4'}>
          <div>
            <h3 className="text-lg font-black text-slate-800">案例运行面板</h3>
            {!compactLayout && <p className="text-xs text-slate-500 mt-1">查看当前案例的运行状态、动作、结果、人工任务和阶段推进</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCase && onOpenDedicatedDetail && !hideCasePool && (
              <button onClick={() => onOpenDedicatedDetail(selectedCase.id)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black">
                {detailEntryLabel}
              </button>
            )}
            {selectedCase && (
              <button onClick={refreshAll} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-2">
                <RefreshCw size={14} />
                刷新详情
              </button>
            )}
          </div>
        </div>
        {!selectedCaseDetail ? (
          <div className={compactLayout ? 'px-4 py-8 text-sm text-slate-400' : 'px-6 py-10 text-sm text-slate-400'}>从左侧选择一个案例查看当前研判详情</div>
        ) : detailContent ? (
          <div className={fullscreenLayout ? 'p-5 xl:p-6' : compactLayout ? 'p-4' : 'p-6'}>{detailContent}</div>
        ) : (
          <div className={compactLayout ? 'p-4 space-y-4' : 'p-6 space-y-6'}>
            <div className={compactLayout ? 'space-y-2' : 'space-y-3'}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${toneOf(selectedCaseDetail.severity, severityTone)}`}>{labelOf(selectedCaseDetail.severity, SEVERITY_LABELS)}</span>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${toneOf(selectedCaseDetail.current_stage, stageTone)}`}>{labelOf(selectedCaseDetail.current_stage, STAGE_LABELS)}</span>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${toneOf(selectedCaseDetail.decision_status, decisionTone)}`}>{labelOf(selectedCaseDetail.decision_status, DECISION_LABELS)}</span>
              </div>
              <h4 className={compactLayout ? 'text-xl font-black text-slate-800' : 'text-2xl font-black text-slate-800'}>{selectedCaseDetail.title}</h4>
              <p className="text-xs font-mono text-slate-500">ID: {selectedCaseDetail.id}</p>
              {selectedCaseDetail.finding_id ? <p className="text-xs font-mono text-blue-600">漏洞编号: {selectedCaseDetail.finding_id}</p> : null}
              <p className={compactLayout ? 'text-sm text-slate-500 line-clamp-2' : 'text-sm text-slate-500'}>{selectedCaseDetail.summary || '暂无摘要'}</p>
            </div>

            {consistencyAlerts.length > 0 && (
              <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <div className="font-black text-slate-800">阶段一致性提醒</div>
                </div>
                <div className="space-y-2">
                  {consistencyAlerts.map((item, index) => (
                    <div key={`consistency-${index}`} className="rounded-xl bg-[var(--bg-surface)] px-3 py-3 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={compactLayout ? 'grid grid-cols-2 xl:grid-cols-5 gap-2.5' : 'grid grid-cols-2 xl:grid-cols-4 gap-3'}>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">当前状态</div><div className="mt-1 font-black text-slate-800">{getCaseStatusLabel(selectedCaseDetail)}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">流程状态</div><div className="mt-1 font-black text-slate-800">{selectedCaseDetail.workflow_run?.run_status || '暂无'}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">上报者</div><div className="mt-1 font-black text-slate-800">{selectedCaseDetail.reporter?.name || '未知'}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">对象定位</div><div className="mt-1 font-black text-slate-800 truncate">{selectedCaseDetail.subject?.locator || '暂无'}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">结束结论</div><div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.finished_reason, FINISHED_REASON_LABELS)}</div></div>
            </div>

            <div className={compactLayout ? 'grid grid-cols-2 xl:grid-cols-3 gap-2.5' : 'grid grid-cols-1 xl:grid-cols-3 gap-3'}>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">研判轮次</div>
                <div className="mt-1 font-black text-slate-800">{selectedCaseDetail.triage_round || 1}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">研判 Gate</div>
                <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.triage_gate, TRIAGE_GATE_LABELS)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">验证结论</div>
                <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}</div>
              </div>
            </div>

            <div className={compactLayout ? 'rounded-[1.25rem] border border-blue-100 bg-blue-50/70 p-3' : 'rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4'}>
              <div className="flex items-center gap-2"><Bot size={16} className="text-blue-600" /><h5 className="font-black text-slate-800">自动推进信号</h5></div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
                <div className="rounded-2xl bg-white px-4 py-3 border border-blue-100"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">推荐动作</div><div className="mt-1 text-2xl font-black text-slate-800">{recommendedActions.length}</div></div>
                <div className="rounded-2xl bg-white px-4 py-3 border border-blue-100"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">自动规则命中</div><div className="mt-1 text-2xl font-black text-slate-800">{automationEvents.length}</div></div>
                <div className="rounded-2xl bg-white px-4 py-3 border border-blue-100"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">开放人工任务</div><div className="mt-1 text-2xl font-black text-slate-800">{taskItems.filter((item: any) => item.status !== 'completed' && item.status !== 'closed').length}</div></div>
              </div>
              {automationEvents.length > 0 && (
                <div className="mt-4 space-y-2">
                  {automationEvents.slice(-3).reverse().map((item: any) => (
                    <div key={item.id} className="rounded-2xl bg-white border border-blue-100 px-4 py-3 text-xs text-slate-600">
                      <div className="font-black text-slate-800">{item.payload?.summary || item.payload?.event_type || 'automation_rule_applied'}</div>
                      <div className="mt-1">{formatTime(item.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedCaseDetail.current_stage === 'triage' && (
              <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2"><GitBranch size={16} className="text-amber-600" /><h5 className="font-black text-slate-800">研判决策栏</h5></div>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl bg-white px-4 py-3 border border-amber-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">当前结论</div>
                      <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.triage_decision, DECISION_LABELS)}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-amber-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">准入状态</div>
                      <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.triage_gate, TRIAGE_GATE_LABELS)}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-amber-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">研判轮次</div>
                      <div className="mt-1 text-2xl font-black text-slate-800">{selectedCaseDetail.triage_round || 1}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-amber-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">待处理人工分析</div>
                      <div className="mt-1 text-2xl font-black text-slate-800">{openManualAnalysisTasks.length}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white border border-amber-100 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">进入验证前检查清单</div>
                    <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                      {triageChecklist.map((item) => (
                        <div key={item.key} className={`rounded-xl border px-3 py-3 ${item.done ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                          <div className="flex items-center gap-2">
                            {item.done ? <CheckCheck size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}
                            <div className="text-sm font-black text-slate-800">{item.label}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{item.helper}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2"><CheckCheck size={16} className="text-amber-600" /><h5 className="font-black text-slate-800">研判操作建议</h5></div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {triageChecklist.every((item) => item.done)
                      ? '当前案例已具备进入验证阶段的基础条件，可以继续推进到验证阶段。'
                      : '当前案例还有研判前置条件未完成，建议先补齐推荐动作、分析结果或人工确认。'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setTaskForm({ ...taskForm, task_type: 'manual_analysis' })} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black">
                      预置人工分析任务
                    </button>
                    <button onClick={() => setDispatchForm({ ...dispatchForm, action_type: preferredActionType || 'analysis' })} className="px-4 py-3 rounded-2xl bg-blue-50 text-blue-700 text-sm font-black">
                      预置分析动作
                    </button>
                  </div>
                  <button
                    onClick={() => handleStageTransition('validation')}
                    disabled={transitioningStage || !triageChecklist.every((item) => item.done)}
                    className="w-full px-5 py-3 rounded-2xl bg-amber-600 text-white font-black disabled:opacity-50"
                  >
                    通过检查后进入验证阶段
                  </button>
                </div>
              </div>
            )}

            {selectedCaseDetail.current_stage === 'validation' && (
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2"><Waypoints size={16} className="text-emerald-600" /><h5 className="font-black text-slate-800">验证流水线</h5></div>
                  <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
                    {validationPipeline.map((step) => (
                      <div key={step.key} className={`rounded-2xl border px-4 py-4 ${step.failedCount > 0 ? 'border-rose-200 bg-rose-50/70' : step.activeCount > 0 ? 'border-blue-200 bg-blue-50/70' : step.latestAction ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-black text-slate-800">{step.label}</div>
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600">
                            {step.latestAction?.execution_status || '未开始'}
                          </span>
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          {step.latestResult?.summary || step.latestAction?.result_summary || '当前还没有执行记录'}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                          <span>活跃 {step.activeCount}</span>
                          <span>失败 {step.failedCount}</span>
                          {step.latestAction?.target_service_id ? <span>{step.latestAction.target_service_id}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2"><ShieldAlert size={16} className="text-emerald-600" /><h5 className="font-black text-slate-800">验证摘要</h5></div>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl bg-white px-4 py-3 border border-emerald-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">验证结果</div>
                      <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-emerald-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">成功动作</div>
                      <div className="mt-1 text-2xl font-black text-slate-800">{actionItems.filter((item: any) => item.execution_status === 'succeeded').length}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-emerald-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">失败动作</div>
                      <div className="mt-1 text-2xl font-black text-slate-800">{actionItems.filter((item: any) => item.execution_status === 'failed').length}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 border border-emerald-100">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">待办验证</div>
                      <div className="mt-1 text-2xl font-black text-slate-800">{taskItems.filter((item: any) => item.task_type === 'manual_validation' && item.status !== 'completed' && item.status !== 'closed').length}</div>
                    </div>
                  </div>
                  {resultItems.length > 0 ? (
                    <div className="rounded-2xl bg-white border border-emerald-100 px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">最近验证信号</div>
                      <div className="mt-3 space-y-2">
                        {resultItems.slice(0, 3).map((item: any) => (
                          <div key={`verification-signal-${item.id}`} className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                            <div className="font-black text-slate-800">{item.summary || '未填写摘要'}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {labelOf(item.result_type, {
                                validation: '验证结果',
                                poc: 'POC 材料',
                                exp: 'EXP 材料',
                                feedback: '反馈结果',
                                analysis: '分析结果',
                              })} · {item.source_service_id || '未知服务'} · {formatTime(item.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white border border-amber-100 px-4 py-3 text-sm text-amber-700">
                      当前还没有任何验证回传结果，建议先派发验证动作或创建人工验证任务。
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2"><CheckCheck size={16} className="text-emerald-600" /><h5 className="font-black text-slate-800">提交验证结论</h5></div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                    <div>成功动作：<span className="font-black text-slate-800">{succeededActionItems.length}</span></div>
                    <div>失败动作：<span className="font-black text-slate-800">{failedActionItems.length}</span></div>
                    <div>待处理人工验证：<span className="font-black text-slate-800">{openManualValidationTasks.length}</span></div>
                  </div>
                  <form onSubmit={handleSubmitValidationResult} className="space-y-3">
                    <select
                      value={validationForm.validation_result}
                      onChange={(event) => setValidationForm({ ...validationForm, validation_result: event.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white"
                    >
                      {(validationResultOptions || []).map((item: string) => (
                        <option key={item} value={item}>{labelOf(item, VALIDATION_RESULT_LABELS)}</option>
                      ))}
                    </select>
                    <textarea
                      value={validationForm.summary}
                      onChange={(event) => setValidationForm({ ...validationForm, summary: event.target.value })}
                      placeholder="补充验证结论、失败原因、环境限制或证明材料说明"
                      className="min-h-[7rem] w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none resize-none"
                    />
                    <button type="submit" disabled={submittingValidation} className="w-full px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black">
                      {submittingValidation ? '提交中...' : '提交验证结论'}
                    </button>
                  </form>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    提交后会更新当前案例的验证结论，并记录到时间线，后续可推进到结束阶段。
                  </div>
                </div>
              </div>
              </div>
            )}

            {selectedCaseDetail.current_stage === 'finished' && (
              <div className="rounded-[1.5rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] p-4 space-y-4">
                <div className="flex items-center gap-2"><CheckCheck size={16} className="text-slate-700" /><h5 className="font-black text-slate-800">终态闭环卡</h5></div>
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">结束原因</div>
                    <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.finished_reason, FINISHED_REASON_LABELS)}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">验证结论</div>
                    <div className="mt-1 font-black text-slate-800">{labelOf(selectedCaseDetail.validation_result, VALIDATION_RESULT_LABELS)}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">结果回传</div>
                    <div className="mt-1 font-black text-slate-800">{latestProofVerificationAction ? latestProofVerificationAction.execution_status : '未触发'}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">未关闭任务</div>
                    <div className="mt-1 text-2xl font-black text-slate-800">{openTasks.length}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                  <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">最后关键结果</div>
                    <div className="mt-3 text-sm font-black text-slate-800">{latestVerificationSignal?.summary || '暂无关键结果摘要'}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      {latestVerificationSignal
                        ? `${latestVerificationSignal.source_service_id || '未知服务'} · ${formatTime(latestVerificationSignal.created_at)}`
                        : '建议结合时间线和结果页补充终态回传说明'}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">闭环状态</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>运行中动作：<span className="font-black text-slate-800">{runningActionItems.length}</span></div>
                      <div>失败动作：<span className="font-black text-slate-800">{failedActionItems.length}</span></div>
                      <div>回传动作：<span className="font-black text-slate-800">{latestProofVerificationAction ? '已存在' : '缺失'}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!compactLayout && showPhasePreset && (phasePresetLabel || preferredActionType || preferredTaskType) && (
              <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">阶段快捷预设</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{phasePresetLabel || '当前阶段工作预设'}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {preferredActionType && (
                    <button
                      onClick={() => setDispatchForm({ ...dispatchForm, action_type: preferredActionType })}
                      className="px-3 py-2 rounded-xl bg-white border border-indigo-100 text-xs font-black text-indigo-700"
                    >
                      预置动作：{labelOf(preferredActionType, ACTION_TYPE_LABELS)}
                    </button>
                  )}
                  {preferredTaskType && (
                    <button
                      onClick={() => setTaskForm({ ...taskForm, task_type: preferredTaskType })}
                      className="px-3 py-2 rounded-xl bg-white border border-indigo-100 text-xs font-black text-indigo-700"
                    >
                      预置任务: {preferredTaskType}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2"><Sparkles size={16} className="text-blue-500" /><h5 className="font-black text-slate-800">派发动作</h5></div>
                <div className="grid grid-cols-2 gap-3">
                  <select value={dispatchForm.action_type} onChange={(event) => setDispatchForm({ ...dispatchForm, action_type: event.target.value })} className="px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white">
                    <option value="">全部动作</option>
                    {ACTION_TYPES.map((item) => <option key={item} value={item}>{labelOf(item, ACTION_TYPE_LABELS)}</option>)}
                  </select>
                  <select value={dispatchForm.service_id} onChange={(event) => setDispatchForm({ ...dispatchForm, service_id: event.target.value })} className="px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white">
                    <option value="">全部服务</option>
                    {services.map((item: any) => <option key={item.service_id} value={item.service_id}>{item.service_name}</option>)}
                  </select>
                </div>
                <button onClick={handleDispatch} disabled={dispatching} className="w-full px-5 py-3 rounded-2xl bg-blue-600 text-white font-black flex items-center justify-center gap-2"><Send size={16} />{dispatching ? '派发中...' : '按路由派发动作'}</button>
                <button onClick={handleAutoOrchestrate} disabled={autoOrchestrating} className="w-full px-5 py-3 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center gap-2"><Waypoints size={16} />{autoOrchestrating ? '编排中...' : '一键自动编排'}</button>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">可快速触发的服务</p>
                  <div className="flex flex-wrap gap-2">
                    {quickDispatchServices.length === 0 ? <span className="text-xs text-slate-400">当前筛选下没有匹配服务</span> : quickDispatchServices.map((service: any) => (
                      <button key={`quick-${service.service_id}`} onClick={() => setDispatchForm({ ...dispatchForm, service_id: service.service_id })} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700">{service.service_name}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">当前阶段推荐</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendedActions.length === 0 ? <span className="text-xs text-slate-400">当前阶段暂无推荐动作</span> : recommendedActions.slice(0, 8).map((item: any) => (
                      <button key={`${item.service_id}-${item.capability_code}`} onClick={() => setDispatchForm({ action_type: item.action_type, service_id: item.service_id })} className={`px-3 py-2 rounded-xl text-xs font-black ${item.already_active ? 'bg-slate-200 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                        {labelOf(item.action_type, ACTION_TYPE_LABELS)} · {item.service_name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2"><GitBranch size={16} className="text-indigo-500" /><h5 className="font-black text-slate-800">阶段推进</h5></div>
                <p className="text-xs text-slate-500">当前阶段 <span className="font-black text-slate-700">{labelOf(selectedCaseDetail.current_stage, STAGE_LABELS)}</span>，可流转阶段 <span className="font-black text-slate-700">{(nextStageMap[selectedCaseDetail.current_stage] || []).map((item: string) => labelOf(item, STAGE_LABELS)).join(' / ') || '无'}</span></p>
                <div className="flex flex-wrap gap-2">
                  {(nextStageMap[selectedCaseDetail.current_stage] || []).map((stage: string) => (
                    <button key={stage} onClick={() => handleStageTransition(stage)} disabled={transitioningStage || stage === selectedCaseDetail.current_stage} className={`px-3 py-2 rounded-xl text-xs font-black ${stage === selectedCaseDetail.current_stage ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-700'}`}>{labelOf(stage, STAGE_LABELS)}</button>
                  ))}
                </div>
                {['triage', 'validation'].includes(selectedCaseDetail.current_stage) && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">人工结束案例</div>
                    <select value={finishForm.finished_reason} onChange={(event) => setFinishForm({ ...finishForm, finished_reason: event.target.value })} className="w-full px-3 py-2 rounded-xl border border-rose-200 bg-white text-xs font-semibold outline-none">
                      {FINISHED_REASON_OPTIONS.map((item) => (
                        <option key={item} value={item}>{labelOf(item, FINISHED_REASON_LABELS)}</option>
                      ))}
                    </select>
                    <input value={finishForm.summary} onChange={(event) => setFinishForm({ ...finishForm, summary: event.target.value })} placeholder="结束说明（必填）" className="w-full px-3 py-2 rounded-xl border border-rose-200 outline-none text-sm" />
                    <button onClick={handleFinishCase} disabled={submittingFinish} className="w-full px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black">
                      {submittingFinish ? '结束中...' : '结束案例'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-2"><CheckCheck size={16} className="text-emerald-500" /><h5 className="font-black text-slate-800">人工裁决</h5></div>
              <form onSubmit={handleSubmitDecision} className="grid grid-cols-1 xl:grid-cols-[12rem_1fr_auto] gap-3">
                <select value={decisionForm.decision_status} onChange={(event) => setDecisionForm({ ...decisionForm, decision_status: event.target.value })} className="px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white">
                  {DECISION_OPTIONS.map((item) => <option key={item} value={item}>{labelOf(item, DECISION_LABELS)}</option>)}
                </select>
                <input value={decisionForm.summary} onChange={(event) => setDecisionForm({ ...decisionForm, summary: event.target.value })} placeholder="补充这次人工裁决的说明" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
                <button type="submit" disabled={submittingDecision} className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black">{submittingDecision ? '提交中...' : '提交裁决'}</button>
              </form>
            </div>

            <div className="border-b border-slate-100 flex gap-2">
              {[
                { key: 'timeline', label: '时间线', icon: FileClock },
                { key: 'actions', label: '动作队列', icon: Sparkles },
                { key: 'results', label: '结果', icon: Activity },
                { key: 'tasks', label: '人工任务', icon: ListTodo },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as 'timeline' | 'results' | 'tasks' | 'actions')} className={`px-4 py-3 rounded-t-2xl text-sm font-black flex items-center gap-2 ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'timeline' && (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {selectedTimeline.length === 0 ? (
                  <div className="text-sm text-slate-400">暂无时间线数据</div>
                ) : (
                  selectedTimeline.map((item: any) => (
                    <div key={item.id} className="rounded-[1.5rem] border border-slate-200 px-4 py-4 bg-[rgba(255,255,255,0.04)]">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded-lg bg-blue-100 text-[10px] font-black uppercase tracking-widest text-blue-700">{item.item_type}</span>
                          <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
                        </div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                      <pre className="mt-3 text-xs text-slate-600 whitespace-pre-wrap break-words">{JSON.stringify(item.payload, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {actionItems.length === 0 ? (
                  <div className="text-sm text-slate-400">当前案例还没有派发动作</div>
                ) : (
                  actionItems.map((item: any) => (
                    <div key={item.id} className="rounded-[1.5rem] border border-slate-200 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-1 rounded-lg bg-blue-100 text-[10px] font-black uppercase tracking-widest text-blue-700">{labelOf(item.action_type, ACTION_TYPE_LABELS)}</span>
                            <span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600">{item.execution_status}</span>
                            {item.target_service_id && <span className="px-2 py-1 rounded-lg bg-emerald-100 text-[10px] font-black uppercase tracking-widest text-emerald-700">{item.target_service_id}</span>}
                            {item.execution_status === 'failed' && <span className="px-2 py-1 rounded-lg bg-rose-100 text-[10px] font-black uppercase tracking-widest text-rose-700">异常</span>}
                            {['queued', 'running'].includes(item.execution_status) && <span className="px-2 py-1 rounded-lg bg-amber-100 text-[10px] font-black uppercase tracking-widest text-amber-700">进行中</span>}
                            {item.action_type === 'proof_verification' && selectedCaseDetail.current_stage === 'finished' && (
                              <span className="px-2 py-1 rounded-lg bg-indigo-100 text-[10px] font-black uppercase tracking-widest text-indigo-700">终态回传</span>
                            )}
                          </div>
                          <p className="text-sm font-black text-slate-800">{item.result_summary || '等待外部服务回传结果'}</p>
                          <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
                            <span>阶段：{labelOf(item.stage, STAGE_LABELS)}</span>
                            <span>派发：{item.dispatch_status}</span>
                            <span>创建：{formatTime(item.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => handleSimulateActionResult(item, 'succeeded')} disabled={callbackingActionId === item.id || actionOperatingId === item.id} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2"><Check size={13} />{callbackingActionId === item.id ? '回传中...' : '模拟成功'}</button>
                          <button onClick={() => handleSimulateActionResult(item, 'failed')} disabled={callbackingActionId === item.id || actionOperatingId === item.id} className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black flex items-center gap-2"><X size={13} />失败回传</button>
                          <button onClick={() => handleActionControl(item.id, 'retry')} disabled={callbackingActionId === item.id || actionOperatingId === item.id} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black">{actionOperatingId === item.id ? '处理中...' : '重试排队'}</button>
                          <button onClick={() => handleActionControl(item.id, 'cancel')} disabled={callbackingActionId === item.id || actionOperatingId === item.id} className="px-3 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-black">取消</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'results' && (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {resultItems.length === 0 ? (
                  <div className="text-sm text-slate-400">还没有回传结果</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      {resultSummaryCards.map((item) => (
                        <div key={`summary-${item.id}`} className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/50 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-1 rounded-lg bg-indigo-100 text-[10px] font-black uppercase tracking-widest text-indigo-700">{item.resultType}</span>
                              <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-black uppercase tracking-widest text-slate-600">{item.status}</span>
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">置信度 {item.confidence}</div>
                          </div>
                          <div className="mt-3 text-sm font-black text-slate-800">{item.title}</div>
                          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                            <span>来源：{item.source}</span>
                            {item.suggestedDecision ? <span>建议结论：{item.suggestedDecision}</span> : null}
                            {item.suggestedStage ? <span>建议阶段：{item.suggestedStage}</span> : null}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-400">{formatTime(item.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  {resultItems.map((item: any) => (
                    <div key={item.id} className="rounded-[1.5rem] border border-slate-200 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-1 rounded-lg bg-indigo-100 text-[10px] font-black uppercase tracking-widest text-indigo-700">{item.result_type}</span>
                            <span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600">{item.status}</span>
                            {item.source_service_id && <span className="px-2 py-1 rounded-lg bg-emerald-100 text-[10px] font-black uppercase tracking-widest text-emerald-700">{item.source_service_id}</span>}
                          </div>
                          <p className="mt-3 text-sm font-black text-slate-800">{item.summary || '未填写摘要'}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">置信度</div>
                          <div className="mt-1 text-xl font-black text-slate-800">{item.confidence}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">结果元数据</div>
                          <pre className="mt-2 text-xs text-slate-600 whitespace-pre-wrap break-words">{JSON.stringify(item.result_meta, null, 2)}</pre>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">原始内容与建议</div>
                          <pre className="mt-2 text-xs text-slate-600 whitespace-pre-wrap break-words">{JSON.stringify({ suggested_stage: item.suggested_stage, suggested_decision: item.suggested_decision, raw_payload: item.raw_payload }, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-5">
                <form onSubmit={handleCreateTask} className="rounded-[1.5rem] border border-slate-200 p-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <select value={taskForm.task_type} onChange={(event) => setTaskForm({ ...taskForm, task_type: event.target.value })} className="px-4 py-3 rounded-2xl border border-slate-200 outline-none bg-white">
                    <option value="manual_review">人工复核</option>
                    <option value="manual_analysis">人工分析</option>
                    <option value="manual_validation">人工验证</option>
                    <option value="manual_decision">人工裁决</option>
                  </select>
                  <input value={taskForm.assignee} onChange={(event) => setTaskForm({ ...taskForm, assignee: event.target.value })} placeholder="指派给谁" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none" />
                  <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="任务标题" className="px-4 py-3 rounded-2xl border border-slate-200 outline-none xl:col-span-2" required />
                  <textarea value={taskForm.summary} onChange={(event) => setTaskForm({ ...taskForm, summary: event.target.value })} placeholder="任务说明" className="min-h-[6rem] px-4 py-3 rounded-2xl border border-slate-200 outline-none resize-none xl:col-span-2" />
                  <button type="submit" disabled={creatingTask} className="xl:col-span-2 px-5 py-3 rounded-2xl bg-amber-500 text-white font-black">{creatingTask ? '创建中...' : '创建人工任务'}</button>
                </form>

                <div className="space-y-3 max-h-[20rem] overflow-y-auto pr-1">
                  {taskItems.length === 0 ? (
                    <div className="text-sm text-slate-400">当前案例还没有人工任务</div>
                  ) : (
                    taskItems.map((item: any) => (
                      <div key={item.id} className="rounded-[1.5rem] border border-slate-200 px-4 py-4 bg-[rgba(255,255,255,0.04)]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-800">{item.title}</p>
                            <p className="text-xs text-slate-500 mt-1">{item.summary || '暂无说明'}</p>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-1 rounded-lg bg-amber-100 text-[10px] font-black uppercase tracking-widest text-amber-700">{item.status}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
                          <span>{labelOf(item.task_type, TASK_TYPE_LABELS)}</span>
                          <span>负责人：{item.assignee || '未指派'}</span>
                          <span>创建：{formatTime(item.created_at)}</span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => handleTaskStatus(item.id, 'in_progress')} disabled={taskOperatingId === item.id} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700">进行中</button>
                          <button onClick={() => handleTaskStatus(item.id, 'completed')} disabled={taskOperatingId === item.id} className="px-3 py-2 rounded-xl bg-emerald-600 text-xs font-black text-white">完成</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {compactLayout && (
              <div className="rounded-[1.25rem] border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">自定义 Panels</div>
                  <button
                    type="button"
                    onClick={() => setShowPanelEditor((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-slate-700"
                  >
                    <Plus size={12} />
                    新增 Panel
                  </button>
                </div>
                {showPanelEditor && (
                  <div className="rounded-xl border border-slate-200 bg-[rgba(255,255,255,0.04)] p-3 space-y-2">
                    <input
                      value={newPanelTitle}
                      onChange={(event) => setNewPanelTitle(event.target.value)}
                      placeholder="Panel 标题"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    />
                    <textarea
                      value={newPanelContent}
                      onChange={(event) => setNewPanelContent(event.target.value)}
                      placeholder="Panel 内容（可选）"
                      className="min-h-[74px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddPanel}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                )}
                {customPanels.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-400">暂无自定义 Panel</div>
                ) : (
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {customPanels.map((panel) => (
                      <div key={panel.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-black text-slate-800">{panel.title}</div>
                          <button
                            type="button"
                            onClick={() => handleDeletePanel(panel.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700"
                          >
                            <Trash2 size={10} />
                            删除
                          </button>
                        </div>
                        {panel.content ? <div className="mt-2 text-xs leading-5 text-slate-600 whitespace-pre-wrap break-words">{panel.content}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    )}

    {!compactLayout && !hideCasePool && <div className="space-y-6">
      <div className={cardClass}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-800">阶段分布与运行趋势</h3>
        </div>
        <div className="p-6 space-y-4">
          {Object.entries(overview?.stage_counts || {}).length === 0 ? (
            <div className="text-sm text-slate-400">暂无阶段统计</div>
          ) : (
            Object.entries(overview?.stage_counts || {}).map(([stage, count]) => (
              <div key={stage} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-black text-slate-700">{stage}</span>
                  <span className="text-slate-400">{count as number}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${overview?.metrics?.total_cases ? ((count as number) / overview.metrics.total_cases) * 100 : 0}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-6 rounded-[2rem] text-white shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-3"><Bot size={18} className="text-blue-300" /><h3 className="text-lg font-black">案例运行提示</h3></div>
        <div className="mt-4 space-y-3 text-sm text-slate-200">
          <div className="flex items-start gap-3"><Sparkles size={15} className="mt-0.5 text-blue-300" /><p>优先看自动推进信号和推荐动作，再决定手动派发还是一键自动编排。</p></div>
          <div className="flex items-start gap-3"><ListTodo size={15} className="mt-0.5 text-amber-300" /><p>当结果失败或低置信度时，引擎会自动创建人工任务，记得在任务页统一处理。</p></div>
        </div>
      </div>
    </div>}
  </div>
  );
};
