
import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Briefcase, Monitor, HardDrive, Workflow,
  RefreshCw, CheckCircle, XCircle, AlertCircle, Activity,
  Layers, Zap, Server, Clock
} from 'lucide-react';
import { PageHeader } from '../../design-system';
import { AdminDashboardStats } from '../../types/types';

interface AdminDashboardPageProps {
  adminStats: AdminDashboardStats | null;
  loading?: boolean;
  onRefresh: () => Promise<void>;
  setCurrentView: (view: string) => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  adminStats,
  loading = false,
  onRefresh,
  setCurrentView
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const serviceStatusMeta: Record<string, { label: string; panelClass: string; textClass: string; icon: React.ReactNode }> = {
    healthy: {
      label: '正常',
      panelClass: 'bg-green-500/15 border-green-500/20',
      textClass: 'text-green-400',
      icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    },
    unhealthy: {
      label: '异常',
      panelClass: 'bg-red-500/15 border-red-500/20',
      textClass: 'text-red-400',
      icon: <XCircle className="w-5 h-5 text-red-500" />,
    },
    degraded: {
      label: '降级',
      panelClass: 'bg-amber-500/15 border-amber-500/20',
      textClass: 'text-amber-400',
      icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
    },
    stale: {
      label: '陈旧',
      panelClass: 'bg-orange-500/15 border-orange-500/20',
      textClass: 'text-orange-400',
      icon: <Clock className="w-5 h-5 text-orange-500" />,
    },
    unknown: {
      label: '未知',
      panelClass: 'bg-yellow-500/15 border-yellow-500/20',
      textClass: 'text-yellow-400',
      icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    },
    unregistered: {
      label: '未纳管',
      panelClass: 'bg-theme-surface border-theme-border',
      textClass: 'text-theme-text-muted',
      icon: <Server className="w-5 h-5 text-theme-text-muted" />,
    },
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Default empty stats
  const stats = adminStats || {
    users: { total: 0, active: 0, online: 0 },
    roles: { total: 0 },
    projects: { total: 0 },
    agents: { total: 0, online: 0, statusDistribution: {} },
    resources: { totalPvcs: 0, totalStorageGi: 0, statusCounts: {} },
    workflows: { totalInstances: 0, statusDistribution: {}, templates: { appTemplates: 0, jobTemplates: 0 } },
    services: [],
    lastUpdated: new Date().toISOString(),
  };

  const serviceStatusCounts = stats.services.reduce((acc: Record<string, number>, service) => {
    acc[service.status] = (acc[service.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500">
      <PageHeader
        title={<><Shield className="w-8 h-8 text-blue-400 inline" /> 全局管理员控制台</>}
        description="平台整体运行态势与服务健康监控"
        actions={<div className="flex items-center gap-4">
          <span className="text-xs text-theme-text-muted">
            更新于: {new Date(stats.lastUpdated).toLocaleString('zh-CN')}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新数据
          </button>
        </div>}
      />

      {/* Service Health Overview */}
 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border">
        <h3 className="text-xl font-semibold text-theme-text-primary mb-6 flex items-center gap-2">
          <Server className="w-5 h-5" />
          服务健康状态
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {Object.entries(serviceStatusMeta).map(([status, meta]) => (
            <div key={status} className={`p-4 rounded-2xl border ${meta.panelClass}`}>
              <div className="flex items-center gap-2 mb-2">
                {meta.icon}
                <span className={`text-xs font-medium uppercase ${meta.textClass}`}>{meta.label}</span>
              </div>
              <p className="text-2xl font-bold text-theme-text-primary">{serviceStatusCounts[status] || 0}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.services.map((service) => (
            <div key={service.id} className={`p-4 rounded-2xl border ${serviceStatusMeta[service.status].panelClass}`}>
              <div className="flex items-center justify-between mb-2">
                {serviceStatusMeta[service.status].icon}
                <span className={`text-xs font-bold uppercase ${serviceStatusMeta[service.status].textClass}`}>
                  {serviceStatusMeta[service.status].label}
                </span>
              </div>
              <p className="text-xs font-bold text-theme-text-secondary truncate" title={service.name}>
                {service.name}
              </p>
              {service.runtimeStatus ? (
                <p className="mt-1 text-[11px] text-theme-text-muted truncate" title={service.id}>
                  {service.runtimeStatus}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] font-bold text-theme-text-secondary">
                {service.replicas !== null && service.replicas !== undefined
                  ?`副本 ${service.readyReplicas ?? 0}/${service.replicas} · Available ${service.availableReplicas ?? 0}`
                  : '副本信息暂不可用'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {/* Users */}
        <div
          onClick={() => setCurrentView('user-mgmt-access')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-blue-500/15 text-blue-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Users size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">用户总数</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.users.total}</div>
          <p className="text-xs font-bold text-theme-text-muted mt-1">活跃: {stats.users.active} · 在线: {stats.users.online}</p>
        </div>

        {/* Roles */}
        <div
          onClick={() => setCurrentView('user-mgmt-access')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Shield size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">角色定义</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.roles.total}</div>
        </div>

        {/* Projects */}
        <div
          onClick={() => setCurrentView('project-mgmt')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-amber-500/15 text-amber-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Briefcase size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">项目空间</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.projects.total}</div>
        </div>

        {/* Agents */}
        <div
          onClick={() => setCurrentView('env-agent')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-green-500/15 text-green-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Monitor size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">Agent 节点</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.agents.total}</div>
          <p className="text-xs font-bold text-theme-text-muted mt-1">在线: {stats.agents.online}</p>
        </div>

        {/* PVC Storage */}
        <div
          onClick={() => setCurrentView('pvc-management')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-cyan-500/15 text-cyan-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <HardDrive size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">PVC 存储</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.resources.totalPvcs}</div>
          <p className="text-xs font-bold text-theme-text-muted mt-1">{stats.resources.totalStorageGi.toFixed(2)} Gi</p>
        </div>

        {/* Workflows */}
        <div
          onClick={() => setCurrentView('workflow-instances')}
 className="bg-theme-surface p-6 rounded-xl border border-theme-border transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-purple-500/15 text-purple-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Workflow size={24} />
          </div>
          <p className="text-theme-text-muted text-sm font-bold uppercase tracking-wider">工作流实例</p>
          <div className="text-3xl font-bold mt-2 text-theme-text-primary">{stats.workflows.totalInstances}</div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Agent Status Distribution */}
 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border">
          <h3 className="text-xl font-semibold text-theme-text-primary mb-6 flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            Agent 状态分布
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.agents.statusDistribution).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'online' ? 'bg-green-500' :
                    status === 'offline' ? 'bg-slate-300' :
                    status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-sm font-bold text-theme-text-secondary capitalize">{status}</span>
                </div>
                <span className="text-sm font-semibold text-theme-text-primary">{count}</span>
              </div>
            ))}
            <div className="h-2 bg-theme-elevated rounded-full overflow-hidden flex mt-4">
              {stats.agents.total > 0 && (
                <>
                  {stats.agents.statusDistribution.online > 0 && (
                    <div
                      className="h-full bg-green-500 transition-all duration-1000"
                      style={{ width: `${(stats.agents.statusDistribution.online / stats.agents.total) * 100}%` }}
                    />
                  )}
                  {stats.agents.statusDistribution.offline > 0 && (
                    <div
                      className="h-full bg-slate-300 transition-all duration-1000"
                      style={{ width: `${(stats.agents.statusDistribution.offline / stats.agents.total) * 100}%` }}
                    />
                  )}
                  {stats.agents.statusDistribution.error > 0 && (
                    <div
                      className="h-full bg-red-500 transition-all duration-1000"
                      style={{ width: `${(stats.agents.statusDistribution.error / stats.agents.total) * 100}%` }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Status Distribution */}
 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border">
          <h3 className="text-xl font-semibold text-theme-text-primary mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            工作流状态分布
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.workflows.statusDistribution).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'running' ? 'bg-blue-500' :
                    status === 'succeeded' ? 'bg-green-500' :
                    status === 'failed' ? 'bg-red-500' :
                    status === 'pending' ? 'bg-yellow-500' : 'bg-slate-300'
                  }`} />
                  <span className="text-sm font-bold text-theme-text-secondary capitalize">{status}</span>
                </div>
                <span className="text-sm font-semibold text-theme-text-primary">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-theme-border">
            <h4 className="text-sm font-bold text-theme-text-muted mb-4">模板统计</h4>
            <div className="flex gap-4">
              <div className="flex-1 p-4 bg-theme-surface rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-theme-text-muted">应用模板</span>
                </div>
                <p className="text-2xl font-bold text-theme-text-primary">{stats.workflows.templates.appTemplates}</p>
              </div>
              <div className="flex-1 p-4 bg-theme-surface rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-theme-text-muted">任务模板</span>
                </div>
                <p className="text-2xl font-bold text-theme-text-primary">{stats.workflows.templates.jobTemplates}</p>
              </div>
            </div>
          </div>
        </div>

        {/* PVC Status Distribution */}
 <div className="bg-theme-surface p-8 rounded-xl border border-theme-border">
          <h3 className="text-xl font-semibold text-theme-text-primary mb-6 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            PVC 状态分布
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.resources.statusCounts).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'Bound' ? 'bg-green-500' :
                    status === 'Pending' ? 'bg-yellow-500' :
                    status === 'Lost' ? 'bg-red-500' : 'bg-slate-300'
                  }`} />
                  <span className="text-sm font-bold text-theme-text-secondary">{status}</span>
                </div>
                <span className="text-sm font-semibold text-theme-text-primary">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-theme-surface p-8 rounded-xl text-white relative overflow-hidden group">
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-blue-500 opacity-10 rounded-full blur-[80px]" />
          <h3 className="text-xl font-semibold mb-6 relative z-10 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            快速操作
          </h3>
          <div className="grid grid-cols-2 gap-4 relative z-10">
            <button
              onClick={() => setCurrentView('user-mgmt-access')}
 className="px-4 py-3 bg-theme-elevated hover:bg-theme-elevated rounded-xl font-bold transition-all text-sm"
            >
              权限管理
            </button>
            <button
              onClick={() => setCurrentView('user-mgmt-online')}
 className="px-4 py-3 bg-theme-elevated hover:bg-theme-elevated rounded-xl font-bold transition-all text-sm"
            >
              在线会话
            </button>
            <button
              onClick={() => setCurrentView('project-mgmt')}
 className="px-4 py-3 bg-theme-elevated hover:bg-theme-elevated rounded-xl font-bold transition-all text-sm"
            >
              项目管理
            </button>
            <button
              onClick={() => setCurrentView('env-agent')}
 className="px-4 py-3 bg-theme-elevated hover:bg-theme-elevated rounded-xl font-bold transition-all text-sm"
            >
              Agent 管理
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
