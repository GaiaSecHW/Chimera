import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlayCircle, RefreshCw, RotateCcw, Square } from 'lucide-react';

import { api } from '../../clients/api';
import { AiwfTriggerTask, AiwfWorkflowDefinition } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, formatDateTime } from './AiwfShared';

export const AiwfTriggersPage: React.FC<{
  projectId: string;
  selectedDefinitionId?: string;
  onNavigateToExecutionCenter?: () => void;
}> = ({ projectId, selectedDefinitionId = '', onNavigateToExecutionCenter }) => {
  const orchestrationApi = api.domains.orchestration;
  const { notify, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [definitions, setDefinitions] = useState<AiwfWorkflowDefinition[]>([]);
  const [tasks, setTasks] = useState<AiwfTriggerTask[]>([]);
  const [definitionId, setDefinitionId] = useState(selectedDefinitionId);
  const [title, setTitle] = useState('Manual trigger task');
  const [taskMarkdown, setTaskMarkdown] = useState('# Task\n\nDescribe what this workflow should do.');

  const loadData = async () => {
    try {
      setLoading(true);
      const [allDefinitions, allTasks] = await Promise.all([
        orchestrationApi.aiAgentFramework.listDefinitions(),
        orchestrationApi.aiAgentFramework.listTriggerTasks(),
      ]);
      const filteredDefinitions = allDefinitions.filter((item) => item.project_id === projectId);
      setDefinitions(filteredDefinitions);
      setTasks(allTasks.filter((item) => item.project_id === projectId));
      if (!definitionId && filteredDefinitions.length > 0) {
        setDefinitionId(filteredDefinitions[0].id);
      }
    } catch (error: any) {
      notify(error.message || '加载 Trigger 数据失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDefinitionId) setDefinitionId(selectedDefinitionId);
  }, [selectedDefinitionId]);

  useEffect(() => {
    if (projectId) void loadData();
  }, [projectId]);

  const filteredTasks = useMemo(
    () => tasks.filter((item) => !definitionId || item.workflow_definition_id === definitionId),
    [tasks, definitionId],
  );

  const handleCreate = async () => {
    if (!definitionId) {
      notify('请先选择一个工作流定义', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await orchestrationApi.aiAgentFramework.createTriggerTask(definitionId, {
        input_tasks: [
          {
            title: title.trim() || 'Manual trigger task',
            task_markdown: taskMarkdown.trim(),
            metadata: {},
            upstream_refs: [],
          },
        ],
      });
      notify('Trigger task 已创建', 'success');
      await loadData();
      onNavigateToExecutionCenter?.();
    } catch (error: any) {
      notify(error.message || '创建 Trigger task 失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await orchestrationApi.aiAgentFramework.cancelTriggerTask(taskId);
      notify('已发送取消请求', 'success');
      await loadData();
    } catch (error: any) {
      notify(error.message || '取消任务失败', 'error');
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await orchestrationApi.aiAgentFramework.retryTriggerTask(taskId);
      notify('已创建重试任务', 'success');
      await loadData();
    } catch (error: any) {
      notify(error.message || '重试任务失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流触发中心"
      description="为指定工作流定义创建 trigger task，并查看当前项目下的触发队列。"
      actions={
        <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <AiwfCard className="p-5">
          <div className="text-sm font-black text-slate-900">创建 Trigger Task</div>
          <div className="mt-4">
            <label className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">工作流定义</label>
            <select value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
              <option value="">请选择定义</option>
              {definitions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">任务标题</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
          </div>
          <div className="mt-4">
            <label className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">任务 Markdown</label>
            <textarea value={taskMarkdown} onChange={(event) => setTaskMarkdown(event.target.value)} className="mt-2 min-h-[220px] w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-xs leading-6" spellCheck={false} />
          </div>
          <button disabled={submitting || !definitionId} onClick={() => void handleCreate()} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
            触发执行
          </button>
        </AiwfCard>

        <AiwfCard className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-sm font-black text-slate-900">Trigger Tasks</div>
            <div className="mt-1 text-xs text-slate-500">按项目过滤，若选择了工作流定义则进一步按定义过滤。</div>
          </div>
          {filteredTasks.length === 0 ? (
            <AiwfEmpty title="暂无 Trigger Task" description="创建一次手动触发后，这里会显示任务状态和时间线。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4">任务</th>
                    <th className="px-5 py-4">状态</th>
                    <th className="px-5 py-4">提交人</th>
                    <th className="px-5 py-4">创建时间</th>
                    <th className="px-5 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-5 py-4">
                        <div className="font-black text-slate-900">{item.id}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.workflow_definition_id}</div>
                      </td>
                      <td className="px-5 py-4">{item.status}</td>
                      <td className="px-5 py-4">{item.submitted_by}</td>
                      <td className="px-5 py-4 text-slate-500">{formatDateTime(item.created_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => void handleRetry(item.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50" title="重试">
                            <RotateCcw size={15} />
                          </button>
                          <button onClick={() => void handleCancel(item.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100" title="取消">
                            <Square size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AiwfCard>
      </div>
      {feedbackNodes}
    </AiwfPageShell>
  );
};
