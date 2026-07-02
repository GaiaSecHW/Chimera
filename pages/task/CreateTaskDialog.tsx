import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Network, X } from 'lucide-react';
import { api } from '../../clients/api';
import { DropdownSelect, MarkdownViewer } from '../../design-system';
import { TestInputUploader, type TestInputUploaderHandle, type InputType as TestInputType } from '../../components/TestInputUploader';
import { toolRegistryApi } from '../../clients/toolRegistry';
import type { TaskCreateToolMenuItem, ToolKind } from '../../clients/toolRegistry';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import {
  loadKgInputEligibility,
} from './kgInputEligibility';
import type {
  KgInputEligibility,
} from './kgInputEligibility';
import { resolveSechpsInstruction } from './taskCenterInstruction';
import { AI4RED_GUIDE_MARKDOWN } from './ai4redGuide';
import { getPlatformRole } from '../../utils/rbac';
import type {
  ProjectInputUploadRecord,
  ScheduleCenterUserTaskCreatePayload,
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

const DISABLED_TASK_TYPE_MESSAGE = '该工具已在系统管理 -> 任务调度 -> 调度参数中禁用前端创建。';

const MODE_OPTIONS = [
  { value: 'dragon-tail', label: '龙尾' },
  { value: 'ram-horn', label: '羊角' },
  { value: 'lion-head', label: '狮首' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getLocalUserInfo = (): UserInfo | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
};

/* 狮首模式仅限 ICSL 部门（含子部门，如 ICSL/安全）使用。
   优先按 department_path 数组判断层级归属（叶子部门名不带 ICSL/ 前缀时也能命中，
   例如 ICSL/渗透测试部 的 department_name 只是 "渗透测试部"）；
   若后端未返回 path，回退到 department_name 的字符串前缀匹配。 */
const isIcslDepartment = (
  user?: { department_path?: { id: number; name: string }[] | null; department_name?: string | null } | null,
): boolean => {
  if (!user) return false;
  const path = Array.isArray(user.department_path) ? user.department_path : null;
  if (path && path.length > 0) {
    return path.some((node) => (node?.name || '').trim() === 'ICSL');
  }
  const name = (user.department_name || '').trim();
  return name === 'ICSL' || name.startsWith('ICSL/');
};

/* ------------------------------------------------------------------ */
/*  LOKI design tokens                                                 */
/* ------------------------------------------------------------------ */

const LK = {
  primary: '#2563EB',
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
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/* 工具类型标签：微服务（蓝）/ Agent（紫） */
const KindBadge = ({ kind }: { kind: ToolKind }) => {
  const isAgent = kind === 'agent';
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight"
      style={isAgent
        ? { backgroundColor: 'rgba(168,85,247,0.16)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.32)' }
        : { backgroundColor: 'rgba(59,130,246,0.16)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.32)' }}
    >
      {isAgent ? 'Agent' : '微服务'}
    </span>
  );
};

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
  // 狮首模式限 ICSL 部门（含子部门）或超级管理员（super_admin）使用
  const platformRole = getPlatformRole(currentUser);
  const isAdminRole = platformRole === 'super_admin';
  const canUseLionHead = isIcslDepartment(currentUser) || isAdminRole;

  /* --- form state --- */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId);
  const [taskType, setTaskType] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goalText, setGoalText] = useState('');
  const [mode, setMode] = useState('dragon-tail');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [tools, setTools] = useState<TaskCreateToolMenuItem[]>([]);
  const [kgEligibilityByUploadId, setKgEligibilityByUploadId] = useState<Record<string, KgInputEligibility>>({});
  const [kgEligibilityLoading, setKgEligibilityLoading] = useState(false);
  const [kgEligibilityError, setKgEligibilityError] = useState('');
  const [toolCreateEnabledByTaskType, setToolCreateEnabledByTaskType] = useState<Record<string, boolean>>({});
  const [showAi4redGuide, setShowAi4redGuide] = useState(false);

  /* --- tool/agent-specific state --- */
  const [moduleName, setModuleName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [toolsLoadError, setToolsLoadError] = useState('');

  /* --- input source toggle --- */
  const [inputSource, setInputSource] = useState<'existing' | 'upload'>('upload');
  const uploaderRef = useRef<TestInputUploaderHandle>(null);
  const [uploading, setUploading] = useState(false);

  /* --- tool dropdown --- */
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const toolDropdownRef = useRef<HTMLDivElement>(null);

  /* --- derived --- */
  const isLionHead = mode === 'lion-head';
  const isKgSourceTask = !isLionHead && taskType === 'kg_source_vuln_scan_e2e';
  /* 按当前模式过滤工具（接口返回的 mode 字段多选：dragon-tail/ram-horn/lion-head）。 */
  const availableTools = useMemo(
    () => tools.filter((t) => (t.mode ?? []).some((m) => m === mode)),
    [tools, mode],
  );
  const selectedTool = useMemo(() => availableTools.find((item) => item.task_type === taskType) || null, [availableTools, taskType]);
  const isAgentTool = selectedTool?.kind === 'agent';
  const agentInfo = selectedTool?.agent || null;
  const codeInputs = useMemo(
    () => inputs.filter((item) => String(item.input_type || '').trim().toLowerCase() === 'code'),
    [inputs],
  );
  /* 工具的 input_types（API 值 document/code/package/other）映射为上传/记录使用的类型（package→software）。 */
  const allowedUploaderInputTypes = useMemo<TestInputType[] | null>(() => {
    const its = selectedTool?.input_types;
    if (!its || its.length === 0) return null;
    return its.map((t) => (t === 'package' ? 'software' : t) as TestInputType);
  }, [selectedTool]);
  const allowedInputTypeSet = useMemo<Set<string> | null>(() => {
    if (!allowedUploaderInputTypes) return null;
    return new Set(allowedUploaderInputTypes);
  }, [allowedUploaderInputTypes]);
  const selectableInputs = useMemo(
    () => {
      const base = isKgSourceTask
        ? codeInputs.filter((item) => kgEligibilityByUploadId[item.upload_id]?.allowed === true)
        : inputs;
      return allowedInputTypeSet
        ? base.filter((item) => allowedInputTypeSet.has(String(item.input_type || '').trim().toLowerCase()))
        : base;
    },
    [codeInputs, inputs, isKgSourceTask, kgEligibilityByUploadId, allowedInputTypeSet],
  );
  const selectedInput = useMemo(() => selectableInputs.find((item) => item.upload_id === selectedInputId) || null, [selectableInputs, selectedInputId]);
  const selectedKgEligibility = useMemo(
    () => (selectedInputId ? kgEligibilityByUploadId[selectedInputId] || null : null),
    [kgEligibilityByUploadId, selectedInputId],
  );
  const isTaskTypeDisabled = (value: string) => !(toolCreateEnabledByTaskType[value] ?? true);
  const taskTypeDisabled = isTaskTypeDisabled(taskType);
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
      : Boolean(taskType) && (
    inputSource === 'upload'
      ? nameValid
      : Boolean(nameValid && selectedInputId
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
    setToolsLoadError('');
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
      const menuResp = await toolRegistryApi.taskCreateMenu();
      setTools(menuResp?.items || []);
    } catch (err: any) {
      setTools([]);
      setToolsLoadError(err?.message || '加载工具列表失败');
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedProjectId(projectId);
      if (preSelectedMode && (preSelectedMode !== 'lion-head' || canUseLionHead)) {
        setMode(preSelectedMode);
      }
      void loadDialogData();
    }
  }, [open, projectId, preSelectedMode, canUseLionHead]);

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

  /* --- keep taskType valid against the loaded tool list (filtered by mode) --- */
  useEffect(() => {
    if (mode === 'lion-head') return;
    if (availableTools.length === 0) return;
    const isEnabled = (tt: string) => (toolCreateEnabledByTaskType[tt] ?? true);
    if (availableTools.some((t) => t.task_type === taskType && isEnabled(t.task_type))) return;
    const firstEnabled = availableTools.find((t) => isEnabled(t.task_type));
    setTaskType(firstEnabled?.task_type || availableTools[0]?.task_type || '');
  }, [mode, availableTools, taskType, toolCreateEnabledByTaskType]);

  /* --- reset on task-type change --- */
  useEffect(() => {
    setInstruction('');
    // CFG mining needs an existing ingested code upload (graph must pre-exist),
    // so force the "选择已有" source.
    if (taskType === 'kg_source_vuln_scan_e2e') {
      setInputSource('existing');
    }
  }, [taskType]);

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

  /* --- tool dropdown: close on outside click --- */
  useEffect(() => {
    if (!toolDropdownOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (toolDropdownRef.current && !toolDropdownRef.current.contains(event.target as Node)) {
        setToolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [toolDropdownOpen]);

  /* --- submit --- */
  const createTask = async () => {
    setSaving(true);
    setError('');
    try {
      if (taskTypeDisabled) {
        setError(DISABLED_TASK_TYPE_MESSAGE);
        return;
      }

      /* ---- 狮首 (lion-head): 走调度中心 cairn_blackboard,调度中心派发到黑板报 ---- */
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
        await scheduleApi.createUserTask(selectedProjectId, {
          task_type: 'cairn_blackboard',
          name,
          description: goalText,
          input_upload_ids: [lionUploadId],
          input_binding: {
            upload_id: lionUploadId,
            selection_type: 'directory',
            relative_path: lionRelativePath || '',
          },
          policy: {},
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

      const agentStartCommand = isAgentTool ? (agentInfo?.start_command || undefined) : undefined;
      const resolvedInstruction = isAgentTool
        ? resolveSechpsInstruction(instruction, agentStartCommand)
        : '';
      const payload: ScheduleCenterUserTaskCreatePayload = {
        task_type: taskType,
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
        agent_app_id: isAgentTool ? (agentInfo?.agent_app_id || undefined) : undefined,
        agent_app_name: isAgentTool ? (selectedTool?.name || undefined) : undefined,
        agent_app_engine: isAgentTool ? (agentInfo?.engine || undefined) : undefined,
        agent_app_agent_name: isAgentTool ? (agentInfo?.default_agent_name || undefined) : undefined,
        agent_model_alias_id: isAgentTool ? (agentInfo?.model_alias_id ?? undefined) : undefined,
        agent_harness_path: isAgentTool ? (agentInfo?.agent_harness_path || undefined) : undefined,
        instruction: isAgentTool ? (resolvedInstruction || undefined) : undefined,
      };
      await scheduleApi.createUserTask(selectedProjectId, payload);
      /* reset form state */
      setName('');
      setDescription('');
      setMode('dragon-tail');
      setModuleName('');
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
    <>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
      style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)', marginTop: '0px' }}
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
              当前项目为「<span className="font-bold" style={{ color: LK.error }}>{projectName || selectedProjectId || '—'}</span>」如需为其他项目创建任务，请在顶部导航右上角切换项目空间。
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
                    {MODE_OPTIONS.map((item) => {
                      const isLion = item.value === 'lion-head';
                      const itemDisabled = isLion && !canUseLionHead;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => { if (!itemDisabled) setMode(item.value); }}
                          disabled={itemDisabled}
                          title={itemDisabled ? '仅 ICSL 部门可用' : undefined}
                          className="flex-1 rounded-md px-3 py-1.5 text-sm font-bold transition-all"
                          style={mode === item.value
                            ? { backgroundColor: LK.primary, color: '#fff' }
                            : itemDisabled
                              ? { color: LK.mutedSoft, cursor: 'not-allowed', opacity: 0.5 }
                              : { color: LK.body }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  {!canUseLionHead ? (
                    <div className="mt-1.5 text-xs" style={{ color: LK.mutedSoft }}>
                      狮首当前处于测试阶段，敬请期待
                    </div>
                  ) : null}
                </div>
              </div>

              {mode === 'lion-head' ? null : (
                <>
              {isKgSourceTask ? (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                  知识图谱-漏洞挖掘会直接使用所选测试对象记录的 <span style={{ color: LK.ink, fontFamily: MONO }}>upload_id</span> 作为知识图谱定位参数，不需要手工填写。
                </div>
              ) : null}

              {/* 工具 */}
              <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                工具
                <div className="relative mt-1" ref={toolDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setToolDropdownOpen((v) => !v)}
                    className="form-select flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {selectedTool ? (
                        <>
                          <KindBadge kind={selectedTool.kind} />
                          <span className="truncate" style={{ color: LK.ink }}>{selectedTool.name}</span>
                          {isTaskTypeDisabled(selectedTool.task_type) ? (
                            <span className="shrink-0 text-xs" style={{ color: LK.warning }}>已禁用</span>
                          ) : null}
                        </>
                      ) : (
                        <span style={{ color: LK.muted }}>请选择工具</span>
                      )}
                    </span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${toolDropdownOpen ? 'rotate-180' : ''}`} style={{ color: LK.muted }} />
                  </button>
                  {toolDropdownOpen ? (
                    <div
                      className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg p-1.5"
                      style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
                    >
                      {availableTools.length === 0 ? (
                        <div className="px-3 py-2 text-xs font-medium" style={{ color: LK.muted }}>暂无可用工具</div>
                      ) : availableTools.map((item) => {
                        const selected = item.task_type === taskType;
                        const disabled = isTaskTypeDisabled(item.task_type);
                        return (
                          <button
                            key={item.task_type}
                            type="button"
                            disabled={disabled}
                            onClick={() => { if (!disabled) { setTaskType(item.task_type); setToolDropdownOpen(false); } }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                            style={selected
                              ? { backgroundColor: LK.primaryMuted, color: LK.ink }
                              : disabled
                                ? { color: LK.mutedSoft, cursor: 'not-allowed', opacity: 0.5 }
                                : { color: LK.body }}
                          >
                            <KindBadge kind={item.kind} />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </label>
              {taskTypeDisabled ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  {DISABLED_TASK_TYPE_MESSAGE}
                </div>
              ) : null}
              {toolsLoadError ? (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
                >
                  {toolsLoadError}
                </div>
              ) : null}
              {!taskTypeDisabled && selectedTool?.description ? (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.body }}
                >
                  {taskType === 'ai4red' ? (
                    <>
                      请上传一个压缩包（
                      <button
                        type="button"
                        onClick={() => setShowAi4redGuide(true)}
                        className="font-bold text-red-500 underline underline-offset-2 transition-colors hover:text-red-400"
                      >
                        具体要求见说明
                      </button>
                      ）
                    </>
                  ) : (
                    selectedTool.description
                  )}
                </div>
              ) : null}

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

              {/* agent 类工具「执行指令」输入框已隐藏：默认隐式使用 Agent Harness 注册的 start_command。
                  instruction state 与 resolveSechpsInstruction fallback 逻辑保留（不填即走 start_command），如需恢复见 git 历史。 */}
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
                    defaultKeepOriginal={selectedTool?.upload_mode === 'raw'}
                    hideKeepOriginal
                    onUploadStateChange={setUploading}
                    allowedInputTypes={allowedUploaderInputTypes ?? undefined}
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
              className="btn-secondary"
            >
              取消
            </button>
            <button
              onClick={() => void createTask()}
              disabled={saving || uploading || !canCreateTask}
              className="btn-primary"
            >
              {saving ? '创建中...' : uploading ? '上传中...' : '创建任务'}
            </button>
          </div>
      </div>
    </div>
    {showAi4redGuide ? (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in"
        style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        onClick={() => setShowAi4redGuide(false)}
      >
        <div
          className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl animate-in"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
            <div className="text-lg font-semibold leading-7" style={{ color: LK.ink }}>
              AI4RED 红线验证使用指南
            </div>
            <button
              onClick={() => setShowAi4redGuide(false)}
              className="rounded-lg p-2 transition-colors"
              style={{ color: LK.muted }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <MarkdownViewer content={AI4RED_GUIDE_MARKDOWN} />
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
};

