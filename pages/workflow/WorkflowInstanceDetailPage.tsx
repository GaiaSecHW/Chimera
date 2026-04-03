import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, Play, Square, RefreshCw, Plus, Trash2, Settings, Terminal, Activity, FolderTree, Loader2, LogOut, RotateCcw, Clock, BarChart2, Database, AlertCircle, CheckCircle, XCircle, Zap, ExternalLink } from 'lucide-react';
import { api } from '../../clients/api';
import { WorkflowInstance, WorkflowNodeInstance, WorkflowStatus } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { XTerminal } from '../../components/XTerminal';
import { ProjectDirectoryPickerModal, ProjectDirectorySelection } from '../../components/ProjectDirectoryPickerModal';

const nodeColor = (status: WorkflowStatus) => {
  switch (status) {
    case 'succeeded': return '#10b981';
    case 'failed': return '#ef4444';
    case 'running': return '#3b82f6';
    case 'pending': return '#f59e0b';
    case 'stopped': return '#64748b';
    case 'ready': return '#10b981';
    case 'unready': return '#f97316';
    default: return '#cbd5e1';
  }
};

type MountSourceType = 'pvc' | 'project_file';

type NodeVolumeMountConfig = {
  mount_path: string;
  source_type: MountSourceType;
  pvc_name: string;
  sub_path?: string;
  read_only: boolean;
  subproject_id?: number | null;
  directory_id?: number | null;
  display_path?: string;
  subproject_name?: string;
  directory_name?: string | null;
};

const createNodeMountConfig = (mountPath: string, readOnly = true): NodeVolumeMountConfig => ({
  mount_path: mountPath,
  source_type: 'pvc',
  pvc_name: '',
  sub_path: '',
  read_only: readOnly,
  subproject_id: null,
  directory_id: null,
  display_path: '',
  subproject_name: '',
  directory_name: null,
});

const hasNodeMountSource = (mount: NodeVolumeMountConfig) => {
  if (mount.source_type === 'project_file') return Boolean(mount.subproject_id);
  return Boolean(mount.pvc_name);
};

