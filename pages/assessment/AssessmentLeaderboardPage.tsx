import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Target, Trophy, Users } from 'lucide-react';
import {
  EmptyState,
  Modal,
  PageHeader,
  PageSection,
  SegmentedControl,
  StatisticCard,
} from '../../design-system';
import type { SegmentedOption } from '../../design-system';
import { renderDataGrid } from './leaderboard-ui/data_grid.js';
import {
  fmtCompact,
  fmtSeconds,
  metricCell,
  renderSkillBadge,
} from './leaderboard-ui/leaderboard.js';
import { escapeHtml, formatDateTime, formatNumber } from './leaderboard-ui/utils.js';
import './leaderboard-ui/style.css';

const API_PREFIX = '/api/ai4secbench-leaderboard';
const DEFAULT_TASK_TYPE = 'discovery';

interface SkillPopoverData {
  category: string;
  partialIndex: number | string;
  skills: Array<{ display_name?: string; name: string; version_label?: string }>;
  top: number;
  left: number;
}

export const AssessmentLeaderboardPage: React.FC<{ projectId?: string }> = ({
  projectId,
}) => {
  const [domainKey, setDomainKey] = useState('');
  const [taskType, setTaskType] = useState(DEFAULT_TASK_TYPE);
  const [groupMode, setGroupMode] = useState('version');
  const [includeSkills, setIncludeSkills] = useState(true);

  const [domains, setDomains] = useState<
    Array<{ key: string; display_name: string }>
  >([]);
  const [taskTypes, setTaskTypes] = useState<
    Array<{ key: string; display_name: string }>
  >([]);
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<any>(null);

  const [skillPopover, setSkillPopover] = useState<SkillPopoverData | null>(
    null,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>(null);

  const effectiveDomainKey = domainKey || domains[0]?.key || '';
  const hasDiscovery = taskType === 'discovery';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (domainKey) params.set('domain_key', domainKey);
      if (taskType) params.set('task_type', taskType);
      params.set(
        'group_mode',
        groupMode === 'family' ? 'family' : 'version',
      );
      params.set('include_skills', includeSkills ? '1' : '0');

      const r = await fetch(`${API_PREFIX}/leaderboard?${params}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();

      setDomains(data.domains || []);
      setTaskTypes(data.task_types || []);
      setTotalCount(data.count || 0);

      const fetchedDomain = data.domain || (data.domains || [])[0];
      if (!domainKey && fetchedDomain?.key) {
        setDomainKey(fetchedDomain.key);
      }

      setItems(
        (data.items || []).map((row: any, i: number) => ({
          ...row,
          _key: `${row.agent_profile_id}|${row.llm_profile_id}|${row.skill_bucket?.signature || ''}|${row.main_task_id || i}`,
          skill_category_text: row.skill_bucket?.primary_label || '',
        })),
      );
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [domainKey, taskType, groupMode, includeSkills]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedDomain =
    domains.find((d) => d.key === effectiveDomainKey) || domains[0];

  const statAgents = formatNumber(totalCount || items.length);
  const statDomains = formatNumber(domains.length);
  const statTasks = formatNumber(
    items.reduce((s, it) => s + Number(it.sub_task_count || 0), 0),
  );
  const statTopScore = useMemo(() => {
    if (!items.length) return '—';
    const pick = hasDiscovery
      ? (it: any) => Number(it.discovery_f1 || 0)
      : (it: any) => Number(it.trigger_success_rate || 0) / 100;
    return items
      .reduce((m: number, it: any) => Math.max(m, pick(it)), 0)
      .toFixed(3);
  }, [items, hasDiscovery]);

  const columns = useMemo(() => {
    const missNote = hasDiscovery ? '1-Recall' : '1-触发率';
    const fpNote = hasDiscovery ? '未命中位置' : '噪声提交';

    const metricCols = hasDiscovery
      ? [
          {
            key: 'discovery_f1',
            label: 'F1',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(Number(v || 0) * 100, null, '%'),
          },
          {
            key: 'discovery_precision',
            label: 'Precision',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(Number(v || 0) * 100, null, '%'),
          },
          {
            key: 'discovery_recall',
            label: 'Recall',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(Number(v || 0) * 100, null, '%'),
          },
          {
            key: 'discovery_mean_score',
            label: '均分',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(v),
          },
        ]
      : [
          {
            key: 'trigger_success',
            label: '触发成功',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any, row: any) => metricCell(v, row.sub_task_count),
          },
          {
            key: 'trigger_success_rate',
            label: '触发率',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(v, null, '%'),
          },
          {
            key: 'execution_success',
            label: '执行成功',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any, row: any) => metricCell(v, row.sub_task_count),
          },
          {
            key: 'submissions',
            label: '提交数',
            sortable: true,
            filterable: true,
            filterMode: 'numeric-range',
            render: (v: any) => metricCell(v),
          },
        ];

    const costCols = [
      {
        key: 'avg_tokens_per_subtask',
        label: '平均子任务Token',
        sortable: true,
        filterable: true,
        filterMode: 'numeric-range',
        render: (v: any) =>
          `<span class="lb-mono" title="${escapeHtml(formatNumber(Number(v || 0)))}">${escapeHtml(fmtCompact(v))}</span>`,
      },
      {
        key: 'avg_elapsed_sec',
        label: '平均子任务耗时',
        sortable: true,
        filterable: true,
        filterMode: 'numeric-range',
        render: (v: any) =>
          `<span class="lb-mono">${escapeHtml(fmtSeconds(v))}</span>`,
      },
      {
        key: 'miss_rate',
        label: `漏报率(${missNote})`,
        sortable: true,
        filterable: true,
        filterMode: 'numeric-range',
        render: (v: any) => metricCell(v, null, '%'),
      },
      {
        key: 'fp_rate',
        label: `误报率(${fpNote})`,
        sortable: true,
        filterable: true,
        filterMode: 'numeric-range',
        render: (v: any) => metricCell(v, null, '%'),
      },
    ];

    const agentCol =
      groupMode === 'family'
        ? {
            key: 'agent_family',
            label: 'Agent 家族',
            sortable: true,
            filterable: true,
            sortValueGetter: (row: any) =>
              row.agent_family || row.agent_name || '',
            render: (_v: any, row: any) => {
              const fam = row.agent_family || row.agent_name || '—';
              const n = Number(row.merged_count || 1);
              const badge =
                n > 1
                  ? ` <span class="lb-badge" title="${escapeHtml((row.merged_versions || []).join(', '))}">×${escapeHtml(String(n))}</span>`
                  : '';
              return `${escapeHtml(fam)}${badge}`;
            },
          }
        : { key: 'agent_name', label: 'Agent', sortable: true, filterable: true };

    const skillCols = includeSkills
      ? [
          {
            key: 'skill_category_text',
            label: 'Skill 类别',
            sortable: true,
            filterable: true,
            filterValueGetter: (row: any) =>
              row.skill_bucket?.signature || 'none',
            filterLabelGetter: (row: any) =>
              row.skill_bucket?.primary_label
                ? `${row.skill_bucket.primary_label}${row.skill_bucket.has_partial ? '（含 P）' : '（ALL）'}`
                : '—',
            sortValueGetter: (row: any) =>
              row.skill_category_text || '',
            render: (_v: any, row: any) =>
              renderSkillBadge(row.skill_bucket),
          },
        ]
      : [];

    return [
      {
        key: 'rank',
        label: '排名',
        sortable: true,
        render: (v: any) =>
          `<span class="lb-mono">${escapeHtml(v)}</span>`,
      },
      agentCol,
      { key: 'llm_name', label: 'LLM', sortable: true, filterable: true },
      ...skillCols,
      ...metricCols,
      ...costCols,
      {
        key: 'difficulty',
        label: '难度',
        sortable: true,
        filterable: true,
        render: (v: any) => escapeHtml(v || '—'),
      },
      {
        key: 'updated_at',
        label: '更新时间',
        sortable: true,
        filterable: true,
        filterLabelGetter: (_row: any, v: any) => formatDateTime(v),
        render: (v: any) => escapeHtml(formatDateTime(v)),
      },
      {
        key: 'open',
        label: '操作',
        sortable: false,
        render: (_v: any, row: any) =>
          `<button class="lb-subtle-button" type="button" data-open-snapshot="${escapeHtml(String(row.snapshot_key || ''))}" data-name="${escapeHtml(String(row.agent_name || ''))}">详情</button>`,
      },
    ];
  }, [hasDiscovery, groupMode, includeSkills]);

  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;

    if (gridApiRef.current) {
      gridApiRef.current.destroy();
      gridApiRef.current = null;
    }

    if (!items.length) {
      container.innerHTML = '';
      return;
    }

    gridApiRef.current = renderDataGrid(container, {
      rows: items,
      columns,
      emptyText: '当前筛选下没有 Agent × LLM 组合的测评结果。',
      rowKey: (row: any) => row._key,
    });
  }, [items, columns]);

  useEffect(() => {
    return () => {
      if (gridApiRef.current) {
        gridApiRef.current.destroy();
      }
    };
  }, []);

  const openAgentDetail = useCallback(
    async (snapshotKey: string, name: string) => {
      setModalOpen(true);
      setModalTitle(`${name || snapshotKey} · 详情`);
      setModalLoading(true);
      setModalError(null);
      setModalData(null);

      if (!snapshotKey) {
        setModalLoading(false);
        return;
      }

      try {
        const r = await fetch(
          `${API_PREFIX}/agents/${encodeURIComponent(snapshotKey)}/stats`,
        );
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        setModalData(await r.json());
      } catch (e: any) {
        setModalError(e.message);
      } finally {
        setModalLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const mount = gridRef.current;
    if (!mount) return;

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement;

      const skillTrigger = target.closest('[data-skill-partial]');
      if (skillTrigger) {
        event.stopPropagation();
        try {
          const payload = JSON.parse(
            skillTrigger.getAttribute('data-skill-partial') || '',
          );
          const rect = skillTrigger.getBoundingClientRect();
          setSkillPopover({
            category: payload.category_name || '',
            partialIndex: payload.partial_index ?? '?',
            skills: payload.skills || [],
            top: rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 296),
          });
        } catch {}
        return;
      }

      const detailBtn = target.closest('[data-open-snapshot]');
      if (detailBtn) {
        event.stopPropagation();
        openAgentDetail(
          detailBtn.getAttribute('data-open-snapshot') || '',
          detailBtn.getAttribute('data-name') || '',
        );
      }
    };

    mount.addEventListener('click', handleClick);
    return () => mount.removeEventListener('click', handleClick);
  }, [openAgentDetail]);

  useEffect(() => {
    if (!skillPopover) return;
    const handle = (event: Event) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest('.skill-popover') &&
        !target.closest('[data-skill-partial]')
      ) {
        setSkillPopover(null);
      }
    };
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [skillPopover]);

  const domainOptions: SegmentedOption[] = useMemo(
    () => domains.map((d) => ({ label: d.display_name || d.key, value: d.key })),
    [domains],
  );
  const taskTypeOptions: SegmentedOption[] = useMemo(
    () =>
      taskTypes.map((t) => ({ label: t.display_name || t.key, value: t.key })),
    [taskTypes],
  );

  const modalBody = useMemo(() => {
    if (modalLoading)
      return <p className="text-sm text-theme-text-muted">加载中…</p>;
    if (modalError)
      return <p className="text-sm text-state-danger">加载失败：{modalError}</p>;
    if (!modalData)
      return <p className="text-sm text-theme-text-muted">未找到记录。</p>;

    const ap = modalData.agent_profile || {};
    const domEntries = Object.entries(modalData.by_domain || {});

    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-theme-text-faint">Agent 家族</dt>
          <dd className="text-theme-text-secondary">{ap.family || '—'}</dd>
          <dt className="text-theme-text-faint">版本</dt>
          <dd className="text-theme-text-secondary">{ap.version || '—'}</dd>
          <dt className="text-theme-text-faint">类型</dt>
          <dd className="text-theme-text-secondary">
            {ap.agent_type || 'local'}
          </dd>
          <dt className="text-theme-text-faint">来源</dt>
          <dd className="text-theme-text-secondary">
            {ap.local_server_id || '—'}
          </dd>
        </dl>
        {domEntries.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-theme-text-faint">
              按领域分布
            </h3>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
              {domEntries.map(([key, v]: [string, any]) => (
                <React.Fragment key={key}>
                  <span className="font-mono text-brand-primary">{key}</span>
                  <span className="text-theme-text-secondary">
                    任务 {formatNumber(v.count)}
                  </span>
                  <span className="text-theme-text-secondary">
                    成功 {formatNumber(v.succeeded)}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, [modalLoading, modalError, modalData]);

  return (
    <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
      <PageHeader
        title="排行榜"
        description="按领域与任务类型比较 Agent × LLM × Skill 组合的最佳主任务测评结果。"
      />

      {error && (
        <EmptyState
          title="加载失败"
          description={error}
          variant="block"
          action={
            <button className="btn btn-secondary" type="button" onClick={fetchData}>
              重试
            </button>
          }
        />
      )}

      {!error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatisticCard
              label="参与 AGENT"
              value={loading ? '—' : statAgents}
              icon={<Users size={18} />}
            />
            <StatisticCard
              label="任务总数"
              value={loading ? '—' : statTasks}
              icon={<Target size={18} />}
            />
            <StatisticCard
              label="领域数"
              value={loading ? '—' : statDomains}
              icon={<Layers size={18} />}
            />
            <StatisticCard
              label="最高均分"
              value={loading ? '—' : statTopScore}
              icon={<Trophy size={18} />}
              tone="brand"
            />
          </div>

          {domainOptions.length > 0 && (
            <PageSection
              title="领域"
              description={selectedDomain?.display_name || '未选择'}
            >
              <SegmentedControl
                value={effectiveDomainKey}
                onChange={setDomainKey}
                options={domainOptions}
                size="sm"
                aria-label="领域选择"
              />
            </PageSection>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {taskTypeOptions.length > 0 && (
              <PageSection
                title="任务类型"
                description={
                  taskTypes.find((t) => t.key === taskType)?.display_name ||
                  taskType
                }
              >
                <SegmentedControl
                  value={taskType}
                  onChange={setTaskType}
                  options={taskTypeOptions}
                  size="sm"
                  aria-label="任务类型"
                />
              </PageSection>
            )}

            <PageSection
              title="显示维度"
              description={`${groupMode === 'family' ? '按家族合并' : '按版本号'} · Skills ${includeSkills ? '开' : '关'}`}
            >
              <div className="flex items-center gap-3">
                <SegmentedControl
                  value={groupMode}
                  onChange={setGroupMode}
                  options={[
                    { label: '按版本号', value: 'version' },
                    { label: '按家族', value: 'family' },
                  ]}
                  size="sm"
                  aria-label="分组模式"
                />
                <SegmentedControl
                  value={includeSkills ? '1' : '0'}
                  onChange={(v) => setIncludeSkills(v === '1')}
                  options={[
                    { label: 'Skills 开', value: '1' },
                    { label: 'Skills 关', value: '0' },
                  ]}
                  size="sm"
                  aria-label="Skills 显示"
                />
              </div>
            </PageSection>
          </div>

          <PageSection
            title="Agent × LLM 最佳结果"
            description={items.length ? `${items.length} 组` : undefined}
          >
            {loading && !items.length && (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-theme-text-muted">加载中…</p>
              </div>
            )}
            {!loading && !items.length && (
              <EmptyState
                title="暂无数据"
                description="当前筛选下没有 Agent × LLM 组合的测评结果。"
              />
            )}
            <div
              ref={gridRef}
              className="-mx-5 overflow-x-auto px-5"
              style={{ display: items.length > 0 ? undefined : 'none' }}
            />
          </PageSection>

          <p className="text-xs text-theme-text-faint">
            API: {API_PREFIX} · 更新时间: {new Date().toLocaleString()}
          </p>
        </>
      )}

      {skillPopover && (
        <div
          className="skill-popover"
          style={{
            position: 'fixed',
            top: skillPopover.top,
            left: skillPopover.left,
            zIndex: 60,
          }}
        >
          <div className="skill-popover-header">
            <span>
              {skillPopover.category} · P{skillPopover.partialIndex}
            </span>
            <span>{skillPopover.skills.length} skills</span>
          </div>
          <div className="skill-popover-list">
            {skillPopover.skills.map((s) => (
              <div key={s.name} className="skill-popover-row">
                <span>{s.display_name || s.name}</span>
                <span className="skill-popover-version">
                  {s.version_label || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        size="xl"
      >
        {modalBody}
      </Modal>
    </div>
  );
};
