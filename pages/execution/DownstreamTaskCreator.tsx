import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, FolderOpen, Loader2, PlayCircle, ShieldCheck, X } from 'lucide-react';

import { api } from '../../clients/api';
import { ProjectFilesystemPickerModal } from '../../components/assets/ProjectFilesystemPickerModal';
import { clearExecutionReturnContext } from '../../utils/executionReturnContext';
import {
  asBinarySecurityContract,
  contractText,
  dfaContractSourceRootPath,
  legacyContractValue,
} from '../../utils/binarySecurityContracts';
import { B2SElfTaskInput, B2STaskDetail } from '../../clients/binaryToSource';
import {
  DataflowCreateTaskPayload,
  DataflowInputRef,
  DataflowProfileConfigPayload,
  DataflowScanProfile,
} from '../../clients/dataflowVulnScanner';
import {
  AppDfaTaskDetail,
  AppDfaTaskResult,
  AppEaEntryDetail,
  AppEaTaskDetail,
  AppEaTaskResult,
  AppSaResultModule,
  AppSaTaskDetail,
  AppSaTaskResult,
} from '../../types/types';
import { FirmwareTaskResult, FirmwareUnpackTask } from '../../clients/firmwareUnpacker';

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

type SourceKind = 'firmware_unpack' | 'system_analysis' | 'binary_to_source' | 'entry_analysis' | 'dataflow_analysis';
type DownstreamMode = 'binary' | 'source';
type TargetStage = 'system_analysis' | 'binary_to_source' | 'entry_analysis' | 'dataflow_analysis' | 'vuln_scan';

type Candidate = {
  key: string;
  label: string;
  description?: string;
  disabledReason?: string;
  payload: Record<string, any>;
};

type CreatedTask = {
  id: string;
  label: string;
  targetStage: TargetStage;
};

type Props = {
  projectId: string;
  sourceKind: SourceKind;
  task: FirmwareUnpackTask | AppSaTaskDetail | B2STaskDetail | AppEaTaskDetail | AppDfaTaskDetail | null;
  className?: string;
  buttonClassName?: string;
};

const TARGET_LABEL: Record<TargetStage, string> = {
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
  vuln_scan: '数据流漏洞挖掘',
};

const SOURCE_LABEL: Record<SourceKind, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
};

const DEFAULT_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50';

const DEFAULT_DATAFLOW_VULN_RUNS_ROOT = '/app/secflow-app-dataflow-vuln-scan';
const DEFAULT_DATAFLOW_VULN_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const FORM_INPUT_CLASS = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500';
const REVIEW_PROFILE_OPTIONS = [
  { value: 'fast', label: '快速筛选' },
  { value: 'balanced', label: '平衡挖掘' },
  { value: 'audit', label: '深度审计' },
];
const REVIEW_PROFILE_DEFAULT_MAX_CYCLES: Record<string, number> = {
  fast: 1,
  balanced: 6,
  audit: 10,
};

type DownstreamVulnCreateState = {
  title: string;
  profileId: string;
  workspacePath: string;
  dataFlowPath: string;
  sourcePath: string;
  model: string;
  provider: string;
  reviewProfile: string;
  maxReviewCycles: number;
  timeoutMaxRetries: number;
  timeoutRetryIntervalSeconds: number;
  resultReviewConcurrency: number;
  runtimeOverridesText: string;
  autoReportVulnerabilities: boolean;
};

function downstreamVulnDefaultConfigPayload(): DataflowProfileConfigPayload {
  return {
    model: DEFAULT_DATAFLOW_VULN_MODEL,
    review_profile: 'fast',
    max_review_cycles: REVIEW_PROFILE_DEFAULT_MAX_CYCLES.fast,
    worker_timeout: 3600,
    advisor_timeout: 3600,
    timeout_max_retries: 3,
    timeout_retry_interval_seconds: 30,
    result_review_concurrency: 3,
    runtime_overrides: {},
  };
}

function normalizeDownstreamVulnConfigPayload(value?: Partial<DataflowProfileConfigPayload> | null): DataflowProfileConfigPayload {
  return {
    ...downstreamVulnDefaultConfigPayload(),
    ...(value || {}),
    runtime_overrides: value?.runtime_overrides || {},
  };
}

function initialDownstreamVulnCreateState(overrides?: Partial<DownstreamVulnCreateState>): DownstreamVulnCreateState {
  const defaults = downstreamVulnDefaultConfigPayload();
  return {
    title:`dataflow-vuln-${new Date().toISOString().slice(0, 16).replace('T', '-')}`,
    profileId: '',
    workspacePath: DEFAULT_DATAFLOW_VULN_RUNS_ROOT,
    dataFlowPath: '',
    sourcePath: '',
    model: defaults.model,
    provider: '',
    reviewProfile: defaults.review_profile || 'fast',
    maxReviewCycles: defaults.max_review_cycles,
    timeoutMaxRetries: defaults.timeout_max_retries ?? 3,
    timeoutRetryIntervalSeconds: defaults.timeout_retry_interval_seconds ?? 30,
    resultReviewConcurrency: defaults.result_review_concurrency,
    runtimeOverridesText: '',
    autoReportVulnerabilities: true,
    ...(overrides || {}),
  };
}

function applyConfigPayloadToDownstreamVulnState(
  state: DownstreamVulnCreateState,
  configPayload: DataflowProfileConfigPayload,
  options?: { preserveModel?: boolean; preserveReviewProfile?: boolean; preserveMaxReviewCycles?: boolean },
): DownstreamVulnCreateState {
  return {
    ...state,
    model: options?.preserveModel ? state.model : configPayload.model,
    reviewProfile: options?.preserveReviewProfile ? state.reviewProfile : (configPayload.review_profile || downstreamVulnDefaultConfigPayload().review_profile || 'fast'),
    maxReviewCycles: options?.preserveMaxReviewCycles ? state.maxReviewCycles : configPayload.max_review_cycles,
    timeoutMaxRetries: configPayload.timeout_max_retries ?? 3,
    timeoutRetryIntervalSeconds: configPayload.timeout_retry_interval_seconds ?? 30,
    resultReviewConcurrency: configPayload.result_review_concurrency,
  };
}

function resolveDefaultVulnProfile(profiles: DataflowScanProfile[]): DataflowScanProfile | null {
  return profiles.find((item) => item.is_default && item.enabled)
    || profiles.find((item) => item.enabled)
    || null;
}

