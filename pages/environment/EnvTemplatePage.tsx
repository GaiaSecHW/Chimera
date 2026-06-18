import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Plus,
  Loader2,
  Download,
  Trash2,
  FileCode,
  RefreshCw,
  FileJson,
  FileText,
  ChevronRight,
  ChevronLeft,
  Search,
  Settings,
  X,
  Upload,
  Terminal,
  FileArchive,
  AlertCircle,
  Code,
  AlertTriangle,
  ShieldCheck,
  Edit3,
  Save,
  Undo2,
  Square,
  CheckSquare,
  Zap,
  Monitor,
  CheckCircle2,
  Cpu,
  Database,
  Filter,
  Check,
  Activity,
  Globe,
  ArrowUpDown,
  Folder,
  FolderOpen,
  ChevronDown,
  Info,
  Calendar,
  Container,
  Network,
  HardDrive,
  Layers,
  Tags
} from 'lucide-react';
import { EnvTemplate, TemplateFile, Agent, AgentService, ParsedCompose, TemplateLlmProviderBinding, TemplateLlmBindingPreview, TemplateLlmMappedFile } from '../../types/types';
import { api } from '../../clients/api';
import { API_BASE, getHeaders } from '../../clients/base';
import { StatusBadge } from '../../components/StatusBadge';
import { ComposeViewer } from '../../components/ComposeViewer';
import { useUiFeedback } from '../../components/UiFeedback';
import { TemplateLlmBindingEditor, normalizeTemplateLlmBinding } from './llm-binding/TemplateLlmBindingEditor';
import { AgentDetailPage } from './AgentDetailPage';
import { PageHeader } from '../../design-system';

// Helper to build tree from flat paths
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: Record<string, TreeNode>;
  size?: number;
  modified?: string;
}

interface WebPortPreset {
  name: string;
  port: number;
  protocol: 'http' | 'https';
  backend_protocol: 'http' | 'https';
  description?: string;
  path?: string;
  websocket_enabled?: boolean;
  tls_enabled?: boolean;
  ingress_tls_enabled?: boolean;
}

