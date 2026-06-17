import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Download, Loader2, Pencil } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
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

function extractTextFromResult(resultStr?: string): string {
  if (!resultStr) return '';
  try {
    const result = JSON.parse(resultStr);
    return result.data?.outputs?.text || '';
  } catch {
    return resultStr;
  }
}

function extractTestResult(resultStr?: string): string {
  const text = extractTextFromResult(resultStr);
  if (!text) return '-';
  const idx = text.indexOf('用例结果');
  if (idx === -1) return '-';
  const afterKeyword = text.substring(idx + '用例结果'.length);
  if (afterKeyword.includes('不通过')) return '不通过';
  if (afterKeyword.includes('通过')) return '通过';
  return '-';
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 text-theme-text-primary">{children}</p>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-400 underline">{children}</a>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ol>,
  h1: ({ children }) => <h1 className="mb-3 text-xl font-bold text-theme-text-primary last:mb-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 text-lg font-bold text-theme-text-primary last:mb-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-base font-bold text-theme-text-primary last:mb-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 text-sm font-bold text-theme-text-primary last:mb-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 border-slate-500 bg-theme-surface px-4 py-2 italic text-theme-text-secondary last:mb-0">{children}</blockquote>,
  table: ({ children }) => <div className="mb-3 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-theme-surface">{children}</thead>,
  th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-bold text-theme-text-primary">{children}</th>,
  td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top text-theme-text-primary">{children}</td>,
  code: ({ children, className }) => className
    ? <code className="block overflow-x-auto rounded-lg border border-theme-border bg-theme-bg-app px-4 py-3 font-mono text-xs text-theme-text-primary">{children}</code>
    : <code className="rounded bg-theme-surface px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">{children}</code>,
  pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
  hr: () => <hr className="my-4 border-theme-border" />,
};

