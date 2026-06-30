import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  Bot,
  Box,
  Brain,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cpu,
  Database,
  FileBox,
  FileSearch,
  FileText,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe,
  GraduationCap,
  HardDrive,
  Key,
  Layers3,
  LayoutDashboard,
  Link2,
  ListTodo,
  Loader2,
  Lock,
  LucideIcon,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Play,
  Plus,
  RefreshCw,
  Server,
  ServerCog,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Terminal,
  UserCog,
  Users,
  Workflow,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';

import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { toolRegistryApi } from '../../clients/toolRegistry';
import { aigwApi } from '../../clients/aigw';
import type {
  ProbeTestResponse,
  ToolCreateParams,
  ToolInputType,
  ToolKind,
  ToolListItem,
  ToolResponse,
  ToolStatus,
  ToolUpdate,
} from '../../clients/toolRegistry';
import {
  Button,
  FormField,
  Input,
  Modal,
  PageHeader,
  PageSection,
  SegmentedControl,
  Select,
} from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';
import { getPlatformRole } from '../../utils/rbac';
import type { AiGatewayModelAlias, UserInfo } from '../../types/types';

interface AgentAppOption {
  id: string;
  name: string;
  engine: string;
}

interface DepartmentOption {
  id: number;
  name: string;
}

type AgentHarnessFileType = 'folder' | 'archive';

interface AgentHarnessFileData {
  type: AgentHarnessFileType;
  name: string;
  files?: File[];
  file?: File;
  size?: number;
}

const TOOL_ID_PATTERN = /^[A-Z]{1,10}$/;

/** Icons available for tool registration, matching those used in app/navigation.tsx. */
const TOOL_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Activity', Icon: Activity },
  { name: 'Archive', Icon: Archive },
  { name: 'BarChart3', Icon: BarChart3 },
  { name: 'Bot', Icon: Bot },
  { name: 'Box', Icon: Box },
  { name: 'Brain', Icon: Brain },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Building2', Icon: Building2 },
  { name: 'ClipboardList', Icon: ClipboardList },
  { name: 'Cpu', Icon: Cpu },
  { name: 'FileBox', Icon: FileBox },
  { name: 'FileSearch', Icon: FileSearch },
  { name: 'FileText', Icon: FileText },
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'FolderTree', Icon: FolderTree },
  { name: 'GitBranch', Icon: GitBranch },
  { name: 'Globe', Icon: Globe },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'HardDrive', Icon: HardDrive },
  { name: 'Key', Icon: Key },
  { name: 'Layers3', Icon: Layers3 },
  { name: 'LayoutDashboard', Icon: LayoutDashboard },
  { name: 'ListTodo', Icon: ListTodo },
  { name: 'Lock', Icon: Lock },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Monitor', Icon: Monitor },
  { name: 'Network', Icon: Network },
  { name: 'Package', Icon: Package },
  { name: 'Play', Icon: Play },
  { name: 'Plus', Icon: Plus },
  { name: 'Server', Icon: Server },
  { name: 'ServerCog', Icon: ServerCog },
  { name: 'Settings', Icon: Settings },
  { name: 'Shield', Icon: Shield },
  { name: 'ShieldAlert', Icon: ShieldAlert },
  { name: 'ShieldCheck', Icon: ShieldCheck },
  { name: 'Smartphone', Icon: Smartphone },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Target', Icon: Target },
  { name: 'Terminal', Icon: Terminal },
  { name: 'UserCog', Icon: UserCog },
  { name: 'Users', Icon: Users },
  { name: 'Workflow', Icon: Workflow },
  { name: 'Zap', Icon: Zap },
];

const findToolIcon = (name: string): LucideIcon | undefined =>
  TOOL_ICONS.find((t) => t.name === name)?.Icon;

const INPUT_TYPE_OPTIONS: { value: ToolInputType; label: string }[] = [
  { value: 'document', label: '文档' },
  { value: 'code', label: '代码' },
  { value: 'package', label: '软件包' },
  { value: 'other', label: '其他' },
];

const DEFAULT_FORM: FormState = {
  id: '',
  name: '',
  description: '',
  kind: 'microservice',
  input_types: [],
  view_id: '',
  icon: '',
  current_version: '',
  // microservice
  namespace: '',
  deployment: '',
  api_prefix: '',
  health_path: '/health',
  service_port: '8080',
  catalogJson: '',
  // agent
  engine: 'opencode',
  start_command: '',
  input_requirements: '',
  default_agent_name: '',
  department_id: '',
  model_alias_id: '',
};

interface FormState {
  id: string;
  name: string;
  description: string;
  kind: ToolKind;
  input_types: ToolInputType[];
  // shared registration fields
  view_id: string;
  icon: string;
  current_version: string;
  // microservice-only
  namespace: string;
  deployment: string;
  api_prefix: string;
  health_path: string;
  service_port: string;
  catalogJson: string;
  // agent-only
  engine: string;
  start_command: string;
  input_requirements: string;
  default_agent_name: string;
  department_id: string;
  model_alias_id: string;
}

type ErrorMap = Partial<Record<keyof FormState | 'catalog' | 'root', string>>;

const isInt = (value: string): boolean => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));

interface ParsedServiceUrl {
  deployment?: string;
  namespace?: string;
  service_port?: string;
  api_prefix?: string;
  health_path?: string;
}

/**
 * Parse a k8s service DNS URL like
 *   http://{deployment}.{namespace}.svc.cluster.local:{port}{path}
 * into the microservice form fields. Returns null when blank or invalid.
 * The path is split at the last "/" so that
 *   /api/project/health -> api_prefix=/api/project, health_path=/health
 */
