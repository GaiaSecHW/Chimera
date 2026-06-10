import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Square,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  redlineVerificationApi,
  RedlineTask,
  RedlineTaskAgent,
} from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const AGENT_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: '等待中', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  WAITING: { label: '排队中', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  RUNNING: { label: '执行中', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  SUCCESS: { label: '成功', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { label: '失败', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: '已取消', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
};
const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    case 'FAILED':
      return <XCircle className="w-4 h-4 text-rose-600" />;
    case 'RUNNING':
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    case 'WAITING':
      return <Clock className="w-4 h-4 text-sky-600" />;
    case 'CANCELLED':
      return <AlertCircle className="w-4 h-4 text-slate-500" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
};

const formatResult = (result: string | undefined): string => {
  if (!result) return '';
  try {
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return result;
  }
};

export const TaskRunningStep: React.FC<Props> = ({ taskId, task, onTaskUpdated, onNext, onPrev }) => {
  const [agents, setAgents] = useState<RedlineTaskAgent[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await redlineVerificationApi.getExecutionStatus(taskId);
      if (res.code === 200 && res.data) {
        setAgents(res.data);
        const allDone = res.data.every((a) => TERMINAL_STATUSES.has(a.status));
        if (allDone) {
          stopPolling();
          onTaskUpdated();
        }
      }
    } catch (err) {
      // Silently continue polling on network errors
    } finally {
      setLoading(false);
    }
  }, [taskId, stopPolling, onTaskUpdated]);

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 3000);
    return () => stopPolling();
  }, [taskId, fetchStatus, stopPolling]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRetry = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      await redlineVerificationApi.retryAgent(taskId, agentId);
      await fetchStatus();
      // Restart polling in case it stopped
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchStatus, 3000);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (taskAgentId: string) => {
    setActionLoading(taskAgentId);
    try {
      await redlineVerificationApi.stopAgent(taskId, taskAgentId);
      await fetchStatus();
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetAndExecute = async () => {
    setActionLoading('reset-all');
    try {
      await redlineVerificationApi.resetAndExecute(taskId);
      await fetchStatus();
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchStatus, 3000);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Derived state
  const completedCount = agents.filter((a) => TERMINAL_STATUSES.has(a.status)).length;
  const totalCount = agents.length;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const hasFailed = agents.some((a) => a.status === 'FAILED');
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading && agents.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mr-3" />
        <span className="text-theme-text-secondary">加载执行状态...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-theme-text-secondary font-medium">执行进度</span>
          <span className="text-theme-text-primary font-medium">
            {completedCount}/{totalCount} 完成
          </span>
        </div>
        <div className="h-3 bg-theme-surface-hover rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {!allDone && (
          <p className="text-xs text-theme-text-tertiary flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            正在执行中，每3秒自动刷新...
          </p>
        )}
      </div>

      {/* Agent list */}
      <div className="space-y-3">
        {agents.map((agent) => {
          const statusInfo = AGENT_STATUS[agent.status] || AGENT_STATUS.PENDING;
          const isExpanded = expandedIds.has(agent.id);
          const isRunningOrWaiting = agent.status === 'RUNNING' || agent.status === 'WAITING';
          const isFailed = agent.status === 'FAILED';

          return (
            <div
              key={agent.id}
              className="rounded-xl border border-theme-border overflow-hidden"
            >
              {/* Panel header */}
              <div
                className="flex items-center gap-3 px-4 py-3 bg-theme-surface cursor-pointer hover:bg-theme-surface-hover transition-colors"
                onClick={() => toggleExpand(agent.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-theme-text-tertiary flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-theme-text-tertiary flex-shrink-0" />
                )}
                {getStatusIcon(agent.status)}
                <span className="text-sm font-medium text-theme-text-primary flex-1 truncate">
                  {agent.agentName || agent.agentId}
                </span>
                {agent.agentType && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                    {agent.agentType}
                  </span>
                )}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${statusInfo.tone}`}>
                  {statusInfo.label}
                </span>
                {isRunningOrWaiting && (
                  <button
                    className="flex items-center gap-1 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStop(agent.id);
                    }}
                    disabled={actionLoading === agent.id}
                  >
                    {actionLoading === agent.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Square className="w-3 h-3" />
                    )}
                    停止
                  </button>
                )}
                {isFailed && (
                  <button
                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry(agent.agentId);
                    }}
                    disabled={actionLoading === agent.agentId}
                  >
                    {actionLoading === agent.agentId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    重试
                  </button>
                )}
              </div>

              {/* Panel content */}
              {isExpanded && (
                <div className="px-4 py-3 border-t border-theme-border bg-theme-surface/50 space-y-2">
                  {agent.startedAt && (
                    <div className="text-xs text-theme-text-secondary">
                      <span className="font-medium">开始:</span> {agent.startedAt}
                    </div>
                  )}
                  {agent.completedAt && (
                    <div className="text-xs text-theme-text-secondary">
                      <span className="font-medium">结束:</span> {agent.completedAt}
                    </div>
                  )}
                  {agent.errorMessage && (
                    <div className="text-xs text-rose-600 bg-rose-50 rounded-md px-3 py-2">
                      <span className="font-medium">错误:</span> {agent.errorMessage}
                    </div>
                  )}
                  {agent.result && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-theme-text-secondary mb-1">执行结果:</div>
                      <div className="text-xs text-theme-text-primary bg-theme-surface rounded-md px-3 py-2 whitespace-pre-wrap max-h-64 overflow-y-auto border border-theme-border">
                        {formatResult(agent.result)}
                      </div>
                    </div>
                  )}
                  {!agent.startedAt && !agent.result && !agent.errorMessage && (
                    <div className="text-xs text-theme-text-tertiary italic">暂无执行信息</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-theme-border">
        <button
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-surface border border-theme-border rounded-lg hover:bg-theme-surface-hover transition-colors"
          onClick={onPrev}
        >
          <ArrowLeft className="w-4 h-4" />
          返回配置
        </button>

        <button
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
          onClick={handleResetAndExecute}
          disabled={actionLoading === 'reset-all' || (!allDone && !hasFailed)}
        >
          {actionLoading === 'reset-all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          重新执行全部
        </button>

        <div className="flex-1" />

        {allDone && (
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            onClick={onNext}
          >
            查看报告
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
