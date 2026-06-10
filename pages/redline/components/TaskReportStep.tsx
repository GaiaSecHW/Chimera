import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Download, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  redlineVerificationApi,
  RedlineTask,
  RedlineTaskAgent,
  RedlineRedLineClause,
  RedlineRedLineResult,
} from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onPrev: () => void;
}

function extractTestResult(result?: string): string {
  if (!result) return '-';
  const idx = result.indexOf('用例结果');
  if (idx === -1) return '-';
  const afterKeyword = result.substring(idx);
  if (afterKeyword.includes('不通过')) return '不通过';
  if (afterKeyword.includes('通过')) return '通过';
  return '-';
}

export const TaskReportStep: React.FC<Props> = ({ taskId, task, onTaskUpdated, onPrev }) => {
  const [agents, setAgents] = useState<RedlineTaskAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeToc, setActiveToc] = useState('summary');
  const [clauseMap, setClauseMap] = useState<Record<string, RedlineRedLineClause[]>>({});
  const [results, setResults] = useState<RedlineRedLineResult[]>([]);
  const [savingResult, setSavingResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const statusRes = await redlineVerificationApi.getExecutionStatus(taskId);
      if (statusRes.code === 200 && statusRes.data) {
        setAgents(statusRes.data);
        // Load clauses for each agent
        const clauseEntries: Record<string, RedlineRedLineClause[]> = {};
        await Promise.all(
          statusRes.data.map(async (agent) => {
            try {
              const clauseRes = await redlineVerificationApi.getAgentRedLineClauses(agent.agentId);
              if (clauseRes.code === 200 && clauseRes.data) {
                clauseEntries[agent.agentId] = clauseRes.data;
              }
            } catch {
              // ignore clause loading errors
            }
          }),
        );
        setClauseMap(clauseEntries);
      }

      // Load existing red-line results
      const resultsRes = await redlineVerificationApi.getRedLineResults(taskId);
      if (resultsRes.code === 200 && resultsRes.data) {
        setResults(resultsRes.data);
      }
    } catch (err) {
      console.error('Failed to load report data', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    let content = `# ${task.name} - 测试报告\n\n`;
    content += `## 汇总\n\n`;
    content += `| 智能体 | 执行结果 | 用例结果 |\n`;
    content += `|--------|----------|----------|\n`;
    for (const agent of agents) {
      const execResult = agent.isSuccess === true ? '成功' : agent.isSuccess === false ? '失败' : '-';
      const testResult = extractTestResult(agent.result);
      content += `| ${agent.agentName || agent.agentId} | ${execResult} | ${testResult} |\n`;
    }
    content += '\n';
    for (const agent of agents) {
      content += `## ${agent.agentName || agent.agentId}\n\n`;
      content += (agent.result || '无结果') + '\n\n';
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.name}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (id: string) => {
    setActiveToc(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const getResultForClause = (clauseId: string, agentId: string): RedlineRedLineResult | undefined => {
    return results.find((r) => r.redLineClauseId === clauseId && r.executionId === agentId);
  };

  const handleRedLineToggle = async (
    agent: RedlineTaskAgent,
    clause: RedlineRedLineClause,
    status: 'PASS' | 'FAIL',
  ) => {
    const key = `${clause.id}-${status}`;
    setSavingResult(key);
    try {
      const existing = getResultForClause(clause.id, agent.agentId);
      if (existing) {
        await redlineVerificationApi.updateRedLineResult(existing.id, { status });
        setResults((prev) =>
          prev.map((r) => (r.id === existing.id ? { ...r, status } : r)),
        );
      } else {
        const res = await redlineVerificationApi.batchSaveRedLineResults(taskId, agent.id, [
          { redLineClauseId: clause.id, status, executionResult: agent.result || '' },
        ]);
        if (res.code === 200) {
          // Reload results to get IDs
          const refreshed = await redlineVerificationApi.getRedLineResults(taskId);
          if (refreshed.code === 200 && refreshed.data) {
            setResults(refreshed.data);
          }
        }
      }
    } catch (err) {
      console.error('Failed to save red-line result', err);
    } finally {
      setSavingResult(null);
    }
  };

  // Compute red-line stats per agent
  const getRedLineStats = (agentId: string): string => {
    const clauses = clauseMap[agentId] || [];
    if (clauses.length === 0) return '-';
    const agentResults = clauses
      .map((c) => getResultForClause(c.id, agentId))
      .filter(Boolean) as RedlineRedLineResult[];
    const passCount = agentResults.filter((r) => r.status === 'PASS').length;
    const total = clauses.length;
    const allPassed = passCount === total && total > 0;
    const hasFail = agentResults.some((r) => r.status === 'FAIL');
    if (hasFail) return `${passCount}/${total} FAIL`;
    if (allPassed) return `${passCount}/${total} PASS`;
    return `${passCount}/${total}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-theme-text-secondary">加载报告数据...</span>
      </div>
    );
  }

  const tocItems = [
    { id: 'summary', label: '汇总' },
    ...agents.map((a) => ({ id: `agent-${a.agentId}`, label: a.agentName || a.agentId })),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-theme-border">
        <button
          onClick={onPrev}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回执行
        </button>
        <button
          onClick={() => { loadData(); onTaskUpdated(); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover"
        >
          <Download className="w-3.5 h-3.5" />
          导出报告
        </button>
      </div>

      {/* Main content with TOC */}
      <div className="flex flex-1 overflow-hidden">
        {/* TOC sidebar */}
        <nav className="w-48 flex-shrink-0 border-r border-theme-border overflow-y-auto py-4 px-2">
          <div className="text-xs font-medium text-theme-text-secondary uppercase tracking-wider px-3 mb-2">
            目录
          </div>
          {tocItems.map((item) => (
            <div
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer truncate ${
                activeToc === item.id
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'text-theme-text-secondary hover:bg-theme-surface-hover'
              }`}
            >
              {item.label}
            </div>
          ))}
        </nav>

        {/* Report content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Summary section */}
          <section id="summary" className="mb-8">
            <h2 className="text-lg font-semibold text-theme-text-primary mb-4">汇总</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-theme-border">
                  <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">智能体</th>
                  <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">执行结果</th>
                  <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">用例结果</th>
                  <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">红线</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const execResult =
                    agent.isSuccess === true ? '成功' : agent.isSuccess === false ? '失败' : '-';
                  const testResult = extractTestResult(agent.result);
                  const redLineStat = getRedLineStats(agent.agentId);
                  return (
                    <tr key={agent.id} className="border-b border-theme-border/50">
                      <td className="py-2 px-3 text-theme-text-primary">
                        {agent.agentName || agent.agentId}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={
                            execResult === '成功'
                              ? 'text-emerald-500'
                              : execResult === '失败'
                                ? 'text-rose-500'
                                : 'text-theme-text-secondary'
                          }
                        >
                          {execResult}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={
                            testResult === '通过'
                              ? 'text-emerald-500'
                              : testResult === '不通过'
                                ? 'text-rose-500'
                                : 'text-theme-text-secondary'
                          }
                        >
                          {testResult}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-theme-text-secondary text-xs">
                        {redLineStat}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Per-agent report sections */}
          {agents.map((agent) => {
            const agentClauses = clauseMap[agent.agentId] || [];
            return (
              <section
                key={agent.id}
                id={`agent-${agent.agentId}`}
                className="mt-8 pt-6 border-t border-theme-border"
              >
                <h3 className="text-base font-semibold text-theme-text-primary mb-4">
                  {agent.agentName || agent.agentId} 报告
                </h3>

                {/* Markdown rendered result */}
                <div className="prose prose-sm prose-invert max-w-none mb-6">
                  {agent.result ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {agent.result}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-theme-text-secondary italic">无结果</p>
                  )}
                </div>

                {/* Red-line clause confirmation */}
                {agentClauses.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-theme-text-primary mb-3">
                      红线条款确认
                    </h4>
                    <div className="space-y-2">
                      {agentClauses.map((clause) => {
                        const existingResult = getResultForClause(clause.id, agent.agentId);
                        const currentStatus = existingResult?.status;
                        const isPass = currentStatus === 'PASS';
                        const isFail = currentStatus === 'FAIL';
                        return (
                          <div
                            key={clause.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-theme-surface-secondary"
                          >
                            <span className="flex-1 text-xs text-theme-text-primary truncate" title={clause.content || clause.name}>
                              {clause.name}
                            </span>
                            <button
                              onClick={() => handleRedLineToggle(agent, clause, 'PASS')}
                              disabled={savingResult !== null}
                              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                isPass
                                  ? 'bg-emerald-600 text-white'
                                  : 'border border-emerald-500 text-emerald-500 hover:bg-emerald-500/10'
                              }`}
                            >
                              PASS
                            </button>
                            <button
                              onClick={() => handleRedLineToggle(agent, clause, 'FAIL')}
                              disabled={savingResult !== null}
                              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                isFail
                                  ? 'bg-rose-600 text-white'
                                  : 'border border-rose-500 text-rose-500 hover:bg-rose-500/10'
                              }`}
                            >
                              FAIL
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {agents.length === 0 && (
            <div className="text-center py-12 text-theme-text-secondary">
              暂无执行结果
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
