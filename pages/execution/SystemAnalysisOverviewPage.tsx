import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, ShieldAlert, Server } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisCapabilitiesResponse } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;

export const SystemAnalysisOverviewPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution;
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<SystemAnalysisCapabilitiesResponse | null>(null);
  const [overview, setOverview] = useState<any>(null);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [capResp, overviewResp] = await Promise.all([
        executionApi.systemAnalysis.getCapabilities(projectId),
        executionApi.systemAnalysis.getOverview(projectId),
      ]);
      setCapabilities(capResp);
      setOverview(overviewResp);
    } catch (error: any) {
      notify(`加载系统分析概览失败: ${error?.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [projectId]);

  const statCards = useMemo(() => {
    const summary = capabilities?.summary || { total_nodes: 0, online_nodes: 0, helper_ready_nodes: 0, analyzable_nodes: 0 };
    return [
      { key: 'total', label: '节点总数', value: summary.total_nodes, icon: <Server size={16} /> },
      { key: 'online', label: '在线节点', value: summary.online_nodes, icon: <Activity size={16} /> },
      { key: 'helper', label: 'Helper就绪', value: summary.helper_ready_nodes, icon: <ShieldAlert size={16} /> },
      { key: 'analyzable', label: '可分析节点', value: summary.analyzable_nodes, icon: <ShieldAlert size={16} /> },
    ];
  }, [capabilities]);

  return (
    <div className="px-5 py-5 space-y-4" style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      {feedbackNodes}
      <section className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.primary }}>System Analysis</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: LK.ink }}>环境概览</h1>
            <p className="mt-2 text-sm" style={{ color: LK.body }}>展示当前项目系统分析可用能力、近期任务与风险分布。</p>
          </div>
          <button onClick={() => void loadData()} className="btn-primary">刷新</button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg p-4 text-sm inline-flex items-center gap-2" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}><Loader2 size={15} className="animate-spin" />加载中...</div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((item) => (
              <div key={item.key} className="rounded-lg p-4" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: LK.muted }}>{item.icon}{item.label}</div>
                <div className="mt-4 text-2xl font-semibold" style={{ color: LK.ink }}>{item.value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-xl p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <h2 className="text-base font-semibold" style={{ color: LK.ink }}>近期风险摘要</h2>
            <div className="mt-3 text-sm" style={{ color: LK.body }}>
              critical {overview?.risk_summary?.critical ?? 0} / high {overview?.risk_summary?.high ?? 0} / medium {overview?.risk_summary?.medium ?? 0} / low {overview?.risk_summary?.low ?? 0}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(overview?.recent_findings || []).map((item: any, idx: number) => (
                <div key={`${item.task_id}-${item.agent_key}-${idx}`} className="rounded-lg p-3" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
                  <div className="text-xs" style={{ color: LK.muted }}>{item.task_id} · {item.agent_key} · {item.risk_level}</div>
                  <div className="mt-1 text-sm" style={{ color: LK.ink }}>{item.summary || '-'}</div>
                </div>
              ))}
              {(overview?.recent_findings || []).length === 0 ? <div className="text-sm" style={{ color: LK.muted }}>暂无数据</div> : null}
            </div>
          </section>

          <section className="rounded-xl p-4 overflow-auto" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
            <h2 className="text-base font-semibold" style={{ color: LK.ink }}>节点能力矩阵</h2>
            <table className="mt-4 w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                  <th className="py-2 pr-2" style={{ color: LK.muted }}>节点</th>
                  <th className="py-2 pr-2" style={{ color: LK.muted }}>状态</th>
                  <th className="py-2 pr-2" style={{ color: LK.muted }}>Helper</th>
                  <th className="py-2 pr-2" style={{ color: LK.muted }}>可选AI Agent</th>
                  <th className="py-2 pr-2" style={{ color: LK.muted }}>最近分析</th>
                </tr>
              </thead>
              <tbody>
                {(capabilities?.items || []).map((item) => (
                  <tr key={item.agent_key} style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                    <td className="py-3 pr-2">
                      <div className="font-medium" style={{ color: LK.ink }}>{item.agent_hostname || item.agent_key}</div>
                      <div className="text-xs" style={{ color: LK.muted }}>{item.agent_key} · {item.agent_ip || '-'}</div>
                    </td>
                    <td className="py-3 pr-2">{item.agent_status}</td>
                    <td className="py-3 pr-2">{item.helper_installed ?`${item.helper_service_name || '-'} (${item.helper_status || 'unknown'})` : '未部署'}</td>
                    <td className="py-3 pr-2">{item.available_ai_agents.length}</td>
                    <td className="py-3 pr-2" style={{ color: LK.body }}>{item.last_analysis_summary || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
};
