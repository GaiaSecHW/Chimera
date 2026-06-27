import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Network, X } from 'lucide-react';
import { api } from '../../clients/api';
import { DropdownSelect } from '../../design-system';
import { TestInputUploader, TestInputUploaderHandle } from '../../components/TestInputUploader';
import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import {
  loadKgInputEligibility,
} from './kgInputEligibility';
import type {
  KgInputEligibility,
} from './kgInputEligibility';
import { resolveSechpsInstruction } from './taskCenterInstruction';
import type {
  AgentAppSummary,
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
  value: ScheduleCenterUserTaskType;
  label: string;
  downstreamView?: string;
  modes: readonly TaskMode[];
};

const TASK_TYPES: readonly TaskTypeOption[] = [
  { value: 'binary_firmware_e2e', label: '盖亚-二进制固件', downstreamView: 'binary-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'source_scan_e2e', label: '盖亚-源码端到端', downstreamView: 'source-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'kg_source_vuln_scan_e2e', label: '知识图谱-漏洞挖掘', downstreamView: 'kg-source-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'binary_module_e2e', label: '盖亚-二进制模块', downstreamView: 'binary-module-security-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'ai4app_fast', label: 'AI4APP 扫描（快速）', downstreamView: 'app-security-scan-detail', modes: ['dragon-tail'] },
  { value: 'ai4web_fast', label: 'AI4WEB 扫描（快速）', downstreamView: 'app-security-scan-detail', modes: ['dragon-tail'] },
  { value: 'ai4app_deep', label: 'AI4APP 扫描（深度）', downstreamView: 'app-security-scan-detail', modes: ['ram-horn'] },
  { value: 'ai4web_deep', label: 'AI4WEB 扫描（深度）', downstreamView: 'app-security-scan-detail', modes: ['ram-horn'] },
  { value: 'ai4red', label: 'AI4RED 红线验证', downstreamView: 'task-redline-detail', modes: ['dragon-tail', 'ram-horn'] },
  { value: 'sechps_tool', label: 'Agent Harness 任务', modes: ['dragon-tail', 'ram-horn'] },
];

const DISABLED_TASK_TYPE_MESSAGE = '该工具已在系统管理 -> 任务调度 -> 调度参数中禁用前端创建。';

const MODE_OPTIONS = [
  { value: 'dragon-tail', label: '龙尾' },
  { value: 'ram-horn', label: '羊角' },
  { value: 'lion-head', label: '狮首' },
];