export const EnvTemplatePage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, prompt, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<EnvTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [detailTab, setDetailTab] = useState<'overview' | 'compose' | 'files' | 'deployments'>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  // Selection States
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySource, setDeploySource] = useState<'batch' | 'detail'>('batch');

  // Agent Modal Local States
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'online'>('all');
  const [deployModalTab, setDeployModalTab] = useState<'agents' | 'config' | 'llm' | 'confirm'>('agents');
  const [agentPage, setAgentPage] = useState(1);
  const [agentPageSize, setAgentPageSize] = useState(10);
  const [deployLlmBinding, setDeployLlmBinding] = useState<TemplateLlmProviderBinding | null>(null);
  const [deployLlmPreview, setDeployLlmPreview] = useState<TemplateLlmBindingPreview | null>(null);
  const [deployLlmPreviewLoading, setDeployLlmPreviewLoading] = useState(false);
  const [deployLlmPreviewError, setDeployLlmPreviewError] = useState('');

  // Deletion States
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; names: string[] }>({ show: false, names: [] });
  const [isDeleting, setIsDeleting] = useState(false);

  // Editor States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Tree State
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  // Upload Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'file' | 'editor'>('file');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Template State
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    type: 'yaml' as 'yaml' | 'archive',
    content: '',
    visibility: 'shared' as 'shared' | 'private',
    tags: [] as string[],
    web_port_presets: [] as WebPortPreset[],
  });
  const [detailWebPortPresets, setDetailWebPortPresets] = useState<WebPortPreset[]>([]);
  const [savingWebPortPresets, setSavingWebPortPresets] = useState(false);
  const [savingTemplateLlmBinding, setSavingTemplateLlmBinding] = useState(false);
  const [detailLlmBindingDraft, setDetailLlmBindingDraft] = useState<TemplateLlmProviderBinding | null>(null);
  const [isTemplateLlmModalOpen, setIsTemplateLlmModalOpen] = useState(false);

  // Parsed Compose States
  const [parsedCompose, setParsedCompose] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);

  // Yaml 文件内容 (用于 yaml 类型模板的文件查看)
  const [yamlFileContent, setYamlFileContent] = useState<string>('');
  const [yamlFilePath, setYamlFilePath] = useState<string>('');
  const [yamlFileLoaded, setYamlFileLoaded] = useState(false);
  const [yamlFileLoading, setYamlFileLoading] = useState(false);

  // 所有模板的解析数据 (用于卡片视图)
  const [templatesParsedData, setTemplatesParsedData] = useState<Record<string, any>>({});
  const [templateDeployments, setTemplateDeployments] = useState<AgentService[]>([]);
  const [templateDeploymentsLoading, setTemplateDeploymentsLoading] = useState(false);
  const [templateDeploymentsError, setTemplateDeploymentsError] = useState<string>('');
  const [deploymentAgentMap, setDeploymentAgentMap] = useState<Record<string, Agent>>({});
  const [deploymentDetailAgentKey, setDeploymentDetailAgentKey] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await environmentApi.environment.getTemplates();
      setTemplates(data.templates);
      setSelectedNames(new Set());

      // 为 yaml/archive 类型模板获取解析数据，卡片显示模式保持一致
      const parsedData: Record<string, any> = {};
      for (const template of data.templates) {
        if (template.type === 'yaml' || template.type === 'archive') {
          try {
            const parsed = await environmentApi.environment.getParsedCompose(template.id);
            parsedData[template.name] = parsed;
          } catch (error) {
            console.error(`Failed to parse template ${template.name}:`, error);
          }
        }
      }
      setTemplatesParsedData(parsedData);
    } catch (err) {
      console.error("Failed to load templates", err);
    } finally {
      setLoading(false);
    }
  };

  const canManageTemplate = (template: any): boolean => template?.permissions?.can_manage !== false;

  const canCopyTemplate = (template: any): boolean => template?.permissions?.can_copy !== false;

  const fetchParsedCompose = async (templateId: number) => {
    setParseLoading(true);
    try {
      const data = await environmentApi.environment.getParsedCompose(templateId);
      setParsedCompose(data);
    } catch (error) {
      console.error('Failed to fetch parsed compose:', error);
      setParsedCompose(null);
    } finally {
      setParseLoading(false);
    }
  };

  const getPrimaryYamlPathFromDetail = (detail: any): string => {
    if (!detail) return '';
    const raw = String(detail?.file_path || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/\\/g, '/');
    const filename = normalized.split('/').filter(Boolean).pop() || '';
    if (!filename) return '';
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) return '';
    return filename;
  };

  // 加载 yaml 文件内容（优先主文件，避免编辑了非部署主YAML）
  const fetchYamlFileContent = async (
    templateId: number,
    preferredPath?: string
  ): Promise<{ path: string; content: string } | null> => {
    setYamlFileLoading(true);
    try {
      const possibleFiles: string[] = [];
      const preferred = String(preferredPath || '').trim();
      if (preferred) possibleFiles.push(preferred);
      // 兼容兜底：尝试常见 compose 文件名
      possibleFiles.push('docker-compose.yaml', 'docker-compose.yml', 'compose.yaml', 'compose.yml');
      let content = '';
      let foundFile = '';

      for (const file of possibleFiles) {
        try {
          const data = await environmentApi.environment.getTemplateFileContent(templateId, file);
          if (typeof data.content === 'string') {
            content = data.content;
            foundFile = file;
            break;
          }
        } catch (e) {
          // 文件不存在，继续尝试下一个
        }
      }

      // 如果上述文件都不存在，尝试从 directory_files 中查找第一个 yaml 文件
      if (!content) {
        const detail = await environmentApi.environment.getTemplateDetail(templateId);
        if (detail.directory_files && detail.directory_files.length > 0) {
          const yamlFile = detail.directory_files.find((f: any) =>
            f.path.endsWith('.yaml') || f.path.endsWith('.yml')
          );
          if (yamlFile) {
            const data = await environmentApi.environment.getTemplateFileContent(templateId, yamlFile.path);
            if (typeof data.content === 'string') {
              content = data.content;
              foundFile = yamlFile.path;
            }
          }
        }
      }

      if (foundFile) {
        setYamlFilePath(foundFile);
        setYamlFileContent(content);
        setYamlFileLoaded(true);
        return { path: foundFile, content };
      }

      setYamlFilePath('');
      setYamlFileContent('');
      setYamlFileLoaded(false);
      return null;
    } catch (error) {
      console.error('Failed to fetch yaml file content:', error);
      setYamlFilePath('');
      setYamlFileContent('');
      setYamlFileLoaded(false);
      return null;
    } finally {
      setYamlFileLoading(false);
    }
  };

  const normalizeWebPortPresets = (raw: any): WebPortPreset[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any): WebPortPreset => {
        const backendProtocol: 'http' | 'https' =
          String(item?.backend_protocol || item?.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http';
        const ingressTlsEnabled = item?.ingress_tls_enabled !== undefined
          ? item?.ingress_tls_enabled !== false
          : item?.tls_enabled !== undefined
            ? item?.tls_enabled !== false
            : true;
        return {
          name: String(item?.name || '').trim(),
          port: Number(item?.port || 0),
          protocol: backendProtocol,
          backend_protocol: backendProtocol,
          description: String(item?.description || '').trim(),
          path: String(item?.path || '/').trim() || '/',
          websocket_enabled: item?.websocket_enabled !== false,
          tls_enabled: ingressTlsEnabled,
          ingress_tls_enabled: ingressTlsEnabled,
        };
      })
      .filter((item: WebPortPreset) => Number.isFinite(item.port) && item.port > 0 && item.port <= 65535)
      .slice(0, 32);
  };

  const normalizeTemplateTags = (raw: any): string[] => {
    if (Array.isArray(raw)) {
      return raw
        .map((item) => String(item || '').trim())
        .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index)
        .slice(0, 64);
    }
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index)
        .slice(0, 64);
    }
    return [];
  };

  const stringifyTemplateTags = (tags: any): string => normalizeTemplateTags(tags).join(', ');

  const getTemplateTags = (template: any): string[] =>
    normalizeTemplateTags(template?.tags || template?.metadata?.tags || []);

  const getTemplateCurrentMixBinding = (template: any): TemplateLlmProviderBinding | null =>
    normalizeTemplateLlmBinding(template?.metadata?.llm_mix_state);

  const getTemplateServiceOptions = (template: any): string[] => {
    const services = template?.metadata?.parsed_compose?.services;
    return services && typeof services === 'object' ? Object.keys(services) : [];
  };

  const getDeployTemplates = (): EnvTemplate[] => {
    if (deploySource === 'detail') {
      return templates.filter((item) => item.id === selectedTemplate);
    }
    const selectedIds = new Set(Array.from(selectedNames).map((id) => Number(id)));
    return templates.filter((item) => selectedIds.has(item.id));
  };

  const getDeployServiceOptions = (): string[] => {
    const selectedTemplates = getDeployTemplates();
    if (selectedTemplates.length !== 1) return [];
    return getTemplateServiceOptions(selectedTemplates[0]);
  };

  const viewDetail = async (templateId: number) => {
    setSelectedTemplate(templateId);
    setLoading(true);
    try {
      const detail = await environmentApi.environment.getTemplateDetail(templateId);
      let detailPresets: WebPortPreset[] = normalizeWebPortPresets(detail?.metadata?.web_port_presets || []);
      try {
        const webPortsResp = await environmentApi.environment.getTemplateWebPorts(templateId);
        detailPresets = normalizeWebPortPresets(webPortsResp?.web_port_presets || []);
      } catch (err) {
        console.error('Failed to load template web ports from dedicated API:', err);
      }
      setTemplateDetail(detail);
      setDetailWebPortPresets(detailPresets);
      setDetailLlmBindingDraft(getTemplateCurrentMixBinding(detail));
      setDetailTab('overview');
      setViewMode('detail');
      setExpandedFolders(new Set(['root']));
      void loadTemplateDeployments(templateId);

      // 如果是 yaml 类型模板，获取解析数据和文件内容
      if (detail.type === 'yaml') {
        fetchParsedCompose(templateId);
        fetchYamlFileContent(templateId, getPrimaryYamlPathFromDetail(detail));
      } else {
        setParsedCompose(null);
        setYamlFilePath('');
        setYamlFileContent('');
        setYamlFileLoaded(false);
      }
    } catch (err) {
      notify("获取模版详情失败", 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDeployments = async (templateId: number) => {
    if (!projectId) {
      setTemplateDeployments([]);
      return;
    }
    setTemplateDeploymentsLoading(true);
    setTemplateDeploymentsError('');
    try {
      const agentsResp = await environmentApi.environment.getAgents(projectId, { per_page: 2000 });
      const agentMap: Record<string, Agent> = {};
      (agentsResp?.agents || []).forEach((agent) => {
        if (agent?.key) agentMap[agent.key] = agent;
      });
      setDeploymentAgentMap(agentMap);
      const validAgentKeys = new Set(Object.keys(agentMap));

      let page = 1;
      const perPage = 200;
      let total = 0;
      const all: AgentService[] = [];
      do {
        const resp = await environmentApi.environment.getGlobalServices(projectId, {
          page,
          per_page: perPage,
          include_stale: false,
        });
        total = Number(resp?.total || 0);
        all.push(...(resp?.items || []));
        page += 1;
      } while (all.length < total && page <= 20);

      const rows = all
        .filter((svc) =>
          Number(svc.template_id) === Number(templateId) &&
          svc.is_stale !== true &&
          Boolean(svc.agent_key) &&
          Boolean(svc.name) &&
          validAgentKeys.has(String(svc.agent_key || ''))
        )
        .sort((a, b) => {
          const agentCmp = String(a.agent_key || '').localeCompare(String(b.agent_key || ''));
          if (agentCmp !== 0) return agentCmp;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
      setTemplateDeployments(rows);
    } catch (error) {
      console.error('Failed to load template deployments', error);
      setTemplateDeployments([]);
      setTemplateDeploymentsError('加载部署实例失败');
    } finally {
      setTemplateDeploymentsLoading(false);
    }
  };

  const openTemplateLlmModal = async (template: any) => {
    if (!template?.id) return;
    if (viewMode !== 'detail' || templateDetail?.id !== template.id) {
      await viewDetail(template.id);
    } else {
      setDetailLlmBindingDraft(getTemplateCurrentMixBinding(template));
    }
    setIsTemplateLlmModalOpen(true);
  };

  // Build Resource Tree
  const resourceTree = useMemo(() => {
    if (!templateDetail?.directory_files) return null;

    const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };

    templateDetail.directory_files.forEach((file: TemplateFile) => {
      const parts = file.path.split('/');
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            type: isLast ? 'file' : 'folder',
            children: {},
            size: isLast ? file.size : undefined,
            modified: isLast ? file.modified : undefined
          };
        }
        current = current.children[part];
      });
    });
    return root;
  }, [templateDetail]);

  const deploymentAgentRows = useMemo(() => {
    const grouped = new Map<string, { agentKey: string; services: AgentService[]; latestAt: string }>();
    templateDeployments.forEach((svc) => {
      const key = String(svc.agent_key || '');
      if (!key) return;
      const existing = grouped.get(key);
      const currentTs = String(svc.updated_at || svc.last_seen_at || '');
      if (!existing) {
        grouped.set(key, { agentKey: key, services: [svc], latestAt: currentTs });
      } else {
        existing.services.push(svc);
        if (currentTs && currentTs > existing.latestAt) existing.latestAt = currentTs;
      }
    });
    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        agent: deploymentAgentMap[item.agentKey],
      }))
      .sort((a, b) => a.agentKey.localeCompare(b.agentKey));
  }, [templateDeployments, deploymentAgentMap]);

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  // Selection Logic
  const toggleSelect = (templateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = String(templateId);
    const next = new Set(selectedNames);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedNames(next);
  };

  const toggleSelectAll = () => {
    if (selectedNames.size === filteredTemplates.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(filteredTemplates.map(t => String(t.id))));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedNames.size === 0) return;
    const selectedTemplates = templates.filter((t) => selectedNames.has(String(t.id)));
    const deletable = selectedTemplates.filter(canManageTemplate).map((t) => String(t.id));
    if (deletable.length === 0) {
      notify("当前选中的模板均无删除权限", 'warning');
      return;
    }
    if (deletable.length !== selectedTemplates.length) {
      notify("部分模板无删除权限，已自动跳过，仅删除可管理模板", 'warning');
    }
    setDeleteConfirm({ show: true, names: deletable });
  };

  const executeDelete = async () => {
    if (deleteConfirm.names.length === 0) return;
    setIsDeleting(true);
    try {
      await environmentApi.environment.batchDeleteTemplates(deleteConfirm.names.map((id) => Number(id)));
      setDeleteConfirm({ show: false, names: [] });
      setSelectedNames(new Set());
      if (selectedTemplate !== null && deleteConfirm.names.includes(String(selectedTemplate))) {
        setViewMode('list');
        setSelectedTemplate(null);
      }
      await loadTemplates();
    } catch (err) {
      notify("批量删除部分或全部失败", 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeployModal = async () => {
    if (!projectId) {
      notify("请先选择一个项目空间", 'warning');
      return;
    }
    setDeploySource('batch');
    setIsDeployModalOpen(true);
    setAgentsLoading(true);
    setAgentSearch('');
    setSelectedAgentKeys(new Set());
    setDeployModalTab('agents');
    setAgentPage(1);
    setAgentPageSize(10);
    setDeployLlmBinding(null);
    setDeployLlmPreview(null);
    setDeployLlmPreviewError('');
    try {
      const data = await environmentApi.environment.getAgents(projectId, { per_page: 2000 });
      setAvailableAgents(data.agents || []);
    } catch (err) {
      notify("获取 Agent 列表失败", 'error');
    } finally {
      setAgentsLoading(false);
    }
  };

  const openDetailDeployModal = async () => {
    if (!projectId) {
      notify("请先选择一个项目空间", 'warning');
      return;
    }
    if (!selectedTemplate) return;

    setDeploySource('detail');
    setIsDeployModalOpen(true);
    setAgentsLoading(true);
    setAgentSearch('');
    setSelectedAgentKeys(new Set());
    setDeployModalTab('agents');
    setAgentPage(1);
    setAgentPageSize(10);
    setDeployLlmBinding(null);
    setDeployLlmPreview(null);
    setDeployLlmPreviewError('');
    try {
      const data = await environmentApi.environment.getAgents(projectId, { per_page: 2000 });
      setAvailableAgents(data.agents || []);
    } catch (err) {
      notify("获取 Agent 列表失败", 'error');
    } finally {
      setAgentsLoading(false);
    }
  };

  const buildServiceName = (templateName: string, agentKey: string) => {
    const normalized = templateName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    return`${normalized}-${agentKey.slice(0, 6)}`;
  };

  const executeDeploy = async () => {
    if (selectedAgentKeys.size === 0 || !projectId) return;
    setDeploying(true);
    try {
      // 根据部署来源决定部署哪些模板
      const templatesToDeploy = (deploySource === 'detail'
        ? [selectedTemplate]
        : Array.from(selectedNames).map((id) => Number(id)))
        .filter((id): id is number => typeof id === 'number' && !Number.isNaN(id));
      const templateNameMap = new Map<number, string>();
      templates.forEach((t) => templateNameMap.set(t.id, t.name));
      const agentsToDeploy = Array.from(selectedAgentKeys) as string[];

      const serviceNameMap = new Map<string, Set<string>>();
      await Promise.all(
        agentsToDeploy.map(async (agentKey) => {
          try {
            const data = await environmentApi.environment.getAgentServices(agentKey);
            const names = new Set<string>((data?.services || []).map((svc) => svc.name));
            serviceNameMap.set(agentKey, names);
          } catch {
            serviceNameMap.set(agentKey, new Set<string>());
          }
        })
      );

      let successCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;
      const normalizedDeployBinding = normalizeDeployLlmBinding(deployLlmBinding);
      const llmBindingExtra = normalizedDeployBinding
        ? {
            llm_provider_binding: {
              provider_keys: normalizedDeployBinding.provider_keys,
              target_services: normalizedDeployBinding.target_services,
              env_overrides: normalizedDeployBinding.env_overrides || {},
              file_overrides: normalizedDeployBinding.file_overrides || [],
              source: 'deployment_override',
            }
          }
        : undefined;
      for (const tId of templatesToDeploy) {
        const tName = templateNameMap.get(tId);
        if (!tName) continue;
        for (const aKey of agentsToDeploy) {
          const serviceName = buildServiceName(tName || 'service', aKey);
          const existing = serviceNameMap.get(aKey) || new Set<string>();
          if (existing.has(serviceName)) {
            duplicateCount++;
            continue;
          }
          try {
            await environmentApi.environment.deploy({
              service_name: serviceName,
              agent_key: aKey,
              template_name: tName,
              project_id: projectId,
              extra_params: llmBindingExtra,
            });
            existing.add(serviceName);
            successCount++;
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('重复部署') || msg.includes('已存在') || msg.includes('进行中的部署任务')) {
              duplicateCount++;
            } else {
              failedCount++;
            }
          }
        }
      }

      if (duplicateCount > 0 || failedCount > 0) {
        notify(`已提交 ${successCount} 个任务，跳过重复 ${duplicateCount}，失败 ${failedCount}`, failedCount > 0 ? 'warning' : 'success');
      } else {
        notify(`已成功提交 ${successCount} 个异步部署任务`, 'success');
      }
      setIsDeployModalOpen(false);

      // 只在批量部署时清空选中
      if (deploySource === 'batch') {
        setSelectedNames(new Set());
      }
    } catch (err) {
      notify("部署过程中发生错误", 'error');
    } finally {
      setDeploying(false);
    }
  };

  const filteredAgents = useMemo(() => {
    const list = availableAgents.filter(a => {
      const keyword = agentSearch.toLowerCase();
      const hostname = String(a.hostname || a.key || '').toLowerCase();
      const ipAddress = String(a.ip_address || '').toLowerCase();
      const agentKey = String(a.key || '').toLowerCase();
      const allowReason = String(a.allow_reason || '').toLowerCase();
      const matchesSearch = !keyword || hostname.includes(keyword) || ipAddress.includes(keyword) || agentKey.includes(keyword) || allowReason.includes(keyword);
      const matchesStatus = statusFilter === 'all' || a.status === 'online';
      return matchesSearch && matchesStatus;
    });
    return list.sort((a, b) => {
      if (a.status === b.status) {
        return String(a.hostname || a.key || '').localeCompare(String(b.hostname || b.key || ''));
      }
      return a.status === 'online' ? -1 : 1;
    });
  }, [availableAgents, agentSearch, statusFilter]);

  useEffect(() => {
    setAgentPage(1);
  }, [agentSearch, statusFilter, isDeployModalOpen]);

  const totalAgentPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAgents.length / Math.max(1, agentPageSize))),
    [filteredAgents.length, agentPageSize]
  );

  const pagedAgents = useMemo(() => {
    const normalizedPage = Math.min(Math.max(agentPage, 1), totalAgentPages);
    const start = (normalizedPage - 1) * Math.max(1, agentPageSize);
    return filteredAgents.slice(start, start + Math.max(1, agentPageSize));
  }, [filteredAgents, agentPage, agentPageSize, totalAgentPages]);

  useEffect(() => {
    if (agentPage > totalAgentPages) {
      setAgentPage(totalAgentPages);
    }
  }, [agentPage, totalAgentPages]);

  const normalizeDeployLlmBinding = (binding: TemplateLlmProviderBinding | null): TemplateLlmProviderBinding | null => {
    const normalized = normalizeTemplateLlmBinding(binding);
    if (!normalized) return null;
    return {
      provider_keys: normalized.provider_keys,
      target_services: normalized.target_services,
      env_overrides: normalized.env_overrides || {},
      file_overrides: normalized.file_overrides || [],
      updated_at: normalized.updated_at,
    };
  };

  const patchDeployLlmBinding = (patch: Partial<TemplateLlmProviderBinding>) => {
    setDeployLlmBinding((prev) => {
      const base = normalizeDeployLlmBinding(prev) || {
        provider_keys: [],
        target_services: '*',
        env_overrides: {},
        file_overrides: [],
      };
      return {
        ...base,
        ...patch,
        env_overrides: patch.env_overrides ?? base.env_overrides ?? {},
        file_overrides: patch.file_overrides ?? base.file_overrides ?? [],
      };
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const binding = normalizeDeployLlmBinding(deployLlmBinding);
      const providerKeys = binding?.provider_keys || [];
      if (providerKeys.length === 0) {
        setDeployLlmPreview(null);
        setDeployLlmPreviewError('');
        return;
      }
      setDeployLlmPreviewLoading(true);
      setDeployLlmPreviewError('');
      try {
        const preview = await environmentApi.environment.previewTemplateLlmBinding(projectId, providerKeys, binding?.target_services || '*');
        if (!cancelled) setDeployLlmPreview(preview);
      } catch (err: any) {
        if (!cancelled) {
          setDeployLlmPreview(null);
          setDeployLlmPreviewError(String(err?.message || err || 'LLM 注入预览失败'));
        }
      } finally {
        if (!cancelled) setDeployLlmPreviewLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    JSON.stringify((normalizeDeployLlmBinding(deployLlmBinding)?.provider_keys || [])),
    JSON.stringify(normalizeDeployLlmBinding(deployLlmBinding)?.target_services || '*'),
  ]);

  const deployLlmFinalEnvPreview = useMemo(() => {
    const merged: Record<string, string> = { ...(deployLlmPreview?.merged_env || {}) };
    const overrides = normalizeDeployLlmBinding(deployLlmBinding)?.env_overrides || {};
    Object.entries(overrides).forEach(([key, value]) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      merged[normalizedKey] = value == null ? '' : String(value);
    });
    return merged;
  }, [deployLlmPreview, deployLlmBinding]);

  const deployLlmFinalFilePreview = useMemo(() => {
    const filesByPath = new Map<string, TemplateLlmMappedFile>();
    (deployLlmPreview?.merged_files || []).forEach((item, idx) => {
      const path = String(item?.path || '').trim();
      if (!path) return;
      filesByPath.set(path, {
        name: String(item?.name || '').trim() ||`file-${idx + 1}`,
        path,
        content: String(item?.content || ''),
        format: String(item?.format || 'other'),
        enabled: item?.enabled !== false,
        provider_key: item?.provider_key || undefined,
      });
    });

    const overrides = normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [];
    overrides.forEach((item, idx) => {
      const path = String(item?.path || '').trim();
      if (!path) return;
      if (item?.enabled === false) {
        filesByPath.delete(path);
        return;
      }
      filesByPath.set(path, {
        name: String(item?.name || '').trim() ||`override-${idx + 1}`,
        path,
        content: String(item?.content || ''),
        format: String(item?.format || 'other'),
        enabled: true,
        provider_key: item?.provider_key || undefined,
      });
    });
    return Array.from(filesByPath.values());
  }, [deployLlmPreview, deployLlmBinding]);

  const toggleAgentSelect = (key: string) => {
    const agent = availableAgents.find((item) => item.key === key);
    if (!agent || agent.status !== 'online') return;
    const next = new Set(selectedAgentKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedAgentKeys(next);
  };

  const toggleSelectAllAgents = () => {
    const selectableKeys = filteredAgents.filter((agent) => agent.status === 'online').map((agent) => agent.key);
    if (selectableKeys.length === 0) return;
    const allSelected = selectableKeys.every((key) => selectedAgentKeys.has(key));
    if (allSelected) {
      setSelectedAgentKeys(new Set());
    } else {
      setSelectedAgentKeys(new Set(selectableKeys));
    }
  };

  const isEditable = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return ['yaml', 'yml', 'json', 'txt', 'sh', 'py', 'md', 'conf', 'ini'].includes(ext);
  };

  const handleEditFile = async (path: string) => {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      const res = await environmentApi.environment.getTemplateFileContent(selectedTemplate, path);
      setEditingFile({ path, content: res.content });
      setIsEditorOpen(true);
    } catch (err: any) {
      notify(err?.message ||"无法读取文件内容", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenYamlEditor = async (canManageCurrentTemplate: boolean) => {
    if (!canManageCurrentTemplate) {
      notify('仅模板拥有者可在线编辑', 'warning');
      return;
    }
    if (!templateDetail?.id) {
      notify('模板信息未就绪，请刷新后重试', 'warning');
      return;
    }

    let targetPath = (yamlFilePath || '').trim();
    if (!targetPath) {
      const loaded = await fetchYamlFileContent(
        templateDetail.id,
        getPrimaryYamlPathFromDetail(templateDetail)
      );
      if (loaded?.path) targetPath = loaded.path;
    }

    if (!targetPath) {
      notify('未找到可编辑的YAML文件', 'warning');
      return;
    }

    await handleEditFile(targetPath);
  };

  const handleSaveFile = async () => {
    if (!selectedTemplate || !editingFile) return;
    setIsSavingFile(true);
    try {
      await environmentApi.environment.updateTemplateFileContent(selectedTemplate, editingFile.path, editingFile.content);
      setIsEditorOpen(false);
      setEditingFile(null);
      viewDetail(selectedTemplate);
    } catch (err) {
      notify("保存失败", 'error');
    } finally {
      setIsSavingFile(false);
    }
  };

  // 下载所有文件为ZIP
  const handleDownloadAll = async () => {
    if (!selectedTemplate) return;
    try {
      const response = await fetch(`${API_BASE}/api/agent/templates/id/${selectedTemplate}/download?as_zip=true&include_all=true`, {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('下载失败');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =`${templateDetail?.name || selectedTemplate}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      notify("下载失败", 'error');
    }
  };

  // 下载单个文件
  const handleDownloadFile = async (filePath: string) => {
    if (!selectedTemplate) return;
    try {
      const response = await fetch(`${API_BASE}/api/agent/templates/id/${selectedTemplate}/files/content?path=${encodeURIComponent(filePath)}`, {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('下载失败');
      const data = await response.json();
      const content = data.content;
      const fileName = filePath.split('/').pop() || filePath;

      // 创建 Blob 并下载
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      notify("下载文件失败", 'error');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!selectedTemplate) return;
    const confirmed = await confirm({
      title: '删除文件',
      message:`确认删除文件"${filePath}" 吗？此操作无法撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await environmentApi.environment.deleteTemplateFile(selectedTemplate, filePath);
      if (isEditorOpen && editingFile?.path === filePath) {
        setIsEditorOpen(false);
        setEditingFile(null);
      }
      await viewDetail(selectedTemplate);
    } catch (err: any) {
      notify(err?.message ||"删除文件失败", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDirectory = async (dirPath: string) => {
    if (!selectedTemplate) return;
    const confirmed = await confirm({
      title: '删除目录',
      message:`确认删除目录"${dirPath}" 吗？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await environmentApi.environment.deleteTemplateDirectory(selectedTemplate, dirPath, false);
      await viewDetail(selectedTemplate);
    } catch (err: any) {
      const message = err?.message || '';
      if (message.includes('force=true') || message.includes('目录不为空')) {
        const forceConfirmed = await confirm({
          title: '目录非空',
          message:`目录"${dirPath}" 非空。是否强制删除（包含全部子文件）？`,
          confirmText: '强制删除',
          cancelText: '取消',
          danger: true,
        });
        if (!forceConfirmed) return;
        try {
          await environmentApi.environment.deleteTemplateDirectory(selectedTemplate, dirPath, true);
          await viewDetail(selectedTemplate);
        } catch (forceErr: any) {
          notify(forceErr?.message ||"强制删除目录失败", 'error');
        }
      } else {
        notify(message ||"删除目录失败", 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrigger = (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const templateId = Number(name);
    const template = templates.find((t) => t.id === templateId) || templateDetail;
    if (!canManageTemplate(template)) {
      notify("仅模板拥有者可删除", 'warning');
      return;
    }
    setDeleteConfirm({ show: true, names: [String(templateId)] });
  };

  const handleCopyTemplate = async (sourceTemplateId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const source = templates.find((t) => t.id === sourceTemplateId) || templateDetail;
    if (!canCopyTemplate(source)) {
      notify("无权限复制该模板", 'warning');
      return;
    }
    const sourceName = source?.name ||`template-${sourceTemplateId}`;
    const defaultName =`${sourceName}-copy-${Date.now().toString(36).slice(-4)}`;
    const targetName = (await prompt({
      title: '复制模板',
      message: '请输入新模板名称',
      defaultValue: defaultName,
      placeholder: '新模板名称',
      confirmText: '继续',
      cancelText: '取消',
    }))?.trim();
    if (!targetName) return;
    const visibility = (await confirm({
      title: '模板可见性',
      message: '是否将复制模板设置为共享模板？',
      confirmText: '共享模板',
      cancelText: '私有模板',
    }))
      ? 'shared'
      : 'private';
    try {
      await environmentApi.environment.copyTemplate(sourceTemplateId, { target_name: targetName, visibility });
      notify(`复制成功：${targetName}`, 'success');
      await loadTemplates();
    } catch (err: any) {
      notify(err?.message ||"复制模板失败", 'error');
    }
  };

  const handleRenameTemplate = async (template: any) => {
    if (!template?.id) return;
    if (!canManageTemplate(template)) {
      notify("仅模板拥有者可修改模板名称", 'warning');
      return;
    }
    const nextName = (await prompt({
      title: '修改模板名称',
      message: '请输入新的模板名称',
      defaultValue: template.name,
      placeholder: '模板名称',
      confirmText: '保存',
      cancelText: '取消',
    }))?.trim();
    if (!nextName || nextName === template.name) return;
    try {
      await environmentApi.environment.updateTemplateBasic(template.id, { name: nextName });
      await loadTemplates();
      await viewDetail(template.id);
    } catch (err: any) {
      notify(err?.message ||"修改模板名称失败", 'error');
    }
  };

  const handleEditTemplateTags = async (template: any) => {
    if (!template?.id) return;
    if (!canManageTemplate(template)) {
      notify("仅模板拥有者可修改模板 TAG", 'warning');
      return;
    }
    const nextTags = await prompt({
      title: '修改模板 TAG',
      message: '请输入模板 TAG，使用英文逗号分隔',
      defaultValue: stringifyTemplateTags(getTemplateTags(template)),
      placeholder: '例如：AI_AGENT_HELPER, INTERNAL',
      confirmText: '保存',
      cancelText: '取消',
    });
    if (nextTags == null) return;
    try {
      await environmentApi.environment.updateTemplateBasic(template.id, { tags: normalizeTemplateTags(nextTags) });
      notify('模板 TAG 已更新', 'success');
      await loadTemplates();
      await viewDetail(template.id);
    } catch (err: any) {
      notify(err?.message ||"修改模板 TAG 失败", 'error');
    }
  };

  const handleSaveTemplateLlmBinding = async (template: any, binding: TemplateLlmProviderBinding | null) => {
    if (!template?.id) return;
    if (!canManageTemplate(template)) {
      notify('仅模板拥有者可重新生成模板', 'warning');
      return;
    }
    setSavingTemplateLlmBinding(true);
    try {
      if (!binding?.provider_keys?.length) {
        notify('请至少选择一个 LLM Provider', 'warning');
        return;
      }
      await environmentApi.environment.regenerateTemplateWithLlmProviders(template.id, binding);
      notify('模板已按所选 Provider 重新生成', 'success');
      await loadTemplates();
      await viewDetail(template.id);
    } catch (err: any) {
      notify(err?.message || '重新生成模板失败', 'error');
    } finally {
      setSavingTemplateLlmBinding(false);
    }
  };

  const handleRestoreOriginalCompose = async (template: any) => {
    if (!template?.id) return;
    if (!canManageTemplate(template)) {
      notify('仅模板拥有者可恢复原始模板', 'warning');
      return;
    }
    setSavingTemplateLlmBinding(true);
    try {
      await environmentApi.environment.restoreTemplateOriginalCompose(template.id);
      notify('模板已恢复为原始内容', 'success');
      await loadTemplates();
      await viewDetail(template.id);
    } catch (err: any) {
      notify(err?.message || '恢复原始模板失败', 'error');
    } finally {
      setSavingTemplateLlmBinding(false);
    }
  };

  const addUploadWebPortPreset = () => {
    setNewTemplate((prev) => ({
      ...prev,
      web_port_presets: [
        ...(prev.web_port_presets || []),
        { name: '', port: 80, protocol: 'http', backend_protocol: 'http', description: '', path: '/', websocket_enabled: true, tls_enabled: true, ingress_tls_enabled: true }
      ]
    }));
  };

  const saveDetailWebPortPresets = async () => {
    if (!templateDetail?.id) return;
    if (!canManageTemplate(templateDetail)) {
      notify('仅模板拥有者可更新WEB端口', 'warning');
      return;
    }
    setSavingWebPortPresets(true);
    try {
      const normalized = normalizeWebPortPresets(detailWebPortPresets);
      await environmentApi.environment.updateTemplateWebPorts(templateDetail.id, normalized);
      notify('WEB端口已更新', 'success');
      await viewDetail(templateDetail.id);
      await loadTemplates();
    } catch (err: any) {
      notify(err?.message || '更新WEB端口失败', 'error');
    } finally {
      setSavingWebPortPresets(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('name', newTemplate.name);
      formData.append('description', newTemplate.description);
      formData.append('type', newTemplate.type);
      formData.append('visibility', newTemplate.visibility);
      formData.append('tags', JSON.stringify(normalizeTemplateTags(newTemplate.tags)));
      formData.append('web_port_presets', JSON.stringify(normalizeWebPortPresets(newTemplate.web_port_presets || [])));
      if (uploadTab === 'file') {
        const file = selectedUploadFile || fileInputRef.current?.files?.[0];
        if (!file) throw new Error("请选择上传文件");
        formData.append('file', file);
      } else {
        if (!newTemplate.content.trim()) throw new Error("YAML 内容不能为空");
        const blob = new Blob([newTemplate.content], { type: 'text/yaml' });
        formData.append('file', blob,`${newTemplate.name}.yaml`);
      }

      await environmentApi.environment.uploadTemplate(formData);
      setIsUploadModalOpen(false);
      resetUploadForm();
      loadTemplates();
    } catch (err: any) {
      setUploadError(err.message ||"上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadForm = () => {
    setNewTemplate({ name: '', description: '', type: 'yaml', content: '', visibility: 'shared', tags: [], web_port_presets: [] });
    setUploadError(null);
    setSelectedUploadFile(null);
    setIsDragOverUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isSupportedUploadFile = (file: File): boolean => {
    const filename = file.name.toLowerCase();
    if (newTemplate.type === 'yaml') {
      return filename.endsWith('.yaml') || filename.endsWith('.yml');
    }
    return [
      '.zip', '.tar', '.tar.gz', '.tgz',
      '.tar.bz2', '.tbz', '.tbz2', '.tar.xz', '.txz'
    ].some(ext => filename.endsWith(ext));
  };

  const getUploadAcceptHint = () => {
    return newTemplate.type === 'yaml'
      ? '支持 .yaml, .yml 格式'
      : '支持 .zip, .tar, .tar.gz, .tgz, .tar.bz2, .tbz, .tbz2, .tar.xz, .txz 格式';
  };

  const handleUploadFileSelect = (file: File | null) => {
    if (!file) return;
    if (!isSupportedUploadFile(file)) {
      setUploadError(`文件类型不支持：${file.name}，${getUploadAcceptHint()}`);
      setSelectedUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadError(null);
    setSelectedUploadFile(file);
  };

  const handleUploadInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleUploadFileSelect(file);
  };

  const handleUploadDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverUpload(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleUploadFileSelect(file);
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTemplateWebPortPresets = (template: EnvTemplate): WebPortPreset[] =>
    normalizeWebPortPresets(template?.metadata?.web_port_presets || []);

  const renderDeployModal = () => (
    isDeployModalOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-bg-app w-full max-w-6xl max-h-[86vh] rounded-[2.25rem] overflow-hidden flex flex-col animate-in zoom-in-95">
          <div className="p-7 border-b border-theme-border bg-slate-50/60 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
 <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-blue-600/25">
                  <Monitor size={26} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-theme-text-primary tracking-tight">部署到节点</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-theme-text-muted">
                    <span>模板 {deploySource === 'detail' ? 1 : selectedNames.size} 个</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>已选节点 {selectedAgentKeys.size} / {availableAgents.length}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>预计任务 {((deploySource === 'detail' ? 1 : selectedNames.size) * selectedAgentKeys.size) || 0} 个</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsDeployModalOpen(false)}
 className="p-3 text-theme-text-muted hover:bg-theme-bg-app hover:text-theme-text-secondary rounded-xl transition-all"
              >
                <X size={22} />
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { key: 'agents', label: '1. 节点选择' },
                { key: 'config', label: '2. 部署配置' },
                { key: 'llm', label: '3. LLM 注入' },
                { key: 'confirm', label: '4. 确认下发' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDeployModalTab(tab.key as 'agents' | 'config' | 'llm' | 'confirm')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                    deployModalTab === tab.key
 ? 'bg-theme-bg-app text-blue-400 border border-blue-500/20 '
                      : 'text-theme-text-secondary hover:bg-theme-bg-app'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-7 bg-slate-50/20 custom-scrollbar">
            {deployModalTab === 'agents' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" size={16} />
                      <input
                        type="text"
                        autoFocus
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                        placeholder="快速筛选：hostname / IP / agent key / 原因"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-theme-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="flex rounded-xl border border-theme-border bg-theme-bg-app p-1">
                      <button
                        onClick={() => setStatusFilter('all')}
 className={`px-3 py-1.5 rounded-lg text-xs font-bold ${statusFilter === 'all' ? 'bg-theme-bg-app text-theme-text-primary ' : 'text-theme-text-muted'}`}
                      >
                        全部
                      </button>
                      <button
                        onClick={() => setStatusFilter('online')}
 className={`px-3 py-1.5 rounded-lg text-xs font-bold ${statusFilter === 'online' ? 'bg-green-600 text-white ' : 'text-theme-text-muted'}`}
                      >
                        仅在线
                      </button>
                    </div>
                    <select
                      value={agentPageSize}
                      onChange={(e) => setAgentPageSize(Number(e.target.value) || 10)}
                      className="px-3 py-2.5 rounded-xl border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary"
                    >
                      <option value={10}>10/页</option>
                      <option value={20}>20/页</option>
                      <option value={50}>50/页</option>
                      <option value={100}>100/页</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={toggleSelectAllAgents}
                        className="px-3 py-2.5 rounded-xl border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        {filteredAgents.filter((agent) => agent.status === 'online').length > 0 && filteredAgents.filter((agent) => agent.status === 'online').every((agent) => selectedAgentKeys.has(agent.key)) ? '取消全选筛选结果' : '全选筛选结果'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-theme-border bg-theme-bg-app overflow-hidden">
                  <div className="grid grid-cols-[44px_1.1fr_1fr_120px_220px_140px] gap-3 px-4 py-3 text-[11px] font-black text-theme-text-muted uppercase bg-theme-bg-app border-b border-theme-border">
                    <div />
                    <div>节点</div>
                    <div>IP</div>
                    <div>状态</div>
                    <div>调度说明</div>
                    <div>Agent Key</div>
                  </div>
                  {agentsLoading ? (
                    <div className="py-14 flex items-center justify-center text-theme-text-muted gap-3">
                      <Loader2 className="animate-spin" size={18} />
                      <span className="text-sm">拉取节点列表中...</span>
                    </div>
                  ) : pagedAgents.length === 0 ? (
                    <div className="py-14 text-center text-sm text-theme-text-muted">无匹配节点</div>
                  ) : (
                    pagedAgents.map((agent) => {
                      const online = agent.status === 'online';
                      const selected = selectedAgentKeys.has(agent.key);
                      return (
                        <button
                          key={agent.key}
                          type="button"
                          onClick={() => online && toggleAgentSelect(agent.key)}
                          className={`w-full text-left grid grid-cols-[44px_1.1fr_1fr_120px_220px_140px] gap-3 px-4 py-3 border-b border-theme-border transition-colors ${
                            online ? 'hover:bg-blue-50/50' : 'opacity-60 cursor-not-allowed'
                          } ${selected ? 'bg-blue-500/15' : 'bg-theme-bg-app'}`}
                        >
                          <div className="flex items-center justify-center">
                            <span className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-theme-border bg-theme-bg-app'}`}>
                              {selected ? <Check size={12} /> : null}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-theme-text-primary truncate">{agent.hostname || '-'}</p>
                          </div>
                          <div className="text-xs font-mono text-theme-text-secondary truncate">{agent.ip_address || '-'}</div>
                          <div><StatusBadge status={agent.status} /></div>
                          <div className="text-xs text-theme-text-muted truncate">{agent.allow_reason || '-'}</div>
                          <div className="text-[11px] font-mono text-theme-text-muted truncate">{agent.key}</div>
                        </button>
                      );
                    })
                  )}
                  <div className="px-4 py-3 bg-theme-bg-app border-t border-theme-border flex items-center justify-between text-xs text-theme-text-secondary">
                    <span>第 {Math.min(agentPage, totalAgentPages)} / {totalAgentPages} 页 · 共 {filteredAgents.length} 条</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAgentPage((p) => Math.max(1, p - 1))}
                        disabled={agentPage <= 1}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app disabled:opacity-40"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setAgentPage((p) => Math.min(totalAgentPages, p + 1))}
                        disabled={agentPage >= totalAgentPages}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app disabled:opacity-40"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {deployModalTab === 'config' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                  <h4 className="text-sm font-black text-theme-text-primary mb-2">本次部署模板</h4>
                  <div className="space-y-2">
                    {deploySource === 'detail' ? (
                      <div className="px-3 py-2 rounded-xl bg-theme-bg-app border border-theme-border text-sm font-semibold text-theme-text-secondary">
                        {templateDetail?.name || selectedTemplate}
                      </div>
                    ) : (
                      templates.filter((tpl) => selectedNames.has(String(tpl.id))).map((tpl) => (
                        <div key={`deploy-preview-tpl-${tpl.id}`} className="px-3 py-2 rounded-xl bg-theme-bg-app border border-theme-border text-sm font-semibold text-theme-text-secondary">
                          {tpl.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                  <h4 className="text-sm font-black text-theme-text-primary mb-2">服务命名规则</h4>
                  <p className="text-sm text-theme-text-secondary">
                    <code className="px-1.5 py-0.5 rounded bg-theme-elevated text-theme-text-secondary">{'{template_name}-{agent_key前6位}'}</code>
                    ，同节点重复名称会自动跳过。
                  </p>
                </div>
              </div>
            )}

            {deployModalTab === 'llm' && (
              <div className="space-y-4">
                <TemplateLlmBindingEditor
                  projectId={projectId}
                  value={deployLlmBinding}
                  onChange={(next) => setDeployLlmBinding(normalizeDeployLlmBinding(next))}
                  serviceOptions={getDeployServiceOptions()}
                  title="部署前临时 LLM Provider 注入"
                  description="在模板当前结果基础上，为本次部署临时叠加多个 Provider；该覆盖不会回写模板。"
                />
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-theme-text-primary">环境变量草稿（可编辑）</h4>
                      <p className="text-xs text-theme-text-muted mt-1">第3步仅编辑草稿，不作为最终预览。最终只读预览在第4步展示。</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patchDeployLlmBinding({ env_overrides: { ...(deployLlmPreview?.merged_env || {}) } })}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        从 Provider 填充
                      </button>
                      <button
                        type="button"
                        onClick={() => patchDeployLlmBinding({ env_overrides: {} })}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  {deployLlmPreviewLoading && (
                    <div className="text-xs text-theme-text-muted flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> 正在获取 Provider 预览...</div>
                  )}
                  {deployLlmPreviewError && (
                    <div className="text-xs text-red-400">{deployLlmPreviewError}</div>
                  )}
                  {Object.entries(normalizeDeployLlmBinding(deployLlmBinding)?.env_overrides || {}).map(([key, value], index, arr) => (
                    <div key={`deploy-env-${index}-${key}`} className="grid grid-cols-[minmax(0,240px)_1fr_auto] gap-2">
                      <input
                        value={key}
                        onChange={(e) => {
                          const nextKey = e.target.value;
                          const next: Record<string, string> = {};
                          arr.forEach(([rawKey, rawVal], idx) => {
                            if (idx === index) {
                              const normalizedKey = String(nextKey || '').trim();
                              if (normalizedKey) next[normalizedKey] = String(rawVal || '');
                              return;
                            }
                            const normalizedKey = String(rawKey || '').trim();
                            if (!normalizedKey) return;
                            next[normalizedKey] = String(rawVal || '');
                          });
                          patchDeployLlmBinding({ env_overrides: next });
                        }}
                        className="px-3 py-2 rounded-lg border border-theme-border text-xs font-mono"
                        placeholder="ENV_KEY"
                      />
                      <input
                        value={String(value || '')}
                        onChange={(e) => {
                          const next = { ...(normalizeDeployLlmBinding(deployLlmBinding)?.env_overrides || {}) };
                          next[key] = e.target.value;
                          patchDeployLlmBinding({ env_overrides: next });
                        }}
                        className="px-3 py-2 rounded-lg border border-theme-border text-xs font-mono"
                        placeholder="value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...(normalizeDeployLlmBinding(deployLlmBinding)?.env_overrides || {}) };
                          delete next[key];
                          patchDeployLlmBinding({ env_overrides: next });
                        }}
                        className="px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/15 text-xs font-semibold text-red-400 hover:bg-red-500/15"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const base = { ...(normalizeDeployLlmBinding(deployLlmBinding)?.env_overrides || {}) };
                      let seed = 'NEW_ENV_KEY';
                      let idx = 1;
                      while (Object.prototype.hasOwnProperty.call(base, seed)) {
                        seed =`NEW_ENV_KEY_${idx++}`;
                      }
                      base[seed] = '';
                      patchDeployLlmBinding({ env_overrides: base });
                    }}
                    className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                  >
                    + 新增环境变量
                  </button>
                </div>

                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-theme-text-primary">文件注入草稿（可编辑）</h4>
                      <p className="text-xs text-theme-text-muted mt-1">可编辑名称、路径、格式、内容与启用状态。</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patchDeployLlmBinding({ file_overrides: (deployLlmPreview?.merged_files || []) as TemplateLlmMappedFile[] })}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        从 Provider 填充
                      </button>
                      <button
                        type="button"
                        onClick={() => patchDeployLlmBinding({ file_overrides: [] })}
                        className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  {(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || []).map((item, index) => (
                    <div key={`deploy-file-${index}`} className="rounded-xl border border-theme-border bg-theme-bg-app p-3 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={item.name || ''}
                          onChange={(e) => {
                            const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                            next[index] = { ...next[index], name: e.target.value };
                            patchDeployLlmBinding({ file_overrides: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs"
                          placeholder="文件名称"
                        />
                        <input
                          value={item.path || ''}
                          onChange={(e) => {
                            const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                            next[index] = { ...next[index], path: e.target.value };
                            patchDeployLlmBinding({ file_overrides: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-mono"
                          placeholder="/etc/service/config.toml"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2">
                        <input
                          value={item.format || 'other'}
                          onChange={(e) => {
                            const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                            next[index] = { ...next[index], format: e.target.value };
                            patchDeployLlmBinding({ file_overrides: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs"
                          placeholder="format"
                        />
                        <label className="flex items-center gap-2 text-xs text-theme-text-secondary px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app">
                          <input
                            type="checkbox"
                            checked={item.enabled !== false}
                            onChange={(e) => {
                              const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                              next[index] = { ...next[index], enabled: e.target.checked };
                              patchDeployLlmBinding({ file_overrides: next });
                            }}
                            className="w-4 h-4 accent-blue-600"
                          />
                          启用
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                            next.splice(index, 1);
                            patchDeployLlmBinding({ file_overrides: next });
                          }}
                          className="px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/15 text-xs font-semibold text-red-400 hover:bg-red-500/15"
                        >
                          删除
                        </button>
                      </div>
                      <textarea
                        rows={5}
                        value={item.content || ''}
                        onChange={(e) => {
                          const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                          next[index] = { ...next[index], content: e.target.value };
                          patchDeployLlmBinding({ file_overrides: next });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-mono"
                        placeholder="文件内容"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(normalizeDeployLlmBinding(deployLlmBinding)?.file_overrides || [])];
                      next.push({
                        name:`file-${next.length + 1}`,
                        path: '',
                        content: '',
                        format: 'other',
                        enabled: true,
                      });
                      patchDeployLlmBinding({ file_overrides: next });
                    }}
                    className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-app text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                  >
                    + 新增文件注入
                  </button>
                </div>
              </div>
            )}

            {deployModalTab === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-5">
                  <h4 className="text-sm font-black text-theme-text-primary mb-3">最终确认</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <p className="text-[11px] text-theme-text-muted">模板数量</p>
                      <p className="text-xl font-black text-theme-text-primary">{deploySource === 'detail' ? 1 : selectedNames.size}</p>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <p className="text-[11px] text-theme-text-muted">目标节点</p>
                      <p className="text-xl font-black text-theme-text-primary">{selectedAgentKeys.size}</p>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <p className="text-[11px] text-theme-text-muted">预计任务</p>
                      <p className="text-xl font-black text-blue-400">{((deploySource === 'detail' ? 1 : selectedNames.size) * selectedAgentKeys.size) || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-5">
                  <h4 className="text-sm font-black text-theme-text-primary mb-2">已选节点</h4>
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {Array.from(selectedAgentKeys).length === 0 ? (
                      <p className="text-sm text-theme-text-muted">尚未选择节点</p>
                    ) : (
                      Array.from(selectedAgentKeys).map((key) => {
                        const item = availableAgents.find((agent) => agent.key === key);
                        return (
                          <div key={`confirm-agent-${key}`} className="px-3 py-2 rounded-xl border border-theme-border bg-theme-bg-app text-sm text-theme-text-secondary flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">{item?.hostname || key}</span>
                            <span className="text-xs font-mono text-theme-text-muted truncate">{item?.ip_address || '-'}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-bg-app p-5">
                  <h4 className="text-sm font-black text-theme-text-primary mb-2">最终部署注入预览（只读）</h4>
                  <p className="text-xs text-theme-text-muted mb-3">此处为最终下发内容预览，第4步不可编辑。</p>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <div className="text-xs font-black text-theme-text-secondary mb-2">环境变量 ({Object.keys(deployLlmFinalEnvPreview).length})</div>
                      <div className="max-h-56 overflow-y-auto space-y-1 custom-scrollbar">
                        {Object.entries(deployLlmFinalEnvPreview).length === 0 ? (
                          <div className="text-xs text-theme-text-muted">无环境变量注入</div>
                        ) : (
                          Object.entries(deployLlmFinalEnvPreview).map(([key, value]) => (
                            <div key={`confirm-env-${key}`} className="grid grid-cols-[minmax(0,180px)_1fr] gap-2 rounded-lg bg-theme-bg-app border border-theme-border px-2.5 py-2 text-[11px] font-mono">
                              <span className="truncate text-theme-text-secondary">{key}</span>
                              <span className="break-all text-theme-text-muted">{String(value || '')}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <div className="text-xs font-black text-theme-text-secondary mb-2">文件注入 ({deployLlmFinalFilePreview.length})</div>
                      <div className="max-h-56 overflow-y-auto space-y-2 custom-scrollbar">
                        {deployLlmFinalFilePreview.length === 0 ? (
                          <div className="text-xs text-theme-text-muted">无文件注入</div>
                        ) : (
                          deployLlmFinalFilePreview.map((file, idx) => (
                            <div key={`confirm-file-${idx}-${file.path}`} className="rounded-lg bg-theme-bg-app border border-theme-border p-2.5 text-[11px]">
                              <div className="font-semibold text-theme-text-secondary">{file.name ||`file-${idx + 1}`}</div>
                              <div className="font-mono text-theme-text-muted break-all mt-0.5">{file.path}</div>
                              <pre className="mt-2 p-2 rounded bg-theme-bg-app border border-theme-border text-[11px] font-mono text-theme-text-secondary max-h-28 overflow-auto whitespace-pre-wrap break-all">{file.content || ''}</pre>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-theme-border bg-theme-bg-app flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
            <div className="text-xs text-theme-text-muted">
              当前步骤：
              <span className="font-bold text-theme-text-secondary ml-1">
                {deployModalTab === 'agents' ? '节点选择' : deployModalTab === 'config' ? '部署配置' : deployModalTab === 'llm' ? 'LLM 注入' : '确认下发'}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsDeployModalOpen(false)}
                disabled={deploying}
                className="px-6 py-2.5 bg-theme-elevated text-theme-text-secondary rounded-xl font-bold hover:bg-theme-elevated disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={executeDeploy}
                disabled={deploying || selectedAgentKeys.size === 0}
 className="px-7 py-2.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {deploying ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                执行批量部署
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  );

  const renderTemplateLlmModal = () => (
    isTemplateLlmModalOpen && templateDetail ? (
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-bg-app w-full max-w-4xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95">
          <div className="p-6 border-b border-theme-border bg-slate-100/40 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-theme-text-primary tracking-tight">LLM Provider 混合与重新生成</h3>
                <p className="text-xs text-theme-text-muted mt-1">
                  当前模板：{templateDetail.name}。在此选择配置中心中的一个或多个 LLM Provider，对模板环境变量与配置文件做混合并重新生成当前模板。
                </p>
              </div>
              <button
                onClick={() => setIsTemplateLlmModalOpen(false)}
 className="p-3 text-theme-text-muted hover:bg-theme-bg-app hover:text-theme-text-secondary rounded-xl transition-all"
              >
                <X size={22} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {!canManageTemplate(templateDetail) && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                当前模板仅拥有者可执行 LLM Provider 重新生成和恢复原始模板操作。
              </div>
            )}
            <div className="rounded-2xl border border-theme-border bg-slate-50/80 p-4 space-y-2">
              <div className="text-xs font-black text-theme-text-secondary">当前模板来源</div>
              <div className="text-sm font-bold text-theme-text-primary">
                {templateDetail?.metadata?.llm_mix_state?.provider_keys?.length
                  ?`原始模板 + ${templateDetail.metadata.llm_mix_state.provider_keys.join(' + ')}`
                  : '原始模板'}
              </div>
              <div className="text-xs text-theme-text-muted">
                原始 compose 备份：
                {templateDetail?.metadata?.original_compose_backup?.file_path
                  ?` ${templateDetail.metadata.original_compose_backup.file_path}`
                  : ' 未建立'}
              </div>
            </div>
            <TemplateLlmBindingEditor
              projectId={projectId}
              value={detailLlmBindingDraft}
              onChange={setDetailLlmBindingDraft}
              serviceOptions={getTemplateServiceOptions(templateDetail)}
              disabled={!canManageTemplate(templateDetail) || savingTemplateLlmBinding}
              title="选择用于重新生成的 Provider 组合"
              description="始终基于原始 compose 备份重新生成当前模板内容，不在当前混合结果上叠加。"
            />
          </div>
          <div className="p-6 border-t border-theme-border bg-theme-bg-app shrink-0 flex items-center justify-between gap-3">
            <button
              onClick={() => setIsTemplateLlmModalOpen(false)}
              className="px-4 py-2.5 text-sm font-black rounded-xl bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated"
            >
              关闭
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleRestoreOriginalCompose(templateDetail)}
                disabled={!canManageTemplate(templateDetail) || savingTemplateLlmBinding}
                title={canManageTemplate(templateDetail) ? '恢复为原始模板' : '仅模板拥有者可操作'}
                className="px-4 py-2.5 text-sm font-black rounded-xl bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60 disabled:cursor-not-allowed"
              >
                恢复原始模板
              </button>
              <button
                onClick={() => void handleSaveTemplateLlmBinding(templateDetail, detailLlmBindingDraft)}
                disabled={!canManageTemplate(templateDetail) || savingTemplateLlmBinding}
                title={canManageTemplate(templateDetail) ? '使用所选 Provider 重新生成模板' : '仅模板拥有者可操作'}
                className="px-4 py-2.5 text-sm font-black rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingTemplateLlmBinding ? '处理中...' : '重新生成模板'}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  );

  // Tree Render Component
  const RenderTreeNode: React.FC<{ node: TreeNode; depth: number }> = ({ node, depth }) => {
    const isExpanded = expandedFolders.has(node.path || 'root');
    const isFile = node.type === 'file';
    const canManageCurrentTemplate = canManageTemplate(templateDetail);

    const getIcon = () => {
      if (!isFile) return isExpanded ? <FolderOpen size={16} className="text-amber-400" /> : <Folder size={16} className="text-amber-400" />;
      const ext = node.name.split('.').pop()?.toLowerCase();
      if (['yaml', 'yml'].includes(ext!)) return <FileCode size={16} className="text-blue-500" />;
      if (ext === 'json') return <FileJson size={16} className="text-amber-400" />;
      return <FileText size={16} className="text-theme-text-muted" />;
    };

    return (
      <div className="select-none">
        <div
          onClick={() => !isFile && toggleFolder(node.path || 'root')}
          className={`group flex items-center py-2 px-4 hover:bg-blue-50/50 cursor-pointer rounded-xl transition-all ${depth > 0 ? 'ml-6' : ''}`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {!isFile && (
              <ChevronRight size={14} className={`text-theme-text-faint transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            )}
            {isFile && <div className="w-[14px]" />}
            {getIcon()}
            <span className={`text-sm truncate font-medium ${isFile ? 'text-theme-text-secondary' : 'text-theme-text-primary font-bold'}`}>
              {node.name === 'root' ? 'Template Workspace' : node.name}
            </span>
            {isFile && (
              <span className="text-[10px] font-black text-theme-text-faint uppercase ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {(node.size! / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          {isFile && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
              {canManageCurrentTemplate && isEditable(node.path) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditFile(node.path); }}
                  className="p-1.5 text-theme-text-muted hover:text-blue-400 hover:bg-theme-bg-app rounded-lg transition-all"
                  title="在线编辑"
                >
                  <Edit3 size={14} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDownloadFile(node.path); }}
                className="p-1.5 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-app rounded-lg transition-all"
                title="下载文件"
              >
                <Download size={14} />
              </button>
              {canManageCurrentTemplate && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFile(node.path); }}
                  className="p-1.5 text-theme-text-muted hover:text-red-400 hover:bg-red-500/15 rounded-lg transition-all"
                  title="删除文件"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
          {!isFile && node.path && node.path !== 'root' && canManageCurrentTemplate && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteDirectory(node.path); }}
                className="p-1.5 text-theme-text-muted hover:text-red-400 hover:bg-red-500/15 rounded-lg transition-all"
                title="删除目录"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {(!isFile && isExpanded) && (
          <div className="border-l border-theme-border ml-6 mt-1">
            {/* Fix: Cast Object.values results to TreeNode[] to avoid 'unknown' type errors during property access */}
            {(Object.values(node.children) as TreeNode[]).map(child => (
              <RenderTreeNode key={child.path} node={child} depth={0} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (deploymentDetailAgentKey) {
    return (
      <AgentDetailPage
        agentKey={deploymentDetailAgentKey}
        projectId={projectId}
        onBack={() => setDeploymentDetailAgentKey(null)}
      />
    );
  }

  if (viewMode === 'detail' && templateDetail) {
    const canManageCurrentTemplate = canManageTemplate(templateDetail);
    const canCopyCurrentTemplate = canCopyTemplate(templateDetail);
    const detailTabs: Array<{ key: 'overview' | 'compose' | 'files' | 'deployments'; label: string; icon: React.ReactNode }> = [
      { key: 'overview', label: '概览', icon: <Info size={15} /> },
      ...((templateDetail.type === 'yaml' || templateDetail.type === 'archive')
        ? [
            { key: 'compose' as const, label: 'Compose', icon: <Container size={15} /> },
            { key: 'files' as const, label: '资源文件', icon: <FolderOpen size={15} /> },
          ]
        : []),
      { key: 'deployments', label: '部署实例', icon: <Network size={15} /> },
    ];
    return (
      <>
      <div className="p-10 space-y-8 animate-in slide-in-from-right duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
        {/* Detail Header with Top Right Actions */}
 <div className="flex flex-col md:flex-row justify-between items-start gap-6 bg-theme-elevated backdrop-blur-md p-8 rounded-[3rem] border border-theme-border">
          <div className="flex items-center gap-8">
            <button
              onClick={() => setViewMode('list')}
 className="p-5 bg-theme-bg-app border border-theme-border rounded-[1.5rem] hover:bg-theme-elevated transition-all group active:scale-95"
            >
              <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <div className="flex items-center gap-4">
                <h2 className="text-4xl font-black text-theme-text-primary tracking-tight">{templateDetail.name}</h2>
                <StatusBadge status={templateDetail.type} />
                <StatusBadge status={templateDetail.visibility === 'private' ? 'private' : 'shared'} />
              </div>
              <div className="flex items-center gap-6 mt-3">
                 <div className="flex items-center gap-2 text-theme-text-muted font-bold text-xs uppercase tracking-widest">
                   <Database size={14} /> {(templateDetail.file_size / 1024).toFixed(1)} KB
                 </div>
                 <div className="w-1.5 h-1.5 bg-theme-elevated rounded-full" />
                 <div className="flex items-center gap-2 text-theme-text-muted font-bold text-xs uppercase tracking-widest">
                   <Calendar size={14} /> {templateDetail.updated_at?.replace('T', ' ')}
                 </div>
                 {templateDetail.owner_name && (
                   <>
                     <div className="w-1.5 h-1.5 bg-theme-elevated rounded-full" />
                     <div className="flex items-center gap-2 text-theme-text-muted font-bold text-xs uppercase tracking-widest">
                       OWNER: {templateDetail.owner_name}
                     </div>
                   </>
                 )}
              </div>
              {getTemplateTags(templateDetail).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {getTemplateTags(templateDetail).map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-black tracking-wide">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 self-end md:self-center">
            {canCopyCurrentTemplate && (
              <button
                onClick={() => handleCopyTemplate(templateDetail.id)}
 className="px-8 py-4 bg-theme-bg-app border border-theme-border text-theme-text-secondary rounded-[1.5rem] font-black hover:bg-theme-elevated transition-all flex items-center gap-3 active:scale-95"
              >
                <Layers size={20} className="text-indigo-400" /> 复制模板
              </button>
            )}
            {canManageCurrentTemplate && (
              <button
                onClick={() => handleRenameTemplate(templateDetail)}
 className="px-8 py-4 bg-theme-bg-app border border-theme-border text-theme-text-secondary rounded-[1.5rem] font-black hover:bg-theme-elevated transition-all flex items-center gap-3 active:scale-95"
              >
                <Edit3 size={20} className="text-emerald-400" /> 修改名称
              </button>
            )}
            {canManageCurrentTemplate && (
              <button
                onClick={() => handleEditTemplateTags(templateDetail)}
 className="px-8 py-4 bg-theme-bg-app border border-theme-border text-theme-text-secondary rounded-[1.5rem] font-black hover:bg-theme-elevated transition-all flex items-center gap-3 active:scale-95"
              >
                <Tags size={20} className="text-amber-400" /> 修改 TAG
              </button>
            )}
            <button
              onClick={openDetailDeployModal}
 className="px-8 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black hover:bg-blue-700 transition-all flex items-center gap-3 active:scale-95"
            >
              <Zap size={20} /> 部署到节点
            </button>
            <button
              onClick={handleDownloadAll}
 className="px-8 py-4 bg-theme-bg-app border border-theme-border text-theme-text-secondary rounded-[1.5rem] font-black hover:bg-theme-elevated transition-all flex items-center gap-3 active:scale-95"
            >
              <Download size={20} className="text-blue-400" /> 下载全量包
            </button>
            <button
              onClick={() => handleDeleteTrigger(String(templateDetail.id))}
              disabled={!canManageCurrentTemplate}
 className="px-8 py-4 bg-red-600 text-white rounded-[1.5rem] font-black hover:bg-red-700 transition-all flex items-center gap-3 shadow-red-500/20 active:scale-95"
            >
              <Trash2 size={20} /> 销毁模板
            </button>
          </div>
        </div>

 <div className="inline-flex items-center gap-1.5 rounded-[1.5rem] border border-theme-border bg-theme-bg-app p-1.5">
          {detailTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                detailTab === tab.key
                  ? 'bg-theme-surface text-white shadow'
                  : 'text-theme-text-secondary hover:bg-theme-elevated'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {detailTab === 'overview' && (
          <>
        {/* 模板说明 */}
        {templateDetail.description && (
 <div className="bg-theme-surface p-8 rounded-[2.5rem] text-white relative overflow-hidden">
            <ShieldCheck className="absolute right-[-30px] top-[-30px] w-40 h-40 opacity-5 rotate-12" />
            <div className="relative z-10">
              <h4 className="text-xs font-black text-theme-text-muted uppercase tracking-[0.2em] mb-3">模板说明</h4>
              <p className="text-sm text-theme-text-faint leading-relaxed font-medium">{templateDetail.description}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6">
 <div className="bg-theme-bg-app rounded-[2.5rem] border border-theme-border p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-theme-text-primary">模板 TAG</h4>
                <p className="text-xs text-theme-text-muted mt-1">用于模板分类、识别和自动化关联。</p>
              </div>
              {canManageCurrentTemplate && (
                <button
                  onClick={() => handleEditTemplateTags(templateDetail)}
                  className="px-3 py-2 text-xs font-black rounded-xl bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated"
                >
                  编辑 TAG
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {getTemplateTags(templateDetail).length > 0 ? (
                getTemplateTags(templateDetail).map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-black tracking-wide">
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-xs text-theme-text-muted">暂无 TAG</p>
              )}
            </div>
          </div>

 <div className="bg-theme-bg-app rounded-[2.5rem] border border-theme-border p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-theme-text-primary">LLM Provider 重新生成模板</h4>
                <p className="text-xs text-theme-text-muted mt-1">通过独立弹框选择配置中心中的一个或多个 LLM Provider，基于原始 docker-compose 备份重新生成当前模板结果。</p>
              </div>
              <div className="flex items-center gap-3">
                {savingTemplateLlmBinding && <Loader2 size={16} className="animate-spin text-theme-text-muted" />}
                <button
                  onClick={() => void openTemplateLlmModal(templateDetail)}
                  disabled={savingTemplateLlmBinding}
                  className="px-3 py-2 text-xs font-black rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                >
                  打开混合配置
                </button>
              </div>
            </div>
            {!canManageCurrentTemplate && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                当前模板仅拥有者可执行 LLM Provider 重新生成和恢复原始模板操作。
              </div>
            )}
            <div className="rounded-2xl border border-theme-border bg-slate-50/80 p-4 space-y-2">
              <div className="text-xs font-black text-theme-text-secondary">当前模板来源</div>
              <div className="text-sm font-bold text-theme-text-primary">
                {templateDetail?.metadata?.llm_mix_state?.provider_keys?.length
                  ?`原始模板 + ${templateDetail.metadata.llm_mix_state.provider_keys.join(' + ')}`
                  : '原始模板'}
              </div>
              <div className="text-xs text-theme-text-muted">
                原始 compose 备份：
                {templateDetail?.metadata?.original_compose_backup?.file_path
                  ?` ${templateDetail.metadata.original_compose_backup.file_path}`
                  : ' 未建立'}
              </div>
              {templateDetail?.metadata?.llm_mix_state?.generated_at && (
                <div className="text-xs text-theme-text-muted">
                  最近一次生成：{templateDetail.metadata.llm_mix_state.generated_at}
                  {templateDetail?.metadata?.llm_mix_state?.generated_by ?` · ${templateDetail.metadata.llm_mix_state.generated_by}` : ''}
                </div>
              )}
              {Array.isArray(templateDetail?.metadata?.llm_mix_state?.mapped_env_keys) && templateDetail.metadata.llm_mix_state.mapped_env_keys.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {templateDetail.metadata.llm_mix_state.mapped_env_keys.slice(0, 12).map((key: string) => (
                    <span key={key} className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 text-[11px] font-black">{key}</span>
                  ))}
                </div>
              )}
              {Array.isArray(templateDetail?.metadata?.llm_mix_state?.mapped_file_paths) && templateDetail.metadata.llm_mix_state.mapped_file_paths.length > 0 && (
                <div className="pt-2 space-y-2">
                  <div className="text-xs font-black text-theme-text-secondary">
                    文件注入路径（{templateDetail.metadata.llm_mix_state.mapped_file_paths.length}）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {templateDetail.metadata.llm_mix_state.mapped_file_paths.slice(0, 8).map((filePath: string) => (
                      <span key={filePath} className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black">
                        {filePath}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(templateDetail?.metadata?.llm_mix_history) && templateDetail.metadata.llm_mix_history.length > 0 && (
                <div className="pt-2 space-y-1">
                  <div className="text-xs font-black text-theme-text-secondary">最近生成记录</div>
                  {templateDetail.metadata.llm_mix_history.slice(-3).reverse().map((item: any, idx: number) => (
                    <div key={`mix-history-${idx}`} className="text-[11px] text-theme-text-muted">
                      {(item?.provider_keys || []).join(' + ') || '原始模板'} · {item?.generated_at || '-'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

 <div className="bg-theme-bg-app rounded-[2.5rem] border border-theme-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-theme-text-primary">WEB端口</h4>
              <p className="text-xs text-theme-text-muted mt-1">分别预设 Ingress 访问协议与后端服务协议，用于服务详情页快速创建转发</p>
            </div>
            {canManageCurrentTemplate && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailWebPortPresets(prev => [...prev, { name: '', port: 80, protocol: 'http', backend_protocol: 'http', description: '', path: '/', websocket_enabled: true, tls_enabled: true, ingress_tls_enabled: true }])}
                  className="px-3 py-2 text-xs font-black rounded-xl bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated"
                >
                  新增端口
                </button>
                <button
                  onClick={saveDetailWebPortPresets}
                  disabled={savingWebPortPresets}
                  className="px-3 py-2 text-xs font-black rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingWebPortPresets ? '保存中...' : '保存预设'}
                </button>
              </div>
            )}
          </div>
          {(detailWebPortPresets || []).length === 0 && (
            <p className="text-xs text-theme-text-muted">暂无WEB端口，支持在此维护，服务管理中可一键使用。</p>
          )}
          <div className="space-y-2">
            {(detailWebPortPresets || []).map((preset, idx) => (
              <div key={`detail-port-${idx}`} className="border border-theme-border rounded-xl p-2 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={preset.name || ''}
                    onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))}
                    disabled={!canManageCurrentTemplate}
                    placeholder="名称"
                    className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                  />
                  <input
                    value={preset.port || 0}
                    onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, port: Number(e.target.value || 0) } : p))}
                    disabled={!canManageCurrentTemplate}
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="端口"
                    className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                  />
                  <select
                    value={preset.backend_protocol || preset.protocol || 'http'}
                    onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? {
                      ...p,
                      protocol: (e.target.value === 'https' ? 'https' : 'http') as 'http' | 'https',
                      backend_protocol: (e.target.value === 'https' ? 'https' : 'http') as 'http' | 'https'
                    } : p))}
                    disabled={!canManageCurrentTemplate}
                    className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg bg-theme-bg-app"
                  >
                    <option value="http">后端 HTTP</option>
                    <option value="https">后端 HTTPS</option>
                  </select>
                  <input
                    value={preset.path || '/'}
                    onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, path: e.target.value } : p))}
                    disabled={!canManageCurrentTemplate}
                    placeholder="Path"
                    className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                  />
                  <input
                    value={preset.description || ''}
                    onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))}
                    disabled={!canManageCurrentTemplate}
                    placeholder="说明"
                    className="col-span-3 px-2 py-2 text-xs border border-theme-border rounded-lg"
                  />
                  {canManageCurrentTemplate && (
                    <button
                      onClick={() => setDetailWebPortPresets(prev => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 px-2 py-2 text-xs font-black rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/15"
                    >
                      删除
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4 px-1">
                  <label className="text-xs text-theme-text-secondary flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={preset.websocket_enabled !== false}
                      onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, websocket_enabled: e.target.checked } : p))}
                      disabled={!canManageCurrentTemplate}
                    />
                    启用 WebSocket
                  </label>
                  <label className="text-xs text-theme-text-secondary flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(preset.ingress_tls_enabled ?? preset.tls_enabled) !== false}
                      onChange={(e) => setDetailWebPortPresets(prev => prev.map((p, i) => i === idx ? { ...p, tls_enabled: e.target.checked, ingress_tls_enabled: e.target.checked } : p))}
                      disabled={!canManageCurrentTemplate}
                    />
                    Ingress 启用 HTTPS
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        )}

        {/* YAML 类型 - Compose 标签页 */}
        {templateDetail.type === 'yaml' && detailTab === 'compose' && (
          <div className="space-y-8">
            {parseLoading ? (
 <div className="bg-theme-bg-app rounded-[3rem] border border-theme-border p-12">
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-400 mb-4" />
                  <span className="text-theme-text-secondary font-medium">正在解析 Docker Compose 配置...</span>
                </div>
              </div>
            ) : parsedCompose?.parsed_compose ? (
              <ComposeViewer
                parsedCompose={parsedCompose.parsed_compose}
                isStale={parsedCompose.is_stale}
                onRefresh={() => fetchParsedCompose(selectedTemplate!)}
              />
            ) : parsedCompose?.parse_error ? (
              <div className="bg-red-500/15 border border-red-500/20 rounded-[2rem] p-8">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-8 h-8 text-red-400 shrink-0" />
                  <div className="flex-1">
                    <div className="font-black text-red-300 text-lg mb-2">解析失败</div>
                    <div className="text-sm text-red-400 mb-4">{parsedCompose.parse_error}</div>
                    <button
                      onClick={() => fetchParsedCompose(selectedTemplate!)}
                      className="px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 transition-all"
                    >
                      重试解析
                    </button>
                  </div>
                </div>
              </div>
            ) : (
 <div className="bg-theme-bg-app rounded-[3rem] border border-theme-border p-12">
                <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                  <Container size={64} className="mb-4 opacity-30" />
                  <p className="text-base font-medium">无法加载解析数据</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* YAML 类型 - 资源文件标签页 */}
        {templateDetail.type === 'yaml' && detailTab === 'files' && (
 <div className="bg-theme-bg-app rounded-[3rem] border border-theme-border overflow-hidden">
            <div className="px-8 py-6 border-b border-theme-border bg-slate-100/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-theme-surface rounded-xl flex items-center justify-center text-white">
                  <FileCode size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-theme-text-primary">源文件内容</h3>
                  <p className="text-xs text-theme-text-muted font-bold uppercase tracking-widest mt-1">
                    YAML 配置文件
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadAll}
 className="p-3 text-theme-text-muted hover:text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all"
                  title="下载文件"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => handleOpenYamlEditor(canManageCurrentTemplate)}
 className={`p-3 rounded-xl transition-all ${
                    canManageCurrentTemplate
                      ? 'text-theme-text-muted hover:text-green-400 hover:bg-green-500/15'
                      : 'text-theme-text-faint hover:text-amber-400 hover:bg-amber-500/15'
                  }`}
                  title="编辑文件"
                >
                  <Edit3 size={18} />
                </button>
              </div>
            </div>
            <div className="p-6 bg-theme-surface min-h-[300px]">
              {yamlFileLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                </div>
              ) : yamlFileLoaded ? (
                <pre className="text-xs font-mono text-blue-100/90 leading-relaxed whitespace-pre-wrap">
                  {yamlFileContent || '# 文件为空'}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                  <FileCode size={48} className="mb-4 opacity-30" />
                  <p className="text-sm font-medium">无法加载文件内容</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Archive 类型 - 显示文件树（资源文件标签页） */}
        {templateDetail.type === 'archive' && detailTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 左侧信息 */}
            <div className="lg:col-span-4 space-y-6">
 <div className="bg-theme-bg-app p-6 rounded-[2rem] border border-theme-border space-y-4">
                <h4 className="text-xs font-black text-theme-text-muted uppercase tracking-widest flex items-center gap-2">
                  <Info size={14} /> 模板信息
                </h4>
                <div className="space-y-3">
                  <div className="p-3 bg-theme-bg-app rounded-xl border border-theme-border">
                    <p className="text-[10px] font-black text-theme-text-muted uppercase">资源类型</p>
                    <p className="text-sm font-black text-theme-text-secondary mt-1">压缩包模板</p>
                  </div>
                  <div className="p-3 bg-theme-bg-app rounded-xl border border-theme-border">
                    <p className="text-[10px] font-black text-theme-text-muted uppercase">文件数量</p>
                    <p className="text-sm font-black text-theme-text-secondary mt-1">{templateDetail.directory_files?.length || 0} 个文件</p>
                  </div>
                  <div className="p-3 bg-theme-bg-app rounded-xl border border-theme-border">
                    <p className="text-[10px] font-black text-theme-text-muted uppercase">目录大小</p>
                    <p className="text-sm font-black text-blue-400 mt-1">{((templateDetail.directory_size || 0) / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧文件树 */}
 <div className="lg:col-span-8 flex flex-col min-h-[500px] bg-theme-bg-app rounded-[3rem] border border-theme-border overflow-hidden">
              <div className="px-8 py-6 border-b border-theme-border bg-slate-100/30 flex items-center justify-between">
                <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <FolderOpen size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-theme-text-primary">资源文件树</h3>
                    <p className="text-xs text-theme-text-muted font-bold uppercase tracking-widest mt-1">
                      {templateDetail.directory_files?.length || 0} 个资源项
                    </p>
                  </div>
                </div>
 <button onClick={() => setExpandedFolders(new Set(['root']))} className="p-3 text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-app rounded-xl transition-all">
                  <RefreshCw size={18} />
                </button>
              </div>

              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                {resourceTree && (
                  <RenderTreeNode node={resourceTree} depth={0} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Archive 类型的 Compose 解析展示（Compose 标签页） */}
        {templateDetail.type === 'archive' && detailTab === 'compose' && (
          parsedCompose?.parsed_compose ? (
            <ComposeViewer
              parsedCompose={parsedCompose.parsed_compose}
              isStale={parsedCompose.is_stale}
              onRefresh={() => fetchParsedCompose(selectedTemplate!)}
            />
          ) : (
 <div className="bg-theme-bg-app rounded-[3rem] border border-theme-border p-12">
              <div className="flex flex-col items-center justify-center py-12 text-theme-text-muted">
                <Container size={56} className="mb-4 opacity-30" />
                <p className="text-sm font-medium">该压缩包模板暂无可解析的 Compose 内容</p>
              </div>
            </div>
          )
        )}

        {/* 部署实例标签页 */}
        {detailTab === 'deployments' && (
 <div className="bg-theme-bg-app rounded-[3rem] border border-theme-border overflow-hidden">
            <div className="px-8 py-6 border-b border-theme-border bg-slate-100/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                  <Network size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-theme-text-primary">模板部署实例</h3>
                  <p className="text-xs text-theme-text-muted font-bold uppercase tracking-widest mt-1">
                    基于当前服务列表 · 共 {deploymentAgentRows.length} 个 Agent
                  </p>
                </div>
              </div>
              <button
                onClick={() => void loadTemplateDeployments(templateDetail.id)}
 className="p-3 text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-app rounded-xl transition-all"
                title="刷新部署实例"
              >
                <RefreshCw size={18} className={templateDeploymentsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-theme-text-muted border-b border-theme-border">
                <div className="col-span-4">节点标识</div>
                <div className="col-span-3">网络</div>
                <div className="col-span-2">节点状态</div>
                <div className="col-span-1">服务数</div>
                <div className="col-span-2 text-right">操作</div>
              </div>

              {templateDeploymentsLoading ? (
                <div className="py-12 flex items-center justify-center text-theme-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  加载部署实例中...
                </div>
              ) : templateDeploymentsError ? (
                <div className="py-10 text-center text-sm text-red-400">{templateDeploymentsError}</div>
              ) : deploymentAgentRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-theme-text-muted">当前服务列表中没有该模板的在线实例</div>
              ) : (
                <div className="divide-y divide-theme-border">
                  {deploymentAgentRows.map((row) => {
                    const agent = row.agent;
                    const nodeStatus = agent?.status || 'unknown';
                    const latestServiceName = row.services[0]?.name || '-';
                    return (
                    <div
                      key={row.agentKey}
                      onClick={() => setDeploymentDetailAgentKey(row.agentKey)}
                      className="grid grid-cols-12 gap-2 px-3 py-2.5 text-sm items-center hover:bg-theme-elevated cursor-pointer"
                    >
                      <div className="col-span-4 min-w-0 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${nodeStatus === 'online' ? 'bg-green-500/15 text-green-400' : 'bg-theme-elevated text-theme-text-muted'}`}>
                          <Monitor size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-theme-text-primary truncate">{agent?.hostname || row.agentKey}</div>
                          <div className="text-xs text-theme-text-muted truncate font-mono">{row.agentKey}</div>
                        </div>
                      </div>
                      <div className="col-span-3 min-w-0">
                        <div className="font-semibold text-theme-text-secondary truncate">{agent?.ip_address || row.services[0]?.agent_ip || '-'}</div>
                        <div className="text-xs text-theme-text-muted truncate">{agent?.last_seen ?`Last: ${String(agent.last_seen).replace('T', ' ')}` : '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <StatusBadge status={nodeStatus} />
                      </div>
                      <div className="col-span-1 text-xs text-theme-text-secondary font-bold">
                        {row.services.length}
                      </div>
                      <div className="col-span-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeploymentDetailAgentKey(row.agentKey);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-theme-border text-xs font-black text-theme-text-secondary hover:bg-theme-bg-app"
                          title={`查看节点详情（${latestServiceName} 等 ${row.services.length} 个服务）`}
                        >
                          详情
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Editor Overlay */}
        {isEditorOpen && editingFile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
 <div className="bg-theme-surface w-full max-w-5xl h-[85vh] rounded-[3.5rem] border border-theme-border flex flex-col overflow-hidden animate-in zoom-in-95">
 <div className="px-12 py-8 border-b border-slate-200/5 flex items-center justify-between bg-slate-100/10">
                  <div className="flex items-center gap-5">
 <div className="w-12 h-12 bg-blue-600 rounded-[1.5rem] flex items-center justify-center text-white">
                      <Edit3 size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white tracking-wide">在线编辑: {editingFile.path}</h3>
                      <p className="text-[10px] font-mono text-theme-text-muted uppercase mt-1">Target Template: {templateDetail.name}</p>
                    </div>
                  </div>
 <button onClick={() => setIsEditorOpen(false)} className="p-4 bg-slate-100/10 text-theme-text-muted hover:text-white hover:bg-theme-elevated rounded-2xl transition-all">
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 bg-black/40 relative">
                   <div className="absolute top-6 left-6 pointer-events-none z-10">
                      <Terminal size={20} className="text-theme-text-secondary" />
                   </div>
                   <textarea
                     className="w-full h-full p-12 pl-16 bg-transparent border-none outline-none font-mono text-xs text-blue-100/90 leading-relaxed resize-none custom-scrollbar"
                     value={editingFile.content}
                     onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                     spellCheck={false}
                   />
                </div>
 <div className="px-12 py-8 bg-slate-100/10 border-t border-slate-200/5 flex justify-end gap-6">
 <button onClick={() => setIsEditorOpen(false)} className="px-10 py-4 bg-slate-100/10 text-theme-text-muted rounded-2xl text-xs font-black uppercase transition-all hover:bg-theme-elevated">放弃更改</button>
                   <button
                     onClick={handleSaveFile}
                     disabled={isSavingFile}
 className="px-12 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase hover:bg-blue-500 transition-all disabled:opacity-50 flex items-center gap-3"
                   >
                      {isSavingFile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      提交并更新资源
                   </button>
                </div>
             </div>
          </div>
        )}
        {renderDeployModal()}
        {renderTemplateLlmModal()}
      </div>
      {feedbackNodes}
      </>
    );
  }

  return (
    <>
    <div className="p-10 space-y-10 animate-in fade-in duration-300 pb-24 h-full overflow-y-auto custom-scrollbar">
      <PageHeader
        title="环境模板管理"
        description="标准化、可复用的安全测试沙箱编排模版库"
        actions={<div className="flex gap-4">
            <button onClick={loadTemplates} className="p-4 bg-theme-bg-app border border-theme-border text-theme-text-muted rounded-2xl hover:bg-theme-elevated transition-all"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
            <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95"><Plus size={20} /> 上传新模版</button>
          </div>}
      />

      {/* Batch Action Bar */}
      {selectedNames.size > 0 && (
 <div className="bg-theme-surface px-8 py-5 rounded-[2rem] flex items-center justify-between animate-in slide-in-from-top-4">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><CheckCircle2 size={20} /></div>
              <span className="text-sm font-black text-white">已选中 {selectedNames.size} 个模版资源</span>
           </div>
           <div className="flex gap-4">
              <button onClick={openDeployModal} className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 transition-all">
                 <Zap size={16} /> 批量部署到 Agent
              </button>
              <button onClick={handleBatchDelete} className="px-6 py-3 bg-red-500/10 text-red-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500/20 transition-all">
                 <Trash2 size={16} /> 批量删除
              </button>
              <button onClick={() => setSelectedNames(new Set())} className="px-6 py-3 bg-slate-100/10 text-theme-text-muted rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition-all">取消选择</button>
           </div>
        </div>
      )}

      {/* Card Grid View */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint" size={20} />
 <input type="text" placeholder="检索模版名称、描述信息或文件类型..." className="w-full pl-16 pr-8 py-5 bg-theme-bg-app border border-theme-border rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 px-4 py-2 bg-theme-bg-app border border-theme-border rounded-xl text-xs font-black text-theme-text-secondary hover:bg-theme-elevated transition-all">
              {selectedNames.size === filteredTemplates.length && filteredTemplates.length > 0 ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} />}
              {selectedNames.size === filteredTemplates.length && filteredTemplates.length > 0 ? '取消全选' : '全选'}
            </button>
            <span className="text-xs font-medium text-theme-text-muted">共 {filteredTemplates.length} 个模板</span>
          </div>
        </div>
        {loading ? (
 <div className="bg-theme-bg-app border border-theme-border rounded-[2.5rem] p-12">
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-12 h-12 animate-spin text-blue-400 mb-4" />
              <span className="text-theme-text-secondary font-medium">正在加载模板...</span>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
 <div className="bg-theme-bg-app border border-theme-border rounded-[2.5rem] p-12">
            <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
              <Box size={64} className="mb-4 opacity-30" />
              <p className="text-lg font-black">暂无模板</p>
              <p className="text-sm mt-2">点击右上角"新建模版"按钮创建您的第一个环境模板</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredTemplates.map(t => {
              const parsedData = templatesParsedData[t.name];
              const compose = parsedData?.parsed_compose as ParsedCompose | undefined;
              const composeServices = Object.values((compose?.services || {}) as Record<string, any>) as any[];
              const totalPorts = composeServices.reduce((acc: number, s: any) => acc + (s.ports?.length || 0), 0);
              const cardWebPortPresets = getTemplateWebPortPresets(t);
              const canManageCard = canManageTemplate(t);
              const canCopyCard = canCopyTemplate(t);

              return (
                <div
                  key={t.name}
                  onClick={() => viewDetail(t.id)}
 className={`bg-theme-bg-app border-2 rounded-[2rem] overflow-hidden cursor-pointer transition-all group hover:border-blue-500/20 ${selectedNames.has(String(t.id)) ? 'border-blue-600 ring-4 ring-blue-500/5' : 'border-theme-border'}`}
                >
                  {/* Card Header */}
                  <div className="p-6 border-b border-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button
                          onClick={e => toggleSelect(t.id, e)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${selectedNames.has(String(t.id)) ? 'bg-blue-600 text-white' : 'bg-theme-bg-app text-theme-text-faint hover:bg-theme-elevated'}`}
                        >
                          {selectedNames.has(String(t.id)) ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-black text-theme-text-primary truncate">{t.name}</h3>
                            <StatusBadge status={t.type} />
                            <StatusBadge status={t.visibility === 'private' ? 'private' : 'shared'} />
                          </div>
                          {t.description && (
                            <p className="text-xs text-theme-text-muted mt-1 truncate">{t.description}</p>
                          )}
                          {t.owner_name && (
                            <p className="text-[10px] text-theme-text-muted mt-1 truncate">Owner: {t.owner_name}</p>
                          )}
                          {getTemplateTags(t).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {getTemplateTags(t).slice(0, 4).map((tag) => (
                                <span key={tag} className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-black">
                                  {tag}
                                </span>
                              ))}
                              {getTemplateTags(t).length > 4 && (
                                <span className="text-[10px] text-theme-text-muted font-black">+{getTemplateTags(t).length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Content - Structured Template Info */}
                  <div className="p-6 space-y-4">
                    {compose ? (
                      <>
                        {/* Services Summary */}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-500/15 rounded-lg flex items-center justify-center">
                            <Container size={16} className="text-blue-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest">服务</p>
                            <p className="text-sm font-black text-theme-text-primary">{Object.keys(compose.services || {}).length} 个服务</p>
                          </div>
                        </div>

                        {/* Ports Summary */}
                        {composeServices.some((s: any) => s.ports && s.ports.length > 0) && (
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-green-500/15 rounded-lg flex items-center justify-center shrink-0">
                              <Globe size={16} className="text-green-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest">端口映射</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {Object.entries(compose.services || {}).flatMap(([name, s]: [string, any]) =>
                                  (s.ports || []).slice(0, 4).map((p: any, i: number) => (
                                    <span key={`${name}-${i}`} className="text-[10px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded font-mono">
                                      {p.published}:{p.target}
                                    </span>
                                  ))
                                ).slice(0, 6)}
                                {totalPorts > 6 && (
                                  <span className="text-[10px] text-theme-text-muted">
                                    +{totalPorts - 6} 更多
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Networks & Volumes Summary */}
                        <div className="flex gap-4">
                          {compose.networks && Object.keys(compose.networks).length > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-purple-500/15 rounded-md flex items-center justify-center">
                                <Network size={12} className="text-purple-400" />
                              </div>
                              <span className="text-xs font-bold text-theme-text-secondary">{Object.keys(compose.networks).length} 网络</span>
                            </div>
                          )}
                          {compose.volumes && Object.keys(compose.volumes).length > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-orange-500/15 rounded-md flex items-center justify-center">
                                <HardDrive size={12} className="text-orange-400" />
                              </div>
                              <span className="text-xs font-bold text-theme-text-secondary">{Object.keys(compose.volumes).length} 卷</span>
                            </div>
                          )}
                        </div>

                        {/* Services List Preview */}
                        <div className="bg-theme-bg-app rounded-xl p-4">
                          <p className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest mb-2">服务列表</p>
                          <div className="space-y-1.5">
                            {Object.entries(compose.services || {}).slice(0, 3).map(([name, s]: [string, any]) => (
                              <div key={name} className="flex items-center gap-2 text-xs">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                <span className="font-bold text-theme-text-secondary">{name}</span>
                                {s.image && (
                                  <code className="text-[10px] text-theme-text-muted bg-theme-bg-app px-1.5 py-0.5 rounded truncate max-w-[120px]">{s.image}</code>
                                )}
                              </div>
                            ))}
                            {Object.keys(compose.services || {}).length > 3 && (
                              <p className="text-[10px] text-theme-text-muted pl-3.5">
                                +{Object.keys(compose.services || {}).length - 3} 更多服务
                              </p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (t.type === 'yaml' || t.type === 'archive') && !compose ? (
                      <div className="flex items-center gap-3 text-theme-text-muted">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs">正在解析模板...</span>
                      </div>
                    ) : null}

                  {cardWebPortPresets.length > 0 && (
                    <div className="bg-indigo-50/60 border border-indigo-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">WEB端口</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cardWebPortPresets.slice(0, 6).map((preset, idx) => (
                            <span key={`preset-${t.id}-${idx}`} className="text-[10px] bg-theme-bg-app text-indigo-400 px-2 py-0.5 rounded font-mono border border-indigo-500/20">
                              {(preset.name || 'WEB')}:{preset.port}/后端{String(preset.backend_protocol || preset.protocol || 'http').toUpperCase()}/Ingress{(preset.ingress_tls_enabled ?? preset.tls_enabled) !== false ? 'HTTPS' : 'HTTP'}
                            </span>
                          ))}
                          {cardWebPortPresets.length > 6 && (
                            <span className="text-[10px] text-theme-text-muted">+{cardWebPortPresets.length - 6} 更多</span>
                          )}
                      </div>
                    </div>
                  )}
                  {getTemplateCurrentMixBinding(t)?.provider_keys?.length ? (
                    <div className="bg-emerald-50/60 border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">当前 LLM 混合结果</p>
                      <div className="flex flex-wrap gap-1.5">
                        {getTemplateCurrentMixBinding(t)?.provider_keys.map((providerKey) => (
                          <span key={`${t.id}-${providerKey}`} className="text-[10px] bg-theme-bg-app text-emerald-400 px-2 py-0.5 rounded font-mono border border-emerald-500/20">
                            {providerKey}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                  {/* Card Footer */}
                  <div className="px-6 py-4 bg-slate-100/50 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-theme-text-muted">
                      <div className="flex items-center gap-1.5">
                        <Database size={12} />
                        <span>{(t.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={12} />
                        <span>{t.updated_at?.replace('T', ' ').slice(0, 16)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void openTemplateLlmModal(t);
                        }}
 className="px-2.5 py-2 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-blue-400 hover:border-blue-500/20 rounded-lg transition-all text-[11px] font-black"
                        title="打开 LLM Provider 混合配置弹框"
                      >
                        LLM混合
                      </button>
                      {canCopyCard && (
                        <button
                          onClick={(e) => handleCopyTemplate(t.id, e)}
 className="p-2 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-indigo-400 hover:border-indigo-500/20 rounded-lg transition-all"
                        >
                          <Layers size={14} />
                        </button>
                      )}
 <button className="p-2 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-blue-400 hover:border-blue-500/20 rounded-lg transition-all">
                        <Download size={14} />
                      </button>
                      {canManageCard && (
                        <button
                          onClick={(e) => handleDeleteTrigger(String(t.id), e)}
 className="p-2 bg-red-500/15 border border-red-500/20 text-red-400 hover:text-red-400 hover:border-red-500/20 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {renderDeployModal()}
      {renderTemplateLlmModal()}
      {/* Upload Template Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in">
 <div className={`bg-theme-bg-app w-full max-w-4xl rounded-[2.5rem] overflow-hidden flex flex-col animate-in zoom-in-95 transition-all duration-300 ${
            uploadTab === 'editor' ? 'h-[90vh]' : 'max-h-[80vh]'
          }`}>
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-slate-50 bg-slate-100/30 shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-blue-600/20">
                    <Upload size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-theme-text-primary tracking-tight">上传新模版</h3>
                    <p className="text-xs text-theme-text-muted mt-0.5 font-medium">支持 YAML 配置文件或压缩包上传</p>
                  </div>
                </div>
                <button
                  onClick={() => { setIsUploadModalOpen(false); resetUploadForm(); }}
 className="p-3 text-theme-text-muted hover:bg-theme-bg-app hover:text-theme-text-secondary rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Tab Switcher - 只在YAML类型时显示 */}
            {newTemplate.type === 'yaml' && (
              <div className="px-6 pt-4 bg-slate-100/30">
 <div className="flex gap-2 p-1 bg-theme-bg-app border border-theme-border rounded-xl w-fit">
                  <button
                    onClick={() => setUploadTab('file')}
                    className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${
                      uploadTab === 'file'
 ? 'bg-blue-600 text-white '
                        : 'text-theme-text-muted hover:bg-theme-elevated'
                    }`}
                  >
                    <Upload size={14} /> 文件上传
                  </button>
                  <button
                    onClick={() => setUploadTab('editor')}
                    className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${
                      uploadTab === 'editor'
 ? 'bg-blue-600 text-white '
                        : 'text-theme-text-muted hover:bg-theme-elevated'
                    }`}
                  >
                    <FileCode size={14} /> 在线编辑
                  </button>
                </div>
              </div>
            )}

            {/* Form Content */}
            <div className={`flex-1 overflow-y-auto bg-slate-50/20 custom-scrollbar ${uploadTab === 'editor' ? 'p-6' : 'p-6'}`}>
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                {/* Template Name */}
                <div>
                  <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                    模版名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="输入模版唯一标识符（如：pentest-v2-standard）"
 className="w-full px-5 py-3 bg-theme-bg-app border border-theme-border rounded-xl text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                    模版描述
                  </label>
                  <textarea
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    placeholder="简要说明模版用途、适用场景和安全基线标准..."
                    rows={2}
 className="w-full px-5 py-3 bg-theme-bg-app border border-theme-border rounded-xl text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                    TAG
                  </label>
                  <input
                    type="text"
                    value={stringifyTemplateTags(newTemplate.tags)}
                    onChange={(e) => setNewTemplate({ ...newTemplate, tags: normalizeTemplateTags(e.target.value) })}
                    placeholder="使用英文逗号分隔，例如：AI_AGENT_HELPER, INTERNAL"
 className="w-full px-5 py-3 bg-theme-bg-app border border-theme-border rounded-xl text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium"
                  />
                  <p className="text-[11px] text-theme-text-muted mt-2">模板 TAG 会用于分类、识别和自动化关联。</p>
                </div>

                {/* Template Type */}
                <div>
                  <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                    模版类型
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNewTemplate({ ...newTemplate, type: 'yaml' });
                        setUploadError(null);
                        setSelectedUploadFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className={`flex-1 px-5 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                        newTemplate.type === 'yaml'
                          ? 'bg-blue-500/15 border-blue-600 ring-4 ring-blue-500/5'
                          : 'bg-theme-bg-app border-theme-border hover:border-blue-500/20'
                      }`}
                    >
                      <FileCode size={18} className={newTemplate.type === 'yaml' ? 'text-blue-400' : 'text-theme-text-muted'} />
                      <span className={`text-sm font-black ${newTemplate.type === 'yaml' ? 'text-blue-400' : 'text-theme-text-secondary'}`}>
                        YAML 配置
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTemplate({ ...newTemplate, type: 'archive' });
                        setUploadTab('file'); // 压缩包只支持文件上传
                        setUploadError(null);
                        setSelectedUploadFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className={`flex-1 px-5 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                        newTemplate.type === 'archive'
                          ? 'bg-blue-500/15 border-blue-600 ring-4 ring-blue-500/5'
                          : 'bg-theme-bg-app border-theme-border hover:border-blue-500/20'
                      }`}
                    >
                      <FileArchive size={18} className={newTemplate.type === 'archive' ? 'text-blue-400' : 'text-theme-text-muted'} />
                      <span className={`text-sm font-black ${newTemplate.type === 'archive' ? 'text-blue-400' : 'text-theme-text-secondary'}`}>
                        压缩包
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                    模板可见性
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setNewTemplate({ ...newTemplate, visibility: 'shared' })}
                      className={`flex-1 px-5 py-3 rounded-xl border-2 transition-all text-sm font-black ${
                        newTemplate.visibility === 'shared'
                          ? 'bg-blue-500/15 border-blue-600 text-blue-400 ring-4 ring-blue-500/5'
                          : 'bg-theme-bg-app border-theme-border text-theme-text-secondary hover:border-blue-500/20'
                      }`}
                    >
                      共享模板
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewTemplate({ ...newTemplate, visibility: 'private' })}
                      className={`flex-1 px-5 py-3 rounded-xl border-2 transition-all text-sm font-black ${
                        newTemplate.visibility === 'private'
                          ? 'bg-blue-500/15 border-blue-600 text-blue-400 ring-4 ring-blue-500/5'
                          : 'bg-theme-bg-app border-theme-border text-theme-text-secondary hover:border-blue-500/20'
                      }`}
                    >
                      私有模板
                    </button>
                  </div>
                </div>

                <div className="bg-theme-bg-app border border-theme-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-theme-text-secondary uppercase tracking-widest">
                      WEB端口（可选）
                    </label>
                    <button
                      type="button"
                      onClick={addUploadWebPortPreset}
                      className="px-2.5 py-1.5 text-[11px] font-black rounded-lg bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated"
                    >
                      新增端口
                    </button>
                  </div>
                  {(newTemplate.web_port_presets || []).length === 0 && (
                    <p className="text-xs text-theme-text-muted">可分别定义 Ingress 访问协议与后端服务协议，后续服务详情可一键创建转发。</p>
                  )}
                  {(newTemplate.web_port_presets || []).map((preset, idx) => (
                    <div key={`upload-port-${idx}`} className="border border-theme-border rounded-xl p-2 space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <input
                          value={preset.name || ''}
                          onChange={(e) => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, name: e.target.value } : p)
                          }))}
                          placeholder="名称"
                          className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                        />
                        <input
                          value={preset.port || 0}
                          onChange={(e) => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, port: Number(e.target.value || 0) } : p)
                          }))}
                          type="number"
                          min={1}
                          max={65535}
                          placeholder="端口"
                          className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                        />
                        <select
                          value={preset.backend_protocol || preset.protocol || 'http'}
                          onChange={(e) => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? {
                              ...p,
                              protocol: (e.target.value === 'https' ? 'https' : 'http') as 'http' | 'https',
                              backend_protocol: (e.target.value === 'https' ? 'https' : 'http') as 'http' | 'https'
                            } : p)
                          }))}
                          className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg bg-theme-bg-app"
                        >
                          <option value="http">后端 HTTP</option>
                          <option value="https">后端 HTTPS</option>
                        </select>
                        <input
                          value={preset.path || '/'}
                          onChange={(e) => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, path: e.target.value } : p)
                          }))}
                          placeholder="Path"
                          className="col-span-2 px-2 py-2 text-xs border border-theme-border rounded-lg"
                        />
                        <input
                          value={preset.description || ''}
                          onChange={(e) => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, description: e.target.value } : p)
                          }))}
                          placeholder="说明"
                          className="col-span-3 px-2 py-2 text-xs border border-theme-border rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => setNewTemplate(prev => ({
                            ...prev,
                            web_port_presets: prev.web_port_presets.filter((_, i) => i !== idx)
                          }))}
                          className="col-span-1 px-2 py-2 text-xs font-black rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/15"
                        >
                          删除
                        </button>
                      </div>
                      <div className="flex items-center gap-4 px-1">
                        <label className="text-xs text-theme-text-secondary flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={preset.websocket_enabled !== false}
                            onChange={(e) => setNewTemplate(prev => ({
                              ...prev,
                              web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, websocket_enabled: e.target.checked } : p)
                            }))}
                          />
                          启用 WebSocket
                        </label>
                        <label className="text-xs text-theme-text-secondary flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={(preset.ingress_tls_enabled ?? preset.tls_enabled) !== false}
                            onChange={(e) => setNewTemplate(prev => ({
                              ...prev,
                              web_port_presets: prev.web_port_presets.map((p, i) => i === idx ? { ...p, tls_enabled: e.target.checked, ingress_tls_enabled: e.target.checked } : p)
                            }))}
                          />
                          Ingress 启用 HTTPS
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {/* File Upload or Editor */}
                {uploadTab === 'file' ? (
                  <div>
                    <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                      上传文件 <span className="text-red-500">*</span>
                    </label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOverUpload(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOverUpload(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOverUpload(false);
                      }}
                      onDrop={handleUploadDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-theme-bg-app ${
                        isDragOverUpload
                          ? 'border-blue-500 bg-blue-50/50'
                          : 'border-theme-border hover:border-blue-400'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={newTemplate.type === 'yaml' ? '.yaml,.yml' : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz,.tbz2,.tar.xz,.txz'}
                        className="hidden"
                        id="template-file-upload"
                        onChange={handleUploadInputChange}
                      />
                      <label htmlFor="template-file-upload" className="cursor-pointer">
                        <div className="w-14 h-14 bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Upload size={28} className="text-blue-400" />
                        </div>
                        <p className="text-sm font-black text-theme-text-secondary mb-1.5">
                          {newTemplate.type === 'yaml' ? '点击或拖拽上传 YAML 配置文件' : '点击或拖拽上传压缩包文件'}
                        </p>
                        <p className="text-xs text-theme-text-muted font-medium">
                          {getUploadAcceptHint()}
                        </p>
                      </label>
                      {selectedUploadFile && (
                        <div className="mt-4 mx-auto max-w-xl text-left bg-blue-500/15 border border-blue-500/20 rounded-lg p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-blue-400 truncate">{selectedUploadFile.name}</p>
                            <p className="text-[11px] text-blue-500 mt-0.5">
                              {(selectedUploadFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedUploadFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="px-3 py-1.5 text-[11px] font-black text-theme-text-secondary bg-theme-bg-app border border-theme-border rounded-lg hover:bg-theme-elevated"
                          >
                            清除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-black text-theme-text-secondary uppercase tracking-widest mb-2">
                      YAML 内容 <span className="text-red-500">*</span>
                    </label>
                    <div className="bg-theme-surface rounded-xl p-5 relative">
                      <div className="absolute top-6 left-6 pointer-events-none z-10">
                        <Terminal size={18} className="text-theme-text-secondary" />
                      </div>
                      <textarea
                        value={newTemplate.content}
                        onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                        placeholder={`# 请输入 YAML 配置内容
apiVersion: v1
kind: Pod
metadata:
  name: security-scan-job
spec:
  containers:
    - name: scanner
      image: security-scanner:latest
      ...`}
                        className="w-full bg-transparent border-none outline-none font-mono text-xs text-blue-100/90 leading-relaxed resize-none custom-scrollbar pl-8"
                        spellCheck={false}
                        style={{ height: 'calc(90vh - 420px)', minHeight: '300px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {uploadError && (
                  <div className="bg-red-500/15 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 bg-red-500/15 rounded-lg flex items-center justify-center shrink-0">
                      <AlertCircle size={18} className="text-red-400" />
                    </div>
                    <p className="text-sm font-black text-red-400">{uploadError}</p>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-theme-border bg-theme-bg-app flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setIsUploadModalOpen(false); resetUploadForm(); }}
                disabled={isUploading}
                className="px-8 py-3 bg-theme-elevated text-theme-text-secondary rounded-xl font-black hover:bg-theme-elevated transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUploadSubmit}
                disabled={isUploading || !newTemplate.name.trim()}
 className="px-10 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all flex items-center gap-2 min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    确认上传
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-bg-app w-full max-w-lg rounded-[3rem] overflow-hidden animate-in zoom-in-95">
            <div className="p-10">
              <div className="flex items-center gap-5 mb-6">
                <div className="w-16 h-16 bg-red-500/15 rounded-[1.5rem] flex items-center justify-center">
                  <AlertTriangle size={32} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-theme-text-primary">确认删除</h3>
                  <p className="text-sm text-theme-text-muted mt-1">此操作不可撤销</p>
                </div>
              </div>

              <p className="text-sm text-theme-text-secondary font-medium mb-4">
                即将删除以下模板：
              </p>
              <div className="bg-theme-bg-app rounded-2xl p-5 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {deleteConfirm.names.map(id => {
                  const templateName = templates.find((t) => t.id === Number(id))?.name || id;
                  return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-500/15 rounded-lg flex items-center justify-center shrink-0">
                      <Trash2 size={16} className="text-red-400" />
                    </div>
                    <span className="text-sm font-black text-theme-text-secondary">{templateName}</span>
                  </div>
                )})}
              </div>
            </div>

            <div className="p-10 pt-0 flex gap-4">
              <button
                onClick={() => setDeleteConfirm({ show: false, names: [] })}
                disabled={isDeleting}
                className="flex-1 px-8 py-4 bg-theme-elevated text-theme-text-secondary rounded-2xl font-black hover:bg-theme-elevated transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
 className="flex-1 px-8 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all flex items-center justify-center gap-3 shadow-red-500/20 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={20} />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {feedbackNodes}
    </>
  );
};