const parseMicroserviceUrl = (input: string): ParsedServiceUrl | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const parts = url.hostname.split('.');
  if (parts.length < 2) return null;
  const result: ParsedServiceUrl = {
    deployment: parts[0],
    namespace: parts[1],
  };
  // URL.port strips default ports (80 for http, 443 for https), so extract from raw input
  const portMatch = trimmed.match(/^https?:\/\/[^/]+:(\d+)/);
  const port = portMatch ? portMatch[1] : url.port;
  if (port) result.service_port = port;
  const pathname = url.pathname;
  if (pathname && pathname !== '/') {
    const clean = pathname.replace(/\/+$/, '');
    const segments = clean.split('/').filter(Boolean);
    if (segments.length === 1) {
      result.health_path = '/' + segments[0];
    } else if (segments.length >= 2) {
      result.health_path = '/' + segments[segments.length - 1];
      result.api_prefix = '/' + segments.slice(0, -1).join('/');
    }
  }
  return result;
};

const validate = (form: FormState): ErrorMap => {
  const errors: ErrorMap = {};
  if (!form.id.trim()) errors.id = '请输入工具 ID';
  else if (!TOOL_ID_PATTERN.test(form.id.trim())) errors.id = 'ID 须为 1-10 位大写字母（如 BINSEC）';
  if (!form.name.trim()) errors.name = '请输入工具名称';
  if (!form.view_id.trim()) errors.view_id = '请输入菜单/路由标识';
  if (form.input_types.length === 0) errors.input_types = '请至少选择一种输入类型';
  if (form.kind === 'microservice') {
    if (!form.namespace.trim()) errors.namespace = '请输入 K8s namespace';
    if (!form.deployment.trim()) errors.deployment = '请输入 deployment 名称';
    if (!form.api_prefix.trim()) errors.api_prefix = '请输入 api_prefix';
    if (!form.health_path.trim()) errors.health_path = '请输入 health_path';
    if (!form.service_port.trim()) errors.service_port = '请输入 service_port';
    else if (!isInt(form.service_port)) errors.service_port = 'service_port 须为整数';
    if (form.catalogJson.trim()) {
      try { JSON.parse(form.catalogJson); } catch { errors.catalog = 'catalog 不是合法 JSON'; }
    }
  } else {
    if (!form.engine) errors.engine = '请选择引擎';
    if (!form.default_agent_name.trim()) errors.default_agent_name = '请输入默认 Agent 名称';
    if (!form.department_id) errors.department_id = '请选择部门范围';
  }
  return errors;
};

const buildCreateParams = (form: FormState, harnessFile: AgentHarnessFileData | null, isPublic: boolean): ToolCreateParams => {
  const base = {
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    kind: form.kind,
    input_types: form.input_types,
    view_id: form.view_id.trim() || undefined,
    icon: form.icon.trim() || undefined,
    current_version: form.current_version.trim() || undefined,
  };
  if (form.kind === 'microservice') {
    let catalog: Record<string, unknown> | undefined;
    if (form.catalogJson.trim()) catalog = JSON.parse(form.catalogJson) as Record<string, unknown>;
    return {
      ...base,
      microservice: {
        namespace: form.namespace.trim(),
        deployment: form.deployment.trim(),
        api_prefix: form.api_prefix.trim(),
        health_path: form.health_path.trim(),
        service_port: Number(form.service_port),
        view_id: form.view_id.trim(),
        icon: form.icon.trim() || undefined,
        current_version: form.current_version.trim() || undefined,
        catalog,
      },
    };
  }
  return {
    ...base,
    agent: {
      engine: form.engine,
      default_agent_name: form.default_agent_name.trim(),
      start_command: form.start_command.trim() || undefined,
      input_requirements: form.input_requirements.trim() || undefined,
      is_public: isPublic,
      model_alias_id: form.model_alias_id || undefined,
    },
    agent_harness_file: harnessFile?.file ?? null,
    agent_harness_file_type: harnessFile?.type === 'folder' ? 'folder' : 'archive',
  };
};

const buildUpdatePayload = (form: FormState, isPublic: boolean): ToolUpdate => {
  const payload: ToolUpdate = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    input_types: form.input_types,
  };
  if (form.kind === 'microservice') {
    let catalog: Record<string, unknown> | undefined;
    if (form.catalogJson.trim()) {
      try { catalog = JSON.parse(form.catalogJson) as Record<string, unknown>; } catch { /* keep undefined */ }
    }
    payload.microservice = {
      namespace: form.namespace.trim(),
      deployment: form.deployment.trim(),
      api_prefix: form.api_prefix.trim(),
      health_path: form.health_path.trim(),
      service_port: Number(form.service_port),
      view_id: form.view_id.trim(),
      icon: form.icon.trim() || undefined,
      current_version: form.current_version.trim() || undefined,
      catalog,
    };
  } else {
    payload.agent = {
      engine: form.engine,
      default_agent_name: form.default_agent_name.trim(),
      start_command: form.start_command.trim() || undefined,
      input_requirements: form.input_requirements.trim() || undefined,
      is_public: isPublic,
      view_id: form.view_id.trim(),
      icon: form.icon.trim() || undefined,
      current_version: form.current_version.trim() || undefined,
      model_alias_id: form.model_alias_id.trim() ? Number(form.model_alias_id) : undefined,
    };
  }
  return payload;
};