const TASK_TYPE_HINTS: Record<string, string> = {
  binary_firmware_e2e: '请上传一个二进制固件文件（如 .bin、.img、.fw 等），需要勾选"保留原始文件，不自动解压"',
  binary_module_e2e: '请上传一个或多个二进制模块文件（如 .so、.o、.elf 等），需要勾选"保留原始文件，不自动解压"',
  source_scan_e2e: '请上传一个源码包，不勾选"保留原始文件，不自动解压"',
  cfg_db_vuln: '请选择一个已上传的源码目录',
  kg_source_vuln_scan_e2e: '请选择一个已上传的源码目录',
  ai4app_fast: '请上传一个应用软件包(apk/hap)或源码压缩包，需要勾选"保留原始文件，不自动解压"',
  ai4app_deep: '请上传一个应用软件包(apk/hap)或源码压缩包，需要勾选"保留原始文件，不自动解压"',
  ai4web_fast: '请上传一个压缩包(源码包或产品软件包), 需要勾选"保留原始文件，不自动解压"',
  ai4web_deep: '请上传一个压缩包(源码包或产品软件包), 需要勾选"保留原始文件，不自动解压"',
  ai4red: '请上传一个压缩包（具体要求见说明），需要勾选"保留原始文件，不自动解压"',
  sechps_tool: '请选择一个已注册的 Agent Harness，并选择一个目录。',
};

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
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId);
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]['value']>('source_scan_e2e');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goalText, setGoalText] = useState('');
  const [mode, setMode] = useState('dragon-tail');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [agentApps, setAgentApps] = useState<AgentAppSummary[]>([]);
  const [kgEligibilityByUploadId, setKgEligibilityByUploadId] = useState<Record<string, KgInputEligibility>>({});
  const [kgEligibilityLoading, setKgEligibilityLoading] = useState(false);
  const [kgEligibilityError, setKgEligibilityError] = useState('');
  const [toolCreateEnabledByTaskType, setToolCreateEnabledByTaskType] = useState<Record<string, boolean>>({});

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
  const isLionHead = mode === 'lion-head';
  const isKgSourceTask = !isLionHead && taskType === 'kg_source_vuln_scan_e2e';
  const selectedAgentApp = useMemo(() => agentApps.find((item) => item.id === selectedAgentAppId) || null, [agentApps, selectedAgentAppId]);
  const codeInputs = useMemo(
    () => inputs.filter((item) => String(item.input_type || '').trim().toLowerCase() === 'code'),
    [inputs],
  );
  const selectableInputs = useMemo(
    () => (isKgSourceTask
      ? codeInputs.filter((item) => kgEligibilityByUploadId[item.upload_id]?.allowed === true)
      : inputs),
    [codeInputs, inputs, isKgSourceTask, kgEligibilityByUploadId],
  );
  const selectedInput = useMemo(() => selectableInputs.find((item) => item.upload_id === selectedInputId) || null, [selectableInputs, selectedInputId]);
  const selectedKgEligibility = useMemo(
    () => (selectedInputId ? kgEligibilityByUploadId[selectedInputId] || null : null),
    [kgEligibilityByUploadId, selectedInputId],
  );
  const isTaskTypeDisabled = (value: ScheduleCenterUserTaskType) => !(toolCreateEnabledByTaskType[value] ?? true);
  const taskTypeDisabled = isTaskTypeDisabled(taskType);
  const availableTaskTypes = useMemo(
    () => TASK_TYPES.filter((item) => item.modes.includes(mode as TaskMode)),
    [mode],
  );
  const enabledTaskTypes = useMemo(
    () => availableTaskTypes.filter((item) => !isTaskTypeDisabled(item.value)),
    [availableTaskTypes, toolCreateEnabledByTaskType],
  );
  const kgEligibleItems = useMemo(
    () => codeInputs.filter((item) => kgEligibilityByUploadId[item.upload_id]?.allowed === true),
    [codeInputs, kgEligibilityByUploadId],
  );
  const kgIneligibleItems = useMemo(
    () => codeInputs
      .map((item) => ({ record: item, eligibility: kgEligibilityByUploadId[item.upload_id] || null }))
      .filter(({ eligibility }) => eligibility && !eligibility.allowed),
    [codeInputs, kgEligibilityByUploadId],
  );

  const nameValid = name.trim().length > 0;
  const lionHeadInputReady = inputSource === 'upload'
    ? nameValid && !uploading
    : Boolean(nameValid && selectedInputId);
  const canCreateTask = Boolean(selectedProjectId) && !taskTypeDisabled && (
    mode === 'lion-head'
      ? Boolean(lionHeadInputReady && goalText.trim().length > 0)
      : (
    inputSource === 'upload'
      ? nameValid
      : Boolean(nameValid && selectedInputId
        && (taskType !== 'sechps_tool' || selectedAgentApp)
        && (taskType !== 'binary_module_e2e' || moduleName.trim())
        && (!isKgSourceTask || selectedKgEligibility?.allowed === true))
  ));

  const loadKgEligibilityState = async (records: ProjectInputUploadRecord[]) => {
    if (!isKgSourceTask) {
      setKgEligibilityByUploadId({});
      setKgEligibilityError('');
      setKgEligibilityLoading(false);
      return;
    }
    const nextCodeRecords = records.filter((item) => String(item.input_type || '').trim().toLowerCase() === 'code');
    if (!nextCodeRecords.length) {
      setKgEligibilityByUploadId({});
      setKgEligibilityError('');
      setKgEligibilityLoading(false);
      return;
    }
    setKgEligibilityLoading(true);
    setKgEligibilityError('');
    try {
      const next = await loadKgInputEligibility(nextCodeRecords);
      setKgEligibilityByUploadId(next);
    } catch (err: any) {
      setKgEligibilityByUploadId({});
      setKgEligibilityError(err?.message || '加载知识图谱可选测试对象失败');
    } finally {
      setKgEligibilityLoading(false);
    }
  };


  /* --- data loading --- */
  const loadDialogData = async () => {
    if (!selectedProjectId) return;
    setAgentAppsLoadError('');
    try {
      const runtimeConfig = await api.domains.platform.scheduleCenter.getRuntimeConfig();
      const nextToolCreateEnabledByTaskType = Object.fromEntries(
        ((runtimeConfig?.tool_defaults || []) as Array<{ task_type?: string; create_task_enabled?: boolean | null }>).map((item) => [
          String(item.task_type || ''),
          item.create_task_enabled !== false,
        ]),
      );
      setToolCreateEnabledByTaskType(nextToolCreateEnabledByTaskType);
    } catch {
      setToolCreateEnabledByTaskType({});
    }
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

  useEffect(() => {
    if (!open) return;
    if (!isKgSourceTask) {
      setKgEligibilityByUploadId({});
      setKgEligibilityError('');
      setKgEligibilityLoading(false);
      return;
    }
    void loadKgEligibilityState(inputs);
  }, [open, isKgSourceTask, inputs]);

  /* --- keep taskType valid for the selected mode --- */
  useEffect(() => {
    if (mode === 'lion-head') return;
    if (!enabledTaskTypes.some((item) => item.value === taskType)) {
      setTaskType(enabledTaskTypes[0]?.value || availableTaskTypes[0]?.value || 'source_scan_e2e');
    }
  }, [mode, availableTaskTypes, enabledTaskTypes, taskType]);

  /* --- reset on task-type change --- */
  useEffect(() => {
    setInstruction('');
    if (taskType !== 'sechps_tool') {
      setSelectedAgentAppId('');
    }
    // CFG mining needs an existing ingested code upload (graph must pre-exist),
    // so force the "选择已有" source.
    if (taskType === 'kg_source_vuln_scan_e2e') {
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

  /* --- close (cancel any in-flight upload first) --- */
  const handleClose = () => {
    uploaderRef.current?.cancel();
    onClose();
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

      /* ---- 狮首 (lion-head): 直接走 Cairn 黑板，不经过调度中心 ---- */
      if (mode === 'lion-head') {
        let lionUploadId = selectedInputId;
        let lionRelativePath = '';
        if (inputSource === 'upload') {
          if (!uploaderRef.current?.hasFiles()) {
            setError('请先选择要上传的文件');
            setSaving(false);
            return;
          }
          const uploadResult = await uploaderRef.current.triggerUpload();
          lionUploadId = uploadResult.uploadId;
          lionRelativePath = '';
        }
        if (!lionUploadId) {
          setError('请先选择测试对象');
          setSaving(false);
          return;
        }
        const resolved = await fileserverApi.resolveProjectInputUpload(selectedProjectId, lionUploadId, lionRelativePath);
        const cairnProject = await api.domains.cairn.createProject({
          title: name,
          origin: resolved.absolute_path,
          goal: goalText,
        });
        const cairnProjectId = cairnProject?.project?.id || cairnProject?.id || '';
        await scheduleApi.createUserTask(selectedProjectId, {
          task_type: 'source_scan_e2e',
          name,
          description: `[黑板:cairn:${cairnProjectId}] ${goalText}`,
          input_upload_ids: [lionUploadId],
          input_binding: {
            upload_id: lionUploadId,
            selection_type: 'directory',
            relative_path: lionRelativePath || '',
          },
          policy: { cairn_project_id: cairnProjectId },
          dispatch_policy: {},
        });
        setName('');
        setDescription('');
        setGoalText('');
        setMode('dragon-tail');
        uploaderRef.current?.reset();
        onCreated();
        handleClose();
        return;
      }

      let finalInputUploadId = selectedInputId;
      let finalInputBinding = {
        upload_id: selectedInputId,
        selection_type: 'directory' as const,
        relative_path: '',
        relative_paths: undefined,
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
          selection_type: 'directory' as const,
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
      if (isKgSourceTask && (!selectedKgEligibility || selectedKgEligibility.allowed !== true)) {
        setError(selectedKgEligibility?.reasonText || '当前测试对象未满足“入口分析已完成 + 至少 1 个入口”的要求');
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
      uploaderRef.current?.reset();
      onCreated();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
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
            <div className="mt-1 text-xs leading-5" style={{ color: LK.muted }}>
              当前项目为<span className="font-semibold" style={{ color: LK.inkSoft }}>「{projectName || selectedProjectId || '—'}」</span>如需为其他项目创建任务，请在顶部导航右上角切换项目空间。
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 transition-colors"
            style={{ color: LK.muted }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
            <div className="flex h-full flex-col space-y-3">
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

              {/* 任务名称 + 模式 */}
              <div className="flex gap-3">
                <label className="block min-w-0 flex-1 text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  任务名称 <span className="required"> *</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input mt-1.5 w-full rounded-lg px-3 text-sm outline-none transition-colors"
                  />
                </label>
                <div className="flex-1 shrink-0">
                  <div className="mb-1.5 text-sm font-semibold" style={{ color: LK.inkSoft }}>模式</div>
                  <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}>
                    {MODE_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setMode(item.value)}
                        className="flex-1 rounded-md px-3 py-1.5 text-sm font-bold transition-all"
                        style={mode === item.value
                          ? { backgroundColor: LK.primary, color: '#fff' }
                          : { color: LK.body }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {mode === 'lion-head' ? null : (
                <>
              {/* binary_module_e2e module name */}
              {taskType === 'binary_module_e2e' ? (
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  模块名
                  <input
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    className="form-input mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                  />
                </label>
              ) : null}

              {isKgSourceTask ? (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                  知识图谱-漏洞挖掘会直接使用所选测试对象记录的 <span style={{ color: LK.ink, fontFamily: MONO }}>upload_id</span> 作为知识图谱定位参数，不需要手工填写。
                </div>
              ) : null}

              {/* 工具 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                工具
                <DropdownSelect
                  value={taskType}
                  onChange={(v) => setTaskType(v as (typeof TASK_TYPES)[number]['value'])}
                  options={availableTaskTypes.map((item) => ({
                    value: item.value,
                    label: `${item.label}${isTaskTypeDisabled(item.value) ? '（已禁用）' : ''}`,
                    disabled: isTaskTypeDisabled(item.value),
                  }))}
                  placeholder="请选择工具"
                  emptyText="暂无可用工具"
                  containerClassName="mt-1"
                />
              </label>
              {taskTypeDisabled ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  {DISABLED_TASK_TYPE_MESSAGE}
                </div>
              ) : null}
              {!taskTypeDisabled && TASK_TYPE_HINTS[taskType] ? (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}
                >
                  {TASK_TYPE_HINTS[taskType]}
                </div>
              ) : null}

              {/* sechps Agent Harness specific */}
              {taskType === 'sechps_tool' ? (
                <>
                  <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                    Agent Harness
                    <DropdownSelect
                      value={selectedAgentAppId}
                      onChange={setSelectedAgentAppId}
                      options={[
                        { value: '', label: '请选择具体 Harness' },
                        ...agentApps.map((item) => ({ value: item.id, label: `${item.name} / ${item.engine}` })),
                      ]}
                      placeholder="请选择具体 Harness"
                      emptyText="暂无可用 Harness"
                      containerClassName="mt-1"
                    />
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
                      className="form-textarea mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                      placeholder="不填时使用 Agent Harness 的启动命令，例如 /project:xxx"
                    />
                  </label>
                </>
              ) : null}
                </>
              )}


              {/* -------- 测试对象 section -------- */}
              <div>
                {/* sub-mode toggle */}
                <div
                  className="mb-3 flex w-full gap-1 border-b"
                  style={{ borderColor: LK.border }}
                >
                  {(isKgSourceTask ? (['existing'] as const) : (['upload', 'existing'] as const)).map((src) => {
                    const active = inputSource === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setInputSource(src)}
                        className={`relative px-4 py-2 text-sm transition-colors ${active ? 'font-semibold' : 'font-medium'}`}
                        style={{ color: active ? LK.primary : LK.body }}
                      >
                        {src === 'existing' ? '选择已有' : '直接上传'}
                        {active ? (
                          <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ backgroundColor: LK.primary }} />
                        ) : null}
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
                    hideUploadIcon
                    defaultInputType="code"
                    onUploadStateChange={setUploading}
                  />
                ) : (
                  <div className="space-y-3">
                    {isKgSourceTask ? (
                      <div className="rounded-lg px-3 py-2" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                        <div className="text-sm font-semibold" style={{ color: LK.inkSoft }}>
                          严格筛选结果
                        </div>
                        <div className="mt-1 text-xs" style={{ color: LK.muted }}>
                          共发现 {codeInputs.length} 条源码上传记录，当前仅 {kgEligibleItems.length} 条满足“至少 1 个入口”。
                        </div>
                      </div>
                    ) : null}

                    {/* input record selector */}
                    <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                      测试对象记录
                      <DropdownSelect
                        value={selectedInputId}
                        onChange={setSelectedInputId}
                        options={selectableInputs.map((item) => ({
                          value: item.upload_id,
                          label: getUploadRecordDisplayName(item),
                        }))}
                        placeholder="请选择测试对象记录"
                        emptyText="暂无可用记录"
                        containerClassName="mt-1"
                      />
                    </label>

                    {isKgSourceTask && kgEligibilityLoading ? (
                      <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                        <Loader2 size={14} className="mr-2 inline-block animate-spin" />
                        正在检查源码记录的知识图谱与入口分析状态...
                      </div>
                    ) : null}

                    {isKgSourceTask && kgEligibilityError ? (
                      <div
                        className="rounded-lg px-4 py-3 text-sm"
                        style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
                      >
                        {kgEligibilityError}
                      </div>
                    ) : null}

                    {selectableInputs.length === 0 ? (
                      <div
                        className="rounded-lg px-4 py-3 text-sm"
                        style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                      >
                        {isKgSourceTask
                          ? '当前没有满足“至少 1 个入口”的源码上传记录，请先到'
                          : '没有可用输入，请先到'}
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
                        {isKgSourceTask && kgIneligibleItems.length > 0 ? (
                          <div className="overflow-hidden rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                            <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.inkSoft, backgroundColor: LK.surfaceRaised }}>
                              不可选源码记录
                            </div>
                            <div className="overflow-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                                    <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>上传记录</th>
                                    <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>上传状态</th>
                                    <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>图谱状态</th>
                                    <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>入口分析</th>
                                    <th className="px-4 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>不可选原因</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {kgIneligibleItems.map(({ record, eligibility }) => (
                                    <tr key={record.upload_id} style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                                      <td className="px-4 py-2.5" style={{ color: LK.inkSoft }}>{getUploadRecordDisplayName(record)}</td>
                                      <td className="px-4 py-2.5" style={{ color: LK.body }}>{record.status}</td>
                                      <td className="px-4 py-2.5" style={{ color: LK.body }}>
                                        {eligibility?.codemapTaskStatus || '-'}
                                      </td>
                                      <td className="px-4 py-2.5" style={{ color: LK.body }}>
                                        {eligibility?.attackStatus
                                          ? `${eligibility.attackStatus}${typeof eligibility.attackEntries === 'number' ? ` · 入口 ${eligibility.attackEntries}` : ''}`
                                          : '-'}
                                      </td>
                                      <td className="px-4 py-2.5" style={{ color: LK.warning }}>{eligibility?.reasonText || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {mode === 'lion-head' ? (
                <>
                  {/* 目标 */}
                  <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                    目标 <span className="required"> *</span>
                    <textarea
                      value={goalText}
                      onChange={(e) => setGoalText(e.target.value)}
                      className="form-textarea mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                      rows={3}
                      placeholder="例如：审计该项目是否存在 SQL 注入、命令注入等高危漏洞"
                    />
                  </label>

                  {/* 工具 */}
                  <div>
                    <div className="mb-1.5 text-sm font-semibold" style={{ color: LK.inkSoft }}>工具</div>
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                      style={{ backgroundColor: LK.primaryMuted, border: `1px solid ${LK.primary}`, color: LK.primary }}
                    >
                      <Network size={14} />
                      黑板
                      <span className="ml-1 text-xs font-normal" style={{ color: LK.body }}>狮首模式固定使用黑板（Cairn）源码白盒漏洞挖掘</span>
                    </div>
                  </div>

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
              ) : (
                <>

              {/* 描述 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                描述
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="form-textarea mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
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

              {/* 动态验证环境提示 */}
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}
              >
                如需运行动态验证，请前往
                <button
                  type="button"
                  onClick={() => {
                    window.open('#/env-management', '_blank', 'noopener,noreferrer');
                  }}
                  className="mx-1 font-semibold underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: LK.primary }}
                >
                  测试环境 · 环境管理
                </button>
                完成环境配置。
              </div>
            </div>
        </div>

        {/* footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${LK.border}` }}>
            <button
              onClick={handleClose}
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