export const WorkflowInstanceDetailPage: React.FC<{ instanceId: string, onBack: () => void }> = ({ instanceId, onBack }) => {
  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<any>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<any> | null>(null);
  const [selectedNodeTemplateDetails, setSelectedNodeTemplateDetails] = useState<any>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; right: number; bottom: number } | null>(null);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isUninitModalOpen, setIsUninitModalOpen] = useState(false);
  const [nodeLogs, setNodeLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // 新增：节点交互操作状态
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [nodeStatus, setNodeStatus] = useState<any>(null);
  const [nodeEvents, setNodeEvents] = useState<any[]>([]);
  const [nodeMetrics, setNodeMetrics] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [recreating, setRecreating] = useState(false);
  
  // 终端相关状态 (使用xterm.js)
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [terminalWs, setTerminalWs] = useState<WebSocket | null>(null);
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalPodName, setTerminalPodName] = useState<string>('');
  const [terminalNodeName, setTerminalNodeName] = useState<string>('');
  const [terminalPosition, setTerminalPosition] = useState({ x: 100, y: 100 });
  const [terminalIsMinimized, setTerminalIsMinimized] = useState(false);
  const [terminalIsMaximized, setTerminalIsMaximized] = useState(false);
  const [terminalZIndex, setTerminalZIndex] = useState(1000);
  const [terminalDragOffset, setTerminalDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingTerminal, setIsDraggingTerminal] = useState(false);

  const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState(false);
  const [isEditingNode, setIsEditingNode] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [addNodeStep, setAddNodeStep] = useState<'select' | 'configure'>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<{ id: string, name: string, type: 'app' | 'job' } | null>(null);
  const [templateDetails, setTemplateDetails] = useState<any>(null);
  const [newNodeConfig, setNewNodeConfig] = useState({
    name: '',
    env_vars: [] as { name: string, value: string }[],
    volume_mounts: [] as NodeVolumeMountConfig[],
    position: null as { x: number, y: number } | null,
    create_service: true,
    service_name: '',
    service_ports: [] as { name: string, port: number, target_port: number, protocol: string }[],
    service_type: 'ClusterIP' as 'ClusterIP' | 'NodePort' | 'LoadBalancer',
    create_ingress: false,
    ingress_type: '' as '' | 'nginx',
    ingress_host: '',
    ingress_ip: '',
    timeout_seconds: null as number | null
  });
  const [templates, setTemplates] = useState<{ id: string, name: string, type: 'app' | 'job' }[]>([]);
  const [pvcs, setPvcs] = useState<any[]>([]);
  const [directoryPickerTarget, setDirectoryPickerTarget] = useState<string | null>(null);
  // 访问服务相关状态
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [serviceAccessInfo, setServiceAccessInfo] = useState<any>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  
  const [initialNodes, setInitialNodes] = useState<Node[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);

  // 独立终端窗口状态
  interface FloatingTerminal {
    id: string;
    nodeId: string;
    nodeName: string;
    podName: string;
    ws: WebSocket | null;
    connected: boolean;
    isMinimized: boolean;
    isMaximized: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
  }
  const [floatingTerminals, setFloatingTerminals] = useState<FloatingTerminal[]>([]);
  const [maxZIndex, setMaxZIndex] = useState(1000);
  const [draggingTerminal, setDraggingTerminal] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Toast 状态
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  };

  const handleConfirmClose = () => {
    if (confirmDialog) {
      confirmDialog.onCancel();
    }
  };

  const loadInstance = async (updateBaseline = false) => {
    try {
      const data = await api.workflow.getInstance(instanceId);
      setInstance(data);
      
      // Transform nodes for React Flow
      const flowNodes: Node[] = (data.nodes || []).map((n: any, index: number) => ({
        id: n.id,
        type: 'default',
        position: n.position || { x: 250, y: index * 100 + 50 },
        data: { 
          label: (
            <div className="flex flex-col items-center p-2">
              <div className="font-bold text-sm">{n.name}</div>
              <div className="text-[10px] text-slate-500 uppercase">{n.node_type}</div>
              <div className="mt-2">
                <StatusBadge status={n.status} />
              </div>
            </div>
          ),
          ...n
        },
        style: {
          border: `2px solid ${nodeColor(n.status)}`,
          borderRadius: '12px',
          padding: '10px',
          background: '#fff',
          minWidth: '150px'
        }
      }));

      // Transform edges
      let flowEdges: Edge[] = [];
      if (data.edges && data.edges.length > 0) {
        flowEdges = data.edges.map((e: any) => ({
          id: e.edge_id || `${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          animated: data.status === 'running',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#94a3b8', strokeWidth: 2 }
        }));
      } else {
        // Fallback to depends_on
        (data.nodes || []).forEach((n: any) => {
          if (n.depends_on && n.depends_on.length > 0) {
            n.depends_on.forEach((dep: string) => {
              flowEdges.push({
                id: `${dep}-${n.id}`,
                source: dep,
                target: n.id,
                animated: data.status === 'running',
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: '#94a3b8', strokeWidth: 2 }
              });
            });
          }
        });
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
      
      if (updateBaseline) {
        setInitialNodes(flowNodes);
        setInitialEdges(flowEdges);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const [appRes, jobRes] = await Promise.all([
        api.workflow.listAppTemplates({ project_id: instance?.project_id }),
        api.workflow.listJobTemplates({ project_id: instance?.project_id })
      ]);
      const appTmpls = (appRes.items || []).map(t => ({ id: t.id, name: t.name, type: 'app' as const }));
      const jobTmpls = (jobRes.items || []).map(t => ({ id: t.id, name: t.name, type: 'job' as const }));
      setTemplates([...appTmpls, ...jobTmpls]);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPvcs = async () => {
    if (!instance?.project_id) return;
    try {
      const res = await api.resources.getPVCs(instance.project_id);
      setPvcs(res.pvcs || []);
    } catch (e) {
      console.error(e);
    }
  };

  const splitNodeMountPayloads = (mounts: NodeVolumeMountConfig[]) => {
    const volume_mounts = mounts
      .filter((mount) => mount.source_type === 'pvc' && mount.pvc_name)
      .map((mount) => ({
        pvc_name: mount.pvc_name,
        mount_path: mount.mount_path,
        sub_path: mount.sub_path || '',
        read_only: mount.read_only,
      }));
    const project_file_mounts = mounts
      .filter((mount) => mount.source_type === 'project_file' && mount.subproject_id)
      .map((mount) => ({
        subproject_id: mount.subproject_id as number,
        directory_id: mount.directory_id ?? null,
        mount_path: mount.mount_path,
        read_only: mount.read_only,
        display_path: mount.display_path,
        subproject_name: mount.subproject_name,
        directory_name: mount.directory_name ?? null,
      }));
    return { volume_mounts, project_file_mounts };
  };

  const buildTemplateMountConfigs = (details: any, nodeDetails?: any): NodeVolumeMountConfig[] => {
    const volumeMounts: NodeVolumeMountConfig[] = [];
    details.containers.forEach((container: any) => {
      (container.input_volume_mounts || []).forEach((mount: any) => {
        if (volumeMounts.find((item) => item.mount_path === mount.mount_path)) {
          return;
        }
        const existingPvc = nodeDetails?.volume_mounts?.find((vm: any) => vm.mount_path === mount.mount_path);
        const existingProject = nodeDetails?.project_file_mounts?.find((vm: any) => vm.mount_path === mount.mount_path);
        if (existingProject) {
          volumeMounts.push({
            mount_path: mount.mount_path,
            source_type: 'project_file',
            pvc_name: '',
            sub_path: '',
            read_only: existingProject.read_only ?? mount.read_only ?? true,
            subproject_id: existingProject.subproject_id,
            directory_id: existingProject.directory_id ?? null,
            display_path: existingProject.display_path || '/',
            subproject_name: existingProject.subproject_name || '',
            directory_name: existingProject.directory_name ?? null,
          });
          return;
        }
        volumeMounts.push({
          ...createNodeMountConfig(mount.mount_path, existingPvc?.read_only ?? mount.read_only ?? true),
          pvc_name: existingPvc?.pvc_name || '',
          sub_path: existingPvc?.sub_path || '',
        });
      });
    });
    return volumeMounts;
  };

  useEffect(() => {
    loadInstance();
    const interval = setInterval(() => {
      if (!isEditMode) {
        loadInstance();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [instanceId, isEditMode]);

  useEffect(() => {
    if (isAddNodeModalOpen) {
      loadTemplates();
    }
  }, [isAddNodeModalOpen]);

  const onConnect = useCallback((params: Connection) => {
    if (!isEditMode) return;
    const newEdge: Edge = {
      ...params,
      id: `edge-${params.source}-${params.target}`,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [setEdges, isEditMode]);

  const hasChanges = () => {
    if (nodes.length !== initialNodes.length) return true;
    if (edges.length !== initialEdges.length) return true;

    const getNodeData = (n: Node) => ({
      id: n.id,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: {
        name: n.data.name,
        node_type: n.data.node_type,
        template_id: n.data.template_id,
        env_vars: n.data.env_vars,
        volume_mounts: n.data.volume_mounts
      }
    });

    const getEdgeData = (e: Edge) => ({
      source: e.source,
      target: e.target
    });

    const initialNodeMap = new Map(initialNodes.map(n => [n.id, getNodeData(n)]));
    const initialEdgeMap = new Map(initialEdges.map(e => [`${e.source}-${e.target}`, getEdgeData(e)]));

    for (const node of nodes) {
      const initial = initialNodeMap.get(node.id);
      if (!initial) return true;
      if (JSON.stringify(getNodeData(node)) !== JSON.stringify(initial)) return true;
    }

    for (const edge of edges) {
      const key = `${edge.source}-${edge.target}`;
      if (!initialEdgeMap.has(key)) return true;
    }

    return false;
  };

  const handleExitEdit = () => {
    if (hasChanges()) {
      setShowUnsavedChangesModal(true);
    } else {
      setIsEditMode(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // 1. Get current state from backend
      const currentInstance = await api.workflow.getInstance(instanceId);
      const currentNodes = currentInstance.nodes || [];
      const currentEdges = currentInstance.edges || [];
      
      // 2. Process Nodes (Create/Update/Delete)
      // Nodes to delete
      const flowNodeIds = new Set(nodes.map(n => n.id));
      for (const cn of currentNodes) {
        if (!flowNodeIds.has(cn.id)) {
          await api.workflow.deleteNode(instanceId, cn.id);
        }
      }

      // Nodes to create/update
      for (const node of nodes) {
        const existingNode = currentNodes.find((n: any) => n.id === node.id);
        if (existingNode) {
          await api.workflow.updateNode(instanceId, existingNode.id, {
            name: node.data.name,
            position: node.position
          });
        } else {
          // This case should be handled by handleCreateNode now, 
          // but keeping it as fallback for any nodes added via other means
          await api.workflow.createNode(instanceId, {
            node_type: node.data.node_type,
            template_id: node.data.template_id,
            name: node.data.name,
            position: node.position
          });
        }
      }

      // 3. Process Edges (Add/Delete)
      // Edges to delete
      for (const ce of currentEdges) {
        const stillExists = edges.find(e => e.source === ce.source && e.target === ce.target);
        if (!stillExists) {
          await api.workflow.updateEdge(instanceId, {
            edge_id: ce.edge_id,
            action: 'delete'
          });
        }
      }

      // Edges to add
      for (const fe of edges) {
        const alreadyExists = currentEdges.find(e => e.source === fe.source && e.target === fe.target);
        if (!alreadyExists) {
          await api.workflow.updateEdge(instanceId, {
            edge_id: fe.id,
            source: fe.source,
            target: fe.target,
            action: 'add'
          });
        }
      }
      
      await loadInstance(true);
      showToast("保存成功", "success");
    } catch (e: any) {
      showToast("保存失败: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = async (template: { id: string, name: string, type: 'app' | 'job' }) => {
    try {
      setLoading(true);
      const [details, _] = await Promise.all([
        template.type === 'app' ? api.workflow.getAppTemplate(template.id, instance?.project_id) : api.workflow.getJobTemplate(template.id, instance?.project_id),
        loadPvcs()
      ]);
      
      setSelectedTemplate(template);
      setTemplateDetails(details);
      
      // Initialize config with required inputs
      const envVars: { name: string, value: string }[] = [];

      const servicePorts: { name: string, port: number, target_port: number, protocol: string }[] = [];
      details.containers.forEach((c: any) => {
        if (c.input_env_vars) {
          c.input_env_vars.forEach((iv: any) => {
            if (!envVars.find(e => e.name === iv.name)) {
              envVars.push({ name: iv.name, value: iv.default_value || '' });
            }
          });
        }
        if (c.ports) {
          c.ports.forEach((p: any) => {
            if (!servicePorts.find(sp => sp.port === p.container_port)) {
              servicePorts.push({
                name: p.name || `port-${p.container_port}`,
                port: p.container_port,
                target_port: p.container_port,
                protocol: p.protocol || 'TCP'
              });
            }
          });
        }
      });
      
      const autoServiceName = template.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const volumeMounts = buildTemplateMountConfigs(details);
      
      setNewNodeConfig({
        name: template.name,
        env_vars: envVars,
        volume_mounts: volumeMounts,
        position: null,
        create_service: template.type === 'app',
        service_name: template.type === 'app' ? autoServiceName : '',
        service_ports: template.type === 'app' ? servicePorts : [],
        service_type: 'ClusterIP',
        create_ingress: false,
        ingress_type: '',
        ingress_host: '',
        ingress_ip: '',
        timeout_seconds: null
      });
      
      setAddNodeStep('configure');
    } catch (e) {
      console.error(e);
      showToast("获取模板详情失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNode = async () => {
    if (!selectedTemplate || !newNodeConfig.name) {
      showToast("请填写完整信息", "warning");
      return;
    }

    // Validation
    const missingEnvVars = newNodeConfig.env_vars.filter(e => !e.value);
    const missingVolumes = newNodeConfig.volume_mounts.filter(v => !hasNodeMountSource(v));

    if (missingEnvVars.length > 0 || missingVolumes.length > 0) {
      let errorMsg = "请完善以下必填项:\n";
      if (missingEnvVars.length > 0) {
        errorMsg += "\n环境变量:\n" + missingEnvVars.map(e => ` - ${e.name}`).join('\n');
      }
      if (missingVolumes.length > 0) {
        errorMsg += "\n存储挂载:\n" + missingVolumes.map(v => ` - ${v.mount_path}`).join('\n');
      }
      showToast(errorMsg, "error");
      return;
    }

    if (selectedTemplate.type === 'app' && newNodeConfig.create_service) {
      if (!newNodeConfig.service_name || !newNodeConfig.service_name.trim()) {
        showToast("服务名称不能为空", "warning");
        return;
      }
      if (newNodeConfig.service_ports.length === 0) {
        showToast("请至少添加一个服务端口", "warning");
        return;
      }
      const invalidPorts = newNodeConfig.service_ports.filter(sp => !sp.port || !sp.target_port);
      if (invalidPorts.length > 0) {
        showToast("服务端口配置不完整，请检查端口号", "warning");
        return;
      }
    }
      if (newNodeConfig.create_ingress && newNodeConfig.ingress_type !== 'nginx') {
        showToast("请选择 Nginx Ingress 类型", "warning");
        return;
      }

    try {
      setLoading(true);
      const mountPayloads = splitNodeMountPayloads(newNodeConfig.volume_mounts);
      
      if (isEditingNode && editingNodeId) {
        await api.workflow.updateNode(instanceId, editingNodeId, {
          name: newNodeConfig.name,
          env_vars: newNodeConfig.env_vars.filter(e => e.value),
          volume_mounts: mountPayloads.volume_mounts,
          project_file_mounts: mountPayloads.project_file_mounts,
          create_service: newNodeConfig.create_service,
          service_name: newNodeConfig.create_service ? newNodeConfig.service_name : undefined,
          service_ports: newNodeConfig.create_service ? newNodeConfig.service_ports : [],
          service_type: newNodeConfig.create_service ? newNodeConfig.service_type : undefined,
          create_ingress: newNodeConfig.create_service ? newNodeConfig.create_ingress : false,
          ingress_type: newNodeConfig.create_service && newNodeConfig.create_ingress ? 'nginx' : undefined,
        });
        showToast("更新成功", "success");
      } else {
        const payload: any = {
          node_type: selectedTemplate.type,
          template_id: selectedTemplate.id,
          name: newNodeConfig.name,
          position: newNodeConfig.position || { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
          env_vars: newNodeConfig.env_vars.filter(e => e.value),
          volume_mounts: mountPayloads.volume_mounts,
          project_file_mounts: mountPayloads.project_file_mounts
        };
        
        if (selectedTemplate.type === 'app') {
          payload.create_service = newNodeConfig.create_service;
          if (newNodeConfig.create_service) {
            payload.service_name = newNodeConfig.service_name;
            payload.service_ports = newNodeConfig.service_ports;
            payload.service_type = newNodeConfig.service_type;
            payload.create_ingress = newNodeConfig.create_ingress;
            if (newNodeConfig.create_ingress) {
              payload.ingress_type = 'nginx';
            }
          }
        }
        
        if (newNodeConfig.timeout_seconds) {
          payload.timeout_seconds = newNodeConfig.timeout_seconds;
        }
        
        await api.workflow.createNode(instanceId, payload);
        showToast("创建成功", "success");
      }
      
      setIsAddNodeModalOpen(false);
      setIsEditingNode(false);
      setEditingNodeId(null);
      setAddNodeStep('select');
      setSelectedTemplate(null);
      setTemplateDetails(null);
      setDirectoryPickerTarget(null);
      await loadInstance();
    } catch (e: any) {
      let errorMsg = (isEditingNode ? "更新" : "创建") + "节点失败: " + e.message;
      if (e.details && Array.isArray(e.details)) {
        errorMsg += "\n\n详细错误信息:\n";
        e.details.forEach((d: any) => {
           errorMsg += ` - [${d.type}] ${d.container}: ${d.message}\n`;
        });
      }
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const onNodeClick = async (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedNodeTemplateDetails(null);
    setLoadingTemplate(true);
    try {
      let details;
      if (node.data.node_type === 'app') {
        details = await api.workflow.getAppTemplate(node.data.template_id as string, instance?.project_id);
      } else {
        details = await api.workflow.getJobTemplate(node.data.template_id as string, instance?.project_id);
      }
      setSelectedNodeTemplateDetails(details);
    } catch (e) {
      console.error("Failed to load template details for node:", e);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setMenu(null);
  };

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setMenu({
        id: node.id,
        top: event.clientY,
        left: event.clientX,
        right: window.innerWidth - event.clientX,
        bottom: window.innerHeight - event.clientY,
      });
    },
    [setMenu]
  );

  const handleUninitialize = async () => {
    try {
      setLoading(true);
      await api.workflow.uninitializeInstance(instanceId);
      setIsUninitModalOpen(false);
      await loadInstance();
      showToast("反初始化成功", "success");
    } catch (e: any) {
      showToast("反初始化失败: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNode = async (nodeId: string) => {
    setMenu(null);
    try {
      setLoading(true);
      // 1. Fetch the latest node details from backend
      const nodeDetails = await api.workflow.getNode(instanceId, nodeId);
      
      setIsEditingNode(false);
      setEditingNodeId(null);
      
      // 2. Fetch template details to know what inputs are required
      let details;
      if (nodeDetails.node_type === 'app') {
        details = await api.workflow.getAppTemplate(nodeDetails.template_id, instance?.project_id);
      } else {
        details = await api.workflow.getJobTemplate(nodeDetails.template_id, instance?.project_id);
      }
      
      await loadPvcs();
      
      setSelectedTemplate({ id: nodeDetails.template_id, name: details.name, type: nodeDetails.node_type });
      setTemplateDetails(details);
      
      // 3. Populate config from node details
      const envVars: { name: string, value: string }[] = [];

      details.containers.forEach((c: any) => {
        if (c.input_env_vars) {
          c.input_env_vars.forEach((iv: any) => {
            if (!envVars.find(e => e.name === iv.name)) {
              const existingValue = nodeDetails.env_vars?.find((ev: any) => ev.name === iv.name);
              envVars.push({ name: iv.name, value: existingValue?.value || iv.default_value || '' });
            }
          });
        }
      });
      const volumeMounts = buildTemplateMountConfigs(details, nodeDetails);

      setNewNodeConfig({
        name: `${nodeDetails.name} (Copy)`,
        env_vars: envVars,
        volume_mounts: volumeMounts,
        position: { 
          x: (nodeDetails.position?.x || 0) + 50, 
          y: (nodeDetails.position?.y || 0) + 50 
        },
        create_service: nodeDetails.create_service ?? true,
        service_name: nodeDetails.service_name || '',
        service_ports: nodeDetails.service_ports || [],
        service_type: nodeDetails.service_type || 'ClusterIP',
        create_ingress: nodeDetails.create_ingress ?? Boolean(nodeDetails.ingress_type),
        ingress_type: nodeDetails.ingress_type || '',
        ingress_host: nodeDetails.ingress_host || '',
        ingress_ip: nodeDetails.ingress_ip || '',
        timeout_seconds: nodeDetails.timeout_seconds || null
      });
      
      setAddNodeStep('configure');
      setIsAddNodeModalOpen(true);
    } catch (e: any) {
      showToast("复制节点失败: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleViewLogs = async (nodeId: string) => {
    setMenu(null);
    setIsLogsModalOpen(true);
    setLoadingLogs(true);
    setNodeLogs('');
    try {
      const res = await api.workflow.getNodeLogs(instanceId, nodeId);
      setNodeLogs(res.logs || '暂无日志');
    } catch (e: any) {
      setNodeLogs("获取日志失败: " + e.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  // 新增：获取节点状态
  const handleViewStatus = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }
    
    setIsStatusModalOpen(true);
    setLoadingStatus(true);
    setNodeStatus(null);
    
    try {
      // 获取Pod列表
      const podsRes = await api.k8s.getPods(instance.project_id, `app=${node.data.k8s_resource_name}`);
      if (podsRes.items && podsRes.items.length > 0) {
        const podName = podsRes.items[0].name;
        const status = await api.k8s.getPodStatus(instance.project_id, podName);
        setNodeStatus(status);
      } else {
        setNodeStatus({ error: "未找到运行的Pod" });
      }
    } catch (e: any) {
      setNodeStatus({ error: "获取状态失败: " + e.message });
    } finally {
      setLoadingStatus(false);
    }
  };

  // 新增：获取节点事件
  const handleViewEvents = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }
    
    setIsEventsModalOpen(true);
    setLoadingEvents(true);
    setNodeEvents([]);
    
    try {
      const podsRes = await api.k8s.getPods(instance.project_id, `app=${node.data.k8s_resource_name}`);
      if (podsRes.items && podsRes.items.length > 0) {
        const podName = podsRes.items[0].name;
        const eventsRes = await api.k8s.getPodEvents(instance.project_id, podName);
        setNodeEvents(eventsRes.events || []);
      }
    } catch (e: any) {
      console.error("获取事件失败:", e);
    } finally {
      setLoadingEvents(false);
    }
  };

  // 新增：获取节点资源指标
  const handleViewMetrics = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }
    
    setIsMetricsModalOpen(true);
    setLoadingMetrics(true);
    setNodeMetrics(null);
    
    try {
      const podsRes = await api.k8s.getPods(instance.project_id, `app=${node.data.k8s_resource_name}`);
      if (podsRes.items && podsRes.items.length > 0) {
        const podName = podsRes.items[0].name;
        const metrics = await api.k8s.getPodMetrics(instance.project_id, podName);
        setNodeMetrics(metrics);
      } else {
        setNodeMetrics({ error: "未找到运行的Pod" });
      }
    } catch (e: any) {
      setNodeMetrics({ error: "获取指标失败: " + e.message });
    } finally {
      setLoadingMetrics(false);
    }
  };

  // 新增：重启节点（APP类型）
  const handleRestartNode = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }

    if (!(await showConfirm(`确定要重启节点 "${node.data.name}" 吗？`))) return;

    setRestarting(true);
    try {
      await api.k8s.restartDeployment(instance.project_id, node.data.k8s_resource_name);
      showToast("重启命令已发送", "success");
      loadInstance();
    } catch (e: any) {
      showToast("重启失败: " + e.message, "error");
    } finally {
      setRestarting(false);
    }
  };

  // 新增：重试节点（JOB类型）
  const handleRetryNode = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }

    if (!(await showConfirm(`确定要重试任务 "${node.data.name}" 吗？这将删除并重建Job。`))) return;

    setRecreating(true);
    try {
      await api.k8s.recreateJob(instance.project_id, node.data.k8s_resource_name);
      showToast("重试命令已发送", "success");
      loadInstance();
    } catch (e: any) {
      showToast("重试失败: " + e.message, "error");
    } finally {
      setRecreating(false);
    }
  };

  // 新增：打开终端 (使用xterm.js)
  const handleOpenTerminal = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;

    // 检查是否已有任何终端窗口打开（进入终端或新开终端）
    const hasOpenTerminal = isTerminalModalOpen || floatingTerminals.length > 0;
    if (hasOpenTerminal) {
      // 恢复并聚焦已打开的终端窗口
      if (isTerminalModalOpen && terminalIsMinimized) {
        setTerminalIsMinimized(false);
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);
        setTerminalZIndex(newZIndex);
      } else if (floatingTerminals.length > 0) {
        // 恢复并聚焦第一个最小化的浮动终端
        const minimizedTerminal = floatingTerminals.find(t => t.isMinimized);
        if (minimizedTerminal) {
          handleRestoreTerminal(minimizedTerminal.id);
        } else {
          // 聚焦第一个浮动终端
          handleFocusTerminal(floatingTerminals[0].id);
        }
      }
      showToast("已有终端窗口打开，请先关闭当前终端后再打开新终端", "warning");
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }

    try {
      // 获取Pod列表
      const podsRes = await api.k8s.getPods(instance.project_id, `app=${node.data.k8s_resource_name}`);
      if (podsRes.items && podsRes.items.length > 0) {
        const firstPod = podsRes.items[0];
        const podName = firstPod.name;
        // 获取第一个容器的名称（K8s exec API 要求必须指定容器）
        const containerName = firstPod.containers?.[0]?.name;
        setTerminalPodName(podName);
        setTerminalNodeName(node.data.name as string);
        setIsTerminalModalOpen(true);
        setTerminalConnected(false);
        // 重置窗口状态
        setTerminalPosition({ x: 100, y: 100 });
        setTerminalIsMinimized(false);
        setTerminalIsMaximized(false);
        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);
        setTerminalZIndex(newZIndex);

        // 创建WebSocket连接，传递容器名称
        const ws = api.workflow.createTerminalProxyConnection(instance.project_id, podName, containerName);

        ws.onopen = () => {
          setTerminalConnected(true);
        };

        ws.onerror = () => {
          setTerminalConnected(false);
        };

        ws.onclose = () => {
          setTerminalConnected(false);
        };

        setTerminalWs(ws);
      } else {
        showToast("未找到运行的Pod", "warning");
      }
    } catch (e: any) {
      showToast("获取Pod失败: " + e.message, "error");
    }
  };

  // 关闭终端
  const handleCloseTerminal = () => {
    if (terminalWs) {
      terminalWs.close();
      setTerminalWs(null);
    }
    setIsTerminalModalOpen(false);
    setTerminalConnected(false);
    setTerminalPodName('');
    setTerminalNodeName('');
    setTerminalIsMinimized(false);
    setTerminalIsMaximized(false);
  };

  // 终端窗口拖拽
  const handleTerminalStartDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (terminalIsMaximized) return;

    setIsDraggingTerminal(true);
    setTerminalDragOffset({
      x: e.clientX - terminalPosition.x,
      y: e.clientY - terminalPosition.y
    });
    // 聚焦窗口
    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);
    setTerminalZIndex(newZIndex);
  };

  // 终端窗口拖拽 useEffect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTerminal) return;
      setTerminalPosition({
        x: e.clientX - terminalDragOffset.x,
        y: e.clientY - terminalDragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDraggingTerminal(false);
    };

    if (isDraggingTerminal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTerminal, terminalDragOffset]);

  // 新开独立终端窗口
  const handleOpenNewTerminal = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;

    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.k8s_resource_name) {
      showToast("节点尚未创建K8S资源", "warning");
      return;
    }

    try {
      // 获取Pod列表
      const podsRes = await api.k8s.getPods(instance.project_id, `app=${node.data.k8s_resource_name}`);
      if (podsRes.items && podsRes.items.length > 0) {
        const firstPod = podsRes.items[0];
        const podName = firstPod.name;
        const containerName = firstPod.containers?.[0]?.name;

        // 创建WebSocket连接
        const ws = api.workflow.createTerminalProxyConnection(instance.project_id, podName, containerName);

        const newZIndex = maxZIndex + 1;
        setMaxZIndex(newZIndex);

        const terminalId = `terminal-${Date.now()}`;

        const newTerminal: FloatingTerminal = {
          id: terminalId,
          nodeId: nodeId,
          nodeName: node.data.name as string,
          podName: podName,
          ws: ws,
          connected: false,
          isMinimized: false,
          isMaximized: false,
          position: { x: 50 + (floatingTerminals.length * 30), y: 50 + (floatingTerminals.length * 30) },
          size: { width: 900, height: 600 },
          zIndex: newZIndex
        };

        ws.onopen = () => {
          setFloatingTerminals(prev => prev.map(t =>
            t.id === terminalId ? { ...t, connected: true } : t
          ));
        };

        ws.onerror = () => {
          setFloatingTerminals(prev => prev.map(t =>
            t.id === terminalId ? { ...t, connected: false } : t
          ));
        };

        ws.onclose = () => {
          setFloatingTerminals(prev => prev.map(t =>
            t.id === terminalId ? { ...t, connected: false } : t
          ));
        };

        setFloatingTerminals(prev => [...prev, newTerminal]);
      } else {
        showToast("未找到运行的Pod", "warning");
      }
    } catch (e: any) {
      showToast("获取Pod失败: " + e.message, "error");
    }
  };

  // 关闭独立终端窗口
  const handleCloseFloatingTerminal = (terminalId: string) => {
    setFloatingTerminals(prev => {
      const terminal = prev.find(t => t.id === terminalId);
      if (terminal?.ws) {
        terminal.ws.close();
      }
      return prev.filter(t => t.id !== terminalId);
    });
  };

  // 最小化终端窗口
  const handleMinimizeTerminal = (terminalId: string) => {
    setFloatingTerminals(prev => prev.map(t =>
      t.id === terminalId ? { ...t, isMinimized: true } : t
    ));
  };

  // 恢复终端窗口
  const handleRestoreTerminal = (terminalId: string) => {
    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);
    setFloatingTerminals(prev => prev.map(t =>
      t.id === terminalId ? { ...t, isMinimized: false, zIndex: newZIndex } : t
    ));
  };

  // 最大化终端窗口
  const handleMaximizeTerminal = (terminalId: string) => {
    setFloatingTerminals(prev => prev.map(t =>
      t.id === terminalId ? { ...t, isMaximized: true } : t
    ));
  };

  // 还原最大化终端窗口
  const handleUnmaximizeTerminal = (terminalId: string) => {
    setFloatingTerminals(prev => prev.map(t =>
      t.id === terminalId ? { ...t, isMaximized: false } : t
    ));
  };

  // 聚焦终端窗口
  const handleFocusTerminal = (terminalId: string) => {
    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);
    setFloatingTerminals(prev => prev.map(t =>
      t.id === terminalId ? { ...t, zIndex: newZIndex } : t
    ));
  };

  // 拖拽终端窗口
  const handleStartDrag = (e: React.MouseEvent, terminalId: string) => {
    if ((e.target as HTMLElement).closest('button')) return; // 不拦截按钮点击

    const terminal = floatingTerminals.find(t => t.id === terminalId);
    if (!terminal || terminal.isMaximized) return;

    setDraggingTerminal(terminalId);
    setDragOffset({
      x: e.clientX - terminal.position.x,
      y: e.clientY - terminal.position.y
    });
    handleFocusTerminal(terminalId);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingTerminal) return;

      setFloatingTerminals(prev => prev.map(t =>
        t.id === draggingTerminal
          ? { ...t, position: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } }
          : t
      ));
    };

    const handleMouseUp = () => {
      setDraggingTerminal(null);
    };

    if (draggingTerminal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTerminal, dragOffset]);

  // 新增：访问服务
  const handleAccessService = async (nodeId: string) => {
    setMenu(null);
    if (!instance?.project_id) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.data.service_name) {
      showToast("该节点未创建Service，无法直接访问", "warning");
      return;
    }
    
    setIsAccessModalOpen(true);
    setLoadingAccess(true);
    setServiceAccessInfo(null);
    
    try {
      const accessInfo = await api.workflow.getNodeAccessInfo(instanceId, nodeId);
      setServiceAccessInfo(accessInfo);
    } catch (e: any) {
      setServiceAccessInfo({ error: "获取访问信息失败: " + e.message });
    } finally {
      setLoadingAccess(false);
    }
  };

  // 打开服务代理URL
  const handleOpenProxyUrl = (port: number, path: string = '/') => {
    if (!instance?.project_id || !serviceAccessInfo?.name) return;
    const url = api.k8s.proxyServiceUrl(instance.project_id, serviceAccessInfo.name, port, path);
    window.open(url, '_blank');
  };

  const handleModifyNode = async (nodeId: string) => {
    setMenu(null);
    try {
      setLoading(true);
      // 1. Fetch the latest node details from backend
      const nodeDetails = await api.workflow.getNode(instanceId, nodeId);
      
      setIsEditingNode(true);
      setEditingNodeId(nodeDetails.id); // The backend ID
      
      // 2. Fetch template details to know what inputs are required
      let details;
      if (nodeDetails.node_type === 'app') {
        details = await api.workflow.getAppTemplate(nodeDetails.template_id, instance?.project_id);
      } else {
        details = await api.workflow.getJobTemplate(nodeDetails.template_id, instance?.project_id);
      }
      
      await loadPvcs();
      
      setSelectedTemplate({ id: nodeDetails.template_id, name: details.name, type: nodeDetails.node_type });
      setTemplateDetails(details);
      
      // 3. Populate config from node details
      // We merge the template's required inputs with the node's provided values
      const envVars: { name: string, value: string }[] = [];

      details.containers.forEach((c: any) => {
        if (c.input_env_vars) {
          c.input_env_vars.forEach((iv: any) => {
            if (!envVars.find(e => e.name === iv.name)) {
              const existingValue = nodeDetails.env_vars?.find((ev: any) => ev.name === iv.name);
              envVars.push({ name: iv.name, value: existingValue?.value || iv.default_value || '' });
            }
          });
        }
      });
      const volumeMounts = buildTemplateMountConfigs(details, nodeDetails);

      setNewNodeConfig({
        name: nodeDetails.name,
        env_vars: envVars,
        volume_mounts: volumeMounts,
        position: null,
        create_service: nodeDetails.create_service ?? true,
        service_name: nodeDetails.service_name || '',
        service_ports: nodeDetails.service_ports || [],
        service_type: nodeDetails.service_type || 'ClusterIP',
        create_ingress: nodeDetails.create_ingress ?? Boolean(nodeDetails.ingress_type),
        ingress_type: nodeDetails.ingress_type || '',
        ingress_host: nodeDetails.ingress_host || '',
        ingress_ip: nodeDetails.ingress_ip || '',
        timeout_seconds: nodeDetails.timeout_seconds || null
      });
      
      setAddNodeStep('configure');
      setIsAddNodeModalOpen(true);
    } catch (e: any) {
      showToast("获取节点详情失败: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNode = (nodeId?: string) => {
    const idToDelete = nodeId || selectedNode?.id;
    if (!idToDelete || !isEditMode) return;
    
    setNodes((nds) => nds.filter((n) => n.id !== idToDelete));
    setEdges((eds) => eds.filter((e) => e.source !== idToDelete && e.target !== idToDelete));
    if (selectedNode?.id === idToDelete) {
      setSelectedNode(null);
    }
  };

  if (loading && !instance) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  const workflowStatus = (instance?.status || '').toLowerCase();

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">{instance?.name}</h2>
              {instance?.status && <StatusBadge status={instance.status} />}
              {instance?.has_warning && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full flex items-center gap-1">
                  <AlertCircle size={12} /> 警告
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">ID: {instance?.id}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => loadInstance()} className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-all" title="刷新">
            <RefreshCw size={18} />
          </button>
          
          {isEditMode ? (
            <>
              <button onClick={() => setIsEditMode(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                取消
              </button>
              <button onClick={handleExitEdit} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm">
                <LogOut size={16} /> 退出编辑
              </button>
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-500/20">
                <Save size={16} /> 保存
              </button>
            </>
          ) : (
            <>
              {workflowStatus === 'pending' && (
                <button 
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await api.workflow.initializeInstance(instanceId);
                      await loadInstance();
                      showToast("初始化成功", "success");
                    } catch (e: any) {
                      showToast("初始化失败: " + e.message, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                >
                  <Activity size={16} /> 初始化
                </button>
              )}
              <button 
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.workflow.syncInstanceStatus(instanceId);
                    await loadInstance();
                    showToast("同步成功", "success");
                  } catch (e: any) {
                    showToast("同步失败: " + e.message, "error");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
              >
                <RefreshCw size={16} /> 同步状态
              </button>

              {['unready', 'ready'].includes(workflowStatus) && (
                <button
                  onClick={() => setIsUninitModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                >
                  <RotateCcw size={16} /> 反初始化
                </button>
              )}

              {workflowStatus === 'pending' && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await api.workflow.startInstance(instanceId);
                      await loadInstance();
                      showToast("启动成功", "success");
                    } catch (e: any) {
                      showToast("启动失败: " + e.message, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-lg shadow-green-500/20"
                >
                  <Play size={16} /> 启动
                </button>
              )}

              {['unready', 'ready'].includes(workflowStatus) && (instance?.run_mode === 'once' || instance?.is_active) && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await api.workflow.triggerInstance(instanceId);
                      await loadInstance();
                      showToast("触发执行成功", "success");
                    } catch (e: any) {
                      showToast("触发执行失败: " + e.message, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Zap size={16} /> 触发执行
                </button>
              )}

              {workflowStatus === 'pending' && (
                <button 
                  onClick={() => {
                    setInitialNodes(nodes);
                    setInitialEdges(edges);
                    setIsEditMode(true);
                  }} 
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                >
                  <Settings size={16} /> 编辑模式
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      {instance?.has_warning && instance?.message && (
        <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <div className="font-bold text-yellow-800 mb-1">工作流状态警告</div>
            <div className="text-sm text-yellow-700">{instance.message}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  if (await showConfirm('确定要取消初始化并清理资源吗？')) {
                    try {
                      setLoading(true);
                      await api.workflow.uninitializeInstance(instanceId);
                      await loadInstance();
                    } catch (e: any) {
                      showToast('操作失败: ' + e.message, "error");
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all"
              >
                取消初始化
              </button>
              <button 
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.workflow.initializeInstance(instanceId);
                    await loadInstance();
                  } catch (e: any) {
                    showToast('重新初始化失败: ' + e.message, "error");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50 transition-all"
              >
                重新初始化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            nodesDraggable={isEditMode}
            nodesConnectable={isEditMode}
            elementsSelectable={true}
            deleteKeyCode={isEditMode ? 'Backspace' : null}
            fitView
          >
            <Background color="#cbd5e1" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            
            {isEditMode && (
              <Panel position="top-left" className="m-4">
                <button 
                  onClick={() => setIsAddNodeModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-slate-50 font-bold text-sm"
                >
                  <Plus size={16} /> 添加节点
                </button>
              </Panel>
            )}
          </ReactFlow>

          {/* Context Menu */}
          {menu && (
            <div 
              className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] py-2 min-w-[160px] animate-in zoom-in-95 duration-100"
              style={{ top: menu.top, left: menu.left }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-2 border-b border-slate-100 mb-1">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">节点操作</div>
                <div className="text-xs font-bold text-slate-600 truncate max-w-[140px]">{menu.id}</div>
              </div>
              
              {isEditMode ? (
                <>
                  <button 
                    onClick={() => handleModifyNode(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <Settings size={14} className="text-slate-400" /> 修改配置
                  </button>
                  <button 
                    onClick={() => handleCopyNode(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <Plus size={14} className="text-slate-400" /> 复制节点
                  </button>
                  <button 
                    onClick={() => {
                      handleDeleteNode(menu.id);
                      setMenu(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-all"
                  >
                    <Trash2 size={14} /> 删除节点
                  </button>
                </>
              ) : (
                <>
                  {/* 状态监控 */}
                  <button 
                    onClick={() => handleViewStatus(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <Activity size={14} className="text-green-500" /> 实时状态
                  </button>
                  
                  {/* 日志 */}
                  <button 
                    onClick={() => handleViewLogs(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-all"
                  >
                    <Terminal size={14} /> 查看日志
                  </button>
                  
                  {/* 进入终端 */}
                  <button
                    onClick={() => handleOpenTerminal(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <Zap size={14} className="text-yellow-500" /> 进入终端
                  </button>

                  {/* 新开终端 */}
                  <button
                    onClick={() => handleOpenNewTerminal(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2 transition-all"
                  >
                    <ExternalLink size={14} className="text-emerald-500" /> 新开终端
                  </button>

                  {/* 事件历史 */}
                  <button 
                    onClick={() => handleViewEvents(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <Clock size={14} className="text-orange-500" /> 执行历史
                  </button>
                  
                  {/* 资源指标 */}
                  <button 
                    onClick={() => handleViewMetrics(menu.id)}
                    className="w-full px-4 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
                  >
                    <BarChart2 size={14} className="text-purple-500" /> 资源监控
                  </button>
                  
                  {/* 分隔线 */}
                  <div className="border-t border-slate-100 my-1"></div>
                  
                  {/* 访问服务 - 仅APP类型节点显示 */}
                  {(() => {
                    const node = nodes.find(n => n.id === menu.id);
                    if (node?.data.node_type === 'app' && node?.data.service_name) {
                      return (
                        <button 
                          onClick={() => handleAccessService(menu.id)}
                          className="w-full px-4 py-2 text-left text-sm font-bold text-cyan-600 hover:bg-cyan-50 flex items-center gap-2 transition-all"
                        >
                          <Database size={14} /> 访问服务
                        </button>
                      );
                    }
                    return null;
                  })()}
                  
                  {/* 重启/重试 - 根据节点类型显示不同选项 */}
                  {(() => {
                    const node = nodes.find(n => n.id === menu.id);
                    if (node?.data.node_type === 'app') {
                      return (
                        <button 
                          onClick={() => handleRestartNode(menu.id)}
                          disabled={restarting}
                          className="w-full px-4 py-2 text-left text-sm font-bold text-orange-600 hover:bg-orange-50 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} /> 重启服务
                        </button>
                      );
                    } else if (node?.data.node_type === 'job') {
                      return (
                        <button 
                          onClick={() => handleRetryNode(menu.id)}
                          disabled={recreating}
                          className="w-full px-4 py-2 text-left text-sm font-bold text-orange-600 hover:bg-orange-50 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          <RotateCcw size={14} className={recreating ? 'animate-spin' : ''} /> 重试任务
                        </button>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar for Node Details */}
        {selectedNode && (
          <div className="w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 animate-in slide-in-from-right-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-800">节点详情</h3>
              {isEditMode && (
                <button onClick={() => handleDeleteNode()} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="删除节点">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            
            <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">节点名称</label>
                  <div className="mt-1 text-sm font-bold text-slate-800">{selectedNode.data.name as string}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">节点类型</label>
                  <div className="mt-1 text-sm font-bold text-slate-800 uppercase">{selectedNode.data.node_type as string}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">节点 ID</label>
                  <div className="mt-1 text-xs font-mono text-slate-600 truncate" title={selectedNode.data.id}>
                    {selectedNode.data.id as string}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">运行状态</label>
                  <div className="mt-1">
                    <StatusBadge status={selectedNode.data.status as WorkflowStatus} />
                  </div>
                </div>
              </div>

              {/* Node Configuration (Inputs) */}
              {(selectedNode.data.input_env_vars?.length > 0 || selectedNode.data.input_volume_mounts?.length > 0) && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">节点配置 (实例化参数)</h4>
                  
                  {selectedNode.data.input_env_vars?.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">环境变量</label>
                      <div className="space-y-1.5">
                        {selectedNode.data.input_env_vars.map((ev: any, i: number) => (
                          <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[9px] font-black text-slate-400 uppercase">{ev.name}</div>
                            <div className="text-xs font-mono text-slate-700 break-all">{ev.value || ev.default_value || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.data.input_volume_mounts?.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">存储挂载</label>
                      <div className="space-y-1.5">
                        {selectedNode.data.input_volume_mounts.map((vm: any, i: number) => (
                          <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[9px] font-black text-slate-400 uppercase">路径: {vm.mount_path}</div>
                            <div className="text-xs font-bold text-slate-700">PVC: {vm.pvc_name || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Template Details (Read-only) */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">模板详细信息</h4>
                  {loadingTemplate && <Loader2 size={12} className="animate-spin text-blue-600" />}
                </div>

                {selectedNodeTemplateDetails ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">模板名称</label>
                      <div className="mt-1 text-xs font-bold text-slate-700">{selectedNodeTemplateDetails.name}</div>
                    </div>

                    {selectedNodeTemplateDetails.containers?.map((container: any, cIdx: number) => (
                      <div key={cIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-blue-600 uppercase">容器: {container.name}</span>
                        </div>
                        
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase">镜像</label>
                          <div className="text-[10px] font-mono text-slate-600 break-all">{container.image}</div>
                        </div>

                        {(container.command || container.args) && (
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase">启动命令 & 参数</label>
                            <div className="text-[10px] font-mono text-slate-600 break-all bg-white p-1.5 rounded border border-slate-100 space-y-1">
                              {container.command && (
                                <div><span className="text-slate-400">Command:</span> {Array.isArray(container.command) ? container.command.join(' ') : container.command}</div>
                              )}
                              {container.args && (
                                <div><span className="text-slate-400">Args:</span> {Array.isArray(container.args) ? container.args.join(' ') : container.args}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {container.env_vars?.length > 0 && (
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase">环境变量 (模板定义)</label>
                            <div className="space-y-1 mt-1">
                              {container.env_vars.map((ev: any, i: number) => (
                                <div key={i} className="flex justify-between text-[10px] font-mono border-b border-slate-200 last:border-0 pb-1 last:pb-0">
                                  <span className="text-slate-500">{ev.name}</span>
                                  <span className="text-slate-700 truncate max-w-[120px]" title={ev.value}>{ev.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {container.volume_mounts?.length > 0 && (
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase">存储挂载 (模板定义)</label>
                            <div className="space-y-1 mt-1">
                              {container.volume_mounts.map((vm: any, i: number) => (
                                <div key={i} className="text-[10px] font-mono text-slate-600">
                                  {vm.mount_path} {vm.read_only ? '(RO)' : ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {container.resources && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] font-black text-slate-400 uppercase">CPU 限制</label>
                              <div className="text-[10px] font-mono text-slate-600">{container.resources.limits?.cpu || '-'}</div>
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-400 uppercase">内存限制</label>
                              <div className="text-[10px] font-mono text-slate-600">{container.resources.limits?.memory || '-'}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {selectedNodeTemplateDetails.create_service && (
                      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-indigo-600 uppercase">服务配置</span>
                          <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                            {selectedNodeTemplateDetails.service_type || 'ClusterIP'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase">服务名称</label>
                            <div className="text-[10px] font-mono text-slate-700">{selectedNodeTemplateDetails.service_name || '-'}</div>
                          </div>
                        </div>

                        {selectedNodeTemplateDetails.service_ports?.length > 0 && (
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase">服务端口</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {selectedNodeTemplateDetails.service_ports.map((p: any, i: number) => (
                                <div key={i} className="px-2 py-1 bg-white text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-100 shadow-sm">
                                  {p.name}: {p.port} → {p.target_port} <span className="text-[8px] text-slate-400">({p.protocol})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : !loadingTemplate && (
                  <div className="text-center py-4 text-slate-400 text-[10px] font-bold italic">未找到模板详情</div>
                )}
              </div>

              {!isEditMode && selectedNode.data.k8s_resource_name && (
                <div className="pt-4 border-t border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">K8S 资源名称</label>
                  <div className="mt-1 text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 break-all">
                    {selectedNode.data.k8s_resource_name as string}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Uninitialize Confirmation Modal */}
      {isUninitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-orange-50 text-orange-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800">确认反初始化？</h3>
              <p className="text-slate-500 mt-4 font-medium">
                您确定要反初始化这个工作流实例吗？这将删除所有关联的 K8S 资源并重置状态。
              </p>
              <p className="text-red-500 mt-2 font-bold text-sm bg-red-50 p-3 rounded-xl border border-red-100">
                警告：所有的非持久化数据将全部丢失！
              </p>
            </div>
            <div className="p-8 bg-slate-50 flex gap-4">
              <button 
                onClick={() => setIsUninitModalOpen(false)} 
                className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button 
                onClick={handleUninitialize}
                disabled={loading}
                className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                确认反初始化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {isAddNodeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-800">
                {addNodeStep === 'select' ? '选择模板' : `配置节点: ${selectedTemplate?.name}`}
              </h3>
              {addNodeStep === 'configure' && (
                <button 
                  onClick={() => setAddNodeStep('select')}
                  className="text-sm font-bold text-blue-600 hover:text-blue-700"
                >
                  返回选择
                </button>
              )}
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {addNodeStep === 'select' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-slate-400 text-sm font-bold">暂无可用模板</div>
                  ) : (
                    templates.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => handleTemplateSelect(t)}
                        className="p-4 border border-slate-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-800 group-hover:text-blue-700">{t.name}</div>
                          <span className="text-[10px] font-black uppercase px-2 py-1 bg-slate-100 text-slate-500 rounded-md group-hover:bg-blue-100 group-hover:text-blue-600">
                            {t.type}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-2 truncate">{t.id}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">显示名称</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-bold text-sm"
                      value={newNodeConfig.name}
                      onChange={e => setNewNodeConfig({...newNodeConfig, name: e.target.value})}
                      placeholder="e.g. 前端服务"
                    />
                  </div>

                  {newNodeConfig.env_vars.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">环境变量依赖</label>
                      <div className="space-y-2">
                        {newNodeConfig.env_vars.map((ev, i) => (
                          <div key={ev.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex-1">
                              <div className="text-[10px] font-black text-slate-500 uppercase">{ev.name}</div>
                              <input 
                                type="text"
                                className="w-full mt-1 bg-transparent outline-none text-sm font-bold text-slate-800"
                                value={ev.value}
                                onChange={e => {
                                  const n = [...newNodeConfig.env_vars];
                                  n[i].value = e.target.value;
                                  setNewNodeConfig({...newNodeConfig, env_vars: n});
                                }}
                                placeholder="输入变量值"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNodeConfig.volume_mounts.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">存储挂载依赖</label>
                      <div className="space-y-2">
                        {newNodeConfig.volume_mounts.map((vm, i) => (
                          <div key={vm.mount_path} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[10px] font-black text-slate-500 uppercase">挂载路径: {vm.mount_path}</div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const n = [...newNodeConfig.volume_mounts];
                                    n[i] = { ...createNodeMountConfig(vm.mount_path, vm.read_only), source_type: 'pvc' };
                                    setNewNodeConfig({ ...newNodeConfig, volume_mounts: n });
                                  }}
                                  className={`rounded-full px-3 py-1 text-[10px] font-bold ${vm.source_type === 'pvc' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}
                                >
                                  PVC
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const n = [...newNodeConfig.volume_mounts];
                                    n[i] = { ...createNodeMountConfig(vm.mount_path, true), source_type: 'project_file' };
                                    setNewNodeConfig({ ...newNodeConfig, volume_mounts: n });
                                  }}
                                  className={`rounded-full px-3 py-1 text-[10px] font-bold ${vm.source_type === 'project_file' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}
                                >
                                  项目文件夹
                                </button>
                              </div>
                            </div>
                            <div className="flex-1">
                              {vm.source_type === 'project_file' ? (
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <button
                                    type="button"
                                    className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-blue-400"
                                    onClick={() => setDirectoryPickerTarget(vm.mount_path)}
                                  >
                                    <span className="truncate">{vm.subproject_id ? `${vm.subproject_name || '子项目'} ${vm.display_path || '/'}` : '选择项目文件夹'}</span>
                                    <FolderTree size={16} className="text-blue-500" />
                                  </button>
                                  <div className="mt-1 rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                    支持选择任意层级文件夹，保存时会自动解析成 fileserver PVC 目录挂载。
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <select 
                                    className="w-full mt-1 bg-transparent outline-none text-sm font-bold text-slate-800"
                                    value={vm.pvc_name}
                                    onChange={e => {
                                      const n = [...newNodeConfig.volume_mounts];
                                      n[i].pvc_name = e.target.value;
                                      setNewNodeConfig({...newNodeConfig, volume_mounts: n});
                                    }}
                                  >
                                    <option value="">选择 PVC</option>
                                    {pvcs.map(pvc => (
                                      <option key={pvc.pvc_name} value={pvc.pvc_name}>
                                        {pvc.pvc_name} ({pvc.capacity}) - {pvc.resource_name || '未关联资源'}
                                      </option>
                                    ))}
                                  </select>
                                  <input 
                                    type="text"
                                    className="w-full mt-2 bg-white px-3 py-2 rounded-lg border border-slate-200 outline-none text-xs font-mono text-slate-600 focus:border-blue-500 transition-all"
                                    value={vm.sub_path || ''}
                                    onChange={e => {
                                      const n = [...newNodeConfig.volume_mounts];
                                      n[i].sub_path = e.target.value;
                                      setNewNodeConfig({...newNodeConfig, volume_mounts: n});
                                    }}
                                    placeholder="Sub Path (可选)"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTemplate?.type === 'app' && (
                    <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">服务配置</label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={newNodeConfig.create_service}
                            onChange={e => setNewNodeConfig({
                              ...newNodeConfig,
                              create_service: e.target.checked,
                              create_ingress: e.target.checked ? newNodeConfig.create_ingress : false,
                              ingress_type: e.target.checked ? newNodeConfig.ingress_type : '',
                              ingress_host: e.target.checked ? newNodeConfig.ingress_host : '',
                              ingress_ip: e.target.checked ? newNodeConfig.ingress_ip : ''
                            })}
                            className="w-4 h-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold text-indigo-700">创建 K8S Service</span>
                        </label>
                      </div>
                      
                      {newNodeConfig.create_service && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-500 uppercase">服务名称</label>
                              <input 
                                type="text"
                                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-500 text-sm font-bold text-slate-800"
                                value={newNodeConfig.service_name}
                                onChange={e => setNewNodeConfig({...newNodeConfig, service_name: e.target.value})}
                                placeholder="my-service"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-500 uppercase">服务类型</label>
                              <select 
                                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-500 text-sm font-bold text-slate-800"
                                value={newNodeConfig.service_type}
                                onChange={e => setNewNodeConfig({...newNodeConfig, service_type: e.target.value as any})}
                              >
                                <option value="ClusterIP">ClusterIP</option>
                                <option value="NodePort">NodePort</option>
                                <option value="LoadBalancer">LoadBalancer</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black text-slate-500 uppercase">服务端口</label>
                              <button 
                                type="button"
                                onClick={() => setNewNodeConfig({
                                  ...newNodeConfig, 
                                  service_ports: [...newNodeConfig.service_ports, { name: `port-${newNodeConfig.service_ports.length + 1}`, port: 80, target_port: 80, protocol: 'TCP' }]
                                })}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                              >
                                + 添加端口
                              </button>
                            </div>
                            <div className="space-y-2">
                              {newNodeConfig.service_ports.map((sp, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100">
                                  <input 
                                    type="text"
                                    className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                                    value={sp.name}
                                    onChange={e => {
                                      const n = [...newNodeConfig.service_ports];
                                      n[i].name = e.target.value;
                                      setNewNodeConfig({...newNodeConfig, service_ports: n});
                                    }}
                                    placeholder="名称"
                                  />
                                  <input 
                                    type="number"
                                    className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                                    value={sp.port}
                                    onChange={e => {
                                      const n = [...newNodeConfig.service_ports];
                                      n[i].port = parseInt(e.target.value) || 0;
                                      setNewNodeConfig({...newNodeConfig, service_ports: n});
                                    }}
                                    placeholder="端口"
                                  />
                                  <span className="text-slate-400">→</span>
                                  <input 
                                    type="number"
                                    className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                                    value={sp.target_port}
                                    onChange={e => {
                                      const n = [...newNodeConfig.service_ports];
                                      n[i].target_port = parseInt(e.target.value) || 0;
                                      setNewNodeConfig({...newNodeConfig, service_ports: n});
                                    }}
                                    placeholder="目标端口"
                                  />
                                  <select 
                                    className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                                    value={sp.protocol}
                                    onChange={e => {
                                      const n = [...newNodeConfig.service_ports];
                                      n[i].protocol = e.target.value;
                                      setNewNodeConfig({...newNodeConfig, service_ports: n});
                                    }}
                                  >
                                    <option value="TCP">TCP</option>
                                    <option value="UDP">UDP</option>
                                  </select>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const n = newNodeConfig.service_ports.filter((_, idx) => idx !== i);
                                      setNewNodeConfig({...newNodeConfig, service_ports: n});
                                    }}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Ingress 配置 */}
                          <div className="space-y-2 pt-2 border-t border-indigo-100">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newNodeConfig.create_ingress}
                                  onChange={e => setNewNodeConfig({
                                    ...newNodeConfig,
                                    create_ingress: e.target.checked,
                                    ingress_type: e.target.checked ? 'nginx' : '',
                                    ingress_host: e.target.checked ? newNodeConfig.ingress_host : '',
                                    ingress_ip: e.target.checked ? newNodeConfig.ingress_ip : ''
                                  })}
                                  className="w-4 h-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-indigo-700">创建 Ingress</span>
                              </label>
                              <label className="text-[9px] font-black text-slate-500 uppercase">Ingress 配置</label>
                            </div>
                            {newNodeConfig.create_ingress && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                默认使用 `nginx` Ingress，域名会按当前 Service 自动生成。节点初始化完成后，可在节点“访问服务”里直接打开入口地址。
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">超时时间 (秒)</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-bold text-sm"
                      value={newNodeConfig.timeout_seconds || ''}
                      onChange={e => setNewNodeConfig({...newNodeConfig, timeout_seconds: e.target.value ? parseInt(e.target.value) : null})}
                      placeholder="可选，单位：秒"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button 
                onClick={() => {
                  setIsAddNodeModalOpen(false);
                  setIsEditingNode(false);
                  setEditingNodeId(null);
                  setAddNodeStep('select');
                  setSelectedTemplate(null);
                  setTemplateDetails(null);
                  setDirectoryPickerTarget(null);
                }}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              {addNodeStep === 'configure' && (
                <button 
                  onClick={handleCreateNode}
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  确认创建
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-800">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Terminal size={20} className="text-blue-400" />
                </div>
                <h3 className="text-xl font-black text-white">节点日志</h3>
              </div>
              <button 
                onClick={() => setIsLogsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-black/50 rounded-2xl border border-slate-800 p-4 h-[60vh] overflow-y-auto custom-scrollbar font-mono text-sm text-slate-300 leading-relaxed">
                {loadingLogs ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Loader2 className="animate-spin text-blue-500" size={32} />
                    <div className="text-slate-500 font-bold animate-pulse">正在获取实时日志...</div>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">{nodeLogs}</pre>
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button 
                onClick={() => setIsLogsModalOpen(false)}
                className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Activity size={20} className="text-green-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">实时状态</h3>
              </div>
              <button 
                onClick={() => setIsStatusModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {loadingStatus ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <div className="text-slate-500 font-bold">获取状态中...</div>
                </div>
              ) : nodeStatus?.error ? (
                <div className="text-center py-8 text-red-500">{nodeStatus.error}</div>
              ) : nodeStatus ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Phase</div>
                      <div className="text-lg font-bold text-slate-800">{nodeStatus.phase}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Pod IP</div>
                      <div className="text-lg font-bold text-slate-800 font-mono">{nodeStatus.pod_ip || '-'}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Host IP</div>
                      <div className="text-lg font-bold text-slate-800 font-mono">{nodeStatus.host_ip || '-'}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Node</div>
                      <div className="text-lg font-bold text-slate-800 truncate">{nodeStatus.node_name || '-'}</div>
                    </div>
                  </div>
                  
                  {nodeStatus.container_statuses?.length > 0 && (
                    <div>
                      <div className="text-xs font-black text-slate-400 uppercase mb-2">容器状态</div>
                      <div className="space-y-2">
                        {nodeStatus.container_statuses.map((cs: any, i: number) => (
                          <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">{cs.name}</span>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${cs.ready ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {cs.ready ? 'Ready' : 'Not Ready'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{cs.state}</div>
                            <div className="text-xs text-slate-400 mt-1">重启次数: {cs.restart_count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {nodeStatus.conditions?.length > 0 && (
                    <div>
                      <div className="text-xs font-black text-slate-400 uppercase mb-2">条件</div>
                      <div className="space-y-1">
                        {nodeStatus.conditions.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {c.status === 'True' ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                            <span className="font-bold text-slate-700">{c.type}</span>
                            {c.reason && <span className="text-slate-400">({c.reason})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsStatusModalOpen(false)} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Events Modal */}
      {isEventsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Clock size={20} className="text-orange-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">执行历史</h3>
              </div>
              <button onClick={() => setIsEventsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {loadingEvents ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <div className="text-slate-500 font-bold">获取事件中...</div>
                </div>
              ) : nodeEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">暂无事件记录</div>
              ) : (
                <div className="space-y-3">
                  {nodeEvents.map((event, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${event.type === 'Warning' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {event.type === 'Warning' ? <AlertCircle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}
                        <span className="font-bold text-slate-800">{event.reason}</span>
                        {event.count > 1 && <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full">x{event.count}</span>}
                      </div>
                      <div className="text-sm text-slate-600">{event.message}</div>
                      {event.last_timestamp && (
                        <div className="text-xs text-slate-400 mt-2">{new Date(event.last_timestamp).toLocaleString()}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsEventsModalOpen(false)} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Modal */}
      {isMetricsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <BarChart2 size={20} className="text-purple-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">资源监控</h3>
              </div>
              <button onClick={() => setIsMetricsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {loadingMetrics ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <div className="text-slate-500 font-bold">获取指标中...</div>
                </div>
              ) : nodeMetrics?.error ? (
                <div className="text-center py-8 text-red-500">{nodeMetrics.error}</div>
              ) : nodeMetrics ? (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 mb-2">需要安装 Metrics Server 才能获取资源指标</div>
                  {nodeMetrics.containers?.map((c: any, i: number) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="font-bold text-slate-800 mb-3">{c.name}</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase">CPU</div>
                          <div className="text-lg font-bold text-blue-600 font-mono">{c.cpu}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase">Memory</div>
                          <div className="text-lg font-bold text-purple-600 font-mono">{c.memory}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsMetricsModalOpen(false)} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Modal - 使用xterm.js 浮动窗口 */}
      {isTerminalModalOpen && !terminalIsMinimized && (
        <div
          className="fixed bg-slate-900 rounded-xl shadow-2xl overflow-hidden flex flex-col border border-slate-700"
          style={{
            left: terminalIsMaximized ? 0 : terminalPosition.x,
            top: terminalIsMaximized ? 0 : terminalPosition.y,
            width: terminalIsMaximized ? '100vw' : 900,
            height: terminalIsMaximized ? '100vh' : 600,
            zIndex: terminalZIndex,
          }}
        >
          {/* 终端标题栏 */}
          <div
            className={`flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 ${terminalIsMaximized ? '' : 'cursor-move'}`}
            onMouseDown={handleTerminalStartDrag}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${terminalConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-slate-300 font-mono text-sm">{terminalNodeName} - {terminalPodName}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                terminalConnected
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {terminalConnected ? '已连接' : '未连接'}
              </span>
              {/* 窗口控制按钮 - macOS 风格 */}
              <div className="flex items-center gap-2 ml-3">
                {/* 关闭按钮 - 红色 */}
                <button
                  onClick={handleCloseTerminal}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all group"
                  title="关闭"
                >
                  <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
                {/* 最小化按钮 - 黄色 */}
                <button
                  onClick={() => setTerminalIsMinimized(true)}
                  className="w-3.5 h-3.5 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-all group"
                  title="最小化"
                >
                  <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M2 6h8" />
                  </svg>
                </button>
                {/* 最大化/还原按钮 - 绿色 */}
                <button
                  onClick={() => setTerminalIsMaximized(!terminalIsMaximized)}
                  className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all group"
                  title={terminalIsMaximized ? "还原" : "最大化"}
                >
                  {terminalIsMaximized ? (
                    <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="4" width="4" height="4" />
                      <rect x="4" y="2" width="4" height="4" fill="none" />
                    </svg>
                  ) : (
                    <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="8" height="8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          {/* 终端内容 */}
          <div className="flex-1 overflow-hidden">
            <XTerminal
              ws={terminalWs}
              connected={terminalConnected}
              podName={terminalPodName}
              onClose={handleCloseTerminal}
              showHeader={false}
            />
          </div>
        </div>
      )}

      {/* 终端最小化任务栏 */}
      {isTerminalModalOpen && terminalIsMinimized && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur-sm rounded-xl px-4 py-2 shadow-2xl border border-slate-700 z-[9999] flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium mr-2">终端窗口:</span>
          <button
            onClick={() => {
              setTerminalIsMinimized(false);
              const newZIndex = maxZIndex + 1;
              setMaxZIndex(newZIndex);
              setTerminalZIndex(newZIndex);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 text-sm font-medium transition-all"
          >
            <Terminal size={14} className={terminalConnected ? 'text-green-400' : 'text-red-400'} />
            <span className="max-w-[120px] truncate">{terminalNodeName}</span>
          </button>
        </div>
      )}

      {/* Access Service Modal */}
      {isAccessModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-50 rounded-lg">
                  <Database size={20} className="text-cyan-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">访问服务</h3>
              </div>
              <button 
                onClick={() => setIsAccessModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {loadingAccess ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <div className="text-slate-500 font-bold">获取访问信息中...</div>
                </div>
              ) : serviceAccessInfo?.error ? (
                <div className="text-center py-8 text-red-500">{serviceAccessInfo.error}</div>
              ) : serviceAccessInfo ? (
                <div className="space-y-6">
                  {/* 服务基本信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Service名称</div>
                      <div className="text-lg font-bold text-slate-800">{serviceAccessInfo.name}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Service类型</div>
                      <div className="text-lg font-bold text-slate-800">{serviceAccessInfo.type}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Cluster IP</div>
                      <div className="text-lg font-bold text-slate-800 font-mono">{serviceAccessInfo.cluster_ip || '-'}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Namespace</div>
                      <div className="text-lg font-bold text-slate-800">{serviceAccessInfo.namespace}</div>
                    </div>
                  </div>
                  
                  {/* 端口信息 */}
                  {serviceAccessInfo.ports?.length > 0 && (
                    <div>
                      <div className="text-xs font-black text-slate-400 uppercase mb-3">端口配置</div>
                      <div className="space-y-2">
                        {serviceAccessInfo.ports.map((port: any, i: number) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-slate-800">{port.name || `port-${i}`}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">{port.protocol}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>
                                <span className="text-slate-400">Port:</span>
                                <span className="font-mono font-bold text-slate-700 ml-1">{port.port}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Target:</span>
                                <span className="font-mono font-bold text-slate-700 ml-1">{port.target_port}</span>
                              </div>
                              {port.node_port && (
                                <div>
                                  <span className="text-slate-400">NodePort:</span>
                                  <span className="font-mono font-bold text-cyan-600 ml-1">{port.node_port}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 访问方式 */}
                  {serviceAccessInfo.ingress_accesses?.length > 0 && (
                    <div>
                      <div className="text-xs font-black text-slate-400 uppercase mb-3">域名访问</div>
                      <div className="space-y-3">
                        {serviceAccessInfo.ingress_accesses.map((item: any, i: number) => (
                          <div key={i} className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">
                                {item.ingress_class_name || 'Ingress'}
                              </span>
                              <span className="text-xs text-slate-500">{item.ingress_name}</span>
                            </div>
                            <div className="font-mono text-sm text-slate-800 break-all">{item.host || '-'}</div>
                            <div className="mt-2 text-xs text-slate-600">
                              {item.selected_ip ? `hosts: ${item.selected_ip} ${item.host}` : '未记录所选 Ingress IP'}
                            </div>
                            {item.url && (
                              <div className="mt-2 text-xs text-emerald-700 break-all">{item.url}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {serviceAccessInfo.ingress_accesses?.length === 0 && serviceAccessInfo.access_urls?.length > 0 && (
                    <div>
                      <div className="text-xs font-black text-slate-400 uppercase mb-3">访问方式</div>
                      <div className="space-y-3">
                        {serviceAccessInfo.access_urls.map((access: any, i: number) => (
                          <div key={i} className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl border border-cyan-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                access.type === 'NodePort' ? 'bg-orange-100 text-orange-700' :
                                access.type === 'LoadBalancer' ? 'bg-green-100 text-green-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>{access.type}</span>
                              <span className="text-sm text-slate-500">{access.port_name}</span>
                            </div>
                            <div className="font-mono text-sm text-slate-700 break-all">{access.url}</div>
                            {access.type === 'ClusterIP' && (
                              <button
                                onClick={() => handleOpenProxyUrl(access.port, '/')}
                                className="mt-3 w-full py-2 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-all text-sm"
                              >
                                通过代理访问
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 代理访问说明 */}
                  {serviceAccessInfo.ingress_accesses?.length > 0 ? (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="text-xs font-black text-emerald-700 mb-2">域名访问说明</div>
                      <ul className="text-xs text-emerald-700 space-y-1 list-disc list-inside">
                        <li>优先使用上方已绑定的域名访问节点服务。</li>
                        <li>请先在本机 `hosts` 文件中配置 `Ingress IP 域名` 的映射。</li>
                        <li>配置完成后，可直接通过域名 URL 访问对应节点服务。</li>
                      </ul>
                    </div>
                  ) : (
                  <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                    <div className="text-xs font-black text-yellow-700 mb-2">访问说明</div>
                    <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                      <li><strong>ClusterIP</strong>: 仅集群内部可访问，可通过代理访问</li>
                      <li><strong>NodePort</strong>: 通过节点IP和NodePort访问，需确保防火墙开放</li>
                      <li><strong>LoadBalancer</strong>: 通过外部负载均衡器IP访问</li>
                    </ul>
                  </div>
                  )}
                </div>
              ) : null}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsAccessModalOpen(false)} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedChangesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
          <div className="bg-white rounded-xl p-6 w-[400px] shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">未保存的更改</h3>
            <p className="text-slate-600 mb-6">您有未保存的更改，是否保存并退出？</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowUnsavedChangesModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-all"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  setIsEditMode(false);
                  setShowUnsavedChangesModal(false);
                  loadInstance(); // Reload to discard changes
                }}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-bold transition-all"
              >
                不保存退出
              </button>
              <button
                onClick={async () => {
                  await handleSave();
                  setIsEditMode(false);
                  setShowUnsavedChangesModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold transition-all"
              >
                保存并退出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 浮动终端窗口 */}
      {floatingTerminals.filter(t => !t.isMinimized).map(terminal => (
        <div
          key={terminal.id}
          className="fixed bg-slate-900 rounded-xl shadow-2xl overflow-hidden flex flex-col border border-slate-700"
          style={{
            left: terminal.isMaximized ? 0 : terminal.position.x,
            top: terminal.isMaximized ? 0 : terminal.position.y,
            width: terminal.isMaximized ? '100vw' : terminal.size.width,
            height: terminal.isMaximized ? '100vh' : terminal.size.height,
            zIndex: terminal.zIndex,
          }}
          onClick={() => handleFocusTerminal(terminal.id)}
        >
          {/* 终端标题栏 */}
          <div
            className={`flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 ${terminal.isMaximized ? '' : 'cursor-move'}`}
            onMouseDown={(e) => handleStartDrag(e, terminal.id)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${terminal.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-slate-300 font-mono text-sm">{terminal.nodeName} - {terminal.podName}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                terminal.connected
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {terminal.connected ? '已连接' : '未连接'}
              </span>
              {/* 窗口控制按钮 - macOS 风格 */}
              <div className="flex items-center gap-2 ml-3">
                {/* 关闭按钮 - 红色 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseFloatingTerminal(terminal.id);
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all group"
                  title="关闭"
                >
                  <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
                {/* 最小化按钮 - 黄色 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMinimizeTerminal(terminal.id);
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-all group"
                  title="最小化"
                >
                  <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M2 6h8" />
                  </svg>
                </button>
                {/* 最大化/还原按钮 - 绿色 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (terminal.isMaximized) {
                      handleUnmaximizeTerminal(terminal.id);
                    } else {
                      handleMaximizeTerminal(terminal.id);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all group"
                  title={terminal.isMaximized ? "还原" : "最大化"}
                >
                  {terminal.isMaximized ? (
                    <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="4" width="4" height="4" />
                      <rect x="4" y="2" width="4" height="4" fill="none" />
                    </svg>
                  ) : (
                    <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="8" height="8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          {/* 终端内容 */}
          <div className="flex-1 overflow-hidden">
            <XTerminal
              ws={terminal.ws}
              connected={terminal.connected}
              podName={terminal.podName}
              onClose={() => handleCloseFloatingTerminal(terminal.id)}
              showHeader={false}
            />
          </div>
        </div>
      ))}

      {/* 底部任务栏 - 显示最小化的终端 */}
      {floatingTerminals.filter(t => t.isMinimized).length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur-sm rounded-xl px-4 py-2 shadow-2xl border border-slate-700 z-[9999] flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium mr-2">终端窗口:</span>
          {floatingTerminals.filter(t => t.isMinimized).map(terminal => (
            <button
              key={terminal.id}
              onClick={() => handleRestoreTerminal(terminal.id)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 text-sm font-medium transition-all"
            >
              <Terminal size={14} className={terminal.connected ? 'text-green-400' : 'text-red-400'} />
              <span className="max-w-[120px] truncate">{terminal.nodeName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toast 通知 */}
      {toast && (
        <div
          className="fixed top-4 left-1/2 z-[99999]"
          style={{
            transform: 'translateX(-50%)',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
              }
            }
          `}</style>
          <div className={`px-6 py-3 rounded-xl shadow-2xl border font-bold text-sm flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-600 text-white border-green-500' :
            toast.type === 'error' ? 'bg-red-600 text-white border-red-500' :
            toast.type === 'warning' ? 'bg-yellow-500 text-yellow-900 border-yellow-400' :
            'bg-slate-800 text-white border-slate-700'
          }`}>
            {toast.type === 'success' && <CheckCircle size={18} />}
            {toast.type === 'error' && <XCircle size={18} />}
            {toast.type === 'warning' && <AlertCircle size={18} />}
            {toast.type === 'info' && <Activity size={18} />}
            {toast.message}
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99998] flex items-center justify-center p-4">
          <style>{`
            @keyframes zoomIn {
              from {
                opacity: 0;
                transform: scale(0.95);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'zoomIn 0.2s ease-out' }}
          >
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} />
              </div>
              <p className="text-slate-700 font-bold text-base">{confirmDialog.message}</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={confirmDialog.onCancel}
                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-3 text-orange-600 font-bold hover:bg-orange-50 transition-all border-l border-slate-100"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectDirectoryPickerModal
        isOpen={Boolean(directoryPickerTarget)}
        projectId={instance?.project_id || ''}
        onClose={() => setDirectoryPickerTarget(null)}
        onSelect={(selection: ProjectDirectorySelection) => {
          if (!directoryPickerTarget) return;
          const nextMounts = newNodeConfig.volume_mounts.map((mount) => (
            mount.mount_path === directoryPickerTarget
              ? {
                  ...mount,
                  source_type: 'project_file' as const,
                  pvc_name: '',
                  sub_path: '',
                  read_only: true,
                  subproject_id: selection.subproject_id,
                  directory_id: selection.directory_id ?? null,
                  display_path: selection.display_path,
                  subproject_name: selection.subproject_name,
                  directory_name: selection.directory_name ?? null,
                }
              : mount
          ));
          setNewNodeConfig({ ...newNodeConfig, volume_mounts: nextMounts });
          setDirectoryPickerTarget(null);
        }}
      />
    </div>
  );
};
