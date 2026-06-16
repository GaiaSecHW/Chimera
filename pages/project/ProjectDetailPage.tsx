
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  RefreshCw,
  Loader2,
  Clock,
  FileText,
  AlertCircle,
  X,
  Lock,
  User,
  Copy,
  Key,
  Check,
  Users,
  Server,
  Bug,
  ClipboardList,
} from 'lucide-react';
import { SecurityProject, MachineToken } from '../../types/types';
import { authApi } from '../../clients/auth';
import { StatusBadge } from '../../components/StatusBadge';

/* ── LOKI design tokens ─────────────────────────────────────── */
const LK = {
  primary: '#4f73ff',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

interface ProjectDetailPageProps {
  projectId: string;
  projects: SecurityProject[];
  onBack: () => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ projectId, projects, onBack }) => {
  const [loading, setLoading] = useState(true);

  /* ── block-switched list area ── */
  const [activeBlock, setActiveBlock] = useState<'task' | 'env' | 'vuln'>('task');
  const [taskCount, setTaskCount] = useState(0);
  const [envCount, setEnvCount] = useState(0);
  const [vulnCount, setVulnCount] = useState(0);

  /* ── SDK Token state ── */
  const [projectToken, setProjectToken] = useState<MachineToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  /* ── Member modal ── */
  const [showMemberModal, setShowMemberModal] = useState(false);

  const project = projects.find(p => p.id === projectId);

  /* ── Data loading ── */
  useEffect(() => {
    loadAllData();
  }, [projectId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Placeholder — future: fetch task/env/vuln counts from backend
      setTaskCount(0);
      setEnvCount(0);
      setVulnCount(0);
    } catch (err) {
      console.error('Failed to load project details', err);
    } finally {
      setLoading(false);
    }
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
      const confirmed = window.confirm(
        '刷新 Token 将导致当前 Token 立即失效。\n请先完成其他系统/脚本中的 Token 替换准备，再继续刷新。\n是否确认刷新？',
      );
      if (!confirmed) return;
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

  /* ── Loading spinner ── */
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 animate-in fade-in">
        <Loader2 className="animate-spin mb-6" size={48} style={{ color: LK.primary }} />
        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: LK.muted }}>
          正在加载项目数据...
        </p>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24" style={{ backgroundColor: LK.canvas }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack}
            className="p-4 rounded-2xl transition-all group active:scale-95"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" style={{ color: LK.body }} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight" style={{ color: LK.ink }}>
                {project?.name || '未知项目'}
              </h2>
              <StatusBadge status={project?.status || 'Active'} />
            </div>
            {project?.description && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: LK.body }}>
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadAllData}
            className="p-4 rounded-2xl transition-all hover:opacity-80"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={() => setShowMemberModal(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: LK.primaryMuted, color: LK.primary, border: `1px solid ${LK.border}` }}
          >
            <Users size={18} /> 管理成员
          </button>
        </div>
      </div>

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
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${stat.accent}18`, color: stat.accent }}
            >
              {stat.icon}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: LK.muted }}>{stat.label}</p>
              <h4 className="text-2xl font-black" style={{ color: LK.ink }}>{stat.value}</h4>
            </div>
          </button>
        ))}
      </div>

      {/* ── Block-switched list area ───────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        {activeBlock === 'task' && (
          <div className="p-8">
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: LK.muted }}>任务列表将在此展示</p>
              <p className="text-xs mt-2" style={{ color: LK.muted }}>此区域将嵌入当前项目下的任务数据</p>
            </div>
          </div>
        )}
        {activeBlock === 'env' && (
          <div className="p-8">
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: LK.muted }}>环境列表将在此展示</p>
              <p className="text-xs mt-2" style={{ color: LK.muted }}>此区域将嵌入当前项目下的环境代理数据</p>
            </div>
          </div>
        )}
        {activeBlock === 'vuln' && (
          <div className="p-8">
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: LK.muted }}>漏洞列表将在此展示</p>
              <p className="text-xs mt-2" style={{ color: LK.muted }}>此区域将嵌入当前项目下的漏洞数据</p>
            </div>
          </div>
        )}
      </div>

      {/* ── SDK Token card (can_manage only) ────────────────── */}
      {project?.can_manage && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: LK.ink }}>
              <Key size={16} style={{ color: LK.primary }} /> 项目 SDK Token
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: LK.inkSoft }}>第三方 SDK 专用项目凭证</p>
                <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: LK.muted }}>
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
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: LK.muted }}>Token</p>
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
        </div>
      )}

      {/* ── Member management modal ────────────────────────── */}
      {showMemberModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div className="w-full max-w-lg rounded-2xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
              <h3 className="text-base font-semibold" style={{ color: LK.ink }}>项目成员管理</h3>
              <button
                onClick={() => setShowMemberModal(false)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: LK.muted }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-8 text-center">
              <p className="text-sm" style={{ color: LK.muted }}>成员管理功能即将上线</p>
              <p className="text-xs mt-2" style={{ color: LK.muted }}>需要后端接口 GET /api/project/{'{id}'}/members</p>
            </div>
            <div className="px-6 py-4 flex justify-end" style={{ borderTop: `1px solid ${LK.borderSoft}` }}>
              <button
                onClick={() => setShowMemberModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
