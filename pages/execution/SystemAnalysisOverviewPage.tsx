import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, ShieldAlert, Server } from 'lucide-react';

import { api } from '../../clients/api';
import { SystemAnalysisCapabilitiesResponse } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

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
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">环境概览</h1>
            <p className="mt-2 text-sm text-slate-500">展示当前项目系统分析可用能力、近期任务与风险分布。</p>
          </div>
          <button onClick={() => void loadData()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">刷新</button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" />加载中...</div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{item.icon}{item.label}</div>
                <div className="mt-4 text-3xl font-black text-slate-900">{item.value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">近期风险摘要</h2>
            <div className="mt-3 text-sm text-slate-600">
              critical {overview?.risk_summary?.critical ?? 0} / high {overview?.risk_summary?.high ?? 0} / medium {overview?.risk_summary?.medium ?? 0} / low {overview?.risk_summary?.low ?? 0}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(overview?.recent_findings || []).map((item: any, idx: number) => (
                <div key={`${item.task_id}-${item.agent_key}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{item.task_id} · {item.agent_key} · {item.risk_level}</div>
                  <div className="mt-1 text-sm text-slate-800">{item.summary || '-'}</div>
                </div>
              ))}
              {(overview?.recent_findings || []).length === 0 ? <div className="text-sm text-slate-500">暂无数据</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-auto">
            <h2 className="text-lg font-black text-slate-900">节点能力矩阵</h2>
            <table className="mt-4 w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2">节点</th>
                  <th className="py-2 pr-2">状态</th>
                  <th className="py-2 pr-2">Helper</th>
                  <th className="py-2 pr-2">可选AI Agent</th>
                  <th className="py-2 pr-2">最近分析</th>
                </tr>
              </thead>
              <tbody>
                {(capabilities?.items || []).map((item) => (
                  <tr key={item.agent_key} className="border-b border-slate-100">
                    <td className="py-3 pr-2">
                      <div className="font-semibold text-slate-900">{item.agent_hostname || item.agent_key}</div>
                      <div className="text-xs text-slate-500">{item.agent_key} · {item.agent_ip || '-'}</div>
                    </td>
                    <td className="py-3 pr-2">{item.agent_status}</td>
                    <td className="py-3 pr-2">{item.helper_installed ? `${item.helper_service_name || '-'} (${item.helper_status || 'unknown'})` : '未部署'}</td>
                    <td className="py-3 pr-2">{item.available_ai_agents.length}</td>
                    <td className="py-3 pr-2 text-slate-600">{item.last_analysis_summary || '-'}</td>
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
