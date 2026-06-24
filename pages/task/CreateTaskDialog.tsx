import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Loader2, Plus, RefreshCw, Square, SquareCheck, X } from 'lucide-react';
import { api } from '../../clients/api';
import { TestInputUploader, TestInputUploaderHandle } from '../../components/TestInputUploader';
import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import { buildManagerTargetDir } from '../../clients/codemapManager';
import { resolveSechpsInstruction } from './taskCenterInstruction';
import type {
  AgentAppSummary,
  ProjectInputUploadBrowseEntry,
  ProjectInputUploadBrowseResponse,
  ProjectInputUploadRecord,
  ScheduleCenterUserTaskCreatePayload,
  ScheduleCenterUserTaskType,
  SecurityProject,
  UserInfo,
} from '../../types/types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export type HomeCardMode = 'dragon-tail' | 'ram-horn' | 'lion-head';

export interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projects: SecurityProject[];
  onRefreshProjects?: () => Promise<void> | void;
  preSelectedInputId?: string;
  preSelectedMode?: HomeCardMode;
  onCreated: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type TaskMode = 'dragon-tail' | 'ram-horn';

type TaskTypeOption = {
  value: ScheduleCenterUserTaskType | 'cfg_db_vuln';
  label: string;
  downstreamView?: string;
  modes: readonly TaskMode[];
  disabled?: boolean;
};

