import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Box,
  Edit2,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import JSZip from 'jszip';

import { getAuthHeaders, getHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';
import { aigwApi } from '../../clients/aigw';
import type { AiGatewayModelAlias, UserInfo, ViewType } from '../../types/types';

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface ToolOverviewPageProps {
  projectId: string;
  user: UserInfo | null;
  onNavigate: (view: ViewType) => void;
}

type AgentAppEngine = 'opencode' | 'claudecode' | 'agentflow' | 'script';
type AgentHarnessFileType = 'folder' | 'archive';

interface AgentApp {
  id: string;
  userId: string;
  name: string;
  engine: AgentAppEngine | string;
  agentHarnessPath?: string | null;
  agentHarnessRepoName?: string | null;
  agentHarnessGiteaUrl?: string | null;
  defaultAgentName: string;
  startCommand?: string | null;
  inputRequirements?: string | null;
  requireCodedmap?: boolean;
  status?: string;
  isPublic: boolean;
  tenantId?: string | null;
  departmentId?: number | string | null;
  modelAliasId?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt: string;
}

interface DepartmentOption {
  id: number;
  name: string;
}

interface AgentHarnessFileData {
  type: AgentHarnessFileType;
  name: string;
  files?: File[];
  file?: File;
  size?: number;
}

interface AgentAppFormState {
  name: string;
  engine: AgentAppEngine;
  defaultAgentName: string;
  startCommand: string;
  inputRequirements: string;
  requireCodedmap: boolean;
  departmentId: string;
  modelAliasId: string;
}

interface ClaudeCodeInfo {
  agents: string[];
  commands: string[];
}

interface AgentAppModalProps {
  mode: 'create' | 'edit';
  app?: AgentApp | null;
  saving: boolean;
  departments: DepartmentOption[];
  canChoosePublic: boolean;
  modelAliases: AiGatewayModelAlias[];
  modelAliasesLoading: boolean;
  onClose: () => void;
  onSubmit: (formState: AgentAppFormState, agentHarnessFile: AgentHarnessFileData | null, isPublic: boolean) => Promise<void>;
}

const emptyForm: AgentAppFormState = {
  name: '',
  engine: 'opencode',
  defaultAgentName: '',
  startCommand: '',
  inputRequirements: '',
  requireCodedmap: false,
  departmentId: '',
  modelAliasId: '',
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

const formatTime = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
};

const formatDate = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('zh-CN');
};

const formatPercent = (value?: number | null, invert = false): string => {
  if (value == null) return '-';
  return`${((invert ? 1 - value : value) * 100).toFixed(0)}%`;
};

const engineLabel = (engine: string): string => {
  if (engine === 'opencode') return 'OpenCode';
  if (engine === 'claudecode') return 'Claude Code';
  if (engine === 'agentflow') return 'AgentFlow';
  if (engine === 'script') return 'Script';
  return engine || '-';
};

const engineTone = (engine: string): string => {
  if (engine === 'opencode') return 'from-teal-500 to-cyan-600';
  if (engine === 'claudecode') return 'from-violet-500 to-fuchsia-600';
  if (engine === 'agentflow') return 'from-sky-500 to-blue-600';
  if (engine === 'script') return 'from-amber-500 to-orange-600';
  return 'from-slate-500 to-slate-700';
};