function buildDownstreamVulnConfigOverrides(
  state: DownstreamVulnCreateState,
  baseline: DataflowProfileConfigPayload,
): Partial<DataflowCreateTaskPayload> {
  const overrides: Partial<DataflowCreateTaskPayload> = {};
  const shouldSend = <T,>(value: T, baselineValue: T) => value !== baselineValue;
  const model = state.model.trim();
  const provider = state.provider.trim();
  if (provider) {
    overrides.provider = provider;
    if (model) overrides.model = model;
  } else if (model && shouldSend(model, baseline.model)) {
    overrides.model = model;
  }
  if (state.reviewProfile && shouldSend(state.reviewProfile, baseline.review_profile || 'balanced')) {
    overrides.review_profile = state.reviewProfile;
  }
  if (shouldSend(state.maxReviewCycles, baseline.max_review_cycles)) {
    overrides.max_review_cycles = state.maxReviewCycles;
  }
  if (shouldSend(state.timeoutMaxRetries, baseline.timeout_max_retries ?? 3)) {
    overrides.timeout_max_retries = state.timeoutMaxRetries;
  }
  if (shouldSend(state.timeoutRetryIntervalSeconds, baseline.timeout_retry_interval_seconds ?? 30)) {
    overrides.timeout_retry_interval_seconds = state.timeoutRetryIntervalSeconds;
  }
  if (shouldSend(state.resultReviewConcurrency, baseline.result_review_concurrency)) {
    overrides.result_review_concurrency = state.resultReviewConcurrency;
  }
  return overrides;
}

function parseJsonObject(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed;
}

function taskIdOf(task: Props['task']): string {
  if (!task) return '';
  return String((task as any).task_id || (task as any).id || '');
}

function taskNameOf(task: Props['task']): string {
  if (!task) return '';
  return String((task as any).task_name || (task as any).name || (task as any).firmware_path || taskIdOf(task) || 'task');
}

function isComplete(sourceKind: SourceKind, task: Props['task']): boolean {
  if (!task) return false;
  const status = String((task as any).status || '').toLowerCase();
  if (sourceKind === 'firmware_unpack') return status === 'success';
  if (sourceKind === 'binary_to_source') {
    const detail = task as B2STaskDetail;
    return status === 'success' || (status === 'partial_success' && detail.items?.some((item) => item.status === 'success'));
  }
  return status === 'passed' || status === 'success';
}

function basename(path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized || 'item';
}