const TASK_TYPES: readonly TaskTypeOption[] = [
  { value: 'binary_firmware_e2e', label: '盖亚-二进制固件', downstreamView: 'binary-security-detail', modes: ['dragon-tail', 'ram-horn'], disabled: true },
  { value: 'source_scan_e2e', label: '盖亚-源码', downstreamView: 'source-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'cfg_db_vuln', label: 'CFG-挖掘工具', downstreamView: 'cfg-db-vuln-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'kg_source_vuln_scan_e2e', label: '知识图谱-漏洞挖掘', downstreamView: 'kg-source-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'binary_module_e2e', label: '盖亚-二进制模块', downstreamView: 'binary-module-security-detail', modes: ['dragon-tail', 'ram-horn'], disabled: true },
  { value: 'ai4app_fast', label: 'AI4APP 扫描（快速）', downstreamView: 'app-security-scan-detail', modes: ['dragon-tail'] },
  { value: 'ai4web_fast', label: 'AI4WEB 扫描（快速）', downstreamView: 'app-security-scan-detail', modes: ['dragon-tail'] },
  { value: 'ai4app_deep', label: 'AI4APP 扫描（深度）', downstreamView: 'app-security-scan-detail', modes: ['ram-horn'] },
  { value: 'ai4web_deep', label: 'AI4WEB 扫描（深度）', downstreamView: 'app-security-scan-detail', modes: ['ram-horn'] },
  { value: 'ai4red', label: 'AI4RED 红线验证', downstreamView: 'task-redline-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'sechps_tool', label: 'Agent Harness 任务', modes: ['dragon-tail', 'ram-horn'] },
];

const DISABLED_TASK_TYPE_MESSAGE = '该任务类型已临时禁用，请勿从调度中心创建。';

const CREATE_TABS = [
  { key: 'basic', label: '基础信息' },
  { key: 'dynamic-env', label: '动态验证环境（可选）' },
] as const;

const INPUT_MODES: Record<string, 'file' | 'file_list' | 'directory'> = {
  binary_firmware_e2e: 'file',
  binary_module_e2e: 'file_list',
  source_scan_e2e: 'directory',
  cfg_db_vuln: 'directory',
  kg_source_vuln_scan_e2e: 'directory',
  ai4red: 'directory',
  ai4app_fast: 'file',
  ai4app_deep: 'file',
  ai4web_fast: 'file',
  ai4web_deep: 'file',
  sechps_tool: 'directory',
};

const MODE_OPTIONS = [
  { value: 'dragon-tail', label: '龙尾' },
  { value: 'ram-horn', label: '羊角' },
  { value: 'lion-head', label: '狮首' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const loadAgentApps = async (departmentId?: number | string | null, tenantId?: number | string | null): Promise<AgentAppSummary[]> => {
  const params = new URLSearchParams();
  if (departmentId) params.set('departmentId', String(departmentId));
  if (tenantId) params.set('tenantId', String(tenantId));
  const qs = params.toString();
  const response = await fetch(agentManageApiPath(`/agent-apps${qs ? `?${qs}` : ''}`), { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  return Array.isArray(payload?.apps) ? payload.apps : [];
};

const getLocalUserInfo = (): UserInfo | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/*  LOKI design tokens                                                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  projects,
  onRefreshProjects,
  preSelectedInputId,
  preSelectedMode,
  onCreated,
}) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const fileserverApi = api.domains.assets.fileserver;
  const currentUser = useMemo(() => getLocalUserInfo(), []);

  /* --- form state --- */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeCreateTab, setActiveCreateTab] = useState<(typeof CREATE_TABS)[number]['key']>('basic');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId);
  const [projectsRefreshing, setProjectsRefreshing] = useState(false);
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]['value']>('source_scan_e2e');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('dragon-tail');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [agentApps, setAgentApps] = useState<AgentAppSummary[]>([]);

  /* --- browse state --- */
  const [inputBrowseLoading, setInputBrowseLoading] = useState(false);
  const [inputBrowseError, setInputBrowseError] = useState('');
  const [inputCurrentPath, setInputCurrentPath] = useState('');
  const [browseCache, setBrowseCache] = useState<Record<string, ProjectInputUploadBrowseResponse>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selectedRelativePath, setSelectedRelativePath] = useState<string | null>(null);
  const [selectedRelativePaths, setSelectedRelativePaths] = useState<string[]>([]);
  const [directorySelectionTouched, setDirectorySelectionTouched] = useState(false);

  /* --- sechps-specific state --- */
  const [moduleName, setModuleName] = useState('');
  const [selectedAgentAppId, setSelectedAgentAppId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [agentAppsLoadError, setAgentAppsLoadError] = useState('');

  /* --- input source toggle --- */
  const [inputSource, setInputSource] = useState<'existing' | 'upload'>('upload');
  const uploaderRef = useRef<TestInputUploaderHandle>(null);
  const [uploading, setUploading] = useState(false);

  /* --- derived --- */
  const isKgSourceTask = taskType === 'kg_source_vuln_scan_e2e';
  const selectionMode = useMemo(() => INPUT_MODES[taskType] || 'file', [taskType]);
  const selectedAgentApp = useMemo(() => agentApps.find((item) => item.id === selectedAgentAppId) || null, [agentApps, selectedAgentAppId]);
  const selectableInputs = useMemo(
    () => (isKgSourceTask ? inputs.filter((item) => String(item.input_type || '').trim().toLowerCase() === 'code') : inputs),
    [inputs, isKgSourceTask],
  );
  const selectedInput = useMemo(() => selectableInputs.find((item) => item.upload_id === selectedInputId) || null, [selectableInputs, selectedInputId]);
  const rootBrowse = browseCache[''] || null;
  const isDirectorySelectionValid = directorySelectionTouched && selectedRelativePath !== null;
  const taskTypeMeta = useMemo(() => TASK_TYPES.find((item) => item.value === taskType) || TASK_TYPES[0], [taskType]);
  const taskTypeDisabled = Boolean(taskTypeMeta?.disabled);
  const availableTaskTypes = useMemo(
    () => TASK_TYPES.filter((item) => item.modes.includes(mode as TaskMode)),
    [mode],
  );

  const inputSummary = useMemo(() => {
    if (!selectedInput) return '未选择上传记录';
    if (selectionMode === 'file') return selectedRelativePath || '请选择一个文件';
    if (selectionMode === 'file_list') return selectedRelativePaths.length ? selectedRelativePaths.join('，') : '请选择一个或多个文件';
    if (!isDirectorySelectionValid) return '请选择一个文件夹';
    return selectedRelativePath || selectedInput.target_path || '/';
  }, [isDirectorySelectionValid, selectedInput, selectedRelativePath, selectedRelativePaths, selectionMode]);

  const inputSelectionHint = useMemo(() => {
    if (taskType === 'cfg_db_vuln') return '请选择一个已构建知识图谱的代码测试对象；CFG 两阶段挖掘按整个上传根进行（入口分析 → fan-out 审计）。';
    if (taskType === 'sechps_tool') return '请选择一个已注册的 Agent Harness，并选择一个目录。调度中心会在分发时自动申请 Task Key，并把所选目录直接传给下游。';
    if (taskType === 'ai4app_fast' || taskType === 'ai4app_deep') return '请选择一个 APK/HAP 安装包，或 zip/rar/tar.gz/gz 等常见压缩包作为测试对象；压缩包将作为 APK/HAP 的源码包处理。';
    if (taskType === 'ai4web_fast' || taskType === 'ai4web_deep') return '请选择一个 Web 源码包（zip/rar/tar.gz/gz 等压缩包）作为测试对象。';
    if (selectionMode === 'directory') return '请选择一个目录作为测试对象。';
    if (selectionMode === 'file_list') return '请选择一个或多个文件作为测试对象。';
    return '请选择一个文件作为测试对象。';
  }, [selectionMode, taskType]);

  const canCreateTask = Boolean(selectedProjectId) && !taskTypeDisabled && mode !== 'lion-head' && (
    taskType === 'cfg_db_vuln'
      // CFG mining runs over an existing, already-ingested code upload (its
      // codemap graph must exist); just need a name + a selected record.
      ? Boolean(name && selectedInputId)
      : inputSource === 'upload'
      ? Boolean(name)
      : (taskType === 'sechps_tool'
        ? Boolean(name && selectedAgentApp && selectedInputId && isDirectorySelectionValid)
        : Boolean(name && selectedInputId && (
          (selectionMode === 'file' && selectedRelativePath) ||
          (selectionMode === 'file_list' && selectedRelativePaths.length > 0) ||
          (selectionMode === 'directory' && isDirectorySelectionValid)
        ) && (taskType !== 'binary_module_e2e' || moduleName.trim())))
  );


  /* --- data loading --- */
  const loadDialogData = async () => {
    if (!selectedProjectId) return;
    setAgentAppsLoadError('');
    try {
      const inputResp = await fileserverApi.listProjectInputUploads(selectedProjectId, { pageSize: 200 });
      const nextInputs = inputResp.items || [];
      setInputs(nextInputs);
      if (preSelectedInputId && nextInputs.some((item) => item.upload_id === preSelectedInputId)) {
        setSelectedInputId(preSelectedInputId);
      } else {
        setSelectedInputId((current) => current || nextInputs[0]?.upload_id || '');
      }
    } catch {
      setInputs([]);
    }
    try {
      const appResp = await loadAgentApps(currentUser?.department_id, currentUser?.department_id);
      setAgentApps(appResp || []);
      setSelectedAgentAppId((current) => current || appResp?.[0]?.id || '');
    } catch (err: any) {
      setAgentApps([]);
      setSelectedAgentAppId('');
      setAgentAppsLoadError(err?.message || '加载 Agent Harness 失败');
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedProjectId(projectId);
      if (preSelectedMode) setMode(preSelectedMode);
      void loadDialogData();
    }
  }, [open, projectId, preSelectedMode]);

  useEffect(() => {
    if (open && selectedProjectId) {
      void loadDialogData();
    }
  }, [open, selectedProjectId]);

  /* --- browse helpers --- */
  const loadBrowsePath = async (relativePath: string) => {
    if (!open || !selectedInputId || !selectedProjectId) return;
    setInputBrowseLoading(true);
    setInputBrowseError('');
    try {
      const resp = await fileserverApi.browseProjectInputUpload(selectedProjectId, selectedInputId, relativePath);
      setBrowseCache((current) => ({ ...current, [relativePath]: resp }));
    } catch (err: any) {
      setInputBrowseError(err?.message || '加载输入目录失败');
    } finally {
      setInputBrowseLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !selectedInputId || !selectedProjectId) return;
    void loadBrowsePath('');
  }, [open, selectedProjectId, selectedInputId, taskType]);

  /* --- keep taskType valid for the selected mode --- */
  useEffect(() => {
    if (mode === 'lion-head') return;
    const enabledTaskTypes = availableTaskTypes.filter((item) => !item.disabled);
    if (!enabledTaskTypes.some((item) => item.value === taskType)) {
      setTaskType(enabledTaskTypes[0]?.value || 'source_scan_e2e');
    }
  }, [mode, availableTaskTypes, taskType]);

  /* --- reset on task-type change --- */
  useEffect(() => {
    setSelectedRelativePath(null);
    setSelectedRelativePaths([]);
    setInputCurrentPath('');
    setExpandedPaths([]);
    setDirectorySelectionTouched(false);
    setInputBrowseError('');
    setInstruction('');
    if (taskType !== 'sechps_tool') {
      setSelectedAgentAppId('');
    }
    // CFG mining needs an existing ingested code upload (graph must pre-exist),
    // so force the "选择已有" source.
    if (taskType === 'cfg_db_vuln' || taskType === 'kg_source_vuln_scan_e2e') {
      setInputSource('existing');
    }
  }, [taskType]);

  /* --- agent app auto-select --- */
  useEffect(() => {
    if (taskType !== 'sechps_tool') return;
    if (!agentApps.length) {
      setSelectedAgentAppId('');
      return;
    }
    if (!selectedAgentAppId || !agentApps.some((item) => item.id === selectedAgentAppId)) {
      setSelectedAgentAppId(agentApps[0]?.id || '');
    }
  }, [agentApps, selectedAgentAppId, taskType]);

  /* --- reset on input change --- */
  useEffect(() => {
    setSelectedRelativePath(null);
    setSelectedRelativePaths([]);
    setInputCurrentPath('');
    setBrowseCache({});
    setExpandedPaths([]);
    setDirectorySelectionTouched(false);
    setInputBrowseError('');
  }, [selectedInputId]);

  /* --- keep selectedInputId valid --- */
  useEffect(() => {
    if (!selectableInputs.length) {
      setSelectedInputId('');
      return;
    }
    if (!selectableInputs.some((item) => item.upload_id === selectedInputId)) {
      setSelectedInputId(selectableInputs[0]?.upload_id || '');
    }
  }, [selectableInputs, selectedInputId]);

  /* --- browse actions --- */
  const openBrowsePath = (relativePath: string) => {
    setInputCurrentPath(relativePath);
    if (selectionMode === 'directory') {
      setSelectedRelativePath(relativePath);
      setDirectorySelectionTouched(true);
    }
    setExpandedPaths((current) => (current.includes(relativePath) || !relativePath ? current : [...current, relativePath]));
    if (!(relativePath in browseCache)) {
      void loadBrowsePath(relativePath);
    }
  };

  const toggleDirectoryExpansion = (relativePath: string) => {
    const nextExpanded = expandedPaths.includes(relativePath)
      ? expandedPaths.filter((item) => item !== relativePath)
      : [...expandedPaths, relativePath];
    setExpandedPaths(nextExpanded);
    if (!expandedPaths.includes(relativePath) && !(relativePath in browseCache)) {
      void loadBrowsePath(relativePath);
    }
  };

  const selectDirectoryPath = (relativePath: string | null) => {
    setSelectedRelativePath(relativePath);
    setDirectorySelectionTouched(true);
  };

  const toggleFileSelection = (entry: ProjectInputUploadBrowseEntry) => {
    if (entry.node_type !== 'file') return;
    if (selectionMode === 'file') {
      setSelectedRelativePath((current) => (current === entry.relative_path ? null : entry.relative_path));
      return;
    }
    if (selectionMode === 'file_list') {
      setSelectedRelativePaths((current) => current.includes(entry.relative_path)
        ? current.filter((item) => item !== entry.relative_path)
        : [...current, entry.relative_path]);
    }
  };

  /* --- submit --- */
  const createTask = async () => {
    setSaving(true);
    setError('');
    try {
      if (taskTypeDisabled) {
        setError(DISABLED_TASK_TYPE_MESSAGE);
        return;
      }
      // CFG-挖掘工具: our own two-stage pipeline, not the schedule-center flow.
      // Runs over the selected code upload's root (codemap graph keyed by that
      // upload_id), then opens the CFG detail view.
      if (taskType === 'cfg_db_vuln') {
        if (!selectedInput) {
          setError('请选择一个已有的代码测试对象（其知识图谱需已构建）');
          return;
        }
        const created = await api.cfgPipeline.createPipeline({
          project_id: selectedProjectId,
          name,
          input_path: buildManagerTargetDir(selectedProjectId, selectedInput.target_path),
          created_by: currentUser?.username,
        });
        setName('');
        setDescription('');
        setActiveCreateTab('basic');
        onCreated();
        window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
          detail: { view: 'cfg-db-vuln-detail', cfgDbVulnTaskId: created.pipeline_id },
        }));
        return;
      }

      let finalInputUploadId = selectedInputId;
      let finalInputBinding = {
        upload_id: selectedInputId,
        selection_type: selectionMode,
        relative_path: selectionMode === 'file_list' ? undefined : (selectionMode === 'directory' ? (selectedRelativePath !== null ? selectedRelativePath : undefined) : (selectedRelativePath || undefined)),
        relative_paths: selectionMode === 'file_list' ? selectedRelativePaths : undefined,
      };

      if (inputSource === 'upload') {
        if (!uploaderRef.current?.hasFiles()) {
          setError('请先选择要上传的文件');
          setSaving(false);
          return;
        }
        const uploadResult = await uploaderRef.current.triggerUpload();
        finalInputUploadId = uploadResult.uploadId;
        finalInputBinding = {
          upload_id: uploadResult.uploadId,
          selection_type: 'directory',
          relative_path: '',
          relative_paths: undefined,
        };
      }

      if (isKgSourceTask && inputSource !== 'existing') {
        setError('知识图谱-漏洞挖掘只能选择已有测试对象');
        setSaving(false);
        return;
      }
      if (isKgSourceTask && (!selectedInput || String(selectedInput.input_type || '').trim().toLowerCase() !== 'code')) {
        setError('知识图谱-漏洞挖掘仅支持选择类型为源码的上传记录');
        setSaving(false);
        return;
      }

      const sechpsInstruction = taskType === 'sechps_tool'
        ? resolveSechpsInstruction(instruction, selectedAgentApp?.startCommand)
        : '';
      const payload: ScheduleCenterUserTaskCreatePayload = {
        task_type: taskType as ScheduleCenterUserTaskType,
        name,
        description,
        input_upload_ids: [finalInputUploadId],
        input_binding: finalInputBinding,
        policy: isKgSourceTask ? {
          pipeline_profile: 'kg_source_vuln_scan',
          knowledge_graph_upload_id: finalInputUploadId,
        } : {},
        dispatch_policy: {},
        module_name: taskType === 'binary_module_e2e' ? moduleName : undefined,
        agent_app_id: taskType === 'sechps_tool' ? (selectedAgentApp?.id || undefined) : undefined,
        agent_app_name: taskType === 'sechps_tool' ? (selectedAgentApp?.name || undefined) : undefined,
        agent_app_engine: taskType === 'sechps_tool' ? (selectedAgentApp?.engine || undefined) : undefined,
        agent_app_agent_name: taskType === 'sechps_tool' ? (selectedAgentApp?.defaultAgentName || undefined) : undefined,
        agent_model_alias_id: taskType === 'sechps_tool' ? (selectedAgentApp?.modelAliasId || undefined) : undefined,
        agent_harness_path: taskType === 'sechps_tool' ? (selectedAgentApp?.agentHarnessPath || undefined) : undefined,
        instruction: taskType === 'sechps_tool' ? (sechpsInstruction || undefined) : undefined,
      };
      await scheduleApi.createUserTask(selectedProjectId, payload);
      /* reset form state */
      setName('');
      setDescription('');
      setMode('dragon-tail');
      setModuleName('');
      setSelectedAgentAppId('');
      setInstruction('');
      setSelectedRelativePath(null);
      setSelectedRelativePaths([]);
      setInputCurrentPath('');
      setDirectorySelectionTouched(false);
      setActiveCreateTab('basic');
      uploaderRef.current?.reset();
      onCreated();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };


  /* --- tree rendering --- */
  const renderTreeRows = (relativePath: string, depth: number): React.ReactNode[] => {
    const browse = browseCache[relativePath];
    if (!browse) return [];
    const rows: React.ReactNode[] = [];
    const entries = [...(browse.directories || []), ...(browse.files || [])];
    entries.forEach((entry) => {
      const isDirectory = entry.node_type === 'directory';
      const isExpanded = isDirectory && expandedPaths.includes(entry.relative_path);
      const isSelected = selectionMode === 'file_list'
        ? selectedRelativePaths.includes(entry.relative_path)
        : selectionMode === 'directory'
          ? selectedRelativePath === entry.relative_path
          : selectedRelativePath === entry.relative_path;
      rows.push(
        <tr
          key={entry.relative_path || `${relativePath}:${entry.name}`}
          style={{ borderBottom: `1px solid ${LK.borderSoft}` }}
        >
          <td className="px-4 py-2">
            {isDirectory ? (
              selectionMode === 'directory' ? (
                <button
                  type="button"
                  onClick={() => selectDirectoryPath(entry.relative_path)}
                  className="transition-colors"
                  style={{ color: LK.muted }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.muted; }}
                >
                  {isSelected ? <SquareCheck size={16} /> : <Square size={16} />}
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => toggleFileSelection(entry)}
                className="transition-colors"
                style={{ color: LK.muted }}
                onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = LK.muted; }}
              >
                {isSelected ? <SquareCheck size={16} /> : <Square size={16} />}
              </button>
            )}
          </td>
          <td className="px-4 py-2">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
              {isDirectory ? (
                <button
                  type="button"
                  onClick={() => toggleDirectoryExpansion(entry.relative_path)}
                  className="rounded-md p-1 transition-colors"
                  style={{ color: LK.muted }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                >
                  <ChevronRight size={14} className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
                </button>
              ) : (
                <span className="inline-block h-6 w-6" />
              )}
              {isDirectory ? (
                <button
                  type="button"
                  onClick={() => openBrowsePath(entry.relative_path)}
                  className="inline-flex items-center gap-2 font-semibold transition-colors"
                  style={{ color: LK.inkSoft }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = LK.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
                >
                  {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                  {entry.name}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleFileSelection(entry)}
                  className="font-medium transition-colors"
                  style={{ color: LK.inkSoft }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = LK.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
                >
                  {entry.name}
                </button>
              )}
            </div>
          </td>
          <td className="px-4 py-2" style={{ fontFamily: MONO, fontSize: '12px', color: LK.muted }}>{entry.relative_path || '.'}</td>
          <td className="px-4 py-2" style={{ color: LK.body }}>{isDirectory ? '文件夹' : '文件'}</td>
        </tr>,
      );
      if (isDirectory && isExpanded) {
        rows.push(...renderTreeRows(entry.relative_path, depth + 1));
      }
    });
    return rows;
  };

  /* --- render --- */
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
      style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="flex h-[min(1160px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl animate-in"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        {/* header */}
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
          <div>
            <div className="text-lg font-semibold leading-7" style={{ color: LK.ink }}>
              创建任务
            </div>
            <div className="mt-1 text-xs font-semibold" style={{ color: LK.error }}>
              当前处于「{projects.find((item) => item.id === selectedProjectId)?.name || projectName}」项目下
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors"
            style={{ color: LK.muted }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* tabs */}
        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
          <div className="flex flex-wrap gap-2">
            {CREATE_TABS.map((tab, index) => {
              const active = tab.key === activeCreateTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCreateTab(tab.key)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? LK.primaryMuted : LK.surfaceRaised,
                    color: active ? LK.primary : LK.body,
                    borderBottom: active ? `2px solid ${LK.primary}` : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = LK.body; }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                    style={{ backgroundColor: active ? 'rgba(255, 255, 255, 0.15)' : LK.surface }}
                  >
                    {index + 1}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* body */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]"
        >
          {/* =============== TAB: basic =============== */}
            <div className="flex h-full flex-col space-y-3" style={{ display: activeCreateTab === 'basic' ? undefined : 'none' }}>
              {/* 项目选择 */}
              <div>
                <div className="text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  项目 <span style={{ color: LK.error }}>*</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  >
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="新增项目"
                    onClick={() => {
                      sessionStorage.setItem('chimera:pendingNav', JSON.stringify({
                        view: 'project-mgmt',
                        openCreateProject: true,
                      }));
                      window.open(window.location.href, '_blank');
                    }}
                    className="shrink-0 rounded-lg p-2 transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; }}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type="button"
                    title="刷新项目列表"
                    disabled={projectsRefreshing}
                    onClick={async () => {
                      setProjectsRefreshing(true);
                      try { await onRefreshProjects?.(); } catch { /* ignore */ } finally { setProjectsRefreshing(false); }
                    }}
                    className="shrink-0 rounded-lg p-2 transition-colors disabled:opacity-50"
                    style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; }}
                  >
                    <RefreshCw size={16} className={projectsRefreshing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              {projects.length === 0 ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  当前没有可用项目，请先到
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('chimera:pendingNav', JSON.stringify({
                        view: 'project-mgmt',
                        openCreateProject: true,
                      }));
                      window.open(window.location.href, '_blank');
                    }}
                    className="mx-1 font-semibold underline underline-offset-2 transition-opacity hover:opacity-80"
                    style={{ color: LK.warning }}
                  >
                    资产管理 → 项目管理
                  </button>
                  初始化项目。
                </div>
              ) : null}

              {/* 任务名称 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                任务名称
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                />
              </label>

              {/* 模式 */}
              <div>
                <div className="mb-1.5 text-sm font-semibold" style={{ color: LK.inkSoft }}>模式</div>
                <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
                  {MODE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setMode(item.value)}
                      className="flex-1 rounded-md px-3 py-2 text-sm font-bold transition-all"
                      style={mode === item.value
                        ? { backgroundColor: LK.primary, color: '#fff' }
                        : { color: LK.body }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'lion-head' ? (
                <div
                  className="flex flex-1 flex-col items-center justify-center rounded-lg px-4 py-12 text-center text-sm font-semibold"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  「狮首」模式正在开发中，敬请期待
                </div>
              ) : (
                <>
              {/* sechps Agent Harness specific */}
              {taskType === 'sechps_tool' ? (
                <>
                  <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                    Agent Harness
                    <select
                      value={selectedAgentAppId}
                      onChange={(e) => setSelectedAgentAppId(e.target.value)}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    >
                      <option value="">请选择具体 Harness</option>
                      {agentApps.map((item) => <option key={item.id} value={item.id}>{`${item.name} / ${item.engine}`}</option>)}
                    </select>
                  </label>
                  {agentAppsLoadError ? (
                    <div
                      className="rounded-lg px-4 py-3 text-sm"
                      style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                    >
                      {agentAppsLoadError}。不影响上传记录加载，但当前无法创建 Agent Harness 任务。
                    </div>
                  ) : null}
                  {selectedAgentApp ? (
                    <div className="rounded-lg px-4 py-3 text-xs" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}>
                      <div>Harness: <span className="font-semibold" style={{ color: LK.ink }}>{selectedAgentApp.name}</span></div>
                      <div className="mt-1">Engine: <span className="font-semibold" style={{ color: LK.ink }}>{selectedAgentApp.engine}</span></div>
                      <div className="mt-1 break-all">Harness Path: <span className="font-semibold" style={{ color: LK.ink }}>{selectedAgentApp.agentHarnessPath || '—'}</span></div>
                    </div>
                  ) : null}
                  <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                    执行指令（可选，不填则使用 Agent Harness 注册的启动命令）
                    <textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                      placeholder="不填时使用 Agent Harness 的启动命令，例如 /project:xxx"
                    />
                  </label>
                </>
              ) : null}

              {/* binary_module_e2e module name */}
              {taskType === 'binary_module_e2e' ? (
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  模块名
                  <input
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </label>
              ) : null}

              {isKgSourceTask ? (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                  知识图谱-漏洞挖掘会直接使用所选测试对象记录的 <span style={{ color: LK.ink, fontFamily: MONO }}>upload_id</span> 作为知识图谱定位参数，不需要手工填写。
                </div>
              ) : null}


              {/* -------- 测试对象 section -------- */}
              <div>
                <div className="mb-2 text-sm font-semibold" style={{ color: LK.inkSoft }}>测试对象</div>
                {/* sub-mode toggle */}
                <div className="mb-3 flex gap-2">
                  {(isKgSourceTask ? (['existing'] as const) : (['upload', 'existing'] as const)).map((src) => {
                    const active = inputSource === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setInputSource(src)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                        style={{
                          backgroundColor: active ? LK.primaryMuted : LK.surfaceRaised,
                          color: active ? LK.primary : LK.body,
                          border: active ? `1px solid ${LK.primary}` : `1px solid ${LK.border}`,
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = LK.body; }}
                      >
                        {src === 'existing' ? '选择已有' : '直接上传'}
                      </button>
                    );
                  })}
                </div>

                {inputSource === 'upload' ? (
                  <TestInputUploader
                    ref={uploaderRef}
                    projectId={selectedProjectId}
                    displayName={name}
                    compact={true}
                    onUploadStateChange={setUploading}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* hint block */}
                    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                      <div className="text-sm" style={{ color: LK.body }}>
                        当前输入模式：
                        <span className="ml-2 font-semibold" style={{ color: LK.ink }}>
                          {selectionMode === 'file' ? '选择单个文件' : selectionMode === 'file_list' ? '选择多个文件' : '选择文件夹'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs" style={{ color: LK.muted }}>{inputSelectionHint}</div>
                    </div>

                    {/* input record selector */}
                    <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                      测试对象记录
                      <select
                        value={selectedInputId}
                        onChange={(e) => setSelectedInputId(e.target.value)}
                        className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                      >
                        {selectableInputs.map((item) => <option key={item.upload_id} value={item.upload_id}>{`${getUploadRecordDisplayName(item)} · ${item.status}`}</option>)}
                      </select>
                    </label>

                    {selectableInputs.length === 0 ? (
                      <div
                        className="rounded-lg px-4 py-3 text-sm"
                        style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                      >
                        {isKgSourceTask ? '当前没有可用的源码类型上传记录，请先到' : '没有可用输入，请先到'}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
                              detail: { view: 'test-input-root' },
                            }));
                          }}
                          className="mx-1 font-semibold underline underline-offset-2 transition-opacity hover:opacity-80"
                          style={{ color: LK.warning }}
                        >
                          "测试对象"
                        </button>
                        上传记录。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* breadcrumbs */}
                        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.borderSoft}` }}>
                          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: LK.muted }}>
                            {((browseCache[inputCurrentPath]?.breadcrumbs) || (rootBrowse?.breadcrumbs) || []).map((crumb, index, items) => (
                              <button
                                key={`${crumb.path}-${index}`}
                                type="button"
                                onClick={() => openBrowsePath(crumb.path)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors"
                                style={{ color: LK.body }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }}
                              >
                                <Folder size={12} />
                                <span>{crumb.name}</span>
                                {index < items.length - 1 ? <ChevronRight size={12} /> : null}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* browse error */}
                        {inputBrowseError ? (
                          <div
                            className="rounded-lg px-4 py-3 text-sm"
                            style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
                          >
                            {inputBrowseError}
                          </div>
                        ) : null}

                        {/* file tree table */}
                        <div className="max-h-[min(14rem,28vh)] overflow-auto rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                                <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>选择</th>
                                <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>名称</th>
                                <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>相对路径</th>
                                <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>类型</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inputBrowseLoading ? (
                                <tr><td className="px-4 py-6 text-center" colSpan={4} style={{ color: LK.muted }}>加载目录中...</td></tr>
                              ) : null}
                              {!inputBrowseLoading && !rootBrowse ? (
                                <tr><td className="px-4 py-6 text-center" colSpan={4} style={{ color: LK.muted }}>暂无可浏览目录</td></tr>
                              ) : null}
                              {rootBrowse ? (
                                <tr style={{ borderBottom: `1px solid ${LK.borderSoft}`, backgroundColor: `${LK.surfaceRaised}40` }}>
                                  <td className="px-4 py-2">
                                    {selectionMode === 'directory' ? (
                                      <button
                                        type="button"
                                        onClick={() => selectDirectoryPath('')}
                                        className="transition-colors"
                                        style={{ color: LK.muted }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = LK.muted; }}
                                      >
                                        {selectedRelativePath === '' && directorySelectionTouched ? <SquareCheck size={16} /> : <Square size={16} />}
                                      </button>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2 font-semibold" style={{ color: LK.ink }}>
                                      <FolderOpen size={15} />
                                      上传根目录
                                    </div>
                                  </td>
                                  <td className="px-4 py-2" style={{ fontFamily: MONO, fontSize: '12px', color: LK.muted }}>.</td>
                                  <td className="px-4 py-2" style={{ color: LK.body }}>文件夹</td>
                                </tr>
                              ) : null}
                              {rootBrowse ? renderTreeRows('', 0) : null}
                            </tbody>
                          </table>
                        </div>

                        {/* current selection summary */}
                        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>当前选择</div>
                          <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{inputSummary}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 工具 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                工具
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                >
                  {availableTaskTypes.map((item) => (
                    <option key={item.value} value={item.value} disabled={item.disabled}>
                      {item.label}{item.disabled ? '（已禁用）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {taskTypeDisabled ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  {DISABLED_TASK_TYPE_MESSAGE}
                </div>
              ) : null}

              {/* 描述 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                描述
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  rows={2}
                />
              </label>

              {/* error */}
              {error ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
                >
                  {error}
                </div>
              ) : null}
                </>
              )}
            </div>

          {/* =============== TAB: dynamic-env =============== */}
          <div className="flex flex-col items-center gap-4 py-12" style={{ display: activeCreateTab === 'dynamic-env' ? undefined : 'none' }}>
            <p className="text-sm" style={{ color: LK.muted }}>后续支持动态验证环境配置</p>
          </div>
        </div>

        {/* footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${LK.border}` }}>
            <button
              onClick={onClose}
              className="btn-secondary rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
            >
              取消
            </button>
            <button
              onClick={() => void createTask()}
              disabled={saving || uploading || !canCreateTask}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? '创建中...' : uploading ? '上传中...' : '创建任务'}
            </button>
          </div>
      </div>
    </div>
  );
};
