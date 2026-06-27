
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  RefreshCw,
  Loader2,
  Clock,
  FileText,
  AlertCircle,
  Lock,
  User,
  Copy,
  Key,
  Check,
  Users,
  Server,
  Bug,
  ClipboardList,
  Trash2,
  Download,
} from 'lucide-react';
import { SecurityProject, MachineToken } from '../../types/types';
import { authApi } from '../../clients/auth';
import { scheduleCenterApi } from '../../clients/scheduleCenter';
import { environmentApi } from '../../clients/environment';
import { api } from '../../clients/api';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../design-system';
import { TaskCenterPage } from '../task/TaskCenterPage';
import { useUiFeedback } from '../../components/UiFeedback';
import { ProjectMemberModal } from './ProjectMemberModal';

/* ── LOKI design tokens ─────────────────────────────────────── */
const LK = {
  primary: '#2563EB',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#5a687e',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
} as const;

const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—');

/* ── Env helpers (mirroring EnvManagementPage) ── */
const getAgentName = (a: any) => a.full_name || a.hostname || a.key || a.agent_key || '—';
const getAgentKey = (a: any) => a.key || a.agent_key || a.id || '';
const getAgentType = (a: any) => String(a.agent_type || a.agentType || a.type || '').toUpperCase();
const AGENT_TYPE_LABELS: Record<string, string> = { NODE_AGENT: 'Node Agent', JAVA_AGENT: 'Java Agent', GAIA_AGENT: 'Gaia Agent', PACKAGE: 'Package' };
const getAgentTypeLabel = (t: string) => AGENT_TYPE_LABELS[t] || t || '未知';
const getIpList = (a: any): string[] => {
  if (a.ip_address) return Array.isArray(a.ip_address) ? a.ip_address : [a.ip_address];
  if (a.ipAddresses) return Array.isArray(a.ipAddresses) ? a.ipAddresses : [a.ipAddresses];
  return [];
};
const getAgentVersion = (a: any) => a.agent_version || a.agentVersion || a.version || '';
const getStatusDot = (a: any) => {
  const s = String(a.status || '').toLowerCase();
  if (['online', 'healthy', 'ready'].includes(s)) return LK.success;
  if (['offline', 'error', 'timeout'].includes(s)) return LK.error;
  if (['connecting', 'pending'].includes(s)) return LK.warning;
  return LK.muted;
};
const getStatusLabel = (a: any) => {
  const s = String(a.status || '').toLowerCase();
  if (['online', 'healthy', 'ready'].includes(s)) return '在线';
  if (['offline', 'error', 'timeout'].includes(s)) return '离线';
  if (['connecting', 'pending'].includes(s)) return '连接中';
  return a.status || '未知';
};

/* ── Vuln helpers (mirroring VulnIntakePage) ── */
const STAGE_TEXT: Record<string, string> = { receive: '接收阶段', triage: '研判阶段', validation: '验证阶段', finished: '已结束' };
const STATUS_TEXT: Record<string, string> = {
  intake_created: '已接收', files_collecting: '文件收集中', ready_for_triage: '待验证', waiting: '等待中',
  ai_assessing: 'AI 研判中', manual_assessing: '人工研判中', awaiting_manual_gate: '待人工确认',
  triage_completed: '研判完成', queued: '待验证', poc_generating: 'POC 生成中', exp_generating: 'EXP 生成中',
  reproducing: '漏洞复现中', evidence_collecting: '证据收集中', validation_completed: '验证完成', finished: '已结束',
};
const toStageText = (v?: string) => (v ? STAGE_TEXT[v] || v : '未知');
const toStatusText = (v?: string) => (v ? STATUS_TEXT[v] || v : '未知');
const severityColor = (s?: string) => {
  if (s === 'critical' || s === 'high') return LK.error;
  if (s === 'medium') return LK.warning;
  if (s === 'low') return LK.success;
  return LK.muted;
};

/* ── Shared table cell/header style ── */
const TH_STYLE: React.CSSProperties = { borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised };
const thClass = 'px-4 py-2.5 font-medium whitespace-nowrap';