export const TaskReportStep: React.FC<Props> = ({ taskId, task, onTaskUpdated, onPrev }) => {
  const [agents, setAgents] = useState<RedlineTaskAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeToc, setActiveToc] = useState('summary');
  // clauseDetailsMap: agentId -> { clauseId -> full clause detail }
  const [clauseDetailsMap, setClauseDetailsMap] = useState<Record<string, Record<string, RedlineRedLineClause>>>({});
  const [loadingClauses, setLoadingClauses] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<RedlineRedLineResult[]>([]);
  const [savingResult, setSavingResult] = useState<string | null>(null);
  const [editingClause, setEditingClause] = useState<string | null>(null);

  const loadClauseDetailsForAgent = useCallback(async (agentId: string) => {
    if (loadingClauses[agentId]) return;
    setLoadingClauses((prev) => ({ ...prev, [agentId]: true }));
    try {
      const clauseRes = await redlineVerificationApi.getAgentRedLineClauses(agentId);
      if (clauseRes.code === 200 && clauseRes.data && clauseRes.data.length > 0) {
        const clauseIds = clauseRes.data.map((c) => c.id);
        const detailRes = await redlineVerificationApi.getRedLineClausesByIds(clauseIds);
        if (detailRes.code === 200 && detailRes.data) {
          const map: Record<string, RedlineRedLineClause> = {};
          detailRes.data.forEach((c) => { map[c.id] = c; });
          setClauseDetailsMap((prev) => ({ ...prev, [agentId]: map }));
        }
      } else {
        setClauseDetailsMap((prev) => ({ ...prev, [agentId]: {} }));
      }
    } catch {
      setClauseDetailsMap((prev) => ({ ...prev, [agentId]: {} }));
    } finally {
      setLoadingClauses((prev) => ({ ...prev, [agentId]: false }));
    }
  }, [loadingClauses]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const statusRes = await redlineVerificationApi.getExecutionStatus(taskId);
      if (statusRes.code === 200 && statusRes.data) {
        setAgents(statusRes.data);
        // Load clause details for each agent
        for (const agent of statusRes.data) {
          loadClauseDetailsForAgent(agent.agentId);
        }
      }
      const resultsRes = await redlineVerificationApi.getRedLineResults(taskId);
      if (resultsRes.code === 200 && resultsRes.data) {
        setResults(resultsRes.data);
      }
    } catch (err) {
      console.error('Failed to load report data', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // executionId = agent.id (TaskAgent record ID), NOT agent.agentId
  const getResultForClause = (clauseId: string, executionId: string): RedlineRedLineResult | undefined => {
    return results.find((r) => r.redLineClauseId === clauseId && r.executionId === executionId);
  };

  const handleConfirm = async (
    agent: RedlineTaskAgent,
    clauseId: string,
    status: 'PASS' | 'FAIL',
  ) => {
    const key =`${clauseId}-${agent.id}-${status}`;
    setSavingResult(key);
    try {
      const existing = getResultForClause(clauseId, agent.id);
      if (existing) {
        await redlineVerificationApi.updateRedLineResult(existing.id, { status });
      } else {
        await redlineVerificationApi.batchSaveRedLineResults(taskId, agent.id, [
          { redLineClauseId: clauseId, status },
        ]);
      }
      const refreshed = await redlineVerificationApi.getRedLineResults(taskId);
      if (refreshed.code === 200 && refreshed.data) {
        setResults(refreshed.data);
      }
      setEditingClause(null);
    } catch (err) {
      console.error('Failed to save red-line result', err);
    } finally {
      setSavingResult(null);
    }
  };

  const handleExport = () => {
    let content =`# ${task.name} - 测试报告\n\n`;
    content +=`## 汇总\n\n`;
    content +=`| 智能体 | 执行结果 | 用例结果 |\n`;
    content +=`|--------|----------|----------|\n`;
    for (const agent of agents) {
      const execResult = agent.isSuccess === true ? '成功' : agent.isSuccess === false ? '失败' : '-';
      const testResult = extractTestResult(agent.result);
      content +=`| ${agent.agentName || agent.agentId} | ${execResult} | ${testResult} |\n`;
    }
    content += '\n---\n\n';
    for (const agent of agents) {
      const text = extractTextFromResult(agent.result);
      content +=`## ${agent.agentName || agent.agentId}\n\n`;
      content += (text || '无结果') + '\n\n';

      const clauseMap = clauseDetailsMap[agent.agentId] || {};
      const clauseList = Object.values(clauseMap);
      if (clauseList.length > 0) {
        content +=`### 关联红线条款\n\n`;
        content +=`| 解读编号 | 类别 | 正文要求 | 红线解读及指导 | 确认状态 |\n`;
        content +=`|:---|:---|:---|:---|:---|\n`;
        for (const clause of clauseList) {
          const result = getResultForClause(clause.id, agent.id);
          let status = '未确认';
          if (result) {
            status = result.status === 'PASS' ? '已通过' : '不通过';
          }
          const escCell = (s?: string) => (s || '-').replace(/\|/g, '\\|').replace(/\n/g, ' ');
          content +=`| ${clause.id} | ${escCell(clause.redLineCategory || clause.category)} | ${escCell(clause.bodyRequirement || clause.content)} | ${escCell(clause.interpretationGuidance || clause.description)} | ${status} |\n`;
        }
        content += '\n';
      }
      content += '---\n\n';
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =`${task.name}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (id: string) => {
    setActiveToc(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const getRedLineStats = (agent: RedlineTaskAgent): string => {
    const clauseMap = clauseDetailsMap[agent.agentId];
    if (!clauseMap) return '-';
    const clauseIds = Object.keys(clauseMap);
    if (clauseIds.length === 0) return '-';
    const agentResults = clauseIds
      .map((cid) => getResultForClause(cid, agent.id))
      .filter(Boolean) as RedlineRedLineResult[];
    const passCount = agentResults.filter((r) => r.status === 'PASS').length;
    const failCount = agentResults.filter((r) => r.status === 'FAIL').length;
    const total = clauseIds.length;
    if (failCount > 0) return`${passCount}/${total} (有不通过)`;
    if (passCount === total && total > 0) return`${passCount}/${total} 全部通过`;
    return`${agentResults.length}/${total}`;
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
    ...agents.map((a) => ({ id:`agent-${a.agentId}`, label: a.agentName || a.agentId })),
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
                  const redLineStat = getRedLineStats(agent);
                  return (
                    <tr key={agent.id} className="border-b border-theme-border/50">
                      <td className="py-2 px-3 text-theme-text-primary">
                        {agent.agentName || agent.agentId}
                      </td>
                      <td className="py-2 px-3">
                        <span className={execResult === '成功' ? 'text-emerald-500' : execResult === '失败' ? 'text-rose-500' : 'text-theme-text-secondary'}>
                          {execResult}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={testResult === '通过' ? 'text-emerald-500' : testResult === '不通过' ? 'text-rose-500' : 'text-theme-text-secondary'}>
                          {testResult}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-theme-text-secondary text-xs">{redLineStat}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Per-agent sections */}
          {agents.map((agent) => {
            const text = extractTextFromResult(agent.result);
            const clauseMap = clauseDetailsMap[agent.agentId] || {};
            const clauseList = Object.values(clauseMap);
            return (
              <section key={agent.id} id={`agent-${agent.agentId}`} className="mt-8 pt-6 border-t border-theme-border">
                <h3 className="text-base font-semibold text-theme-text-primary mb-4">
                  {agent.agentName || agent.agentId} 报告
                </h3>

                {/* Markdown rendered result */}
                <div className="break-words leading-6 mb-6">
                  {text ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>
                  ) : (
                    <p className="text-theme-text-secondary italic">无结果</p>
                  )}
                </div>

                {/* Red-line clause table */}
                {clauseList.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-theme-text-primary mb-3">红线条款确认</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-theme-border">
                        <thead>
                          <tr className="bg-theme-surface">
                            <th className="border border-theme-border px-2 py-2 text-left text-theme-text-secondary font-medium w-24">解读编号</th>
                            <th className="border border-theme-border px-2 py-2 text-left text-theme-text-secondary font-medium w-20">类别</th>
                            <th className="border border-theme-border px-2 py-2 text-left text-theme-text-secondary font-medium">正文要求</th>
                            <th className="border border-theme-border px-2 py-2 text-left text-theme-text-secondary font-medium">红线解读及指导</th>
                            <th className="border border-theme-border px-2 py-2 text-center text-theme-text-secondary font-medium w-40">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clauseList.map((clause) => {
                            const existingResult = getResultForClause(clause.id, agent.id);
                            const currentStatus = existingResult?.status;
                            const clauseEditKey =`${clause.id}-${agent.id}`;
                            const isEditing = editingClause === clauseEditKey;
                            return (
                              <tr key={clause.id} className="border-b border-theme-border/50">
                                <td className="border border-theme-border px-2 py-2 text-theme-text-primary">{clause.id?.slice(0, 8) || '-'}</td>
                                <td className="border border-theme-border px-2 py-2 text-theme-text-primary">{clause.redLineCategory || clause.category || '-'}</td>
                                <td className="border border-theme-border px-2 py-2 text-theme-text-primary whitespace-pre-wrap">{clause.bodyRequirement || clause.content || '-'}</td>
                                <td className="border border-theme-border px-2 py-2 text-theme-text-primary whitespace-pre-wrap">{clause.interpretationGuidance || clause.description || '-'}</td>
                                <td className="border border-theme-border px-2 py-2 text-center">
                                  {currentStatus && !isEditing ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                                        currentStatus === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                      }`}>
                                        {currentStatus}
                                      </span>
                                      <button
                                        onClick={() => setEditingClause(clauseEditKey)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        修改
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => handleConfirm(agent, clause.id, 'PASS')}
                                        disabled={savingResult !== null}
                                        className="px-3 py-1 text-xs rounded border border-emerald-500 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                                      >
                                        通过
                                      </button>
                                      <button
                                        onClick={() => handleConfirm(agent, clause.id, 'FAIL')}
                                        disabled={savingResult !== null}
                                        className="px-3 py-1 text-xs rounded border border-rose-500 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                                      >
                                        不通过
                                      </button>
                                      {isEditing && (
                                        <button
                                          onClick={() => setEditingClause(null)}
                                          className="px-2 py-1 text-xs rounded border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover"
                                        >
                                          取消
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {agents.length === 0 && (
            <div className="text-center py-12 text-theme-text-secondary">暂无执行结果</div>
          )}
        </div>
      </div>
    </div>
  );
};
