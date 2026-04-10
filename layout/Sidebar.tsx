
import React from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  Box, 
  Briefcase, 
  FileBox, 
  Database, 
  ShieldCheck, 
  Target, 
  LogOut, 
  PanelLeftClose, 
  PanelLeftOpen,
  ChevronRight,
  Monitor,
  ClipboardCheck,
  FileText,
  Play,
  Sparkles,
  ListTodo,
  HardDrive,
  Archive,
  FileCode,
  FolderTree,
  Package,
  Bot,
  MessageSquare,
  Terminal,
  Zap,
  Workflow,
  Layout,
  Code2,
  Users,
  UserCog,
  ShieldAlert,
  Globe,
  Settings,
  ServerCog,
  ArrowLeftCircle,
  Cpu,
  Key,
  Layers,
  Activity,
  GitBranch,
  Building2,
  FolderOpen,
  FileSearch,
  Plus,
  History
} from 'lucide-react';
import { UserInfo, ViewType } from '../types/types';
import { getUserAccess } from '../utils/rbac';

interface SidebarProps {
  user: UserInfo | null;
  currentView: ViewType | string;
  hasSelectedProject: boolean;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;
  expandedMenus: Set<string>;
  setExpandedMenus: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCurrentView: (v: ViewType | string) => void;
  handleLogout: () => void;
  resourceHealth?: boolean | null;
  staticPackageHealth?: boolean | null;
  projectHealth?: boolean | null;
  envHealth?: boolean | null;
  codeAuditHealth?: boolean | null;
  workflowHealth?: boolean | null;
  vulnHealth?: boolean | null;
  configCenterHealth?: boolean | null;
  aiAgentFrameworkHealth?: boolean | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  user, currentView, hasSelectedProject, isSidebarCollapsed, setIsSidebarCollapsed, 
  expandedMenus, setExpandedMenus, setCurrentView, handleLogout,
  resourceHealth = null,
  staticPackageHealth = null,
  projectHealth = null,
  envHealth = null,
  codeAuditHealth = null,
  workflowHealth = null,
  vulnHealth = null,
  configCenterHealth = null,
  aiAgentFrameworkHealth = null
}) => {
  const isUserMgmtMode = currentView.startsWith('user-mgmt-') || currentView.startsWith('org-mgmt-');

  const SidebarItem = ({
    id,
    label,
    icon,
    children,
    depth = 0,
    healthStatus = null,
    applyHealth = false,
    disabled = false,
    disabledTitle,
  }: any) => {
    const isExpanded = expandedMenus.has(id);
    const isActive = currentView === id;
    const hasChildren = children && children.length > 0;

    let iconElement = icon || <div className="w-5" />;
    if (applyHealth && React.isValidElement(iconElement)) {
      const healthColor = healthStatus === true ? 'text-green-500' : healthStatus === false ? 'text-red-500' : 'text-slate-400';
      iconElement = React.cloneElement(iconElement as React.ReactElement<any>, { 
        className: `${(iconElement.props as any).className || ''} ${healthColor} transition-colors duration-500` 
      });
    }

    return (
      <div className="space-y-1">
        <div onClick={() => {
            if (disabled) return;
            if (hasChildren) {
              setExpandedMenus(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              });
            } else setCurrentView(id);
          }}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl cursor-pointer transition-all ${
            disabled
              ? 'text-slate-600 bg-slate-900/40 cursor-not-allowed opacity-55'
              : isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 font-bold'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
          style={{ marginLeft: depth > 0 ? `${depth * 0.75}rem` : '0' }}
          title={disabled ? (disabledTitle || '请先选择项目后再使用此功能') : undefined}
        >
          {iconElement}
          {!isSidebarCollapsed && (
            <div className="flex-1 flex items-center justify-between overflow-hidden">
              <span className={`${depth > 0 ? 'text-[11px]' : 'text-sm'} truncate`}>{label}</span>
              {hasChildren && <ChevronRight size={12} className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />}
            </div>
          )}
        </div>
        {!isSidebarCollapsed && isExpanded && children?.map((child: any) => (
          <SidebarItem 
            key={child.id} 
            id={child.id} 
            label={child.label} 
            icon={child.icon} 
            children={child.children} 
            depth={depth + 1} 
            healthStatus={child.id === 'pentest-exec-code' ? codeAuditHealth : (child.healthStatus !== undefined ? child.healthStatus : healthStatus)}
            applyHealth={child.id === 'pentest-exec-code' ? true : (child.applyHealth !== undefined ? child.applyHealth : applyHealth)}
            disabled={disabled || !!child.disabled}
            disabledTitle={child.disabledTitle}
          />
        ))}
      </div>
    );
  };

  const renderMainSidebar = () => {
    const access = getUserAccess(user);

    return (
    <nav className="flex-1 px-5 py-2 space-y-8 overflow-y-auto custom-scrollbar">
      <div className="space-y-1">
        {access.canAccessAdminDashboard && (
          <SidebarItem
            id="admin-dashboard"
            label="管理员控制台"
            icon={<ShieldAlert size={20} />}
            healthStatus={true}
            applyHealth={true}
          />
        )}

        <SidebarItem id="dashboard" label="控制台" icon={<LayoutDashboard size={20} />} />
        
        <SidebarItem 
          id="base-mgmt" 
          label="基础资源管理" 
          icon={<Box size={20} />} 
          healthStatus={staticPackageHealth}
          applyHealth={true}
          children={[
            { id: 'project-file-explorer', label: '项目文件资源管理', icon: <FolderTree size={14} />, disabled: !hasSelectedProject, disabledTitle: '请先选择项目' },
            { id: 'static-packages', label: '静态软件包管理', icon: <Package size={14} /> },
            { id: 'deploy-script-mgmt', label: '部署脚本管理', icon: <Terminal size={14} /> }
          ]} 
        />

        <SidebarItem 
          id="project-mgmt" 
          label="项目空间" 
          icon={<Briefcase size={20} />} 
          healthStatus={projectHealth}
          applyHealth={true}
        />

        {access.canAccessConfigCenter && (
          <SidebarItem
            id="config-center-root"
            label="配置中心"
            icon={<Key size={20} />}
            healthStatus={configCenterHealth}
            applyHealth={true}
            children={[
              { id: 'config-center-llm', label: 'LLM 对接配置', icon: <Globe size={14} /> }
            ]}
          />
        )}

        <SidebarItem
          id="ai-agent-framework-root"
          label="AI工作流"
          icon={<Bot size={20} />}
          disabled={!hasSelectedProject}
          healthStatus={aiAgentFrameworkHealth}
          applyHealth={true}
          children={[
            {
              id: 'aiwf-definitions',
              label: '工作流定义',
              icon: <FileCode size={14} />,
              children: [
                { id: 'aiwf-definition-list', label: '定义列表', icon: <ListTodo size={12} /> },
                { id: 'aiwf-definition-create', label: '新建定义', icon: <Plus size={12} /> },
                { id: 'aiwf-definition-versions', label: '版本记录', icon: <History size={12} /> },
              ],
            },
            {
              id: 'aiwf-triggers',
              label: '触发任务',
              icon: <Play size={14} />,
              children: [
                { id: 'aiwf-trigger-create', label: '触发任务', icon: <Play size={12} /> },
                { id: 'aiwf-trigger-list', label: '任务列表', icon: <Workflow size={12} /> },
              ],
            },
            {
              id: 'aiwf-executions',
              label: '执行中心',
              icon: <Activity size={14} />,
              children: [
                { id: 'aiwf-execution-list', label: '执行列表', icon: <ListTodo size={12} /> },
                { id: 'aiwf-execution-events', label: '执行事件', icon: <FileText size={12} /> },
                { id: 'aiwf-execution-artifacts', label: '执行工件', icon: <Archive size={12} /> },
              ],
            },
            {
              id: 'aiwf-scheduler',
              label: '调度节点',
              icon: <ServerCog size={14} />,
              children: [
                { id: 'aiwf-worker-list', label: 'Worker 状态', icon: <Activity size={12} /> },
                { id: 'aiwf-worker-control', label: '运行控制', icon: <Settings size={12} /> },
              ],
            },
          ]}
        />

        <SidebarItem
          id="public-resource-management"
          label="公共资源管理"
          healthStatus={resourceHealth}
          applyHealth={true}
          icon={<FileBox size={20} />}
          disabled={!hasSelectedProject}
          children={[
            { id: 'public-resource-pvc-management', label: 'PVC管理', icon: <HardDrive size={14} /> },
            { id: 'public-resource-task-management', label: '任务管理', icon: <ListTodo size={14} /> },
          ]}
        />

        <SidebarItem 
          id="env-mgmt" 
          label="环境服务" 
          icon={<Database size={20} />} 
          disabled={!hasSelectedProject}
          healthStatus={envHealth}
          applyHealth={true}
          children={[
            { id: 'env-template', label: '模板管理', icon: <Box size={14} /> }, 
            { id: 'env-agent', label: 'Agent 管理', icon: <Monitor size={14} /> }, 
            { id: 'env-service', label: '服务管理', icon: <Zap size={14} /> },
            {
              id: 'env-ai-agent-root',
              label: 'AI Agent管理',
              icon: <Bot size={14} />,
              children: [
                { id: 'env-ai-agent-manage', label: 'AI Agent 管理', icon: <Bot size={12} /> },
                { id: 'env-ai-session', label: '单会话', icon: <MessageSquare size={12} /> },
                { id: 'env-ai-batch-session', label: '批量会话', icon: <GitBranch size={12} /> },
              ],
            },
            {
              id: 'env-process-monitor-root',
              label: '节点进程监控',
              icon: <Cpu size={14} />,
              children: [
                { id: 'env-process-monitor-overview', label: '节点总览', icon: <Activity size={12} /> },
                { id: 'env-process-monitor-detail', label: '进程详情', icon: <FolderTree size={12} /> },
                { id: 'env-process-monitor-tasks', label: '任务管理', icon: <Workflow size={12} /> },
              ],
            },
            {
              id: 'env-tasks', label: '环境模板部署/卸载任务管理', icon: <Workflow size={14} />
            }
          ]} 
        />

        <SidebarItem 
          id="workflow-root" 
          label="安全测试工作流" 
          icon={<Workflow size={20} />} 
          disabled={!hasSelectedProject}
          healthStatus={workflowHealth}
          applyHealth={true}
          children={[
            { id: 'workflow-apps', label: '应用模板', icon: <Layers size={14} /> },
            { id: 'workflow-app-instances', label: '应用实例', icon: <Box size={14} /> },
            { id: 'workflow-jobs', label: '任务模板', icon: <Zap size={14} /> },
            { id: 'workflow-instances', label: '工作流实例', icon: <Activity size={14} /> }
          ]}
        />
        
        <SidebarItem id="engine-validation" label="安全验证" icon={<ShieldCheck size={20} />} disabled={!hasSelectedProject} />
        <SidebarItem id="pentest-root" label="渗透测试" icon={<Target size={20} />} disabled={!hasSelectedProject} children={[
          { id: 'pentest-risk', label: '风险评估' }, 
          {
            id: 'pentest-system',
            label: '系统分析',
            icon: <Activity size={14} />,
            children: [
              {
                id: 'system-analysis-runtime-root',
                label: '运行环境分析',
                icon: <ServerCog size={12} />,
                children: [
                  { id: 'system-analysis-overview', label: '分析概览', icon: <Activity size={12} /> },
                  { id: 'system-analysis-task', label: '分析任务', icon: <Play size={12} /> },
                  { id: 'system-analysis-history', label: '任务记录', icon: <ClipboardCheck size={12} /> },
                  { id: 'system-analysis-prompt', label: 'Prompt 管理', icon: <FileText size={12} /> }
                ],
              }
            ],
          },
          { id: 'pentest-threat', label: '威胁分析' }, 
          { id: 'pentest-orch', label: '测试编排' },
          { id: 'pentest-exec', label: '测试执行', icon: <Play size={14} />, children: [
            { id: 'pentest-exec-code', label: '在线代码审计（VSCODE AI版）', icon: <Code2 size={12} /> },
            { id: 'pentest-exec-work', label: '知微' },
            { id: 'pentest-exec-secmate', label: 'SecMate-NG (AI 助手)', icon: <Sparkles size={12} className="text-amber-400" /> },
            { id: 'pentest-exec-b2s-root', label: '代码逆向还原引擎', icon: <FileCode size={12} />, children: [
              { id: 'pentest-exec-b2s-task-list', label: '任务列表', icon: <ListTodo size={12} /> },
              { id: 'pentest-exec-b2s-queue', label: '执行队列', icon: <Workflow size={12} /> },
              { id: 'pentest-exec-b2s-result', label: '结果查询', icon: <FileSearch size={12} /> }
            ]}
          ]},
          { id: 'pentest-report', label: '报告', icon: <FileText size={14} /> }
        ]} />
        <SidebarItem id="security-assessment" label="安全评估" icon={<ClipboardCheck size={20} />} disabled={!hasSelectedProject} />
        <SidebarItem
          id="vuln-root"
          label="漏洞引擎"
          icon={<Cpu size={20} />}
          disabled={!hasSelectedProject}
          healthStatus={vulnHealth}
          applyHealth={true}
          children={[
            { id: 'vuln-overview', label: '生命周期总览', icon: <Activity size={14} /> },
            { id: 'vuln-intake', label: '疑点上报', icon: <FolderOpen size={14} /> },
            { id: 'vuln-analysis', label: '研判阶段', icon: <GitBranch size={14} /> },
            { id: 'vuln-verification', label: '验证阶段', icon: <ShieldCheck size={14} /> },
            { id: 'vuln-decision', label: '结束管理', icon: <ShieldAlert size={14} /> },
            { id: 'vuln-queue', label: '运行队列', icon: <Workflow size={14} /> },
            { id: 'vuln-services', label: '能力注册', icon: <ServerCog size={14} /> },
            { id: 'vuln-repro-config', label: '复现模块配置', icon: <Settings size={14} /> }
          ]}
        />
      </div>
    </nav>
  );
  };

  const renderUserMgmtSidebar = () => {
    const access = getUserAccess(user);
    const isOrdinaryAdmin = access.platformRole === 'ordinary_admin';
    const userCenterChildren = [
      {
        id: 'user-mgmt-users',
        label: '用户账号管理',
        icon: <Users size={14} />,
        disabled: isOrdinaryAdmin,
        disabledTitle: '普通管理员无权访问用户账号管理',
      },
      {
        id: 'user-mgmt-access',
        label: '用户权限管理',
        icon: <Shield size={14} />,
        disabled: isOrdinaryAdmin,
        disabledTitle: '普通管理员无权访问用户权限管理',
      },
      {
        id: 'user-mgmt-online',
        label: '在线会话监控',
        icon: <Globe size={14} />,
        disabled: isOrdinaryAdmin,
        disabledTitle: '普通管理员无权访问在线会话监控',
      },
      {
        id: 'user-mgmt-machine',
        label: '机机凭证管理',
        icon: <Cpu size={14} />,
        disabled: isOrdinaryAdmin,
        disabledTitle: '普通管理员无权访问机机凭证管理',
      },
    ];
    const orgCenterChildren = [
      {
        id: 'org-mgmt-departments',
        label: '部门结构管理',
        icon: <Building2 size={14} />,
        disabled: !access.canManageDepartments,
        disabledTitle: '普通管理员无权访问部门结构管理',
      },
      {
        id: 'org-mgmt-members',
        label: '部门成员管理',
        icon: <Users size={14} />,
        disabled: !access.canManageDepartmentMembers,
        disabledTitle: '当前账号无权访问部门成员管理',
      },
      {
        id: 'org-mgmt-projects',
        label: '项目权限管理',
        icon: <FolderOpen size={14} />,
        disabled: !access.canManageOrgProjects,
        disabledTitle: '当前账号无权访问项目权限管理',
      },
    ];

    return (
    <nav className="flex-1 px-5 py-2 space-y-8 overflow-y-auto custom-scrollbar">
       <div className="space-y-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-3 px-4 py-2 text-xs font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest mb-4"
          >
             <ArrowLeftCircle size={16} /> 返回业务大盘
          </button>

          <SidebarItem
            id="user-mgmt-root"
            label="用户权限中心"
            icon={<ShieldAlert size={20} />}
            children={userCenterChildren}
          />
          
          <SidebarItem 
            id="org-mgmt-root" 
            label="组织架构管理" 
            icon={<Building2 size={20} />} 
            children={orgCenterChildren} 
          />
       </div>
    </nav>
  );
  };

  return (
    <aside className={`${isSidebarCollapsed ? 'w-24' : 'w-80'} bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 z-30 shadow-2xl shrink-0`}>
      <div className="p-8 flex items-center gap-4 shrink-0">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
          {isUserMgmtMode ? <UserCog className="text-white" size={28} /> : <Shield className="text-white" size={28} />}
        </div>
        {!isSidebarCollapsed && (
          <div className="flex flex-col">
            <span className="text-xl font-black text-white tracking-tighter">SecFlow</span>
            <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.3em]">{isUserMgmtMode ? 'Admin Console' : 'Security Engine'}</span>
          </div>
        )}
      </div>

      {isUserMgmtMode ? renderUserMgmtSidebar() : renderMainSidebar()}

      <div className="p-6 border-t border-slate-800">
         {!isSidebarCollapsed && (
           <div className="flex items-center gap-4 p-4 bg-slate-800/40 rounded-3xl">
             <div className="w-11 h-11 rounded-2xl bg-blue-500 flex items-center justify-center text-white font-black">
               {user?.username?.[0]?.toUpperCase()}
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-sm font-black text-white truncate">{user?.username}</p>
               <button onClick={handleLogout} className="text-[10px] text-red-400 font-bold hover:underline text-left">退出登录</button>
             </div>
             <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 text-slate-500">
               <PanelLeftClose size={18} />
             </button>
           </div>
         )}
         {isSidebarCollapsed && (
           <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="w-full flex justify-center p-3 text-slate-500">
             <PanelLeftOpen size={22} />
           </button>
         )}
      </div>
    </aside>
  );
};
