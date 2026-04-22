
import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Briefcase, Monitor, HardDrive, Workflow,
  RefreshCw, CheckCircle, XCircle, AlertCircle, Activity,
  Layers, Zap, Server, Clock
} from 'lucide-react';
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
      panelClass: 'bg-green-50 border-green-200',
      textClass: 'text-green-600',
      icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    },
    unhealthy: {
      label: '异常',
      panelClass: 'bg-red-50 border-red-200',
      textClass: 'text-red-600',
      icon: <XCircle className="w-5 h-5 text-red-500" />,
    },
    degraded: {
      label: '降级',
      panelClass: 'bg-amber-50 border-amber-200',
      textClass: 'text-amber-600',
      icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
    },
    stale: {
      label: '陈旧',
      panelClass: 'bg-orange-50 border-orange-200',
      textClass: 'text-orange-600',
      icon: <Clock className="w-5 h-5 text-orange-500" />,
    },
    unknown: {
      label: '未知',
      panelClass: 'bg-yellow-50 border-yellow-200',
      textClass: 'text-yellow-600',
      icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    },
    unregistered: {
      label: '未纳管',
      panelClass: 'bg-slate-50 border-slate-200',
      textClass: 'text-slate-500',
      icon: <Server className="w-5 h-5 text-slate-400" />,
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
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            全局管理员控制台
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            平台整体运行态势与服务健康监控
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">
            更新于: {new Date(stats.lastUpdated).toLocaleString('zh-CN')}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新数据
          </button>
        </div>
      </div>

      {/* Service Health Overview */}
      <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <Server className="w-5 h-5" />
          服务健康状态
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {Object.entries(serviceStatusMeta).map(([status, meta]) => (
            <div key={status} className={`p-4 rounded-2xl border ${meta.panelClass}`}>
              <div className="flex items-center gap-2 mb-2">
                {meta.icon}
                <span className={`text-xs font-black uppercase ${meta.textClass}`}>{meta.label}</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{serviceStatusCounts[status] || 0}</p>
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
              <p className="text-xs font-bold text-slate-700 truncate" title={service.name}>
                {service.name}
              </p>
              {service.runtimeStatus ? (
                <p className="mt-1 text-[11px] text-slate-500 truncate" title={service.id}>
                  {service.runtimeStatus}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] font-bold text-slate-700">
                {service.replicas !== null && service.replicas !== undefined
                  ? `副本 ${service.readyReplicas ?? 0}/${service.replicas} · Available ${service.availableReplicas ?? 0}`
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
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Users size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">用户总数</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.users.total}</div>
          <p className="text-xs font-bold text-slate-400 mt-1">活跃: {stats.users.active} · 在线: {stats.users.online}</p>
        </div>

        {/* Roles */}
        <div
          onClick={() => setCurrentView('user-mgmt-access')}
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Shield size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">角色定义</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.roles.total}</div>
        </div>

        {/* Projects */}
        <div
          onClick={() => setCurrentView('project-mgmt')}
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Briefcase size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">项目空间</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.projects.total}</div>
        </div>

        {/* Agents */}
        <div
          onClick={() => setCurrentView('env-agent')}
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Monitor size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Agent 节点</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.agents.total}</div>
          <p className="text-xs font-bold text-slate-400 mt-1">在线: {stats.agents.online}</p>
        </div>

        {/* PVC Storage */}
        <div
          onClick={() => setCurrentView('pvc-management')}
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <HardDrive size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">PVC 存储</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.resources.totalPvcs}</div>
          <p className="text-xs font-bold text-slate-400 mt-1">{stats.resources.totalStorageGi.toFixed(2)} Gi</p>
        </div>

        {/* Workflows */}
        <div
          onClick={() => setCurrentView('workflow-instances')}
          className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Workflow size={24} />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">工作流实例</p>
          <div className="text-3xl font-black mt-2 text-slate-900">{stats.workflows.totalInstances}</div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Agent Status Distribution */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
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
                  <span className="text-sm font-bold text-slate-600 capitalize">{status}</span>
                </div>
                <span className="text-sm font-black text-slate-800">{count}</span>
              </div>
            ))}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex mt-4">
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
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
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
                  <span className="text-sm font-bold text-slate-600 capitalize">{status}</span>
                </div>
                <span className="text-sm font-black text-slate-800">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-500 mb-4">模板统计</h4>
            <div className="flex gap-4">
              <div className="flex-1 p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-slate-500">应用模板</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{stats.workflows.templates.appTemplates}</p>
              </div>
              <div className="flex-1 p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-500">任务模板</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{stats.workflows.templates.jobTemplates}</p>
              </div>
            </div>
          </div>
        </div>

        {/* PVC Status Distribution */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
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
                  <span className="text-sm font-bold text-slate-600">{status}</span>
                </div>
                <span className="text-sm font-black text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-900 p-8 rounded-[3rem] text-white relative overflow-hidden group">
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-blue-500 opacity-10 rounded-full blur-[80px]" />
          <h3 className="text-xl font-black mb-6 relative z-10 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            快速操作
          </h3>
          <div className="grid grid-cols-2 gap-4 relative z-10">
            <button
              onClick={() => setCurrentView('user-mgmt-access')}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all text-sm"
            >
              权限管理
            </button>
            <button
              onClick={() => setCurrentView('user-mgmt-online')}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all text-sm"
            >
              在线会话
            </button>
            <button
              onClick={() => setCurrentView('project-mgmt')}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all text-sm"
            >
              项目管理
            </button>
            <button
              onClick={() => setCurrentView('env-agent')}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all text-sm"
            >
              Agent 管理
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
