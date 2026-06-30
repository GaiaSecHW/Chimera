import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader, RefreshCw } from 'lucide-react';
import { Modal } from '../design-system';
import { vulnApi, type VulnBreakdownResponse } from '../clients/vuln';
import { scheduleCenterApi } from '../clients/scheduleCenter';
import type { SecurityProject } from '../types/types';

interface SuspectVulnTaskBreakdownDialogProps {
  open: boolean;
  onClose: () => void;
  projects: SecurityProject[];
}

// LOKI design tokens — mirrors DashboardPage local palette.
const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  primaryMutedSoft: 'rgba(79, 115, 255, 0.07)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
} as const;

const NO_TASK_BUCKET_ID = '__no_linked_task__';
const NO_TASK_LABEL = '未关联任务';

// Shared grid template keeps L1 / L2 numeric columns aligned.
// 1fr name | 总计 | 是漏洞 | 非漏洞 (right-aligned, tabular-nums)
const GRID_TEMPLATE = 'minmax(0, 1fr) 84px 92px 92px';

interface UserTasksResp {
  items?: Array<{ id: string; name?: string }>;
}

export const SuspectVulnTaskBreakdownDialog: React.FC<SuspectVulnTaskBreakdownDialogProps> = ({
  open,
  onClose,
  projects,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VulnBreakdownResponse | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Accordion: at most one project expanded at a time.
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  // Per-project lazy task-name cache: { projectId: { taskId: name } }
  const [taskNameCache, setTaskNameCache] = useState<Record<string, Record<string, string>>>({});
  const [taskNameLoading, setTaskNameLoading] = useState<Record<string, boolean>>({});
  const loadedRef = useRef(false);

  // Resolve project names from the prop (fall back to raw id).
  const projectNameMap = useMemo(
    () => new Map((projects || []).map((p) => [p.id, p.name])),
    [projects],
  );

  // Effect 1 — fetch breakdown ONCE per session on open. Cached via loadedRef;
  // retry resets the flag.
  useEffect(() => {
    if (!open) return;
    if (loadedRef.current) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await vulnApi.getBreakdown();
        if (mounted) {
          setData(resp);
          loadedRef.current = true;
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [open, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2 — lazy-load task names for the newly expanded project (only if
  // not already cached / not already loading).
  useEffect(() => {
    if (!expandedProjectId) return;
    if (taskNameCache[expandedProjectId] || taskNameLoading[expandedProjectId]) return;
    const pid = expandedProjectId;
    let mounted = true;

    const load = async () => {
      setTaskNameLoading((prev) => ({ ...prev, [pid]: true }));
      try {
        const resp: UserTasksResp = await scheduleCenterApi.listUserTasks(pid, { page_size: 200 });
        const map: Record<string, string> = {};
        for (const t of resp?.items || []) {
          if (t?.id) {
            const trimmed = t.name && String(t.name).trim();
            map[String(t.id)] = trimmed || String(t.id);
          }
        }
        if (mounted) {
          setTaskNameCache((prev) => ({ ...prev, [pid]: map }));
        }
      } catch {
        // leave cache empty — caller falls back to raw task id
      } finally {
        if (mounted) setTaskNameLoading((prev) => ({ ...prev, [pid]: false }));
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [expandedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = () => {
    loadedRef.current = false;
    setExpandedProjectId(null);
    setTaskNameCache({});
    setTaskNameLoading({});
    setRetryKey((k) => k + 1);
  };

  const toggleProject = (pid: string) => {
    setExpandedProjectId((cur) => (cur === pid ? null : pid));
  };

  const resolveTaskName = (projectId: string, taskId: string): string => {
    if (taskId === NO_TASK_BUCKET_ID) return NO_TASK_LABEL;
    const cache = taskNameCache[projectId];
    if (cache && cache[taskId]) return cache[taskId];
    return taskId; // placeholder while loading / unresolved
  };

  // Sort projects by name asc (zh-CN). Name resolves from prop, fallback id.
  // Filter to only projects passed in via prop (department filtering).
  const sortedProjects = useMemo(() => {
    if (!data?.projects) return [];
    const projectIds = new Set((projects || []).map((p) => p.id));
    return [...data.projects]
      .filter((p) => projectIds.size === 0 || projectIds.has(p.project_id))
      .sort((a, b) => {
        const na = projectNameMap.get(a.project_id) || a.project_id;
        const nb = projectNameMap.get(b.project_id) || b.project_id;
        return na.localeCompare(nb, 'zh-CN');
      });
  }, [data, projectNameMap, projects]);

  const countColor = (value: number, on: string) => (value > 0 ? on : LK.mutedSoft);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="疑似漏洞 - 任务统计"
      description="按项目分组，点击项目展开任务级明细"
    >
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <AlertTriangle size={28} style={{ color: LK.error }} />
          <span style={{ color: LK.error }}>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors hover:opacity-80"
            style={{ backgroundColor: LK.primaryMuted, color: LK.primary, border: `1px solid ${LK.border}` }}
          >
            <RefreshCw size={14} /> 重试
          </button>
        </div>
      ) : loading || !data ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader size={28} className="animate-spin" style={{ color: LK.primary }} />
          <span style={{ color: LK.muted }}>加载中...</span>
        </div>
      ) : sortedProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <span style={{ color: LK.mutedSoft }}>暂无数据</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, minWidth: 560 }}
          >
            {/* Column header */}
            <div
              className="grid items-center px-4 py-2 text-xs font-medium"
              style={{
                gridTemplateColumns: GRID_TEMPLATE,
                color: LK.muted,
                borderBottom: `1px solid ${LK.borderSoft}`,
              }}
            >
              <span>项目 / 任务</span>
              <span className="text-right tabular-nums">总计</span>
              <span className="text-right tabular-nums">是漏洞</span>
              <span className="text-right tabular-nums">非漏洞</span>
            </div>

            {sortedProjects.map((proj) => {
              const expanded = expandedProjectId === proj.project_id;
              const name = projectNameMap.get(proj.project_id) || proj.project_id;
              const hovered = hoveredProjectId === proj.project_id;
              const tasksSorted = [...proj.tasks].sort(
                (a, b) => b.total - a.total || b.vulnerable - a.vulnerable,
              );

              const rowBg = expanded
                ? LK.primaryMuted
                : hovered
                  ? LK.primaryMutedSoft
                  : 'transparent';

              return (
                <div key={proj.project_id}>
                  {/* L1 — project row (clickable to expand) */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleProject(proj.project_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleProject(proj.project_id);
                      }
                    }}
                    onMouseEnter={() => setHoveredProjectId(proj.project_id)}
                    onMouseLeave={() => setHoveredProjectId((cur) => (cur === proj.project_id ? null : cur))}
                    className="grid cursor-pointer items-center px-4 py-3 transition-colors"
                    style={{
                      gridTemplateColumns: GRID_TEMPLATE,
                      backgroundColor: rowBg,
                      borderBottom: `1px solid ${LK.borderSoft}`,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {expanded ? (
                        <ChevronDown size={16} style={{ color: LK.muted, flexShrink: 0 }} />
                      ) : (
                        <ChevronRight size={16} style={{ color: LK.muted, flexShrink: 0 }} />
                      )}
                      <span
                        className="truncate text-sm font-semibold"
                        style={{ color: LK.ink }}
                        title={name}
                      >
                        {name}
                      </span>
                    </div>
                    <span
                      className="text-right text-sm font-medium tabular-nums"
                      style={{ color: LK.ink }}
                    >
                      {proj.total}
                    </span>
                    <span
                      className="text-right text-sm font-medium tabular-nums"
                      style={{ color: countColor(proj.vulnerable, LK.error) }}
                    >
                      {proj.vulnerable}
                    </span>
                    <span
                      className="text-right text-sm font-medium tabular-nums"
                      style={{ color: countColor(proj.not_vulnerable, LK.success) }}
                    >
                      {proj.not_vulnerable}
                    </span>
                  </div>

                  {/* L2 — task rows (only when expanded) */}
                  {expanded && (
                    <div style={{ backgroundColor: LK.canvas }}>
                      {tasksSorted.length === 0 ? (
                        <div
                          className="py-2.5 text-xs"
                          style={{ color: LK.mutedSoft, paddingLeft: 40, paddingRight: 16 }}
                        >
                          暂无任务
                        </div>
                      ) : (
                        tasksSorted.map((task) => {
                          const taskName = resolveTaskName(proj.project_id, task.source_task_id);
                          const isNoTask = task.source_task_id === NO_TASK_BUCKET_ID;
                          return (
                            <div
                              key={task.source_task_id}
                              className="grid items-center px-4 py-2.5"
                              style={{
                                gridTemplateColumns: GRID_TEMPLATE,
                                borderBottom: `1px solid ${LK.borderSoft}`,
                              }}
                            >
                              <div className="flex min-w-0 items-center" style={{ paddingLeft: 32 }}>
                                <span
                                  className="truncate text-sm"
                                  style={{ color: isNoTask ? LK.mutedSoft : LK.ink }}
                                  title={taskName}
                                >
                                  {taskName}
                                </span>
                              </div>
                              <span
                                className="text-right text-sm tabular-nums"
                                style={{ color: LK.ink }}
                              >
                                {task.total}
                              </span>
                              <span
                                className="text-right text-sm tabular-nums"
                                style={{ color: countColor(task.vulnerable, LK.error) }}
                              >
                                {task.vulnerable}
                              </span>
                              <span
                                className="text-right text-sm tabular-nums"
                                style={{ color: countColor(task.not_vulnerable, LK.success) }}
                              >
                                {task.not_vulnerable}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
};