interface ProjectDetailPageProps {
  projectId: string;
  projects: SecurityProject[];
  onBack: () => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ projectId, projects, onBack }) => {
  const [loading, setLoading] = useState(true);
  const { confirm, feedbackNodes } = useUiFeedback();

  /* ── block-switched list area ── */
  const [activeBlock, setActiveBlock] = useState<'task' | 'env' | 'vuln'>('task');
  const [taskCount, setTaskCount] = useState(0);
  const [envCount, setEnvCount] = useState(0);
  const [vulnCount, setVulnCount] = useState(0);
  const [envAgents, setEnvAgents] = useState<any[]>([]);
  const [vulnCases, setVulnCases] = useState<any[]>([]);
  const [deletingVulnId, setDeletingVulnId] = useState<string | null>(null);

  /* ── SDK Token state ── */
  const [tokenSectionOpen, setTokenSectionOpen] = useState(false);
  const [projectToken, setProjectToken] = useState<MachineToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  /* ── Member modal ── */
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [userPermissions, setUserPermissions] = useState<UserPermissionInfo | null>(null);

  const project = projects.find(p => p.id === projectId);

  useEffect(() => {
    orgApi.getUserPermissions().then(setUserPermissions).catch(() => null);
  }, []);

  // 成员管理权限：仅项目创建人或 super_admin
  const canManageMembers =
    !!userPermissions && (!!userPermissions.is_admin || String(userPermissions.user_id) === (project?.owner_id || ''));

  /* ── Data loading ── */
  useEffect(() => {
    loadAllData();
  }, [projectId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [taskResp, envResp, vulnResp] = await Promise.all([
        scheduleCenterApi.listUserTasks(projectId, { page: 1, page_size: 20 }).catch(() => ({ items: [], total: 0 })),
        environmentApi.getAgents(projectId, { page: 1, per_page: 20 }).catch(() => ({ agents: [], total: 0 })),
        api.vuln.listCases({ project_id: projectId, page: 1, page_size: 20 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setTaskCount(Number(taskResp.total || 0));
      setEnvCount(Number(envResp.total || 0));
      setEnvAgents(envResp.agents || []);
      setVulnCount(Number(vulnResp.total || 0));
      setVulnCases(vulnResp.items || []);
    } catch (err) {
      console.error('Failed to load project details', err);
    } finally {
      setLoading(false);
    }
  };

  /* ── Vuln actions ── */
  const deleteVuln = async (v: any) => {
    const ok = await confirm({ message: `确认删除漏洞"${v.title || v.id}"？此操作不可恢复。`, danger: true });
    if (!ok) return;
    setDeletingVulnId(v.id);
    try {
      await api.vuln.deleteCase(v.id);
      await loadAllData();
    } catch (err: any) {
      console.error('Delete vuln failed', err);
    } finally {
      setDeletingVulnId(null);
    }
  };

  const openVulnDetail = (v: any) => {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'vuln-intake' } }));
  };

  /* ── SDK Token helpers ── */
  const loadProjectToken = async () => {
    if (!project?.can_manage) {
      setProjectToken(null);
      setTokenError(null);
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.getProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setProjectToken(null);
      setTokenError(err.message || '加载项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const refreshProjectToken = async () => {
    if (projectToken?.token) {
      const ok = await confirm({
        message: '刷新 Token 将导致当前 Token 立即失效。\n请先完成其他系统/脚本中的 Token 替换准备，再继续刷新。\n是否确认刷新？',
        danger: true,
      });
      if (!ok) return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.refreshProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setTokenError(err.message || '刷新项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const copyToken = async () => {
    if (!projectToken?.token) return;
    await navigator.clipboard.writeText(projectToken.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  useEffect(() => {
    void loadProjectToken();
  }, [projectId, project?.can_manage]);

  /* ── Shared button style ── */
  const actionBtnStyle: React.CSSProperties = { backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` };
  const actionBtnClass = 'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors';

  /* ── Loading spinner ── */
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin mb-6" size={48} style={{ color: LK.primary }} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: LK.muted }}>
          正在加载项目数据...
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24" style={{ backgroundColor: LK.canvas }}>
      {feedbackNodes}

      {/* ── Header ─────────────────────────────────────────── */}
      <PageHeader
        title={<span className="inline-flex items-center gap-3">{project?.name || '未知项目'} <StatusBadge status={project?.status || 'Active'} /></span>}
        description={project?.description || undefined}
        back={{ label: '返回项目列表', onClick: onBack }}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadAllData}
              className="p-2.5 rounded-lg transition-all"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
            >
              <RefreshCw size={20} />
            </button>
            {canManageMembers && (
              <button
                onClick={() => setShowMemberModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: LK.primaryMuted, color: LK.primary, border: `1px solid ${LK.border}` }}
              >
                <Users size={18} /> 管理成员
              </button>
            )}
          </div>
        }
      />

      {/* ── Stat Blocks (task / env / vuln) ─────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {([
          { key: 'task' as const, label: '任务', value: taskCount, icon: <ClipboardList size={20} />, accent: LK.info },
          { key: 'env' as const,  label: '环境', value: envCount,  icon: <Server size={20} />,        accent: LK.success },
          { key: 'vuln' as const, label: '漏洞', value: vulnCount, icon: <Bug size={20} />,           accent: LK.error },
        ]).map(stat => (
          <button
            key={stat.key}
            onClick={() => setActiveBlock(stat.key)}
            className="p-6 rounded-xl flex items-center gap-5 transition-all cursor-pointer text-left"
            style={{
              backgroundColor: activeBlock === stat.key ? LK.surfaceRaised : LK.surface,
              border: `1px solid ${activeBlock === stat.key ? LK.primary : LK.border}`,
              boxShadow: activeBlock === stat.key ? `0 0 0 1px ${LK.primary}` : 'none',
            }}
          >
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${stat.accent}18`, color: stat.accent }}
            >
              {stat.icon}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>{stat.label}</p>
              <h4 className="text-2xl font-bold" style={{ color: LK.ink }}>{stat.value}</h4>
            </div>
          </button>
        ))}
      </div>

      {/* ── Block-switched list area ───────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>

        {/* ──── Task list (reuses TaskCenterPage) ──── */}
        {activeBlock === 'task' && (
          <TaskCenterPage projectId={projectId} projects={projects} onRefreshProjects={loadAllData} hideActionBar />
        )}

        {/* ──── Env table (EnvManagementPage layout) ──── */}
        {activeBlock === 'env' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ color: LK.body }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                  <th className={thClass} style={TH_STYLE}>Agent</th>
                  <th className={thClass} style={TH_STYLE}>状态</th>
                  <th className={thClass} style={TH_STYLE}>类型</th>
                  <th className={thClass} style={TH_STYLE}>地址</th>
                  <th className={thClass} style={TH_STYLE}>版本</th>
                  <th className={thClass} style={TH_STYLE}>最近心跳</th>
                  <th className={thClass} style={TH_STYLE}>说明</th>
                </tr>
              </thead>
              <tbody>
                {envAgents.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center" style={{ color: LK.muted }}>暂无环境</td></tr>
                ) : envAgents.map((agent) => {
                  const ips = getIpList(agent);
                  return (
                    <tr
                      key={getAgentKey(agent)}
                      className="transition-colors"
                      style={{ borderBottom: `1px solid ${LK.borderSoft}` }}
                      onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = LK.surfaceRaised); }}
                      onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = 'transparent'); }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: LK.inkSoft }}>{getAgentName(agent)}</div>
                        <div className="mt-1 text-[11px]" style={{ fontFamily: MONO, color: LK.muted }}>{getAgentKey(agent) || '—'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: LK.inkSoft }}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusDot(agent) }} />
                          {getStatusLabel(agent)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: LK.inkSoft }}>
                        {getAgentTypeLabel(getAgentType(agent))}
                      </td>
                      <td className="px-4 py-3">
                        {ips.length > 0 ? (
                          <div className="max-w-[240px] text-xs leading-5" style={{ fontFamily: MONO, color: LK.inkSoft }}>
                            {ips.slice(0, 2).join(', ')}
                            {ips.length > 2 && <span style={{ color: LK.muted }}> +{ips.length - 2}</span>}
                          </div>
                        ) : <span style={{ color: LK.muted }}>—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ fontFamily: MONO, color: LK.muted }}>
                        {getAgentVersion(agent) || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>
                        {formatDateTime(agent.last_seen)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: LK.muted, maxWidth: '320px' }}>
                        {agent.status_reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ──── Vuln table (VulnIntakePage layout) ──── */}
        {activeBlock === 'vuln' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ color: LK.body }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                  <th className={thClass} style={TH_STYLE}>标题 / 摘要</th>
                  <th className={thClass} style={TH_STYLE}>阶段 / 状态</th>
                  <th className={thClass} style={TH_STYLE}>等级</th>
                  <th className={thClass} style={TH_STYLE}>CVSS</th>
                  <th className={thClass} style={TH_STYLE}>上报者</th>
                  <th className={thClass} style={TH_STYLE}>对象</th>
                  <th className={thClass} style={TH_STYLE}>更新时间</th>
                  <th className={thClass} style={TH_STYLE}>置信度</th>
                  <th className={thClass} style={TH_STYLE}>操作</th>
                </tr>
              </thead>
              <tbody>
                {vulnCases.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center" style={{ color: LK.muted }}>暂无漏洞</td></tr>
                ) : vulnCases.map((v) => (
                  <tr
                    key={v.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: `1px solid ${LK.borderSoft}` }}
                    onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = LK.surfaceRaised); }}
                    onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = 'transparent'); }}
                    onClick={() => openVulnDetail(v)}
                  >
                    <td className="px-4 py-3" style={{ minWidth: '200px' }}>
                      <div className="font-semibold" style={{ color: LK.inkSoft }}>{v.title || v.id}</div>
                      <div className="mt-1 text-[11px]" style={{ fontFamily: MONO, color: LK.muted }}>{v.id}</div>
                      <div className="mt-1 text-xs line-clamp-2 leading-5" style={{ color: LK.muted }}>{v.summary || '暂无摘要'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold" style={{ color: LK.inkSoft }}>{toStageText(v.current_stage)}</div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                        {toStatusText(v.current_status)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: `${severityColor(v.severity)}18`, color: severityColor(v.severity) }}
                      >
                        {v.severity || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold" style={{ color: LK.inkSoft }}>
                      {Number(v.cvss_score || 0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: '120px' }}>
                      <div className="font-semibold truncate" style={{ color: LK.inkSoft }}>{v.reporter?.name || 'unknown'}</div>
                      <div className="mt-0.5 text-xs" style={{ color: LK.muted }}>{v.reporter?.version || 'n/a'}</div>
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: '140px' }}>
                      <div className="font-semibold truncate" style={{ color: LK.inkSoft }}>{v.subject?.locator || 'unscoped asset'}</div>
                      <div className="mt-0.5 text-xs" style={{ color: LK.muted }}>{v.subject?.type || 'generic'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>
                      {formatDateTime(v.updated_at || v.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xl font-semibold" style={{ color: LK.ink }}>
                      {v.confidence}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          className={actionBtnClass}
                          style={actionBtnStyle}
                          onClick={() => openVulnDetail(v)}
                        >
                          <Download size={12} /> 下载
                        </button>
                        <button
                          className={actionBtnClass}
                          style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
                          disabled={deletingVulnId === v.id}
                          onClick={() => deleteVuln(v)}
                        >
                          {deletingVulnId === v.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          {deletingVulnId === v.id ? '删除中' : '删除'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SDK Token card (can_manage only) ────────────────── */}
      {project?.can_manage && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <button
            type="button"
            onClick={() => setTokenSectionOpen(prev => !prev)}
            className="w-full px-5 py-4 flex items-center justify-between cursor-pointer transition-colors hover:opacity-90"
            style={{ borderBottom: tokenSectionOpen ? `1px solid ${LK.borderSoft}` : 'none' }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: LK.ink }}>
              <Key size={16} style={{ color: LK.primary }} /> 项目 SDK Token
            </h3>
            <ChevronDown
              size={16}
              className="transition-transform"
              style={{ color: LK.muted, transform: tokenSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {tokenSectionOpen && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: LK.inkSoft }}>第三方 SDK 专用项目凭证</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-1" style={{ color: LK.muted }}>
                  {projectToken?.machine_code || `project-sdk:${projectId}`}
                </p>
              </div>
              <button
                onClick={refreshProjectToken}
                disabled={tokenLoading}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              >
                {tokenLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                手动刷新
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>Token</p>
              <div className="relative">
                <div
                  className="text-xs font-mono break-all rounded-lg p-5 pr-16 min-h-[96px]"
                  style={{ backgroundColor: '#0a1020', color: LK.info, border: `1px solid ${LK.borderSoft}` }}
                >
                  {tokenLoading && !projectToken ? '正在加载项目 Token...' : (projectToken?.token || '当前 Token 不可用')}
                </div>
                {!!projectToken?.token && (
                  <button
                    onClick={copyToken}
                    className="absolute top-3 right-3 p-3 rounded-lg transition-all hover:opacity-80"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.ink, border: `1px solid ${LK.border}` }}
                  >
                    {tokenCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center text-xs font-medium" style={{ color: LK.muted }}>
              <span>作用域: 项目级</span>
              <span>过期时间: {projectToken?.expires_at ? projectToken.expires_at.replace('T', ' ') : '永不过期'}</span>
            </div>
            {tokenError && (
              <div className="text-xs font-medium" style={{ color: LK.error }}>{tokenError}</div>
            )}
          </div>
          )}
        </div>
      )}

      {/* ── Member management modal ────────────────────────── */}
      {showMemberModal && project && (
        <ProjectMemberModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowMemberModal(false)}
        />
      )}
    </div>
  );
};