const loadAgentApps = async (departmentId?: number | string | null, tenantId?: number | string | null): Promise<AgentApp[]> => {
  const params = new URLSearchParams();
  if (departmentId) params.set('departmentId', String(departmentId));
  if (tenantId) params.set('tenantId', String(tenantId));
  const qs = params.toString();
  const url = agentManageApiPath(`/agent-apps${qs ?`?${qs}` : ''}`);
  const response = await fetch(url, { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  return Array.isArray(payload?.apps) ? payload.apps : [];
};

const loadHarnessBranches = async (appId: string): Promise<Array<{ name: string; commit: Record<string, unknown>; protected: boolean }>> => {
  const response = await fetch(agentManageApiPath(`/agent-apps/${encodeURIComponent(appId)}/branches`), { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  return Array.isArray(payload?.branches) ? payload.branches : [];
};

const appendHarnessFile = (form: FormData, agentHarnessFile: AgentHarnessFileData) => {
  form.append('agentHarnessFileType', agentHarnessFile.type);
  if (agentHarnessFile.type === 'archive' && agentHarnessFile.file) {
    form.append('agentHarnessFile', agentHarnessFile.file);
    return;
  }

  if (agentHarnessFile.type === 'folder' && agentHarnessFile.files) {
    const filesJson = agentHarnessFile.files.map((file, index) => ({
      key:`file_${index}`,
      relativePath: file.webkitRelativePath || file.name,
    }));
    form.append('filesJson', JSON.stringify(filesJson));
    agentHarnessFile.files.forEach((file, index) => form.append(`file_${index}`, file));
    form.append('agentHarnessFile', new File([], agentHarnessFile.name, { type: 'application/x-directory' }));
  }
};

const appendAgentFields = (form: FormData, formState: AgentAppFormState, isPublic: boolean) => {
  form.append('name', formState.name.trim());
  form.append('engine', formState.engine);
  form.append('defaultAgentName', formState.defaultAgentName.trim());
  if (formState.startCommand.trim()) form.append('startCommand', formState.startCommand.trim());
  if (formState.inputRequirements.trim()) form.append('inputRequirements', formState.inputRequirements.trim());
  if (formState.modelAliasId) form.append('modelAliasId', formState.modelAliasId);
  form.append('isPublic', String(isPublic));
  form.append('requireCodedmap', String(formState.requireCodedmap));
  form.append('departmentId', isPublic ? '' : formState.departmentId);
  form.append('tenantId', isPublic ? '' : formState.departmentId);
};

const createAgentApp = async (formState: AgentAppFormState, agentHarnessFile: AgentHarnessFileData, isPublic: boolean): Promise<void> => {
  const form = new FormData();
  appendAgentFields(form, formState, isPublic);
  appendHarnessFile(form, agentHarnessFile);

  const response = await fetch(agentManageApiPath('/agent-apps'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  await handleResponse(response);
};

const updateAgentApp = async (appId: string, formState: AgentAppFormState, agentHarnessFile: AgentHarnessFileData | null, isPublic: boolean): Promise<void> => {
  const url = agentManageApiPath(`/agent-apps/${encodeURIComponent(appId)}`);
  if (agentHarnessFile) {
    const form = new FormData();
    appendAgentFields(form, formState, isPublic);
    appendHarnessFile(form, agentHarnessFile);
    const response = await fetch(url, { method: 'PUT', headers: getAuthHeaders(), body: form });
    await handleResponse(response);
    return;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      name: formState.name.trim(),
      engine: formState.engine,
      defaultAgentName: formState.defaultAgentName.trim(),
      startCommand: formState.startCommand.trim() || null,
      inputRequirements: formState.inputRequirements.trim() || null,
      modelAliasId: formState.modelAliasId ? Number(formState.modelAliasId) : null,
      requireCodedmap: formState.requireCodedmap,
      isPublic,
      departmentId: isPublic ? null : formState.departmentId || null,
      tenantId: isPublic ? null : formState.departmentId || null,
    }),
  });
  await handleResponse(response);
};

const deleteAgentApp = async (id: string): Promise<void> => {
  const response = await fetch(agentManageApiPath(`/agent-apps/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
};

const syncAgentRepos = async (): Promise<{ success: boolean; message?: string }> => {
  const response = await fetch(agentManageApiPath('/agent-apps/sync'), { method: 'POST', headers: getAuthHeaders() });
  return handleResponse(response);
};

const isAdminUser = (): boolean => {
  const userData = localStorage.getItem('user');
  if (userData) {
    try {
      const user = JSON.parse(userData);
      const roles = Array.isArray(user?.roles) ? user.roles : [];
      return roles.includes('admin') || roles.includes('platform_admin') || user?.isPlatformAdmin === true;
    } catch {
      return false;
    }
  }

  const token = localStorage.getItem('chimera_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    const roles = Array.isArray(payload?.roles) ? payload.roles : [];
    return roles.includes('admin') || payload?.isPlatformAdmin === true;
  } catch {
    return false;
  }
};

const validateHarnessStructure = (fileData: AgentHarnessFileData, engine: AgentAppEngine): { valid: boolean; message: string } => {
  if ((engine !== 'opencode' && engine !== 'claudecode') || fileData.type !== 'folder' || !fileData.files) return { valid: true, message: '' };
  const requiredFolder = engine === 'opencode' ? '.opencode' : '.claude';
  const hasRequiredFolder = fileData.files.some((file) => {
    const normalized = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    return normalized.split('/').includes(requiredFolder);
  });

  return hasRequiredFolder
    ? { valid: true, message: '' }
    : { valid: false, message:`该文件不是 ${engineLabel(engine)} 的 AgentHarness 文件` };
};

const extractAgentNameFromFolder = async (files: File[], engine: AgentAppEngine): Promise<string | null> => {
  if (engine === 'opencode') {
    const configFile = files.find((file) => /(?:^|\/)opencode\.json$/i.test(file.webkitRelativePath || file.name));
    if (!configFile) return null;
    try {
      const config = JSON.parse((await configFile.text()).replace(/^﻿/, ''));
      return typeof config.default_agent === 'string' ? config.default_agent : null;
    } catch {
      return null;
    }
  }

  if (engine === 'claudecode') {
    const agentFile = files.find((file) => /(?:^|\/)\.claude\/agents\/([^/]+)\.md$/i.test((file.webkitRelativePath || file.name).replace(/\\/g, '/')));
    const match = (agentFile?.webkitRelativePath || agentFile?.name || '').replace(/\\/g, '/').match(/(?:^|\/)\.claude\/agents\/([^/]+)\.md$/i);
    return match?.[1] || null;
  }

  return null;
};

const detectClaudeCodeFromFolder = (files: File[]): ClaudeCodeInfo => {
  const agents: string[] = [];
  const commands: string[] = [];
  files.forEach((file) => {
    const normalized = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const agentMatch = normalized.match(/(?:^|\/)\.claude\/agents\/([^/]+)\.md$/i);
    if (agentMatch && !agents.includes(agentMatch[1])) agents.push(agentMatch[1]);
    const commandMatch = normalized.match(/(?:^|\/)\.claude\/commands\/([^/]+)\.md$/i);
    if (commandMatch && !commands.includes(commandMatch[1])) commands.push(commandMatch[1]);
  });
  return { agents, commands };
};

const extractAgentNameFromZip = async (file: File, engine: AgentAppEngine): Promise<string | null> => {
  try {
    const zip = await JSZip.loadAsync(file);
    if (engine === 'opencode') {
      const matched = zip.file(/(?:^|\/)opencode\.json$/i)[0];
      if (matched) {
        const content = await matched.async('string');
        const config = JSON.parse(content.replace(/^﻿/, ''));
        if (config.default_agent) return config.default_agent;
      }
    }
    if (engine === 'claudecode') {
      for (const [p, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const normalized = p.replace(/\\/g, '/');
        const agentMatch = normalized.match(/(?:^|\/)\.claude\/agents\/([^/]+)\.md$/i);
        if (agentMatch) return agentMatch[1];
      }
    }
    return null;
  } catch { return null; }
};

const detectClaudeCodeFromZip = async (file: File): Promise<ClaudeCodeInfo> => {
  const zip = await JSZip.loadAsync(file);
  const agents: string[] = [];
  const commands: string[] = [];
  for (const [p, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalized = p.replace(/\\/g, '/');
    const agentMatch = normalized.match(/(?:^|\/)\.claude\/agents\/([^/]+)\.md$/i);
    if (agentMatch && !agents.includes(agentMatch[1])) agents.push(agentMatch[1]);
    const commandMatch = normalized.match(/(?:^|\/)\.claude\/commands\/([^/]+)\.md$/i);
    if (commandMatch && !commands.includes(commandMatch[1])) commands.push(commandMatch[1]);
  }
  return { agents, commands };
};

const validateHarnessZip = async (fileData: AgentHarnessFileData, engine: AgentAppEngine): Promise<{ valid: boolean; message: string }> => {
  if (engine !== 'opencode' && engine !== 'claudecode') return { valid: true, message: '' };
  if (fileData.type !== 'archive' || !fileData.file || !fileData.name.match(/\.zip$/i)) return { valid: true, message: '' };
  const requiredFolder = engine === 'opencode' ? '.opencode' : '.claude';
  try {
    const zip = await JSZip.loadAsync(fileData.file);
    const hasRequired = Object.keys(zip.files).some((p) => p.replace(/\\/g, '/').split('/').includes(requiredFolder));
    return hasRequired ? { valid: true, message: '' } : { valid: false, message:`该文件不是 ${engineLabel(engine)} 的 AgentHarness 文件` };
  } catch { return { valid: false, message: '无法解析 ZIP 文件，请确认文件格式正确' }; }
};

const AgentAppModal: React.FC<AgentAppModalProps> = ({ mode, app, saving, departments, canChoosePublic, modelAliases, modelAliasesLoading, onClose, onSubmit }) => {
  const [formState, setFormState] = useState<AgentAppFormState>(emptyForm);
  const [agentHarnessFile, setAgentHarnessFile] = useState<AgentHarnessFileData | null>(null);
  const [claudeCodeInfo, setClaudeCodeInfo] = useState<ClaudeCodeInfo | null>(null);
  const [localError, setLocalError] = useState('');
  const archiveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'edit' && app) {
      setFormState({
        name: app.name || '',
        engine: (app.engine as AgentAppEngine) || 'opencode',
        defaultAgentName: app.defaultAgentName || '',
        startCommand: app.startCommand || '',
        inputRequirements: app.inputRequirements || '',
        requireCodedmap: app.requireCodedmap || false,
        departmentId: app.isPublic ? '__public__' : String(app.departmentId ?? app.tenantId ?? ''),
        modelAliasId: app.modelAliasId ? String(app.modelAliasId) : '',
      });
    } else {
      setFormState(emptyForm);
    }
    setAgentHarnessFile(null);
    setClaudeCodeInfo(null);
    setLocalError('');
  }, [app, mode]);

  const applyFolderDetection = async (files: File[], engine: AgentAppEngine) => {
    if (engine === 'claudecode') {
      const info = detectClaudeCodeFromFolder(files);
      setClaudeCodeInfo(info);
      setFormState((current) => ({
        ...current,
        defaultAgentName: current.defaultAgentName || info.agents[0] || '',
        startCommand: current.startCommand || (info.commands[0] ?`/project:${info.commands[0]}` : info.agents[0] ?`/project:${info.agents[0]}` : ''),
      }));
      return;
    }

    const agentName = await extractAgentNameFromFolder(files, engine);
    if (agentName) {
      setFormState((current) => ({
        ...current,
        defaultAgentName: current.defaultAgentName || agentName,
        startCommand: current.startCommand ||`/${agentName}`,
      }));
    }
  };

  const applyZipDetection = async (file: File, engine: AgentAppEngine) => {
    if (!engine) return;
    if (engine === 'claudecode') {
      const info = await detectClaudeCodeFromZip(file);
      setClaudeCodeInfo(info);
      setFormState((current) => ({
        ...current,
        defaultAgentName: current.defaultAgentName || info.agents[0] || '',
        startCommand: current.startCommand || (info.commands[0] ?`/project:${info.commands[0]}` : info.agents[0] ?`/project:${info.agents[0]}` : ''),
      }));
      return;
    }
    const agentName = await extractAgentNameFromZip(file, engine);
    if (agentName) {
      setFormState((current) => ({
        ...current,
        defaultAgentName: current.defaultAgentName || agentName,
        startCommand: current.startCommand ||`/${agentName}`,
      }));
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    const firstFile = files[0];
    setLocalError('');

    if (firstFile.webkitRelativePath) {
      const allFiles = Array.from(files);
      const fileData = { type: 'folder' as const, name: firstFile.webkitRelativePath.split('/')[0], files: allFiles };
      const validation = validateHarnessStructure(fileData, formState.engine);
      if (!validation.valid) {
        setLocalError(validation.message);
        return;
      }
      setAgentHarnessFile(fileData);
      await applyFolderDetection(allFiles, formState.engine);
      return;
    }

    if (!firstFile.name.match(/\.(zip|7z|tar|tar\.gz|tgz)$/i)) {
      setLocalError('请上传 ZIP、TAR、TAR.GZ、TGZ、7Z 压缩包或文件夹；暂不支持 RAR');
      return;
    }

    const fileData: AgentHarnessFileData = { type: 'archive', name: firstFile.name, file: firstFile, size: firstFile.size };

    if (formState.engine && firstFile.name.match(/\.zip$/i)) {
      const validation = await validateHarnessZip(fileData, formState.engine);
      if (!validation.valid) {
        setLocalError(validation.message);
        return;
      }
    }

    setAgentHarnessFile(fileData);
    setClaudeCodeInfo(null);

    if (formState.engine && firstFile.name.match(/\.zip$/i)) {
      await applyZipDetection(firstFile, formState.engine);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      setLocalError('请输入 Agent 名称');
      return;
    }
    if (mode === 'create' && !agentHarnessFile) {
      setLocalError('请上传 AgentHarness 文件');
      return;
    }
    if (!formState.departmentId) {
      setLocalError('请选择部门范围');
      return;
    }

    if (agentHarnessFile && (formState.engine === 'opencode' || formState.engine === 'claudecode')) {
      let validation: { valid: boolean; message: string };
      if (agentHarnessFile.type === 'archive' && agentHarnessFile.file && agentHarnessFile.name.match(/\.zip$/i)) {
        validation = await validateHarnessZip(agentHarnessFile, formState.engine);
      } else {
        validation = validateHarnessStructure(agentHarnessFile, formState.engine);
      }
      if (!validation.valid) {
        setLocalError(validation.message);
        return;
      }
    }

    const isPublic = canChoosePublic && formState.departmentId === '__public__';
    await onSubmit(formState, agentHarnessFile, isPublic);
  };

  const inputClass = {'marginTop': '8px', 'width': '100%', 'borderRadius': '12px', 'border':`1px solid ${LK.border}`, 'backgroundColor': LK.surfaceRaised, 'padding': '12px 16px', 'fontSize': '14px', 'color': LK.ink, 'outline': 'none', 'transition': 'all 0.2s', 'cursor': 'text'};

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, backgroundColor: 'rgba(7, 13, 24, 0.55)', padding: '16px', backdropFilter: 'blur(4px)' }}>
      <form onSubmit={handleSubmit} style={{ margin: '0 auto', display: 'flex', height: '100%', width: '100%', maxWidth: '64rem', flexDirection: 'column', overflow: 'hidden', borderRadius: '24px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom:`1px solid ${LK.border}`, padding: '20px 24px', background: `linear-gradient(to right, ${LK.surface}, ${LK.surfaceRaised})` }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 600, color: LK.ink }}>{mode === 'create' ? '创建新工具' : '工具详情'}</h2>
            {app ? <p style={{ marginTop: '4px', wordBreak: 'break-all', fontSize: '12px', fontWeight: 600, color: LK.body }}>{app.id}</p> : null}
          </div>
          <button type="button" onClick={onClose} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px', color: LK.body, transition: 'all 0.2s', cursor: 'pointer' }} aria-label="关闭 Agent 弹窗"><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {localError ? <div style={{ marginBottom: '20px', borderRadius: '12px', border: `1px solid ${LK.error}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '241, 93, 93'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.error }}>{localError}</div> : null}

          {mode === 'edit' && app ? (
            <div className="mb-5 grid gap-3 text-sm md:grid-cols-3">
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}><div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.muted }}>创建时间</div><div style={{ marginTop: '8px', fontWeight: 600, color: LK.inkSoft }}>{formatTime(app.createdAt)}</div></div>
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}><div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.muted }}>更新时间</div><div style={{ marginTop: '8px', fontWeight: 600, color: LK.inkSoft }}>{formatTime(app.updatedAt)}</div></div>
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}><div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.muted }}>Harness</div><div style={{ marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: LK.inkSoft }}>{app.agentHarnessPath || '-'}</div></div>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>Agent 名称 <span className="required"> *</span><input style={inputClass} value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} disabled={saving} /></label>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>使用引擎 <span className="required"> *</span><select style={inputClass} value={formState.engine} onChange={async (event) => { const newEngine = event.target.value as AgentAppEngine; setFormState((cur) => ({ ...cur, engine: newEngine, defaultAgentName: '', startCommand: '' })); setClaudeCodeInfo(null); if (agentHarnessFile?.type === 'archive' && agentHarnessFile.file && agentHarnessFile.name.match(/\.zip$/i)) { await applyZipDetection(agentHarnessFile.file, newEngine); } else if (agentHarnessFile?.type === 'folder' && agentHarnessFile.files) { await applyFolderDetection(agentHarnessFile.files, newEngine); } }} disabled={saving}><option value="opencode">OpenCode</option><option value="claudecode">Claude Code</option><option value="agentflow">AgentFlow</option><option value="script">Script</option></select></label>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>默认 Agent<input style={inputClass} value={formState.defaultAgentName} onChange={(event) => setFormState({ ...formState, defaultAgentName: event.target.value })} disabled={saving} placeholder="例如 security-reviewer" /></label>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>启动命令<input style={inputClass} value={formState.startCommand} onChange={(event) => setFormState({ ...formState, startCommand: event.target.value })} disabled={saving} placeholder={formState.engine === 'script' ? '例如 python run.py' : '例如 /project:review'} /></label>
          </div>

          <label style={{ marginTop: '20px', display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>部门范围<select style={inputClass} value={formState.departmentId} onChange={(event) => setFormState({ ...formState, departmentId: event.target.value })} disabled={saving}><option value="">请选择部门范围</option>{canChoosePublic ? <option value="__public__">公开</option> : null}{departments.map((department) => <option key={department.id} value={String(department.id)}>{department.name}</option>)}</select></label>
          <label style={{ marginTop: '20px', display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>模型<select style={inputClass} value={formState.modelAliasId} onChange={(event) => setFormState({ ...formState, modelAliasId: event.target.value })} disabled={saving || modelAliasesLoading}><option value="">{modelAliasesLoading ? '正在加载模型' : '请选择模型'}</option>{modelAliases.map((alias) => <option key={alias.id} value={String(alias.id)}>{alias.alias_name}</option>)}</select></label>

          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>AgentHarness 文件 {mode === 'create' ? <span className="required"> *</span> : <span style={{ color: LK.muted }}>（可选更新）</span>}</div>
            <div className="mt-2">
              <button type="button" onClick={() => archiveInputRef.current?.click()} disabled={saving} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px', border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px 20px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft, transition: 'all 0.2s', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}><Upload size={18} />上传压缩包</button>
            </div>
            <input ref={archiveInputRef} type="file" accept=".zip,.7z,.tar,.tar.gz,.tgz" className="hidden" onChange={(event) => void handleFilesSelected(event.target.files)} disabled={saving} />
            {agentHarnessFile ? <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-400"><span className="truncate">{agentHarnessFile.type === 'folder' ? '文件夹' : '压缩包'}：{agentHarnessFile.name}</span><button type="button" onClick={() => setAgentHarnessFile(null)} className="text-cyan-400 hover:text-cyan-300">移除</button></div> : null}
          </div>

          {claudeCodeInfo && (claudeCodeInfo.agents.length > 0 || claudeCodeInfo.commands.length > 0) ? (
            <div style={{ marginTop: '20px', borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>检测到 Claude Code 配置</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {claudeCodeInfo.agents.map((agent) => <button key={`agent-${agent}`} type="button" onClick={() => setFormState({ ...formState, defaultAgentName: agent, startCommand: formState.startCommand ||`/project:${agent}` })} style={{ borderRadius: '999px', border: `1px solid ${LK.primary}`, backgroundColor: LK.surface, padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: LK.primary, cursor: 'pointer' }}>Agent: {agent}</button>)}
                {claudeCodeInfo.commands.map((command) => <button key={`command-${command}`} type="button" onClick={() => setFormState({ ...formState, startCommand:`/project:${command}` })} style={{ borderRadius: '999px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: LK.inkSoft, cursor: 'pointer' }}>Command: {command}</button>)}
              </div>
            </div>
          ) : null}

          <label style={{ marginTop: '20px', display: 'block', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>Agent说明<textarea style={{...inputClass, minHeight: '112px', resize: 'vertical'}} value={formState.inputRequirements} onChange={(event) => setFormState({ ...formState, inputRequirements: event.target.value })} disabled={saving} placeholder="说明 Agent 的用途、能力和适用场景" /></label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px 24px' }}>
          <button type="button" onClick={onClose} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft, transition: 'all 0.2s', cursor: saving ? 'not-allowed' : 'pointer' }} disabled={saving}>取消</button>
          <button disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', backgroundColor: LK.primary, padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#ffffff', transition: 'all 0.2s', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? <Loader2 size={16} className="animate-spin" /> : mode === 'create' ? <Plus size={16} /> : <Edit2 size={16} />}{mode === 'create' ? '创建' : '保存'}</button>
        </div>
      </form>
    </div>
  );
};

export const ToolOverviewPage: React.FC<ToolOverviewPageProps> = ({ projectId, user, onNavigate }) => {
  const [apps, setApps] = useState<AgentApp[]>([]);
  const [modelAliases, setModelAliases] = useState<AiGatewayModelAlias[]>([]);
  const [modelAliasesLoading, setModelAliasesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [expandedHarness, setExpandedHarness] = useState('');
  const [harnessBranches, setHarnessBranches] = useState<Record<string, Array<{ name: string; commit: Record<string, unknown>; protected: boolean }>>>({});
  const [pipelineApp, setPipelineApp] = useState<AgentApp | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const effectiveUser = useMemo(() => user || getLocalUserInfo(), [user]);
  const { confirm, feedbackNodes } = useUiFeedback();

  const selectedApp = useMemo(
    () => apps.find((item) => item.id === selectedAppId) || null,
    [apps, selectedAppId],
  );

  const departments = useMemo<DepartmentOption[]>(() => {
    if (!effectiveUser?.department_id) return [];
    return [{ id: effectiveUser.department_id, name: effectiveUser.department_name ||`部门 ${effectiveUser.department_id}` }];
  }, [effectiveUser?.department_id, effectiveUser?.department_name]);


  const refreshApps = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const nextApps = await loadAgentApps(effectiveUser?.department_id, effectiveUser?.department_id);
      setApps(nextApps);
      const branchEntries = await Promise.all(nextApps.filter((app) => app.agentHarnessPath).map(async (app) => {
        try {
          return [app.id, await loadHarnessBranches(app.id)] as const;
        } catch {
          return null;
        }
      }));
      setHarnessBranches((current) => ({ ...current, ...Object.fromEntries(branchEntries.filter((entry): entry is readonly [string, Array<{ name: string; commit: Record<string, unknown>; protected: boolean }>] => Boolean(entry))) }));
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Agent 列表加载失败' });
    } finally {
      setLoading(false);
    }
  };

  const refreshModelAliases = async () => {
    setModelAliasesLoading(true);
    try {
      const aliases = await aigwApi.listModelAliases();
      setModelAliases(Array.isArray(aliases) ? aliases.filter((alias) => alias.enabled !== false) : []);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '模型列表加载失败' });
      setModelAliases([]);
    } finally {
      setModelAliasesLoading(false);
    }
  };

  useEffect(() => {
    const admin = isAdminUser();
    setIsAdmin(admin);
    void refreshApps();
    void refreshModelAliases();
  }, [effectiveUser?.department_id]);

  useEffect(() => {
    if (!selectedApp && !createOpen && !pipelineApp) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedAppId('');
        setCreateOpen(false);
        setPipelineApp(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedApp, createOpen, pipelineApp]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshApps(), refreshModelAliases()]);
    setRefreshing(false);
  };

  const handleSync = async () => {
    const ok = await confirm({ message: '确定要从 Gitea 同步所有 AgentHarness 仓库吗？', danger: true });
    if (!ok) return;
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncAgentRepos();
      setMessage({ type: 'success', text: result.message || '同步完成' });
      await refreshApps();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '同步失败' });
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async (formState: AgentAppFormState, agentHarnessFile: AgentHarnessFileData | null, isPublic: boolean) => {
    if (!agentHarnessFile) return;
    setSaving(true);
    setMessage(null);
    try {
      await createAgentApp(formState, agentHarnessFile, isPublic);
      setCreateOpen(false);
      setMessage({ type: 'success', text: 'Agent 创建成功' });
      await refreshApps();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Agent 创建失败' });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (formState: AgentAppFormState, agentHarnessFile: AgentHarnessFileData | null, isPublic: boolean) => {
    if (!selectedApp) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateAgentApp(selectedApp.id, formState, agentHarnessFile, isPublic);
      setSelectedAppId('');
      setMessage({ type: 'success', text: 'Agent 更新成功' });
      await refreshApps();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Agent 更新失败' });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (app: AgentApp) => {
    const ok = await confirm({ message: `确定要删除 Agent"${app.name}" 吗？此操作不可恢复。`, danger: true });
    if (!ok) return;
    setDeletingId(app.id);
    setMessage(null);
    try {
      await deleteAgentApp(app.id);
      if (selectedAppId === app.id) setSelectedAppId('');
      setMessage({ type: 'success', text: 'Agent 删除成功' });
      await refreshApps();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Agent 删除失败' });
    } finally {
      setDeletingId('');
    }
  };

  const toggleHarness = async (appId: string) => {
    if (expandedHarness === appId) {
      setExpandedHarness('');
      return;
    }
    setExpandedHarness(appId);
    if (harnessBranches[appId]) return;
    try {
      const branches = await loadHarnessBranches(appId);
      setHarnessBranches((current) => ({ ...current, [appId]: branches }));
    } catch {
      setHarnessBranches((current) => ({ ...current, [appId]: [] }));
    }
  };

  const visibleMetrics = (app: AgentApp) => [
    { icon: <Bot size={12} />, value: engineLabel(app.engine), label:"引擎", color:"text-cyan-400", show: true },
    { icon: <Globe size={12} />, value: app.isPublic ?"公开" :"私有", label:"范围", color: app.isPublic ?"text-emerald-400" :"text-amber-400", show: true },
    { icon: <Lock size={12} />, value: formatDate(app.updatedAt), label:"更新时间", color:"text-theme-text-secondary", show: true },
  ];

  return (
    <div style={{ padding: '32px 32px 40px' }}>
      {feedbackNodes}
      <PageHeader title="工具总览" description="统一管理 Agent 市场、AgentHarness 仓库、运行指标和平台内置扫描工具入口。页面参考 Agent 市场能力，并适配当前 Chimera 浅色卡片风格。" />

      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '20px' }}><div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.muted }}>Agent</div><div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 600, color: LK.ink }}>{apps.length}</div></div>
        <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '20px' }}><div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.muted }}>已选项目</div><div style={{ marginTop: '8px', wordBreak: 'break-all', fontSize: '14px', fontWeight: 600, color: LK.inkSoft }}>{projectId || '未选择项目'}</div></div>
      </div>

      {message ? (
        <div style={{ marginTop: '20px', borderRadius: '12px', border: `1px solid ${message.type === 'success' ? LK.success : LK.error}`, backgroundColor: message.type === 'success' ? LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '69, 192, 111') : LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '241, 93, 93'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: message.type === 'success' ? LK.success : LK.error }}>
          {message.text}
        </div>
      ) : null}

      <section style={{ marginTop: '32px', borderRadius: '24px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-4 py-3 text-sm font-medium text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-60">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              刷新
            </button>
            {isAdmin ? (
              <button type="button" onClick={() => void handleSync()} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg border border-teal-500/20 bg-teal-500/15 px-4 py-3 text-sm font-medium text-teal-400 transition hover:bg-teal-500/15 disabled:opacity-60">
                {syncing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                同步仓库
              </button>
            ) : null}
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700">
              <Plus size={16} />
              创建新工具
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center justify-center rounded-2xl border border-theme-border bg-theme-surface px-4 py-12 text-sm font-semibold text-theme-text-muted" aria-busy="true">
            <Loader2 size={18} className="mr-2 animate-spin" />
            正在加载 Agent 列表
          </div>
        ) : apps.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center">
            <Box className="mx-auto text-theme-text-muted" size={34} />
            <h3 className="mt-3 text-base font-semibold text-theme-text-primary">暂无 Agent</h3>
            <p className="mt-2 text-sm text-theme-text-muted">点击右上角创建新工具，或检查后端 Agent 管理服务是否已接入。</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {apps.map((app) => (
 <article key={app.id} className="group flex flex-col overflow-hidden rounded-xl border border-theme-border bg-theme-surface transition hover:-translate-y-0.5 hover:border-cyan-500/20 hover:">
                <div className="flex items-start gap-3 p-5 pb-4">
 <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${engineTone(app.engine)} text-white`}><Bot size={19} /></div>
                  <button type="button" onClick={() => setSelectedAppId(app.id)} className="min-w-0 flex-1 text-left">
                    <h3 className="truncate text-lg font-semibold text-theme-text-primary">{app.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-medium text-theme-text-secondary">{engineLabel(app.engine)}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">{app.isPublic ? <Globe size={11} className="text-emerald-400" /> : <Lock size={11} />}{app.isPublic ? '公开' :`私有 · ${effectiveUser?.department_name ||`部门${app.departmentId ?? ''}`}`}</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {app.engine === 'agentflow' ? <button type="button" onClick={() => setPipelineApp(app)} className="rounded-xl p-2 text-theme-text-muted transition hover:bg-cyan-500/15 hover:text-cyan-400" title="查看流程"><ExternalLink size={15} /></button> : null}
                    <button type="button" onClick={() => setSelectedAppId(app.id)} className="rounded-xl p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary" title="编辑"><Edit2 size={15} /></button>
                    <button type="button" onClick={() => void handleDelete(app)} disabled={deletingId === app.id} className="rounded-xl p-2 text-theme-text-muted transition hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-50" title="删除">{deletingId === app.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button>
                  </div>
                </div>

                <div className="mx-5 border-t border-theme-border" />
                <div className="grid grid-cols-3 gap-2 p-5 py-4">
                  {visibleMetrics(app).map(({ icon, value, label, color }) => (
                    <div key={label} className="flex flex-col items-center rounded-2xl bg-theme-surface px-2 py-3 text-center">
                      <span className={color}>{icon}</span>
                      <span className="mt-1 text-sm font-semibold leading-tight text-theme-text-primary">{value}</span>
                      <span className="mt-0.5 text-[10px] font-bold text-theme-text-muted">{label}</span>
                    </div>
                  ))}
                </div>

                <div className="mx-5 border-t border-theme-border" />
                <div className="flex items-center justify-between gap-3 px-5 py-4 text-xs font-semibold text-theme-text-muted">
                  <span className="truncate">开发者：{user?.username || '-'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {createOpen ? <AgentAppModal mode="create" saving={saving} departments={departments} canChoosePublic={true} modelAliases={modelAliases} modelAliasesLoading={modelAliasesLoading} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} /> : null}
      {selectedApp ? <AgentAppModal mode="edit" app={selectedApp} saving={saving} departments={departments} canChoosePublic={true} modelAliases={modelAliases} modelAliasesLoading={modelAliasesLoading} onClose={() => setSelectedAppId('')} onSubmit={handleUpdate} /> : null}

      {pipelineApp ? (
        <div className="fixed inset-0 z-[260] bg-slate-950/55 p-4 backdrop-blur-sm md:p-8" onClick={() => setPipelineApp(null)}>
 <div className="mx-auto w-full max-w-2xl rounded-xl border border-theme-border bg-theme-surface p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-theme-text-primary">流程预览</h2></div>
              <button type="button" onClick={() => setPipelineApp(null)} className="rounded-2xl border border-theme-border bg-theme-surface p-3 text-theme-text-muted transition hover:text-theme-text-primary" aria-label="关闭流程预览"><X size={20} /></button>
            </div>
            <div className="mt-6 rounded-2xl border border-theme-border bg-theme-surface p-5 text-sm leading-7 text-theme-text-secondary">{pipelineApp.name} 的 AgentFlow 流程入口已保留；当前 Chimera 未包含 SecHPS 的 PipelineViewModal 组件，因此这里展示轻量占位，避免引入额外跨系统依赖。</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