function dirname(path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return normalized.startsWith('/') ? '/' : '';
  return`${normalized.startsWith('/') ? '/' : ''}${parts.slice(0, -1).join('/')}`;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

function joinPath(base: string, child: string): string {
  if (!base) return child;
  if (!child) return base;
  if (child.startsWith('/')) return child;
  return`${base.replace(/\/+$/, '')}/${child.replace(/^\/+/, '')}`;
}

function normalizeProjectScopedDisplayPath(projectId: string, path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/').trim();
  if (!normalized) return '';
  const projectRoot =`/data/files/${projectId}`;
  if (normalized === projectRoot) return '/';
  if (normalized.startsWith(`${projectRoot}/`)) {
    return`/${normalized.slice(projectRoot.length + 1).replace(/^\/+/, '')}`;
  }
  return normalized.startsWith('/') ? normalized :`/${normalized}`;
}

function dataflowVulnInputRef(projectId: string, path: string): DataflowInputRef {
  const normalized = String(path || '').replace(/\\/g, '/').trim();
  const projectRoot =`/data/files/${projectId}`;
  if (normalized === projectRoot) {
    return { source: 'project_filesystem', path: '/', filename: basename(normalized) };
  }
  if (normalized.startsWith(`${projectRoot}/`)) {
    return {
      source: 'project_filesystem',
      path:`/${normalized.slice(projectRoot.length + 1).replace(/^\/+/, '')}`,
      filename: basename(normalized),
    };
  }
  if (normalized.startsWith('/data/files/')) {
    return { source: 'absolute_path', path: normalized, filename: basename(normalized) };
  }
  return { source: 'project_filesystem', path: normalized.startsWith('/') ? normalized :`/${normalized}`, filename: basename(normalized) };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stripTrailingDataflowDir(path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
  if (!normalized) return '';
  return basename(normalized).toLowerCase() === 'dataflow' ? dirname(normalized) : normalized;
}

function dataflowAnalysisOutputDir(task: AppDfaTaskDetail, result?: AppDfaTaskResult | null): string {
  const taskConfig = asRecord(task.task_config_json);
  const outputSummary = asRecord(task.output_summary);
  const outputContract = asBinarySecurityContract(outputSummary.output_contract || taskConfig.output_contract);
  const rawDataFlowRoot = contractText(outputContract, 'data_flow_root', 'artifact_root', 'archive_root')
    || legacyContractValue(outputSummary, 'data_flow_root', 'dataflow_output_path')
    || result?.output_root
    || (task.output_path && task.task_id ? joinPath(joinPath(task.output_path, task.task_id), 'output') : '');
  return stripTrailingDataflowDir(rawDataFlowRoot);
}

function dataflowAnalysisSourceRoot(task: AppDfaTaskDetail): string {
  const taskConfig = asRecord(task.task_config_json);
  const inputSummary = asRecord(task.input_summary);
  const outputSummary = asRecord(task.output_summary);
  const inputContract = asBinarySecurityContract(taskConfig.input_contract);
  const outputContract = asBinarySecurityContract(outputSummary.output_contract || taskConfig.output_contract);
  return dfaContractSourceRootPath(inputContract, inputSummary)
    || contractText(outputContract, 'source_root_path', 'source_root', 'source_dir')
    || legacyContractValue(outputSummary, 'source_root_path', 'source_root', 'source_dir')
    || String((task as any).source_path || task.input_path || '').trim();
}

function navigateTo(targetStage: TargetStage, id: string, navigate: ReturnType<typeof useNavigate>) {
  if (!id) return;
  clearExecutionReturnContext();
  if (targetStage === 'system_analysis') {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'system-analysis-detail', systemAnalysisTaskId: id } }));
    return;
  }
  if (targetStage === 'binary_to_source') {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'pentest-exec-b2s-detail', b2sTaskId: id } }));
    return;
  }
  if (targetStage === 'entry_analysis') {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'entry-analysis-detail', entryAnalysisTaskId: id } }));
    return;
  }
  if (targetStage === 'dataflow_analysis') {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: id } }));
    return;
  }
  navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(id)}`);
}

function inferMode(task: Props['task']): DownstreamMode {
  const mode = String((task as any)?.analysis_mode || (task as any)?.parent_task_type || '').toLowerCase();
  return mode === 'source' ? 'source' : 'binary';
}

function moduleElfCandidate(module: AppSaResultModule): string {
  const files = module.files || [];
  const moduleDir = module.module_dir_path || '';
  const binaryLike = files.find((file) => /\.(elf|so|ko|o|a|axf)$/i.test(file)) || files[0] || '';
  return binaryLike.startsWith('/') ? binaryLike : joinPath(moduleDir, binaryLike);
}

function systemCandidates(result: AppSaTaskResult | null, mode: DownstreamMode): Candidate[] {
  const modules = result?.modules || [];
  return modules.map((module) => {
    const moduleName = module.module_name ||`module-${module.rank}`;
    if (mode === 'binary') {
      const elfPath = moduleElfCandidate(module);
      return {
        key: moduleName,
        label: moduleName,
        description:`${module.file_count || module.files?.length || 0} 个文件 · 风险 ${module.risk_level || '-'}`,
        disabledReason: !module.module_dir_path || !elfPath ? '缺少模块目录或 ELF 输入文件' : undefined,
        payload: {
          module,
          elfPath,
          fileList: module.files || [],
        },
      };
    }
    return {
      key: moduleName,
      label: moduleName,
      description:`${module.file_count || module.files?.length || 0} 个文件 · 源码入口分析`,
      disabledReason: !module.module_dir_path ? '缺少模块目录' : undefined,
      payload: {
        module,
        inputPath: module.module_dir_path,
        sourcePath: result?.output_root || module.module_dir_path,
      },
    };
  });
}

function b2sCandidates(detail: B2STaskDetail): Candidate[] {
  return (detail.items || []).map((item) => ({
    key: item.id,
    label: stripExt(basename(item.elf_path)),
    description:`${basename(item.elf_path)} · ${item.generated_files?.length || 0} 个结果文件`,
    disabledReason: item.status !== 'success' ? '仅成功 item 可创建入口分析' : !item.output_dir ? '缺少输出源码目录' : undefined,
    payload: { item },
  }));
}

function entryCandidates(result: AppEaTaskResult | null): Candidate[] {
  const details: AppEaEntryDetail[] = (result?.entry_details || []).filter(
    (e) => e.entry_category !== '处理入口',
  );
  const funcdbPath = result?.output_root ? joinPath(result.output_root, 'funcdb') : '';
  return details.map((entry, index) => {
    const fileName = (entry.file || '').split('/').pop() || entry.file || '';
    const taintsStr = (entry.taints || []).join(', ') || '—';
    const conf = entry.confidence != null ?`${Math.round(entry.confidence * 100)}%` : null;
    const descParts = [
      fileName ?`📄 ${fileName}` : null,`污点: ${taintsStr}`,
      conf ?`置信度: ${conf}` : null,
    ].filter(Boolean);
    return {
      key:`${entry.func_hash || entry.function}-${index}`,
      label: entry.function,
      description: descParts.join(' · '),
      payload: {
        functionName: entry.function,
        funcHash: entry.func_hash,
        file: entry.file,
        tag: entry.tag,
        taints: entry.taints,
        taintDetails: entry.taint_details,
        functionDescription: entry.function_description,
        entryReason: entry.entry_reason,
        line: entry.line,
        signature: entry.signature,
        confidence: entry.confidence,
        entryCategory: entry.entry_category,
        funcdbPath,
      },
    };
  });
}

function dataflowCandidates(task: AppDfaTaskDetail, result: AppDfaTaskResult | null): Candidate[] {
  const dataFlowDir = dataflowAnalysisOutputDir(task, result);
  const sourceDir = dataflowAnalysisSourceRoot(task);
  const runsRoot = DEFAULT_DATAFLOW_VULN_RUNS_ROOT;
  const disabledReasons = [
    !runsRoot ? '缺少 Runs 根目录' : '',
    !dataFlowDir ? '缺少数据流目录' : '',
    !sourceDir ? '缺少代码目录' : '',
  ].filter(Boolean);
  const fileCount = result?.dataflow_files?.length || result?.output_files?.length || 0;
  return [{
    key: task.task_id,
    label: task.task_name || task.task_id,
    description: [`Runs 根目录：${runsRoot}`,`数据流目录：${dataFlowDir || '-'}`,`代码目录：${sourceDir || '-'}`,
      fileCount ?`数据流产物 ${fileCount} 个` : '',
    ].filter(Boolean).join(' · '),
    disabledReason: disabledReasons.join('；') || undefined,
    payload: { runsRoot, dataFlowDir, sourceDir },
  }];
}

function buildDownstreamVulnCreatePrefill(
  projectId: string,
  task: AppDfaTaskDetail,
  result: AppDfaTaskResult | null,
  sourceName: string,
  defaultProfile?: DataflowScanProfile | null,
): DownstreamVulnCreateState {
  const candidate = dataflowCandidates(task, result)[0];
  const titleBase = sourceName.trim() || task.task_name || task.task_id;
  const initial = initialDownstreamVulnCreateState({
    title:`${titleBase}-${TARGET_LABEL.vuln_scan}`,
    workspacePath: normalizeProjectScopedDisplayPath(projectId, String(candidate?.payload.runsRoot || DEFAULT_DATAFLOW_VULN_RUNS_ROOT)),
    dataFlowPath: normalizeProjectScopedDisplayPath(projectId, String(candidate?.payload.dataFlowDir || '')),
    sourcePath: normalizeProjectScopedDisplayPath(projectId, String(candidate?.payload.sourceDir || '')),
  });
  if (!defaultProfile) return initial;
  return applyConfigPayloadToDownstreamVulnState(
    initial,
    normalizeDownstreamVulnConfigPayload(defaultProfile.config_payload),
    {
      preserveModel: true,
      preserveReviewProfile: true,
      preserveMaxReviewCycles: true,
    },
  );
}

export const DownstreamTaskCreator: React.FC<Props> = ({
  projectId,
  sourceKind,
  task,
  className = '',
  buttonClassName,
}) => {
  const navigate = useNavigate();
  const executionApi = api.domains.execution;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<DownstreamMode>(inferMode(task));
  const [result, setResult] = useState<any>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [taskPrefix, setTaskPrefix] = useState('');
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<CreatedTask[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [pickerField, setPickerField] = useState<null | 'workspacePath' | 'dataFlowPath' | 'sourcePath'>(null);
  const [vulnProfiles, setVulnProfiles] = useState<DataflowScanProfile[]>([]);
  const [vulnProfilesLoading, setVulnProfilesLoading] = useState(false);
  const [vulnCreateState, setVulnCreateState] = useState<DownstreamVulnCreateState | null>(null);

  const available = isComplete(sourceKind, task);
  const taskId = taskIdOf(task);
  const sourceName = taskNameOf(task);
  const targetStage: TargetStage = useMemo(() => {
    if (sourceKind === 'firmware_unpack') return 'system_analysis';
    if (sourceKind === 'system_analysis') return mode === 'binary' ? 'binary_to_source' : 'entry_analysis';
    if (sourceKind === 'binary_to_source') return 'entry_analysis';
    if (sourceKind === 'entry_analysis') return 'dataflow_analysis';
    return 'vuln_scan';
  }, [mode, sourceKind]);
  const isVulnDownstream = sourceKind === 'dataflow_analysis' && targetStage === 'vuln_scan';

  const modeOptions: DownstreamMode[] = sourceKind === 'system_analysis' || sourceKind === 'entry_analysis'
    ? ['binary', 'source']
    : sourceKind === 'firmware_unpack' || sourceKind === 'binary_to_source'
      ? ['binary']
      : sourceKind === 'dataflow_analysis'
        ? []
        : ['binary', 'source'];

  const candidates = useMemo<Candidate[]>(() => {
    if (!task) return [];
    if (sourceKind === 'firmware_unpack') {
      const fwResult = result as FirmwareTaskResult | null;
      const inputPath = fwResult?.output_root || (task as FirmwareUnpackTask).output_path;
      return [{
        key: taskId,
        label: basename((task as FirmwareUnpackTask).firmware_path),
        description: inputPath,
        disabledReason: !inputPath ? '缺少解包结果目录' : undefined,
        payload: { inputPath },
      }];
    }
    if (sourceKind === 'system_analysis') return systemCandidates(result as AppSaTaskResult | null, mode);
    if (sourceKind === 'binary_to_source') return b2sCandidates(task as B2STaskDetail);
    if (sourceKind === 'entry_analysis') return entryCandidates(result as AppEaTaskResult | null);
    if (sourceKind === 'dataflow_analysis') return dataflowCandidates(task as AppDfaTaskDetail, result as AppDfaTaskResult | null);
    return [];
  }, [mode, result, sourceKind, task, taskId]);

  const selectableCandidates = candidates.filter((item) => !item.disabledReason);
  const selectedCandidates = selectableCandidates.filter((item) => selectedKeys.has(item.key));
  const selectableCandidateKeyList = selectableCandidates.map((item) => item.key).join('\u0000');
  const dataflowVulnPreview = sourceKind === 'dataflow_analysis' ? candidates[0]?.payload : null;
  const defaultPrefix = taskPrefix.trim() || sourceName;
  const pickerTitle = pickerField === 'workspacePath'
    ? '选择 Runs 根目录'
    : pickerField === 'dataFlowPath'
      ? '选择数据流目录'
      : '选择代码目录';
  const pickerDescription = pickerField === 'workspacePath'
    ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择 run_vuln_scan.py 的 --runs-root。系统会在该目录下创建标准 Run 扫描目录。'
    : pickerField === 'dataFlowPath'
      ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择包含数据流分析结果文件的目录。'
      : '从数据流漏洞挖掘服务直接挂载的 /data 中选择要审计的代码目录。';

  const loadResult = async () => {
    if (!task || !taskId || sourceKind === 'binary_to_source') return null;
    setLoading(true);
    setMessage('');
    try {
      let data: unknown = null;
      if (sourceKind === 'firmware_unpack') data = await executionApi.firmwareUnpacker.getTaskResult(taskId);
      if (sourceKind === 'system_analysis') data = await executionApi.appSystemAnalyse.getTaskResult(taskId);
      if (sourceKind === 'entry_analysis') data = await executionApi.appEntryAnalyse.getTaskResult(taskId);
      if (sourceKind === 'dataflow_analysis') data = await executionApi.appDataflowAnalyse.getTaskResult(taskId);
      setResult(data);
      return data;
    } catch (err: any) {
      setMessage(`加载结果失败: ${err?.message || err}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadVulnProfiles = async () => {
    if (!projectId) return [] as DataflowScanProfile[];
    setVulnProfilesLoading(true);
    try {
      const profiles = await executionApi.dataflowVulnScanner.listProfiles(projectId);
      setVulnProfiles(profiles);
      return profiles;
    } catch (err: any) {
      setVulnProfiles([]);
      setMessage((current) => current ||`加载漏洞挖掘 Profile 失败: ${err?.message || err}`);
      return [] as DataflowScanProfile[];
    } finally {
      setVulnProfilesLoading(false);
    }
  };

  const openModal = async () => {
    setOpen(true);
    setMode(inferMode(task));
    setTaskPrefix(`${sourceName}-${TARGET_LABEL[targetStage]}`);
    setCreated([]);
    setMessage('');
    setPickerField(null);
    if (isVulnDownstream && task) {
      const loadedResult = await loadResult() as AppDfaTaskResult | null;
      const profiles = await loadVulnProfiles();
      const defaultProfile = resolveDefaultVulnProfile(profiles);
      setVulnCreateState(buildDownstreamVulnCreatePrefill(projectId, task as AppDfaTaskDetail, loadedResult, sourceName, defaultProfile));
      return;
    }
    setVulnCreateState(null);
    if (sourceKind !== 'binary_to_source') await loadResult();
  };

  React.useEffect(() => {
    setSelectedKeys(new Set(selectableCandidates.map((item) => item.key)));
  }, [selectableCandidateKeyList, mode, open]);

  const createTasks = async () => {
    if (!task) return;
    if (isVulnDownstream) {
      if (!vulnCreateState) return;
      if (!vulnCreateState.title.trim()) {
        setMessage('请输入任务标题');
        return;
      }
      if (!vulnCreateState.workspacePath.trim()) {
        setMessage('请选择 Runs 根目录');
        return;
      }
      if (!vulnCreateState.dataFlowPath.trim()) {
        setMessage('请选择数据流目录');
        return;
      }
      if (!vulnCreateState.sourcePath.trim()) {
        setMessage('请选择代码目录');
        return;
      }
      setSubmitting(true);
      setMessage('');
      setCreated([]);
      try {
        const runtimeOverrides = parseJsonObject(vulnCreateState.runtimeOverridesText, '运行时覆盖');
        const selectedProfile = vulnCreateState.profileId
          ? vulnProfiles.find((item) => item.profile_id === vulnCreateState.profileId)
          : resolveDefaultVulnProfile(vulnProfiles);
        const baselinePayload = normalizeDownstreamVulnConfigPayload(selectedProfile?.config_payload);
        const configOverrides = buildDownstreamVulnConfigOverrides(vulnCreateState, baselinePayload);
        const createdTask = await executionApi.dataflowVulnScanner.createTask({
          project_id: projectId,
          profile_id: vulnCreateState.profileId || undefined,
          title: vulnCreateState.title.trim(),
          workspace_dir: dataflowVulnInputRef(projectId, vulnCreateState.workspacePath),
          data_flow: dataflowVulnInputRef(projectId, vulnCreateState.dataFlowPath),
          source_dir: dataflowVulnInputRef(projectId, vulnCreateState.sourcePath),
          auto_report_vulnerabilities: vulnCreateState.autoReportVulnerabilities,
          ...configOverrides,
          ...(Object.keys(runtimeOverrides).length ? { runtime_overrides: runtimeOverrides } : {}),
        });
        const rows: CreatedTask[] = [{
          id: createdTask.task_id,
          label: createdTask.title || createdTask.task_id,
          targetStage: 'vuln_scan',
        }];
        setCreated(rows);
        setMessage(`已创建 ${rows.length} 个${TARGET_LABEL.vuln_scan}任务`);
      } catch (err: any) {
        setMessage(`创建失败: ${err?.message || err}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (selectedCandidates.length === 0) return;
    setSubmitting(true);
    setMessage('');
    setCreated([]);
    try {
      const rows: CreatedTask[] = [];
      if (sourceKind === 'firmware_unpack') {
        const candidate = selectedCandidates[0];
        const createdTask = await executionApi.appSystemAnalyse.createTask({
          project_id: projectId,
          task_name: defaultPrefix,
          input_path: String(candidate.payload.inputPath),
          analysis_mode: 'binary',
        });
        rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'system_analysis' });
      } else if (sourceKind === 'system_analysis' && mode === 'binary') {
        const elfTasks: B2SElfTaskInput[] = selectedCandidates.map((candidate) => ({
          elf_path: String(candidate.payload.elfPath),
          file_list: candidate.payload.fileList || [],
          output_subdir: String(candidate.label || candidate.key),
          metadata: candidate.payload.module || {},
        }));
        const createdTask = await executionApi.binaryToSource.createTask(projectId, {
          name: defaultPrefix,
          tags: ['manual-downstream', 'system-analysis'],
          elf_tasks: elfTasks,
        });
        rows.push({ id: createdTask.id, label: createdTask.name, targetStage: 'binary_to_source' });
      } else if (sourceKind === 'system_analysis' && mode === 'source') {
        for (const candidate of selectedCandidates) {
          const module = candidate.payload.module as AppSaResultModule;
          const createdTask = await executionApi.appEntryAnalyse.createTask({
            project_id: projectId,
            task_name:`${defaultPrefix}-${candidate.label}`,
            input_path: String(candidate.payload.inputPath),
            module_name: module.module_name,
            source_path: String(candidate.payload.sourcePath || candidate.payload.inputPath),
          });
          rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'entry_analysis' });
        }
      } else if (sourceKind === 'binary_to_source') {
        for (const candidate of selectedCandidates) {
          const item = candidate.payload.item as B2STaskDetail['items'][number];
          const moduleName = stripExt(basename(item.elf_path));
          const createdTask = await executionApi.appEntryAnalyse.createTask({
            project_id: projectId,
            task_name:`${defaultPrefix}-${moduleName}`,
            input_path: item.output_dir,
            module_name: moduleName,
            source_path: item.output_dir,
          });
          rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'entry_analysis' });
        }
      } else if (sourceKind === 'entry_analysis') {
        const entryTask = task as AppEaTaskDetail;
        const moduleName = entryTask.module_name || '';
        const moduleInputPath = String(entryTask.input_path || '').trim();
        const sourceRootPath = String(entryTask.source_path || entryTask.input_path || '').trim();
        if (!moduleInputPath) throw new Error('缺少入口分析任务输入目录 input_path，无法创建数据流分析任务');
        if (!sourceRootPath) throw new Error('缺少源码根目录 source_path，无法创建数据流分析任务');
        for (const candidate of selectedCandidates) {
          const functionName = String(candidate.payload.functionName || '').trim();
          const file = String(candidate.payload.file || '').trim();
          const tag = String(candidate.payload.tag || 'P');
          const taints: string[] = Array.isArray(candidate.payload.taints)
            ? candidate.payload.taints.map((item: any) => String(item).trim()).filter(Boolean)
            : [];
          const taintDetails: { name: string; description?: string; source_kind?: string }[] = Array.isArray(candidate.payload.taintDetails)
            ? candidate.payload.taintDetails
            : [];
          if (!functionName) throw new Error('候选入口缺少函数名，无法创建数据流分析任务');
          if (!file) throw new Error(`候选入口 ${functionName} 缺少 source_file，无法创建数据流分析任务`);
          const taintLines = taints.map((name, i) => {
            const detail = taintDetails.find((d) => d.name === name);
            const detail_desc = detail?.description ?`（${detail.description}）` : '';
            return`污点${i + 1}：${name}${detail_desc}`;
          });
          const header = [
            moduleName ?`分析${moduleName}中` : '分析',
            file ?`${file}的` : '',`${functionName}的污点数据流`,
          ].join('');
          const legacyTaintLine =`\n外部输入参数为: ${taints.join(', ')}`;
          const taintBody = tag === 'A'
            ?`，函数主动拉取了污点，污点为函数内变量:\n${taintLines.join('\n')}${legacyTaintLine}`
            :`，污点为函数入参:\n${taintLines.join('\n')}${legacyTaintLine}`;
          const promptContent = header + taintBody;
          try {
            const createdTask = await executionApi.appDataflowVulnScan.createTask({
              project_id: projectId,
              task_name:`${defaultPrefix}-${functionName}`,
              input_path: moduleInputPath,
              module_input_path: moduleInputPath,
              source_root_path: sourceRootPath,
              prompt_content: promptContent,
              function_name: functionName,
              source_file: file,
              line_hint: candidate.payload.line != null ? String(candidate.payload.line) : undefined,
              funcdb_path: candidate.payload.funcdbPath || undefined,
              func_hash: candidate.payload.funcHash || undefined,
              taint_params: taints.length ? taints : undefined,
              taint_details: taintDetails.length ? taintDetails : undefined,
              function_description: candidate.payload.functionDescription || undefined,
              function_description_source: candidate.payload.functionDescription ? 'agent' : undefined,
              entry_reason: candidate.payload.entryReason || undefined,
              entry_reason_source: candidate.payload.entryReason ? 'agent' : undefined,
              task_origin_type: 'binary_security',
              parent_project_id: projectId,
              parent_task_id: entryTask.task_id,
              parent_task_type: 'source',
              parent_stage_name: 'entry_analysis',
              parent_stage_item_id: candidate.payload.funcHash || undefined,
              parent_stage_item_key: functionName,
            });
            rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'dataflow_analysis' });
          } catch (err: any) {
            throw new Error(`创建 ${functionName} 失败（source_file=${file}）: ${err?.message || err}`);
          }
        }
      } else if (sourceKind === 'dataflow_analysis') {
        for (const candidate of selectedCandidates) {
          const dataFlowDir = String(candidate.payload.dataFlowDir || '').trim();
          const sourceDir = String(candidate.payload.sourceDir || '').trim();
          const runsRoot = String(candidate.payload.runsRoot || DEFAULT_DATAFLOW_VULN_RUNS_ROOT).trim();
          if (!dataFlowDir || !sourceDir || !runsRoot) {
            throw new Error('创建数据流漏洞挖掘任务需要 Runs 根目录、数据流目录和代码目录');
          }
          const title = defaultPrefix.includes(candidate.label) ? defaultPrefix :`${defaultPrefix}-${candidate.label}`;
          const createdTask = await executionApi.dataflowVulnScanner.createTask({
            project_id: projectId,
            title,
            task_markdown:`基于数据流分析任务 ${candidate.label} 的输出执行漏洞挖掘。`,
            workspace_dir: dataflowVulnInputRef(projectId, runsRoot),
            data_flow: dataflowVulnInputRef(projectId, dataFlowDir),
            source_dir: dataflowVulnInputRef(projectId, sourceDir),
            model: DEFAULT_DATAFLOW_VULN_MODEL,
            auto_report_vulnerabilities: true,
          });
          rows.push({ id: createdTask.task_id, label: createdTask.title || createdTask.task_id, targetStage: 'vuln_scan' });
        }
      }
      setCreated(rows);
      setMessage(rows.length ?`已创建 ${rows.length} 个${TARGET_LABEL[targetStage]}任务` : '没有创建任务');
    } catch (err: any) {
      setMessage(`创建失败: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAll = () => {
    if (selectedCandidates.length === selectableCandidates.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(selectableCandidates.map((item) => item.key)));
    }
  };

  if (!task) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void openModal()}
        disabled={!available}
        className={buttonClassName || DEFAULT_BUTTON_CLASS}
        title={available ? '创建下游手动任务' : '任务完成后可创建下游手动任务'}
      >
        <PlayCircle size={14} />
        创建下游任务
      </button>

      {open ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7, 13, 24, 0.7)', padding: '16px 32px', backdropFilter: 'blur(4px)' }}>
          <section style={{ display: 'flex', maxHeight: '90vh', width: '100%', maxWidth: '80rem', flexDirection: 'column', overflow: 'hidden', borderRadius: '20px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface }}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom:`1px solid ${LK.border}`, padding: '20px 24px' }}>
              <div>
                <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, color: LK.ink }}>创建{TARGET_LABEL[targetStage]}</h2>
                <p style={{ marginTop: '4px', fontSize: '14px', color: LK.muted }}>
                  来源：{SOURCE_LABEL[sourceKind]} · 新任务按手动任务创建，不记录父任务来源。
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '8px', backgroundColor: 'transparent', color: LK.muted, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </header>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'minmax(0, 1fr) 280px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {isVulnDownstream ? (
                    <>
                      <div style={{ borderRadius: '12px', border: `1px solid ${LK.success}`, backgroundColor: `${LK.success}1a`, padding: '16px', fontSize: '14px', color: LK.success }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.success }}>Downstream Prefill</div>
                        <div style={{ marginTop: '8px', fontWeight: 600 }}>已按当前数据流分析任务自动填充默认值</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.4', color: LK.success }}>
                          下方配置与”数据流漏洞挖掘 → 创建任务”保持一致；你可以在提交前继续修改 Runs 根目录、数据流目录、代码目录、模型和其它参数。
                        </div>
                      </div>

                      {!vulnCreateState ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px 48px', fontSize: '14px', fontWeight: 600, color: LK.muted }}>
                          <Loader2 size={16} className="animate-spin" />
                          正在准备下游任务默认配置...
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <label className="lg:col-span-2">
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>任务标题 / Run 文件夹名</span>
                              <input
                                value={vulnCreateState.title}
                                onChange={(event) => setVulnCreateState({ ...vulnCreateState, title: event.target.value })}
                                style={{ marginTop: '8px', width: '100%', borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '10px 12px', fontSize: '14px', fontWeight: 600, backgroundColor: LK.surfaceRaised, color: LK.ink, outline: 'none' }}
                              />
                              <span style={{ marginTop: '4px', display: 'block', fontSize: '12px', lineHeight: '1.4', color: LK.muted }}>
                                提交后会作为后端 run_vuln_scan.py 的 --run-name，最终目录名会做安全字符清洗。
                              </span>
                            </label>
                            <label className="lg:col-span-2">
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>Profile</span>
                              <select
                                value={vulnCreateState.profileId}
                                onChange={(event) => {
                                  const profile = vulnProfiles.find((item) => item.profile_id === event.target.value);
                                  const payload = event.target.value
                                    ? normalizeDownstreamVulnConfigPayload(profile?.config_payload)
                                    : downstreamVulnDefaultConfigPayload();
                                  setVulnCreateState({
                                    ...vulnCreateState,
                                    profileId: event.target.value,
                                    model: event.target.value ? payload.model : DEFAULT_DATAFLOW_VULN_MODEL,
                                    reviewProfile: payload.review_profile || downstreamVulnDefaultConfigPayload().review_profile || 'fast',
                                    maxReviewCycles: payload.max_review_cycles,
                                    timeoutMaxRetries: payload.timeout_max_retries ?? 3,
                                    timeoutRetryIntervalSeconds: payload.timeout_retry_interval_seconds ?? 30,
                                    resultReviewConcurrency: payload.result_review_concurrency,
                                  });
                                }}
                                style={{ marginTop: '8px', width: '100%', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '10px 12px', fontSize: '14px', fontWeight: 600, color: LK.ink, outline: 'none' }}
                              >
                                <option value="">使用项目默认 Profile</option>
                                {vulnProfiles.map((profile) => (
                                  <option key={profile.profile_id} value={profile.profile_id} disabled={!profile.enabled}>
                                    {profile.name}{profile.is_default ? '（默认）' : ''}{profile.enabled ? '' : '（停用）'}
                                  </option>
                                ))}
                              </select>
                              {vulnProfilesLoading ? <div style={{ marginTop: '8px', fontSize: '12px', color: LK.muted }}>Profile 列表加载中...</div> : null}
                              {!vulnProfilesLoading && !vulnProfiles.some((profile) => profile.enabled) ? (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: LK.muted }}>当前项目还没有可用 Profile，提交任务时系统会自动创建一个默认扫描 Profile。</div>
                              ) : null}
                            </label>
                          </div>

                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: LK.ink }}>
                                <FolderOpen size={16} />
                                Runs 根目录
                              </div>
                              <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: '1.4', color: LK.muted }}>默认填充为当前项目的 /app/secflow-app-dataflow-vuln-scan，但你仍可修改。</div>
                              <div className="mt-3 flex gap-2">
                                <input
                                  value={vulnCreateState.workspacePath}
                                  onChange={(event) => setVulnCreateState({ ...vulnCreateState, workspacePath: event.target.value })}
                                  placeholder={DEFAULT_DATAFLOW_VULN_RUNS_ROOT}
                                  className={FORM_INPUT_CLASS}
                                />
                                <button type="button" onClick={() => setPickerField('workspacePath')} style={{ flexShrink: 0, borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer' }}>
                                  选择
                                </button>
                              </div>
                            </div>

                            <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: LK.ink }}>
                                <FolderOpen size={16} />
                                数据流目录
                              </div>
                              <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: '1.4', color: LK.muted }}>默认填充为当前数据流分析任务的输出目录，但你仍可修改。</div>
                              <div className="mt-3 flex gap-2">
                                <input
                                  value={vulnCreateState.dataFlowPath}
                                  onChange={(event) => setVulnCreateState({ ...vulnCreateState, dataFlowPath: event.target.value })}
                                  placeholder="/case-a/output"
                                  className={FORM_INPUT_CLASS}
                                />
                                <button type="button" onClick={() => setPickerField('dataFlowPath')} style={{ flexShrink: 0, borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer' }}>
                                  选择
                                </button>
                              </div>
                            </div>

                            <div style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px', gridColumn: '1 / -1' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: LK.ink }}>
                                <FolderOpen size={16} />
                                代码目录
                              </div>
                              <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: '1.4', color: LK.muted }}>默认填充为当前数据流分析任务关联的源码目录，但你仍可修改。</div>
                              <div className="mt-3 flex gap-2">
                                <input
                                  value={vulnCreateState.sourcePath}
                                  onChange={(event) => setVulnCreateState({ ...vulnCreateState, sourcePath: event.target.value })}
                                  placeholder="/case-a/source"
                                  className={FORM_INPUT_CLASS}
                                />
                                <button type="button" onClick={() => setPickerField('sourcePath')} style={{ flexShrink: 0, borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: LK.body, cursor: 'pointer' }}>
                                  选择
                                </button>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '16px' }}>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>模型</span>
                              <input value={vulnCreateState.model} onChange={(event) => setVulnCreateState({ ...vulnCreateState, model: event.target.value })} className={FORM_INPUT_CLASS} />
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>Provider（可选）</span>
                              <input value={vulnCreateState.provider} onChange={(event) => setVulnCreateState({ ...vulnCreateState, provider: event.target.value })} placeholder="openai / anthropic" className={FORM_INPUT_CLASS} />
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>Review Profile</span>
                              <select
                                value={vulnCreateState.reviewProfile}
                                onChange={(event) => {
                                  const nextProfile = event.target.value;
                                  setVulnCreateState({
                                    ...vulnCreateState,
                                    reviewProfile: nextProfile,
                                    maxReviewCycles: REVIEW_PROFILE_DEFAULT_MAX_CYCLES[nextProfile] || vulnCreateState.maxReviewCycles,
                                  });
                                }}
                                className={FORM_INPUT_CLASS}
                              >
                                {REVIEW_PROFILE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                              {vulnCreateState.reviewProfile === 'fast' ? (
                                <span style={{ marginTop: '4px', display: 'block', fontSize: '11px', lineHeight: '1.4', color: LK.muted }}>快速筛选会关闭评审；这里的”1”表示至少执行 1 个发现周期，不代表还会再做 1 轮评审。</span>
                              ) : null}
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>最大评审轮次</span>
                              <input type="number" min={1} value={vulnCreateState.maxReviewCycles} onChange={(event) => setVulnCreateState({ ...vulnCreateState, maxReviewCycles: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>Pi Timeout 最大次数</span>
                              <input type="number" min={1} value={vulnCreateState.timeoutMaxRetries} onChange={(event) => setVulnCreateState({ ...vulnCreateState, timeoutMaxRetries: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
                              <span style={{ marginTop: '4px', display: 'block', fontSize: '11px', lineHeight: '1.4', color: LK.muted }}>默认 3；Pi/provider 返回 timeout 时按该次数重发同一提示词。</span>
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>Pi Timeout 重试间隔（秒）</span>
                              <input type="number" min={0} value={vulnCreateState.timeoutRetryIntervalSeconds} onChange={(event) => setVulnCreateState({ ...vulnCreateState, timeoutRetryIntervalSeconds: Math.max(0, Number(event.target.value) || 0) })} className={FORM_INPUT_CLASS} />
                              <span style={{ marginTop: '4px', display: 'block', fontSize: '11px', lineHeight: '1.4', color: LK.muted }}>默认 30；仅在最大次数大于 1 时生效。</span>
                            </label>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>结果评审并发</span>
                              <input type="number" min={1} value={vulnCreateState.resultReviewConcurrency} onChange={(event) => setVulnCreateState({ ...vulnCreateState, resultReviewConcurrency: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
                            </label>
                          </div>

                          <div style={{ borderRadius: '8px', border: `1px solid ${LK.success}`, backgroundColor: `${LK.success}1a`, padding: '16px' }}>
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={vulnCreateState.autoReportVulnerabilities}
                                onChange={(event) => setVulnCreateState({ ...vulnCreateState, autoReportVulnerabilities: event.target.checked })}
                                style={{ marginTop: '4px', height: '16px', width: '16px', borderRadius: '4px', border: `1px solid ${LK.success}`, color: LK.success }}
                              />
                              <span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: LK.success }}>
                                  <ShieldCheck size={16} />
                                  自动上报漏洞
                                </span>
                                <span style={{ marginTop: '4px', display: 'block', fontSize: '12px', lineHeight: '1.4', color: LK.success }}>
                                  默认开启。任务成功后会将最终有效的 result_NNN.md 上报到当前项目的漏洞引擎，并记录原始任务 ID、执行 ID 和结果文件路径。
                                </span>
                              </span>
                            </label>
                          </div>

                          <div>
                            <label>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: LK.body }}>运行时覆盖 JSON</span>
                              <textarea
                                value={vulnCreateState.runtimeOverridesText}
                                onChange={(event) => setVulnCreateState({ ...vulnCreateState, runtimeOverridesText: event.target.value })}
                                placeholder={'{\n"global": {"max_review_cycles": 4 }\n}'}
                                style={{ marginTop: '8px', minHeight: '150px', width: '100%', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px', fontFamily: MONO, fontSize: '12px', lineHeight: '1.4', color: LK.ink, outline: 'none' }}
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: `${LK.surfaceRaised}b3`, padding: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.body }}>任务名前缀</label>
                        <input
                          value={taskPrefix}
                          onChange={(event) => setTaskPrefix(event.target.value)}
                          style={{ marginTop: '8px', width: '100%', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '14px', fontWeight: 600, color: LK.ink, outline: 'none' }}
                        />
                        {modeOptions.length > 1 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {modeOptions.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setMode(item)}
                                className={`rounded-xl border px-3 py-2 text-xs font-black ${mode === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                              >
                                {item === 'binary' ? '二进制任务模式' : '源码任务模式'}
                              </button>
                            ))}
                          </div>
                        ) : modeOptions.length === 1 ? (
                          <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                            {modeOptions[0] === 'binary' ? '二进制任务模式' : '源码任务模式'}
                          </div>
                        ) : null}
                      </div>

                      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <div className="text-sm font-black text-slate-900">候选输入</div>
                            <div className="mt-1 text-xs text-slate-500">可选 {selectableCandidates.length} / 总计 {candidates.length}</div>
                          </div>
                          <button type="button" onClick={toggleAll} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">
                            {selectedCandidates.length === selectableCandidates.length ? '取消全选' : '全选'}
                          </button>
                        </div>
                        {loading ? (
                          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-semibold text-slate-500">
                            <Loader2 size={16} className="animate-spin" />
                            加载结果中...
                          </div>
                        ) : candidates.length === 0 ? (
                          <div className="px-4 py-12 text-center text-sm text-slate-500">没有可用于创建下游任务的结果。</div>
                        ) : (
                          <div className="max-h-[360px] divide-y divide-slate-100 overflow-auto">
                            {candidates.map((candidate) => {
                              const checked = selectedKeys.has(candidate.key);
                              const disabled = Boolean(candidate.disabledReason);
                              return (
                                <label key={candidate.key} className={`flex items-start gap-3 px-4 py-3 ${disabled ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-100'}`}>
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={checked}
                                    onChange={() => {
                                      const next = new Set(selectedKeys);
                                      if (next.has(candidate.key)) next.delete(candidate.key);
                                      else next.add(candidate.key);
                                      setSelectedKeys(next);
                                    }}
                                    className="mt-1"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="break-all text-sm font-black text-slate-800">{candidate.label}</div>
                                    {candidate.description ? <div className="mt-1 break-all text-xs text-slate-500">{candidate.description}</div> : null}
                                    {candidate.disabledReason ? <div className="mt-1 text-xs font-semibold text-amber-600">{candidate.disabledReason}</div> : null}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">目标阶段</div>
                    <div className="mt-2 text-xl font-black text-slate-900">{TARGET_LABEL[targetStage]}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-600">
                      将创建 {isVulnDownstream ? 1 : selectedCandidates.length} 个手动下游任务。
                    </div>
                  </div>
                  {isVulnDownstream && vulnCreateState ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">当前默认填充值</div>
                      <div className="mt-3 space-y-3 text-xs text-slate-700">
                        <div>
                          <div className="font-black text-slate-500">Runs 根目录</div>
                          <div className="mt-1 break-all font-mono">{vulnCreateState.workspacePath || '-'}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">数据流目录</div>
                          <div className="mt-1 break-all font-mono">{vulnCreateState.dataFlowPath || '-'}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">代码目录</div>
                          <div className="mt-1 break-all font-mono">{vulnCreateState.sourcePath || '-'}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">模型</div>
                          <div className="mt-1 break-all font-mono">{vulnCreateState.model || DEFAULT_DATAFLOW_VULN_MODEL}</div>
                        </div>
                      </div>
                    </div>
                  ) : dataflowVulnPreview ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">漏洞挖掘默认参数</div>
                      <div className="mt-3 space-y-3 text-xs text-slate-700">
                        <div>
                          <div className="font-black text-slate-500">Runs 根目录</div>
                          <div className="mt-1 break-all font-mono">{String(dataflowVulnPreview.runsRoot || DEFAULT_DATAFLOW_VULN_RUNS_ROOT)}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">数据流目录</div>
                          <div className="mt-1 break-all font-mono">{String(dataflowVulnPreview.dataFlowDir || '-')}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">代码目录</div>
                          <div className="mt-1 break-all font-mono">{String(dataflowVulnPreview.sourceDir || '-')}</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-500">模型</div>
                          <div className="mt-1 break-all font-mono">{DEFAULT_DATAFLOW_VULN_MODEL}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {message ? (
                    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.includes('失败') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {message}
                    </div>
                  ) : null}
                  {created.length > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-black text-slate-900">已创建任务</div>
                      <div className="space-y-2">
                        {created.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigateTo(item.targetStage, item.id, navigate)}
                            className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-50"
                          >
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-black text-slate-800">{item.label}</span>
                              <span className="block font-mono text-slate-500">{item.id}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {result ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <button type="button" onClick={() => setShowRaw((value) => !value)} className="flex w-full items-center justify-between text-left text-xs font-black text-slate-600">
                        结果原始摘要
                        {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {showRaw ? <pre className="mt-3 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-900">{JSON.stringify(result, null, 2)}</pre> : null}
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                关闭
              </button>
              <button
                type="button"
                onClick={() => void createTasks()}
                disabled={submitting || loading || (isVulnDownstream ? !vulnCreateState : selectedCandidates.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                创建下游任务
              </button>
            </footer>
          </section>

          <ProjectFilesystemPickerModal
            isOpen={Boolean(isVulnDownstream && pickerField)}
            projectId={projectId}
            selectionMode="directory"
            backend="dataflowVulnScanner"
            title={pickerTitle}
            description={pickerDescription}
            onClose={() => setPickerField(null)}
            onSelect={(selection) => {
              if (!pickerField || !vulnCreateState) return;
              setVulnCreateState({ ...vulnCreateState, [pickerField]: selection.path });
              setPickerField(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