const formFromToolDetail = (tool: ToolResponse, user: UserInfo | null): FormState => {
  const ms = tool.microservice;
  const ag = tool.agent;
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description ?? '',
    kind: tool.kind,
    input_types: tool.input_types ?? [],
    view_id: ms?.view_id ?? ag?.view_id ?? '',
    icon: ms?.icon ?? ag?.icon ?? '',
    current_version: ms?.current_version ?? ag?.current_version ?? '',
    namespace: ms?.namespace ?? '',
    deployment: ms?.deployment ?? '',
    api_prefix: ms?.api_prefix ?? '',
    health_path: ms?.health_path ?? '/health',
    service_port: ms?.service_port != null ? String(ms.service_port) : '8080',
    catalogJson: ms?.catalog ? JSON.stringify(ms.catalog, null, 2) : '',
    engine: ag?.engine ?? 'opencode',
    start_command: ag?.start_command ?? '',
    input_requirements: ag?.input_requirements ?? '',
    default_agent_name: ag?.default_agent_name ?? '',
    department_id: ag?.is_public ? '__public__' : (user?.department_id != null ? String(user.department_id) : ''),
    model_alias_id: ag?.model_alias_id != null ? String(ag.model_alias_id) : '',
  };
};

const loadAgentApps = async (): Promise<AgentAppOption[]> => {
  const response = await fetch(agentManageApiPath('/agent-apps'), { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  return apps.map((app: { id: string; name: string; engine: string }) => ({ id: app.id, name: app.name, engine: app.engine }));
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  draft: '草稿', pending: '待审核', online: '已上线', offline: '已下架',
};
const STATUS_TONE: Record<ToolStatus, string> = {
  draft: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  offline: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const HEALTH_TONE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  unhealthy: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  unknown: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
};

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className ?? ''}`}>
    {children}
  </span>
);

const INPUT_TYPE_LABEL = (t: string): string =>
  INPUT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

const DetailField: React.FC<{ label: string; value?: string; mono?: boolean; full?: boolean }> = ({ label, value, mono, full }) => (
  <div className={full ? 'col-span-2' : ''}>
    <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">{label}</div>
    <div className={`mt-0.5 break-all text-theme-text-primary ${mono ? 'font-mono text-xs' : ''}`}>{value || '-'}</div>
  </div>
);

const formatTime = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const inputGridClass = 'grid grid-cols-1 gap-4 md:grid-cols-2';

interface ToolRegistrationPageProps {
  user: UserInfo | null;
}

export const ToolRegistrationPage: React.FC<ToolRegistrationPageProps> = ({ user }) => {
  const { feedbackNodes, notify } = useUiFeedback();
  const isAdmin = getPlatformRole(user) === 'super_admin';
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeTestResponse | null>(null);
  const [probeError, setProbeError] = useState('');
  const [agentApps, setAgentApps] = useState<AgentAppOption[]>([]);
  const [agentAppsLoading, setAgentAppsLoading] = useState(false);
  const [modelAliases, setModelAliases] = useState<AiGatewayModelAlias[]>([]);
  const [modelAliasesLoading, setModelAliasesLoading] = useState(false);
  const [myTools, setMyTools] = useState<ToolListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [microserviceUrl, setMicroserviceUrl] = useState('');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [inputTypePickerOpen, setInputTypePickerOpen] = useState(false);
  const [pendingTools, setPendingTools] = useState<ToolListItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [detailTool, setDetailTool] = useState<ToolResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolListItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [agentHarnessFile, setAgentHarnessFile] = useState<AgentHarnessFileData | null>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const effectiveUser = user;
  const canChoosePublic = true;
  const departments = useMemo<DepartmentOption[]>(() => {
    if (!effectiveUser?.department_id) return [];
    return [{ id: Number(effectiveUser.department_id), name: effectiveUser.department_name || `部门 ${effectiveUser.department_id}` }];
  }, [effectiveUser?.department_id, effectiveUser?.department_name]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleInputType = (value: ToolInputType) => {
    setForm((prev) => ({
      ...prev,
      input_types: prev.input_types.includes(value)
        ? prev.input_types.filter((t) => t !== value)
        : [...prev.input_types, value],
    }));
  };

  const handleMicroserviceUrlChange = (value: string) => {
    setMicroserviceUrl(value);
    const parsed = parseMicroserviceUrl(value);
    if (!parsed) return;
    setForm((prev) => ({
      ...prev,
      ...(parsed.deployment !== undefined ? { deployment: parsed.deployment } : {}),
      ...(parsed.namespace !== undefined ? { namespace: parsed.namespace } : {}),
      ...(parsed.service_port !== undefined ? { service_port: parsed.service_port } : {}),
      ...(parsed.api_prefix !== undefined ? { api_prefix: parsed.api_prefix } : {}),
      ...(parsed.health_path !== undefined ? { health_path: parsed.health_path } : {}),
    }));
    setErrors((prev) => {
      const next = { ...prev };
      (['deployment', 'namespace', 'service_port', 'api_prefix', 'health_path'] as const).forEach((k) => {
        if (next[k]) delete next[k];
      });
      return next;
    });
  };

  const refreshMyTools = async () => {
    setListLoading(true);
    try {
      const result = await toolRegistryApi.listMine({ page: 1, page_size: 100 });
      setMyTools(Array.isArray(result?.items) ? result.items : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : '我的工具列表加载失败', 'error');
      setMyTools([]);
    } finally {
      setListLoading(false);
    }
  };

  const refreshAgentApps = async () => {
    setAgentAppsLoading(true);
    try {
      const apps = await loadAgentApps();
      setAgentApps(apps);
    } catch {
      setAgentApps([]);
    } finally {
      setAgentAppsLoading(false);
    }
  };

  const refreshModelAliases = async () => {
    setModelAliasesLoading(true);
    try {
      const aliases = await aigwApi.listModelAliases();
      setModelAliases(Array.isArray(aliases) ? aliases.filter((alias: AiGatewayModelAlias) => alias.enabled !== false) : []);
    } catch {
      setModelAliases([]);
    } finally {
      setModelAliasesLoading(false);
    }
  };

  useEffect(() => {
    void refreshMyTools();
    void refreshAgentApps();
    void refreshModelAliases();
  }, []);

  const handleKindChange = (kind: string) => {
    setForm((prev) => ({ ...prev, kind: kind as ToolKind }));
    setErrors({});
    setProbeResult(null);
    setProbeError('');
  };

  const handleProbe = async () => {
    if (form.kind !== 'microservice') return;
    const probeErrors: ErrorMap = {};
    if (!form.namespace.trim()) probeErrors.namespace = '请输入 namespace';
    if (!form.deployment.trim()) probeErrors.deployment = '请输入 deployment';
    if (!form.health_path.trim()) probeErrors.health_path = '请输入 health_path';
    if (!form.service_port.trim() || !isInt(form.service_port)) probeErrors.service_port = 'service_port 须为整数';
    if (Object.keys(probeErrors).length > 0) {
      setErrors(probeErrors);
      return;
    }
    setProbeLoading(true);
    setProbeResult(null);
    setProbeError('');
    try {
      const result = await toolRegistryApi.probeTest({
        namespace: form.namespace.trim(),
        deployment: form.deployment.trim(),
        service_port: Number(form.service_port),
        health_path: form.health_path.trim(),
      });
      setProbeResult(result);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : '探活请求失败');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const firstFile = files[0];
    if (!firstFile.name.match(/\.(zip|7z|tar|tar\.gz|tgz)$/i)) {
      notify('请上传 ZIP、TAR、TAR.GZ、TGZ、7Z 压缩包', 'error');
      return;
    }
    setAgentHarnessFile({ type: 'archive', name: firstFile.name, file: firstFile, size: firstFile.size });
  };

  const handleSubmit = async () => {
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const isPublic = canChoosePublic && form.department_id === '__public__';
    if (form.kind === 'agent' && !editingTool && !agentHarnessFile) {
      notify('请上传 AgentHarness 文件', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (editingTool) {
        const payload = buildUpdatePayload(form, isPublic);
        const updated = await toolRegistryApi.update(editingTool.id, payload);
        notify(`工具 ${updated.id} 已更新`, 'success');
      } else {
        const params = buildCreateParams(form, agentHarnessFile, isPublic);
        const created = await toolRegistryApi.create(params);
        notify(`工具 ${created.id} 已提交注册，状态：待审核（pending）`, 'success');
      }
      handleCloseForm();
      await refreshMyTools();
    } catch (error) {
      const message = error instanceof Error ? error.message : (editingTool ? '工具更新失败' : '工具注册失败');
      notify(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setProbeResult(null);
    setProbeError('');
    setMicroserviceUrl('');
    setIconPickerOpen(false);
    setInputTypePickerOpen(false);
    setAgentHarnessFile(null);
  };

  const handleOpenCreate = () => {
    setEditingTool(null);
    setForm(DEFAULT_FORM);
    setErrors({});
    setProbeResult(null);
    setProbeError('');
    setMicroserviceUrl('');
    setIconPickerOpen(false);
    setInputTypePickerOpen(false);
    setAgentHarnessFile(null);
    setFormOpen(true);
  };

  const handleOpenEdit = async (tool: ToolListItem) => {
    setEditingTool(tool);
    setFormOpen(true);
    setErrors({});
    setForm(DEFAULT_FORM);
    setAgentHarnessFile(null);
    try {
      const detail = await toolRegistryApi.get(tool.id);
      setForm(formFromToolDetail(detail, user));
    } catch (error) {
      notify(error instanceof Error ? error.message : '加载工具详情失败', 'error');
      setFormOpen(false);
      setEditingTool(null);
    }
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingTool(null);
    setForm(DEFAULT_FORM);
    setErrors({});
    setProbeResult(null);
    setProbeError('');
    setMicroserviceUrl('');
    setIconPickerOpen(false);
    setInputTypePickerOpen(false);
    setAgentHarnessFile(null);
  };

  const handleOnline = async (id: string) => {
    setActionLoadingId(id);
    try {
      await toolRegistryApi.online(id);
      notify(`工具 ${id} 已上架`, 'success');
      await refreshMyTools();
    } catch (error) {
      notify(error instanceof Error ? error.message : '上架失败', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOffline = async (id: string) => {
    setActionLoadingId(id);
    try {
      await toolRegistryApi.offline(id);
      notify(`工具 ${id} 已下架`, 'success');
      await refreshMyTools();
    } catch (error) {
      notify(error instanceof Error ? error.message : '下架失败', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResubmit = async (id: string) => {
    setActionLoadingId(id);
    try {
      await toolRegistryApi.submit(id);
      notify(`工具 ${id} 已重新提交审核`, 'success');
      await refreshMyTools();
    } catch (error) {
      notify(error instanceof Error ? error.message : '重新提交失败', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenDetail = async (tool: ToolListItem) => {
    setDetailLoading(true);
    setDetailTool(null);
    try {
      const detail = await toolRegistryApi.get(tool.id);
      setDetailTool(detail);
    } catch (error) {
      notify(error instanceof Error ? error.message : '加载工具详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailTool(null);
  };

  const refreshPendingTools = async () => {
    setPendingLoading(true);
    try {
      const result = await toolRegistryApi.listPending();
      setPendingTools(Array.isArray(result?.items) ? result.items : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : '待审批列表加载失败', 'error');
      setPendingTools([]);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleOpenReview = async () => {
    setReviewOpen(true);
    await refreshPendingTools();
  };

  const handleApprove = async (id: string) => {
    setReviewLoadingId(id);
    try {
      await toolRegistryApi.review(id, { action: 'approve' });
      notify(`工具 ${id} 审批通过`, 'success');
      await refreshPendingTools();
      await refreshMyTools();
    } catch (error) {
      notify(error instanceof Error ? error.message : '审批操作失败', 'error');
    } finally {
      setReviewLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectNote.trim()) {
      notify('拒绝时必须填写理由', 'error');
      return;
    }
    setReviewLoadingId(id);
    try {
      await toolRegistryApi.review(id, { action: 'reject', review_note: rejectNote.trim() });
      notify(`工具 ${id} 已拒绝`, 'success');
      setRejectingId(null);
      setRejectNote('');
      await refreshPendingTools();
      await refreshMyTools();
    } catch (error) {
      notify(error instanceof Error ? error.message : '审批操作失败', 'error');
    } finally {
      setReviewLoadingId(null);
    }
  };

  const kindOptions = useMemo(() => [
    { value: 'microservice', label: '微服务', icon: <Server size={14} /> },
    { value: 'agent', label: 'Agent', icon: <Bot size={14} /> },
  ], []);

  const agentAppOptions = useMemo(
    () => agentApps.map((app) => ({ label: `${app.name}（${app.engine}）`, value: app.id })),
    [agentApps],
  );

  return (
    <div className="space-y-6 p-8 pb-10">
      {feedbackNodes}
      <PageHeader
        title="工具注册"
        description="向工具注册中心登记新工具（微服务或 Agent）。注册后状态为 pending，待超级管理员审核通过后上线进菜单 / 过闸门。菜单排序由后台管理员调整，注册时无需填写。"
      />

      {formOpen ? (
        <Modal
          open={formOpen}
          onClose={handleCloseForm}
          size="xl"
          className="!max-w-[900px]"
          title={editingTool ? '修改工具' : '注册新工具'}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={handleReset} disabled={submitting}>重置</Button>
              <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<Plus size={14} />}>
                {editingTool ? '保存修改' : '提交注册'}
              </Button>
            </div>
          }
        >
        <div className="space-y-5">
          <FormField label="工具类型" required>
            <SegmentedControl
              aria-label="工具类型"
              value={form.kind}
              onChange={handleKindChange}
              options={kindOptions}
            />
          </FormField>

          <div className={inputGridClass}>
            <FormField label="工具 ID" required error={errors.id} hint="1-10 位大写字母">
              <Input
                value={form.id}
                onChange={(e) => setField('id', e.target.value.toUpperCase())}
                placeholder="如 BINSEC"
                invalid={!!errors.id}
                maxLength={10}
                disabled={!!editingTool}
              />
            </FormField>
            <FormField label="工具名称" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="如 盖亚-二进制固件"
                invalid={!!errors.name}
              />
            </FormField>
            <FormField label="输入类型" required hint="多选：工具接受的输入类型" error={errors.input_types}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setInputTypePickerOpen((v) => !v)}
                  className="form-select flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className={`truncate flex-1 ${form.input_types.length ? 'text-theme-text-primary' : 'text-theme-text-muted'}`}>
                    {form.input_types.length
                      ? form.input_types.map((t) => INPUT_TYPE_OPTIONS.find((o) => o.value === t)?.label || t).join('、')
                      : '请选择输入类型'}
                  </span>
                  <ChevronDown size={14} className={`shrink-0 text-theme-text-faint transition-transform ${inputTypePickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {inputTypePickerOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setInputTypePickerOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-theme-border bg-theme-surface p-1.5">
                      {INPUT_TYPE_OPTIONS.map(({ value, label }) => {
                        const selected = form.input_types.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleInputType(value)}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-theme-elevated"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-theme-border'}`}>
                              {selected ? <Check size={12} /> : null}
                            </span>
                            <span className={selected ? 'text-theme-text-primary' : 'text-theme-text-secondary'}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            </FormField>
            <FormField label="菜单/路由标识" required error={errors.view_id}>
              <Input
                value={form.view_id}
                onChange={(e) => setField('view_id', e.target.value)}
                placeholder="如 BinarySecurity"
                invalid={!!errors.view_id}
              />
            </FormField>
            <FormField label="icon" hint="选择侧边栏图标（可选）">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIconPickerOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-secondary transition-colors hover:bg-theme-elevated"
                  >
                    {(() => {
                      const Icon = findToolIcon(form.icon);
                      return Icon ? <Icon size={16} /> : null;
                    })()}
                    <span className={form.icon ? '' : 'text-theme-text-muted'}>
                      {form.icon || '请选择图标'}
                    </span>
                    <ChevronDown size={14} className="text-theme-text-muted" />
                  </button>
                  {form.icon ? (
                    <button
                      type="button"
                      onClick={() => setField('icon', '')}
                      className="text-xs text-theme-text-muted transition-colors hover:text-rose-300"
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                {iconPickerOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIconPickerOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 grid w-80 grid-cols-8 gap-1 rounded-lg border border-theme-border bg-theme-surface p-2">
                      {TOOL_ICONS.map(({ name, Icon }) => (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          onClick={() => {
                            setField('icon', name);
                            setIconPickerOpen(false);
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            form.icon === name
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'text-theme-text-secondary hover:bg-theme-elevated'
                          }`}
                        >
                          <Icon size={16} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </FormField>
            <FormField label="当前版本（可选）">
              <Input
                value={form.current_version}
                onChange={(e) => setField('current_version', e.target.value)}
                placeholder="如 v1 或 commit-sha"
              />
            </FormField>
          </div>

          <FormField label="工具说明">
            <textarea
              className="form-input w-full resize-y"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="说明工具的用途、能力和适用场景"
            />
          </FormField>

          {form.kind === 'microservice' ? (
            <div className="space-y-5 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                <Server size={15} /> 微服务连通信息
              </div>
              <FormField
                label="URL 快速填充"
                hint="粘贴完整探活 URL，自动解析 deployment / namespace / service_port / api_prefix / health_path"
              >
                <Input
                  value={microserviceUrl}
                  onChange={(e) => handleMicroserviceUrlChange(e.target.value)}
                  placeholder="http://{deployment}.{namespace}.svc.cluster.local:{port}{path}"
                  prefix={<Link2 size={14} />}
                  className="font-mono text-xs"
                />
              </FormField>
              <div className={inputGridClass}>
                <FormField label="deployment" required error={errors.deployment}>
                  <Input
                    value={form.deployment}
                    onChange={(e) => setField('deployment', e.target.value)}
                    placeholder="如 binary-security"
                    invalid={!!errors.deployment}
                  />
                </FormField>
                <FormField label="namespace" required error={errors.namespace}>
                  <Input
                    value={form.namespace}
                    onChange={(e) => setField('namespace', e.target.value)}
                    placeholder="如 secflow"
                    invalid={!!errors.namespace}
                  />
                </FormField>
                <FormField label="service_port" required error={errors.service_port}>
                  <Input
                    value={form.service_port}
                    onChange={(e) => setField('service_port', e.target.value)}
                    placeholder="如 8080"
                    inputMode="numeric"
                    invalid={!!errors.service_port}
                  />
                </FormField>
                <FormField label="api_prefix" required error={errors.api_prefix}>
                  <Input
                    value={form.api_prefix}
                    onChange={(e) => setField('api_prefix', e.target.value)}
                    placeholder="如 /api/binary-security"
                    invalid={!!errors.api_prefix}
                  />
                </FormField>
                <FormField label="health_path" required error={errors.health_path}>
                  <Input
                    value={form.health_path}
                    onChange={(e) => setField('health_path', e.target.value)}
                    placeholder="如 /health"
                    invalid={!!errors.health_path}
                  />
                </FormField>
              </div>

              <FormField label="catalog" error={errors.catalog} hint="JSON 对象，可选">
                <textarea
                  className="form-input w-full resize-y font-mono text-xs"
                  rows={4}
                  value={form.catalogJson}
                  onChange={(e) => setField('catalogJson', e.target.value)}
                  placeholder='{"summary":"...","tags":["..."],"usageSections":[]}'
                />
              </FormField>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={handleProbe} disabled={probeLoading} icon={<Activity size={14} />}>
                  {probeLoading ? '探活中…' : '探活连通性测试'}
                </Button>
                <span className="text-xs text-theme-text-muted">
                  注册前先测探活 URL：<code className="font-mono">http://{'{deployment}.{namespace}.svc.cluster.local:{port}{path}'}</code>
                </span>
              </div>

              {probeError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <XCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{probeError}</span>
                </div>
              ) : null}
              {probeResult ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-theme-border bg-theme-surface p-3 text-xs">
                  {probeResult.reachable ? (
                    <Badge className={HEALTH_TONE.healthy}><CheckCircle2 size={11} /> 可达</Badge>
                  ) : (
                    <Badge className={HEALTH_TONE.unhealthy}><XCircle size={11} /> 不可达</Badge>
                  )}
                  {probeResult.status_code ? <span className="text-theme-text-secondary">HTTP {probeResult.status_code}</span> : null}
                  {typeof probeResult.elapsed_ms === 'number' ? <span className="text-theme-text-secondary">{probeResult.elapsed_ms} ms</span> : null}
                  {probeResult.url ? <span className="truncate font-mono text-theme-text-muted">{probeResult.url}</span> : null}
                  {probeResult.reason ? <span className="text-theme-text-secondary">{probeResult.reason}</span> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                <Bot size={15} /> Agent 信息
              </div>
              <div className={inputGridClass}>
                <FormField label="使用引擎" required error={errors.engine}>
                  <Select
                    options={[
                      { value: 'opencode', label: 'OpenCode' },
                      { value: 'claudecode', label: 'Claude Code' },
                      { value: 'agentflow', label: 'AgentFlow' },
                      { value: 'script', label: 'Script' },
                    ]}
                    placeholder="请选择引擎"
                    value={form.engine}
                    onChange={(e) => setField('engine', e.target.value)}
                    invalid={!!errors.engine}
                  />
                </FormField>
                <FormField label="默认 Agent" required error={errors.default_agent_name}>
                  <Input
                    value={form.default_agent_name}
                    onChange={(e) => setField('default_agent_name', e.target.value)}
                    placeholder="例如 security-reviewer"
                    invalid={!!errors.default_agent_name}
                  />
                </FormField>
                <FormField label="启动命令" hint="可选">
                  <Input
                    value={form.start_command}
                    onChange={(e) => setField('start_command', e.target.value)}
                    placeholder={form.engine === 'script' ? '例如 python run.py' : '例如 /project:review'}
                  />
                </FormField>
                <FormField label="部门范围" required error={errors.department_id}>
                  <Select
                    options={[
                      ...(canChoosePublic ? [{ label: '公开', value: '__public__' }] : []),
                      ...departments.map((d) => ({ label: d.name, value: String(d.id) })),
                    ]}
                    placeholder="请选择部门范围"
                    value={form.department_id}
                    onChange={(e) => setField('department_id', e.target.value)}
                    invalid={!!errors.department_id}
                  />
                </FormField>
              </div>
              <FormField label="模型" hint="可选，绑定 AI Gateway 模型别名">
                <Select
                  options={modelAliases.map((alias) => ({ label: alias.alias_name, value: String(alias.id) }))}
                  placeholder={modelAliasesLoading ? '正在加载模型' : '请选择模型'}
                  value={form.model_alias_id}
                  onChange={(e) => setField('model_alias_id', e.target.value)}
                  disabled={modelAliasesLoading}
                />
              </FormField>
              <div>
                <div className="text-sm font-semibold text-theme-text-primary">
                  AgentHarness 文件 {!editingTool && <span className="text-rose-400">*</span>}
                  {editingTool && <span className="text-theme-text-muted">（可选更新）</span>}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => archiveInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-theme-border bg-theme-surface px-5 py-4 text-sm font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
                  >
                    <Upload size={18} /> 上传压缩包
                  </button>
                </div>
                <input
                  ref={archiveInputRef}
                  type="file"
                  accept=".zip,.7z,.tar,.tar.gz,.tgz"
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                {agentHarnessFile ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-300">
                    <span className="truncate">压缩包：{agentHarnessFile.name}</span>
                    <button type="button" onClick={() => setAgentHarnessFile(null)} className="text-cyan-300 hover:text-cyan-200">移除</button>
                  </div>
                ) : null}
              </div>
              <FormField label="Agent说明" hint="可选，说明 Agent 的用途、能力和适用场景">
                <textarea
                  className="form-input w-full resize-y"
                  rows={2}
                  value={form.input_requirements}
                  onChange={(e) => setField('input_requirements', e.target.value)}
                  placeholder="说明 Agent 的用途、能力和适用场景"
                />
              </FormField>
            </div>
          )}

        </div>
        </Modal>
      ) : null}

      <PageSection
        title="我的工具"
        description="管理员可见全部工具；普通用户仅见自己注册的。注册成功后此处显示状态。"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleOpenCreate} icon={<Plus size={14} />}>
              新增工具
            </Button>
            {isAdmin ? (
              <Button variant="secondary" onClick={handleOpenReview} icon={<CheckCircle2 size={14} />}>
                审批工具
              </Button>
            ) : null}
            <Button variant="secondary" onClick={refreshMyTools} disabled={listLoading} icon={<RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />}>
              刷新
            </Button>
          </div>
        }
      >
        {listLoading && myTools.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-theme-border bg-theme-surface px-4 py-10 text-sm text-theme-text-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载…
          </div>
        ) : myTools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center">
            <Database className="mx-auto text-theme-text-muted" size={28} />
            <h3 className="mt-2 text-sm font-semibold text-theme-text-primary">暂无已注册工具</h3>
            <p className="mt-1 text-xs text-theme-text-muted">点击右上方「新增工具」按钮注册新工具。</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-theme-elevated text-[11px] uppercase tracking-wider text-theme-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">ID</th>
                  <th className="px-4 py-2.5 font-semibold">名称</th>
                  <th className="px-4 py-2.5 font-semibold">类型</th>
                  <th className="px-4 py-2.5 font-semibold">状态</th>
                  <th className="px-4 py-2.5 font-semibold">健康</th>
                  <th className="px-4 py-2.5 font-semibold">版本</th>
                  <th className="px-4 py-2.5 font-semibold">更新时间</th>
                  <th className="px-4 py-2.5 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {myTools.map((tool) => (
                  <tr key={tool.id} className="bg-theme-surface hover:bg-theme-elevated/50">
                    <td className="px-4 py-2.5 font-mono text-theme-text-primary">{tool.id}</td>
                    <td className="px-4 py-2.5 text-theme-text-primary">
                      <button type="button" onClick={() => void handleOpenDetail(tool)} className="font-medium text-blue-400 hover:text-blue-300 hover:underline">{tool.name}</button>
                      {tool.is_builtin ? <span className="ml-1 text-[10px] text-theme-text-muted">内置</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-theme-text-secondary">{tool.kind === 'microservice' ? '微服务' : 'Agent'}</td>
                    <td className="px-4 py-2.5"><Badge className={STATUS_TONE[tool.status]}>{STATUS_LABEL[tool.status]}</Badge></td>
                    <td className="px-4 py-2.5"><Badge className={HEALTH_TONE[tool.health_status ?? 'unknown']}>{tool.health_status ?? 'unknown'}</Badge></td>
                    <td className="px-4 py-2.5 text-theme-text-secondary">{tool.current_version || '-'}</td>
                    <td className="px-4 py-2.5 text-theme-text-muted">{formatTime(tool.updated_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tool.status === 'draft' ? (
                          <>
                            <button type="button" onClick={() => void handleOpenEdit(tool)} disabled={actionLoadingId === tool.id} className="rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/25 disabled:opacity-50">修改</button>
                            <button type="button" onClick={() => void handleResubmit(tool.id)} disabled={actionLoadingId === tool.id} className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50">{actionLoadingId === tool.id ? '处理中…' : '重新提交'}</button>
                          </>
                        ) : null}
                        {tool.status === 'online' && isAdmin ? (
                          <>
                            <button type="button" onClick={() => void handleOffline(tool.id)} disabled={actionLoadingId === tool.id} className="rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50">{actionLoadingId === tool.id ? '处理中…' : '下架'}</button>
                            <button type="button" onClick={() => void handleOpenEdit(tool)} disabled={actionLoadingId === tool.id} className="rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/25 disabled:opacity-50">修改</button>
                          </>
                        ) : null}
                        {tool.status === 'offline' ? (
                          <>
                            {isAdmin ? <button type="button" onClick={() => void handleOnline(tool.id)} disabled={actionLoadingId === tool.id} className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50">{actionLoadingId === tool.id ? '处理中…' : '上架'}</button> : null}
                            <button type="button" onClick={() => void handleOpenEdit(tool)} disabled={actionLoadingId === tool.id} className="rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/25 disabled:opacity-50">修改</button>
                          </>
                        ) : null}
                        {tool.status === 'pending' ? (
                          <span className="text-xs text-theme-text-muted">待审核</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
      {reviewOpen ? (
        <Modal
          open={reviewOpen}
          onClose={() => { setReviewOpen(false); setRejectingId(null); setRejectNote(''); void refreshMyTools(); }}
          size="xl"
          title="工具审批"
          description="审核待上线工具。通过后状态变为 online，拒绝后回退为 draft。"
          footer={
            <Button variant="secondary" onClick={() => { setReviewOpen(false); setRejectingId(null); setRejectNote(''); void refreshMyTools(); }}>
              关闭
            </Button>
          }
        >
          {pendingLoading && pendingTools.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-theme-text-muted">
              <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载…
            </div>
          ) : pendingTools.length === 0 ? (
            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center">
              <CheckCircle2 className="mx-auto text-theme-text-muted" size={28} />
              <h3 className="mt-2 text-sm font-semibold text-theme-text-primary">暂无待审批工具</h3>
              <p className="mt-1 text-xs text-theme-text-muted">所有工具均已审核。</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-theme-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-theme-elevated text-[11px] uppercase tracking-wider text-theme-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">ID</th>
                    <th className="px-4 py-2.5 font-semibold">名称</th>
                    <th className="px-4 py-2.5 font-semibold">类型</th>
                    <th className="px-4 py-2.5 font-semibold">提交人</th>
                    <th className="px-4 py-2.5 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border">
                  {pendingTools.map((tool) => (
                    <tr key={tool.id} className="bg-theme-surface">
                      <td className="px-4 py-2.5 font-mono text-theme-text-primary">{tool.id}</td>
                      <td className="px-4 py-2.5 text-theme-text-primary">
                        <button type="button" onClick={() => void handleOpenDetail(tool)} className="font-medium text-blue-400 hover:text-blue-300 hover:underline">{tool.name}</button>
                      </td>
                      <td className="px-4 py-2.5 text-theme-text-secondary">{tool.kind === 'microservice' ? '微服务' : 'Agent'}</td>
                      <td className="px-4 py-2.5 text-theme-text-secondary">{tool.submitted_by || '-'}</td>
                      <td className="px-4 py-2.5">
                        {rejectingId === tool.id ? (
                          <div className="space-y-2">
                            <textarea
                              className="form-input w-full resize-y text-xs"
                              rows={2}
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="拒绝理由（必填）"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleReject(tool.id)}
                                disabled={reviewLoadingId === tool.id || !rejectNote.trim()}
                                className="rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
                              >
                                {reviewLoadingId === tool.id ? '处理中…' : '确认拒绝'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRejectingId(null); setRejectNote(''); }}
                                disabled={reviewLoadingId === tool.id}
                                className="rounded-md px-2.5 py-1 text-xs text-theme-text-muted transition-colors hover:text-theme-text-secondary"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(tool.id)}
                              disabled={reviewLoadingId === tool.id}
                              className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              {reviewLoadingId === tool.id ? '处理中…' : '通过'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRejectingId(tool.id); setRejectNote(''); }}
                              disabled={reviewLoadingId === tool.id}
                              className="rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}

      {detailLoading || detailTool ? (
        <Modal
          open={detailLoading || !!detailTool}
          onClose={handleCloseDetail}
          size="xl"
          className="!max-w-[800px]"
          title={detailTool ? `${detailTool.name}（${detailTool.id}）` : '加载中…'}
          footer={<Button variant="secondary" onClick={handleCloseDetail}>关闭</Button>}
        >
          {detailLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-theme-text-muted">
              <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载…
            </div>
          ) : detailTool ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label="工具 ID" value={detailTool.id} mono />
                <DetailField label="类型" value={detailTool.kind === 'microservice' ? '微服务' : 'Agent'} />
                <DetailField label="状态" value={STATUS_LABEL[detailTool.status]} />
                <DetailField label="健康" value={detailTool.health_status ?? 'unknown'} />
                <DetailField label="输入类型" value={(detailTool.input_types ?? []).map((t) => INPUT_TYPE_LABEL(t)).join('、')} />
                <DetailField label="版本" value={detailTool.microservice?.current_version ?? detailTool.agent?.current_version} />
              </div>
              {detailTool.description ? <DetailField label="说明" value={detailTool.description} full /> : null}

              {detailTool.microservice ? (
                <div className="space-y-3 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
                  <div className="text-sm font-semibold text-theme-text-primary">微服务详情</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DetailField label="namespace" value={detailTool.microservice.namespace} mono />
                    <DetailField label="deployment" value={detailTool.microservice.deployment} mono />
                    <DetailField label="api_prefix" value={detailTool.microservice.api_prefix} mono />
                    <DetailField label="health_path" value={detailTool.microservice.health_path} mono />
                    <DetailField label="service_port" value={detailTool.microservice.service_port != null ? String(detailTool.microservice.service_port) : ''} mono />
                    <DetailField label="view_id" value={detailTool.microservice.view_id} mono />
                    <DetailField label="icon" value={detailTool.microservice.icon} />
                    <DetailField label="menu_group" value={detailTool.microservice.menu_group} />
                  </div>
                </div>
              ) : null}

              {detailTool.agent ? (
                <div className="space-y-3 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
                  <div className="text-sm font-semibold text-theme-text-primary">Agent 详情</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DetailField label="engine" value={detailTool.agent.engine} />
                    <DetailField label="default_agent_name" value={detailTool.agent.default_agent_name} mono />
                    <DetailField label="harness_gitea_url" value={detailTool.agent.agent_harness_gitea_url} mono full />
                    <DetailField label="start_command" value={detailTool.agent.start_command} mono />
                    <DetailField label="is_public" value={detailTool.agent.is_public ? '是' : '否'} />
                    <DetailField label="view_id" value={detailTool.agent.view_id} mono />
                    <DetailField label="icon" value={detailTool.agent.icon} />
                    <DetailField label="menu_group" value={detailTool.agent.menu_group} />
                  </div>
                  {detailTool.agent.input_requirements ? <DetailField label="输入要求" value={detailTool.agent.input_requirements} full /> : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label="提交人" value={detailTool.submitted_by_name} />
                <DetailField label="审核人" value={detailTool.reviewed_by_name} />
                <DetailField label="审核时间" value={formatTime(detailTool.reviewed_at)} />
                <DetailField label="审核备注" value={detailTool.review_note} />
                <DetailField label="创建时间" value={formatTime(detailTool.created_at)} />
                <DetailField label="更新时间" value={formatTime(detailTool.updated_at)} />
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
};
