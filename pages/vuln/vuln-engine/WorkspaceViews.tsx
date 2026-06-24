import React from 'react';
import { Activity, AlertTriangle, Bot, Briefcase, Clock3, ListTodo, Plus, RefreshCw, Search, ServerCog, Sparkles, Trash2 } from 'lucide-react';
import { ACTION_QUEUE_FILTERS, ACTION_STATUS_LABELS, ACTION_TYPE_LABELS, MODULE_ROLE_LABELS, REPRO_ACTION_TYPES, REPORT_CHANNEL_LABELS, SERVICE_TYPE_LABELS, STAGE_LABELS, WorkspaceViewKey, cardClass, formatTime, labelOf } from './shared';

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const OverviewWorkspace: React.FC<{
  overview: any;
  projectActions: any[];
  manualTasks: any[];
  setWorkspaceView: (view: WorkspaceViewKey) => void;
  setSelectedCaseId: (id: string) => void;
}> = ({ overview, projectActions, manualTasks, setWorkspaceView, setSelectedCaseId }) => (
  <div className="grid grid-cols-1 2xl:grid-cols-[1.25fr_1fr] gap-6 items-start">
    <div className="space-y-6">
      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>阶段分布与运行趋势</h3>
        </div>
        <div className="p-6 space-y-4">
          {Object.entries(overview?.stage_counts || {}).length === 0 ? (
            <div className="text-sm" style={{ color: LK.muted }}>暂无阶段统计</div>
          ) : (
            Object.entries(overview?.stage_counts || {}).map(([stage, count]) => (
              <div key={stage} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold" style={{ color: LK.ink }}>{stage}</span>
                  <span style={{ color: LK.body }}>{count as number}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: LK.surfaceRaised }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${overview?.metrics?.total_cases ? ((count as number) / overview.metrics.total_cases) * 100 : 0}%`, backgroundColor: LK.primary }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5 flex items-center justify-between gap-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>项目动作队列</h3>
            <p className="text-xs mt-1" style={{ color: LK.muted }}>快速查看项目级动作拥塞和失败项</p>
          </div>
          <button
            onClick={() => setWorkspaceView('queue')}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
          >
            打开队列视图
          </button>
        </div>
        <div className="p-6 space-y-3 max-h-[28rem] overflow-y-auto">
          {projectActions.slice(0, 6).map((item) => (
            <div key={`overview-${item.id}`} className="rounded-lg px-4 py-4" style={{ border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: LK.ink }}>{item.case_title}</p>
                  <p className="text-xs mt-1" style={{ color: LK.body }}>{labelOf(item.action_type, ACTION_TYPE_LABELS)} · {labelOf(item.execution_status, ACTION_STATUS_LABELS)}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCaseId(item.case_id);
                    setWorkspaceView('cases');
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
                >
                  查看
                </button>
              </div>
            </div>
          ))}
          {projectActions.length === 0 && <div className="text-sm" style={{ color: LK.muted }}>当前暂无项目级动作</div>}
        </div>
      </div>
    </div>

    <div className="space-y-6">
      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5 flex items-center gap-2" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <Clock3 size={16} style={{ color: LK.warning }} />
          <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>项目人工待办</h3>
        </div>
        <div className="max-h-[28rem] overflow-y-auto" style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
          {manualTasks.length === 0 ? (
            <div className="px-6 py-8 text-sm" style={{ color: LK.muted }}>当前项目没有人工待办</div>
          ) : (
            manualTasks.map((item) => (
              <div key={item.id} className="px-6 py-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold" style={{ color: LK.ink }}>{item.title}</p>
                    <p className="text-xs" style={{ color: LK.body }}>{item.summary || '暂无说明'}</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2d4a 100%)', border: `1px solid ${LK.border}` }}>
        <div className="flex items-center gap-3">
          <Bot size={18} style={{ color: LK.primarySoft }} />
          <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>推荐使用路径</h3>
        </div>
        <div className="mt-4 space-y-3 text-sm" style={{ color: LK.body }}>
          <div className="flex items-start gap-3">
            <Briefcase size={15} className="mt-0.5" style={{ color: LK.muted }} />
            <p>在总览里先看项目队列和人工任务，再决定是去案例运行页还是服务页操作。</p>
          </div>
          <div className="flex items-start gap-3">
            <Sparkles size={15} className="mt-0.5" style={{ color: LK.primarySoft }} />
            <p>对单个问题需要深入推进时，再进入案例运行视图做派发、裁决和结果分析。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const ServicesWorkspace: React.FC<{
  serviceForm: any;
  setServiceForm: (value: any) => void;
  defaultServiceForm: any;
  submittingService: boolean;
  handleRegisterService: (event: React.FormEvent) => Promise<void>;
  services: any[];
  serviceOperatingId: string | null;
  handleServiceHeartbeat: (serviceId: string) => Promise<void>;
  handleServiceUnregister: (serviceId: string) => Promise<void>;
}> = ({
  serviceForm,
  setServiceForm,
  defaultServiceForm,
  submittingService,
  handleRegisterService,
  services,
  serviceOperatingId,
  handleServiceHeartbeat,
  handleServiceUnregister,
}) => {
  const [serviceSearch, setServiceSearch] = React.useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = React.useState('all');
  const [serviceStageFilter, setServiceStageFilter] = React.useState('all');
  const [serviceRoleFilter, setServiceRoleFilter] = React.useState('all');
  const [serviceActionFilter, setServiceActionFilter] = React.useState('all');
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const editingService = services.find((item) => item.service_id === serviceForm.service_id);
  const serviceStats = React.useMemo(() => {
    const items = services || [];
    const active = items.filter((item) => item.status === 'active').length;
    const unhealthy = items.filter((item) => item.status !== 'active').length;
    const missingHealthcheck = items.filter((item) => !item.healthcheck_url).length;
    const missingCapability = items.filter((item) => (item.capabilities || []).length === 0).length;
    return { active, unhealthy, missingHealthcheck, missingCapability };
  }, [services]);

  const filteredServices = React.useMemo(() => {
    const keyword = serviceSearch.trim().toLowerCase();
    return (services || []).filter((item) => {
      if (serviceStatusFilter !== 'all' && item.status !== serviceStatusFilter) return false;
      if (serviceStageFilter !== 'all' && !(item.capabilities || []).some((cap: any) => (cap.meta?.bind_stage || item.meta?.bind_stage) === serviceStageFilter)) return false;
      if (serviceRoleFilter !== 'all' && !(item.capabilities || []).some((cap: any) => (cap.meta?.module_role || item.meta?.module_role) === serviceRoleFilter)) return false;
      if (serviceActionFilter !== 'all' && !(item.capabilities || []).some((cap: any) => cap.action_type === serviceActionFilter)) return false;
      if (!keyword) return true;
      return [
        item.service_id,
        item.service_name,
        item.service_type,
        item.endpoint,
        item.meta?.association_note,
        ...(item.capabilities || []).flatMap((cap: any) => [cap.capability_code, cap.action_type]),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword));
    });
  }, [serviceActionFilter, serviceRoleFilter, serviceSearch, serviceStageFilter, serviceStatusFilter, services]);

  const loadServiceToForm = (item: any) => {
    const capability = (item.capabilities || [])[0] || {};
    const serviceMeta = item.meta || {};
    const capMeta = capability.meta || {};
    setServiceForm({
      ...defaultServiceForm,
      service_id: item.service_id || '',
      service_name: item.service_name || '',
      service_type: item.service_type || defaultServiceForm.service_type,
      endpoint: item.endpoint || '',
      healthcheck_url: item.healthcheck_url || '',
      callback_mode: item.callback_mode || defaultServiceForm.callback_mode,
      auth_mode: item.auth_mode || defaultServiceForm.auth_mode,
      version: item.version || defaultServiceForm.version,
      capability_code: capability.capability_code || '',
      action_type: capability.action_type || defaultServiceForm.action_type,
      priority: capability.priority ?? defaultServiceForm.priority,
      timeout_seconds: capability.timeout_seconds ?? defaultServiceForm.timeout_seconds,
      concurrency_limit: capability.concurrency_limit ?? defaultServiceForm.concurrency_limit,
      module_role: capMeta.module_role || serviceMeta.module_role || defaultServiceForm.module_role,
      bind_stage: capMeta.bind_stage || serviceMeta.bind_stage || defaultServiceForm.bind_stage,
      report_channel: capMeta.report_channel || serviceMeta.report_channel || defaultServiceForm.report_channel,
      association_note: serviceMeta.association_note || defaultServiceForm.association_note,
    });
    setShowAdvanced(true);
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[0.95fr_1.35fr] gap-6 items-start">
      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5 flex items-center justify-between gap-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div className="flex items-center gap-2">
            <ServerCog size={16} style={{ color: LK.success }} />
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>能力服务注册</h3>
          </div>
          {editingService && (
            <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>
              更新模式
            </span>
          )}
        </div>
        <form onSubmit={handleRegisterService} className="p-6 grid grid-cols-1 gap-3">
          <div className="rounded-xl border p-4" style={{ borderColor: LK.success, backgroundColor: `${LK.success}14` }}>
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.success }}>配置提醒</div>
            <div className="mt-2 space-y-1 text-xs" style={{ color: LK.success }}>
              <p>建议至少补齐服务地址、健康检查、阶段绑定和能力标识，后续排障会明显轻松很多。</p>
              <p>如果一个阶段有多套同类能力，优先通过优先级和角色说明拉开职责边界。</p>
            </div>
          </div>
          <input value={serviceForm.service_id} onChange={(event) => setServiceForm({ ...serviceForm, service_id: event.target.value })} placeholder="服务标识" className="form-input" required />
          <input value={serviceForm.service_name} onChange={(event) => setServiceForm({ ...serviceForm, service_name: event.target.value })} placeholder="服务名称" className="form-input" required />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <select value={serviceForm.service_type} onChange={(event) => setServiceForm({ ...serviceForm, service_type: event.target.value })} className="form-select">
              {Object.keys(SERVICE_TYPE_LABELS).map((item) => (
                <option key={item} value={item}>{SERVICE_TYPE_LABELS[item]}</option>
              ))}
            </select>
            <input value={serviceForm.version} onChange={(event) => setServiceForm({ ...serviceForm, version: event.target.value })} placeholder="版本" className="form-input" />
          </div>
          <input value={serviceForm.endpoint} onChange={(event) => setServiceForm({ ...serviceForm, endpoint: event.target.value })} placeholder="服务地址" className="form-input" required />
          <input value={serviceForm.healthcheck_url} onChange={(event) => setServiceForm({ ...serviceForm, healthcheck_url: event.target.value })} placeholder="健康检查地址" className="form-input" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <input value={serviceForm.capability_code} onChange={(event) => setServiceForm({ ...serviceForm, capability_code: event.target.value })} placeholder="能力标识" className="form-input" required />
            <select value={serviceForm.action_type} onChange={(event) => setServiceForm({ ...serviceForm, action_type: event.target.value })} className="form-select">
              {Object.keys(ACTION_TYPE_LABELS).map((item) => (
                <option key={item} value={item}>{ACTION_TYPE_LABELS[item]}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border p-4 space-y-3" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: LK.ink }}>高级能力配置</div>
                <div className="mt-1 text-xs" style={{ color: LK.muted }}>优先级、超时、并发、回调方式和绑定元数据</div>
              </div>
              <span className="text-xs font-semibold" style={{ color: LK.muted }}>{showAdvanced ? '收起' : '展开'}</span>
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" value={serviceForm.priority} onChange={(event) => setServiceForm({ ...serviceForm, priority: Number(event.target.value) || 100 })} placeholder="优先级" className="form-input" />
                  <input type="number" value={serviceForm.timeout_seconds} onChange={(event) => setServiceForm({ ...serviceForm, timeout_seconds: Number(event.target.value) || 300 })} placeholder="超时秒数" className="form-input" />
                  <input type="number" value={serviceForm.concurrency_limit} onChange={(event) => setServiceForm({ ...serviceForm, concurrency_limit: Number(event.target.value) || 1 })} placeholder="并发上限" className="form-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select value={serviceForm.callback_mode} onChange={(event) => setServiceForm({ ...serviceForm, callback_mode: event.target.value })} className="form-select">
                    {['push', 'polling', 'manual'].map((item) => (
                      <option key={item} value={item}>{labelOf(item, REPORT_CHANNEL_LABELS)}</option>
                    ))}
                  </select>
                  <select value={serviceForm.auth_mode} onChange={(event) => setServiceForm({ ...serviceForm, auth_mode: event.target.value })} className="form-select">
                    {['machine_token', 'none', 'manual'].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <select value={serviceForm.module_role} onChange={(event) => setServiceForm({ ...serviceForm, module_role: event.target.value })} className="form-select">
                    {Object.keys(MODULE_ROLE_LABELS).map((item) => (
                      <option key={item} value={item}>{MODULE_ROLE_LABELS[item]}</option>
                    ))}
                  </select>
                  <select value={serviceForm.bind_stage} onChange={(event) => setServiceForm({ ...serviceForm, bind_stage: event.target.value })} className="form-select">
                    {['receive', 'triage', 'validation', 'finished'].map((item) => (
                      <option key={item} value={item}>{labelOf(item, STAGE_LABELS)}</option>
                    ))}
                  </select>
                  <select value={serviceForm.report_channel} onChange={(event) => setServiceForm({ ...serviceForm, report_channel: event.target.value })} className="form-select">
                    {Object.keys(REPORT_CHANNEL_LABELS).map((item) => (
                      <option key={item} value={item}>{REPORT_CHANNEL_LABELS[item]}</option>
                    ))}
                  </select>
                </div>
                <textarea value={serviceForm.association_note} onChange={(event) => setServiceForm({ ...serviceForm, association_note: event.target.value })} placeholder="记录该服务与阶段、环境或路由策略的关联说明" className="form-textarea min-h-[5rem] resize-none" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submittingService} className="flex-1 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50" style={{ backgroundColor: LK.success, color: '#ffffff' }} onMouseEnter={(e) => { if (!submittingService) e.currentTarget.style.backgroundColor = '#3da860'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.success; }}>
              <Plus size={16} />
              {submittingService ? (editingService ? '更新中...' : '注册中...') : (editingService ? '更新能力服务' : '注册能力服务')}
            </button>
            <button
              type="button"
              onClick={() => setServiceForm(defaultServiceForm)}
              className="px-5 py-3 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
            >
              清空
            </button>
          </div>
        </form>
      </div>

      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5 space-y-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>服务能力一览</h3>
            <div className="text-xs" style={{ color: LK.muted }}>共 {filteredServices.length} / {services.length} 项</div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {[
              { label: '活跃服务', value: serviceStats.active, lkTone: { bg:`${LK.success}14`, border: `${LK.success}40`, color: LK.success } },
              { label: '待检查服务', value: serviceStats.unhealthy, lkTone: { bg:`${LK.warning}14`, border: `${LK.warning}40`, color: LK.warning } },
              { label: '缺健康检查', value: serviceStats.missingHealthcheck, lkTone: { bg:`${LK.info}14`, border: `${LK.info}40`, color: LK.info } },
              { label: '缺能力声明', value: serviceStats.missingCapability, lkTone: { bg:`${LK.error}14`, border: `${LK.error}40`, color: LK.error } },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border px-4 py-4" style={{ backgroundColor: item.lkTone.bg, borderColor: item.lkTone.border, color: item.lkTone.color }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_repeat(3,minmax(0,0.55fr))_auto] gap-3">
            <input
              value={serviceSearch}
              onChange={(event) => setServiceSearch(event.target.value)}
              placeholder="搜索服务名、服务标识、能力标识、动作类型或关联说明"
              className="form-input"
            />
            <select value={serviceStageFilter} onChange={(event) => setServiceStageFilter(event.target.value)} className="form-select">
              <option value="all">全部阶段</option>
              {['receive', 'triage', 'validation', 'finished'].map((item) => (
                <option key={item} value={item}>{labelOf(item, STAGE_LABELS)}</option>
              ))}
            </select>
            <select value={serviceRoleFilter} onChange={(event) => setServiceRoleFilter(event.target.value)} className="form-select">
              <option value="all">全部角色</option>
              {Object.keys(MODULE_ROLE_LABELS).map((item) => (
                <option key={item} value={item}>{MODULE_ROLE_LABELS[item]}</option>
              ))}
            </select>
            <select value={serviceActionFilter} onChange={(event) => setServiceActionFilter(event.target.value)} className="form-select">
              <option value="all">全部动作</option>
              {Object.keys(ACTION_TYPE_LABELS).map((item) => (
                <option key={item} value={item}>{ACTION_TYPE_LABELS[item]}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {['all', 'active'].map((item) => (
                <button
                  key={item}
                  onClick={() => setServiceStatusFilter(item)}
                  className="px-4 py-3 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: serviceStatusFilter === item ? LK.primary : LK.surfaceRaised,
                    color: serviceStatusFilter === item ? '#ffffff' : LK.body
                  }}
                  onMouseEnter={(e) => { if (serviceStatusFilter !== item) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                  onMouseLeave={(e) => { if (serviceStatusFilter !== item) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; } }}
                >
                  {item === 'all' ? '全部状态' : '仅活跃'}
                </button>
              ))}
              {(serviceSearch || serviceStageFilter !== 'all' || serviceRoleFilter !== 'all' || serviceActionFilter !== 'all' || serviceStatusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setServiceSearch('');
                    setServiceStatusFilter('all');
                    setServiceStageFilter('all');
                    setServiceRoleFilter('all');
                    setServiceActionFilter('all');
                  }}
                  className="px-4 py-3 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: LK.surface, color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.body; }}
                >
                  清空
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-theme-border max-h-[56rem] overflow-y-auto">
          {filteredServices.length === 0 ? (
            <div className="px-6 py-8 text-sm text-theme-text-muted">当前筛选条件下没有能力服务</div>
          ) : (
            filteredServices.map((item) => (
              <div key={item.service_id} className="px-6 py-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-theme-text-primary">{item.service_name}</p>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest ${item.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{item.status}</span>
                      {!item.healthcheck_url && <span className="px-2 py-1 rounded-lg bg-sky-500/15 text-[10px] font-semibold uppercase tracking-widest text-sky-400">缺健康检查</span>}
                      {(item.capabilities || []).length === 0 && <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-[10px] font-semibold uppercase tracking-widest text-rose-400">缺能力声明</span>}
                    </div>
                    <p className="text-xs text-theme-text-muted">{labelOf(item.service_type, SERVICE_TYPE_LABELS)} · {item.endpoint}</p>
                    <p className="text-[11px] text-theme-text-muted">heartbeat: {formatTime(item.last_heartbeat_at)} · callback: {item.callback_mode || 'push'} · auth: {item.auth_mode || 'machine_token'}</p>
                  </div>
                  <div className="text-right text-xs text-theme-text-muted shrink-0">
                    <p>版本</p>
                    <p className="mt-1 font-medium text-theme-text-secondary">{item.version || '暂无'}</p>
                  </div>
                </div>

                {(item.meta?.association_note || item.meta?.bind_stage || item.meta?.module_role) && (
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                    <div className="font-medium text-theme-text-secondary">服务元数据</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.meta?.bind_stage && <span>阶段：{labelOf(item.meta.bind_stage, STAGE_LABELS)}</span>}
                      {item.meta?.module_role && <span>角色：{labelOf(item.meta.module_role, MODULE_ROLE_LABELS)}</span>}
                      {item.meta?.report_channel && <span>回传：{labelOf(item.meta.report_channel, REPORT_CHANNEL_LABELS)}</span>}
                    </div>
                    {item.meta?.association_note && <div className="mt-2 text-theme-text-muted">{item.meta.association_note}</div>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 text-[11px]">
                  {item.meta?.bind_stage && (
                    <span className="rounded-xl bg-violet-500/15 px-3 py-2 font-medium text-violet-400">
                      绑定阶段 {labelOf(item.meta.bind_stage, STAGE_LABELS)}
                    </span>
                  )}
                  {item.meta?.module_role && (
                    <span className="rounded-xl bg-theme-elevated px-3 py-2 font-medium text-theme-text-secondary">
                      角色 {labelOf(item.meta.module_role, MODULE_ROLE_LABELS)}
                    </span>
                  )}
                  {item.callback_mode && (
                    <span className="rounded-xl bg-emerald-500/15 px-3 py-2 font-medium text-emerald-400">
                      回调 {item.callback_mode}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {(item.capabilities || []).map((cap: any) => (
                    <div key={`${item.service_id}-${cap.capability_code}`} className="rounded-[1.25rem] border border-theme-border bg-[rgba(255,255,255,0.04)] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 rounded-lg bg-blue-500/15 text-[10px] font-semibold uppercase tracking-widest text-blue-400">{labelOf(cap.action_type, ACTION_TYPE_LABELS)}</span>
                            <span className="px-2 py-1 rounded-lg bg-theme-elevated text-[10px] font-semibold uppercase tracking-widest text-theme-text-secondary">{cap.capability_code}</span>
                            {(cap.timeout_seconds ?? 0) < 60 && (
                              <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-[10px] font-semibold uppercase tracking-widest text-amber-400">短超时</span>
                            )}
                            {(cap.concurrency_limit ?? 0) <= 1 && (
                              <span className="px-2 py-1 rounded-lg bg-sky-500/15 text-[10px] font-semibold uppercase tracking-widest text-sky-400">低并发</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-[11px] text-theme-text-muted">
                            <span>阶段：{labelOf(cap.meta?.bind_stage || item.meta?.bind_stage, STAGE_LABELS)}</span>
                            <span>角色：{labelOf(cap.meta?.module_role || item.meta?.module_role, MODULE_ROLE_LABELS)}</span>
                            <span>优先级：{cap.priority}</span>
                            <span>超时：{cap.timeout_seconds}s</span>
                            <span>并发：{cap.concurrency_limit}</span>
                            <span>回传：{labelOf(cap.meta?.report_channel || item.meta?.report_channel, REPORT_CHANNEL_LABELS)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => loadServiceToForm(item)}
                          className="px-3 py-2 rounded-xl bg-theme-elevated text-xs font-medium text-theme-text-secondary shrink-0"
                        >
                          编辑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleServiceHeartbeat(item.service_id)} disabled={serviceOperatingId === item.service_id} className="px-3 py-2 rounded-xl bg-theme-elevated text-xs font-medium text-theme-text-secondary">
                    {serviceOperatingId === item.service_id ? '处理中...' : '刷新心跳'}
                  </button>
                  <button onClick={() => loadServiceToForm(item)} className="px-3 py-2 rounded-xl bg-blue-500/15 text-xs font-medium text-blue-400">
                    回填到表单
                  </button>
                  <button onClick={() => handleServiceUnregister(item.service_id)} disabled={serviceOperatingId === item.service_id} className="px-3 py-2 rounded-xl bg-rose-500/15 text-xs font-medium text-rose-400 flex items-center gap-2">
                    <Trash2 size={12} />
                    注销
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const TasksWorkspace: React.FC<{
  manualTasks: any[];
  setSelectedCaseId: (id: string) => void;
  setWorkspaceView: (view: WorkspaceViewKey) => void;
  setActiveTab: (tab: 'timeline' | 'results' | 'tasks' | 'actions') => void;
}> = ({ manualTasks, setSelectedCaseId, setWorkspaceView, setActiveTab }) => (
  <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
    <div className="px-6 py-5 flex items-center gap-2" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
      <Clock3 size={16} style={{ color: LK.warning }} />
      <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>项目人工待办</h3>
    </div>
    <div className="max-h-[48rem] overflow-y-auto" style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
      {manualTasks.length === 0 ? (
        <div className="px-6 py-8 text-sm" style={{ color: LK.muted }}>当前项目没有人工待办</div>
      ) : (
        manualTasks.map((item) => (
          <div key={item.id} className="px-6 py-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: LK.ink }}>{item.title}</p>
                <p className="text-xs" style={{ color: LK.body }}>{item.summary || '暂无说明'}</p>
                <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: LK.muted, fontFamily: MONO }}>
                  <span>{item.task_type}</span>
                  <span>case: {item.case_id.slice(0, 8)}</span>
                  <span>{item.assignee || 'unassigned'}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>{item.status}</span>
                <button
                  onClick={() => {
                    setSelectedCaseId(item.case_id);
                    setWorkspaceView('cases');
                    setActiveTab('tasks');
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
                >
                  打开案例
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

export const QueueWorkspace: React.FC<{
  projectActions: any[];
  overview: any;
  services: any[];
  actionQueueFilter: string;
  setActionQueueFilter: (filter: string) => void;
  setSelectedCaseId: (id: string) => void;
  setWorkspaceView: (view: WorkspaceViewKey) => void;
  setActiveTab: (tab: 'timeline' | 'results' | 'tasks' | 'actions') => void;
  actionOperatingId: string | null;
  handleActionControl: (actionId: string, operation: 'retry' | 'cancel') => Promise<void>;
  refreshAll: () => Promise<void>;
}> = ({
  projectActions,
  overview,
  services,
  actionQueueFilter,
  setActionQueueFilter,
  setSelectedCaseId,
  setWorkspaceView,
  setActiveTab,
  actionOperatingId,
  handleActionControl,
  refreshAll,
}) => {
  const [searchText, setSearchText] = React.useState('');
  const [showOnlyExceptions, setShowOnlyExceptions] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState('all');
  const [selectedStage, setSelectedStage] = React.useState('all');
  const [quickFilter, setQuickFilter] = React.useState<'all' | 'timed_out' | 'retryable' | 'service_risk'>('all');

  const serviceMap = React.useMemo(
    () => Object.fromEntries((services || []).map((item: any) => [item.service_id, item])),
    [services],
  );

  const formatSeconds = React.useCallback((value?: number | null) => {
    if (value == null || Number.isNaN(Number(value))) return '暂无';
    const total = Math.max(0, Math.round(Number(value)));
    if (total < 60) return`${total}s`;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes < 60) return`${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    return`${hours}h ${minutes % 60}m`;
  }, []);

  const actionDecorated = React.useMemo(() => {
    const now = Date.now();
    return (projectActions || []).map((item) => {
      const service = item.target_service_id ? serviceMap[item.target_service_id] : null;
      const timeoutAtMs = item.timeout_at ? new Date(item.timeout_at).getTime() : null;
      const isTimedOut = Boolean(
        item.is_timed_out || (
          timeoutAtMs
          && Number.isFinite(timeoutAtMs)
          && timeoutAtMs < now
          && ['queued', 'running'].includes(item.execution_status)
        )
      );
      const serviceHealthy = !service || service.status === 'active';
      const canRetry = item.can_retry ?? ['failed', 'cancelled', 'succeeded', 'partial'].includes(item.execution_status);
      const canCancel = item.can_cancel ?? ['queued', 'running'].includes(item.execution_status);
      const queueWaitSeconds = item.queue_wait_seconds ?? null;
      const runDurationSeconds = item.run_duration_seconds ?? null;
      return {
        ...item,
        service,
        isTimedOut,
        serviceHealthy,
        canRetry,
        canCancel,
        queueWaitSeconds,
        runDurationSeconds,
      };
    });
  }, [projectActions, serviceMap]);

  const serviceOptions = React.useMemo(() => {
    const options = actionDecorated
      .filter((item) => item.target_service_id)
      .reduce((acc, item) => {
        if (!acc.some((option) => option.value === item.target_service_id)) {
          acc.push({
            value: item.target_service_id,
            label: item.service?.service_name || item.target_service_id,
          });
        }
        return acc;
      }, [] as Array<{ value: string; label: string }>);
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [actionDecorated]);

  const stageOptions = React.useMemo(() => {
    const stages = Array.from(new Set(actionDecorated.map((item) => item.stage).filter(Boolean)));
    return stages.sort();
  }, [actionDecorated]);

  const filteredActions = React.useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return actionDecorated
      .filter((item) => {
        if (!showOnlyExceptions) return true;
        return item.execution_status === 'failed' || item.isTimedOut || !item.serviceHealthy;
      })
      .filter((item) => {
        if (selectedServiceId !== 'all' && item.target_service_id !== selectedServiceId) return false;
        if (selectedStage !== 'all' && item.stage !== selectedStage) return false;
        if (quickFilter === 'timed_out' && !item.isTimedOut) return false;
        if (quickFilter === 'retryable' && !item.canRetry) return false;
        if (quickFilter === 'service_risk' && item.serviceHealthy) return false;
        return true;
      })
      .filter((item) => {
        if (!keyword) return true;
        return [
          item.case_title,
          item.case_id,
          item.target_service_id,
          item.action_type,
          item.stage,
          item.dispatch_status,
          item.result_summary,
          item.service?.service_name,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(keyword));
      })
      .sort((a, b) => {
        const rank = (item: any) => {
          if (item.execution_status === 'failed') return 0;
          if (item.isTimedOut) return 1;
          if (!item.serviceHealthy) return 2;
          if (item.execution_status === 'running') return 3;
          if (item.execution_status === 'queued') return 4;
          return 5;
        };
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [actionDecorated, quickFilter, searchText, selectedServiceId, selectedStage, showOnlyExceptions]);

  const queueMetrics = React.useMemo(() => {
    const queued = actionDecorated.filter((item) => item.execution_status === 'queued').length;
    const running = actionDecorated.filter((item) => item.execution_status === 'running').length;
    const failed = actionDecorated.filter((item) => item.execution_status === 'failed').length;
    const timedOut = actionDecorated.filter((item) => item.isTimedOut).length;
    const serviceRisk = actionDecorated.filter((item) => !item.serviceHealthy).length;
    const retryable = actionDecorated.filter((item) => item.canRetry).length;
    return { queued, running, failed, timedOut, serviceRisk, retryable };
  }, [actionDecorated]);

  const topBlockedServices = React.useMemo(() => {
    const grouped = new Map<string, { serviceId: string; serviceName: string; pending: number; failed: number; unhealthy: boolean }>();
    actionDecorated.forEach((item) => {
      const serviceId = item.target_service_id || 'unassigned';
      const current = grouped.get(serviceId) || {
        serviceId,
        serviceName: item.service?.service_name || item.target_service_id || '未绑定服务',
        pending: 0,
        failed: 0,
        unhealthy: !item.serviceHealthy,
      };
      if (['queued', 'running'].includes(item.execution_status)) current.pending += 1;
      if (item.execution_status === 'failed' || item.isTimedOut) current.failed += 1;
      current.unhealthy = current.unhealthy || !item.serviceHealthy;
      grouped.set(serviceId, current);
    });
    return Array.from(grouped.values())
      .sort((a, b) => (b.failed - a.failed) || (b.pending - a.pending) || a.serviceName.localeCompare(b.serviceName))
      .slice(0, 4);
  }, [actionDecorated]);

  const stageBreakdown = React.useMemo(() => {
    const grouped = new Map<string, number>();
    actionDecorated.forEach((item) => {
      const key = item.stage || 'unknown';
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return Array.from(grouped.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);
  }, [actionDecorated]);

  const groupedActions = React.useMemo(() => {
    const groups = [
      {
        key: 'exceptions',
        title: '失败 / 超时优先处理',
        description: '优先检查失败、超时和服务异常动作，先恢复引擎可用性。',
        items: filteredActions.filter((item) => item.execution_status === 'failed' || item.isTimedOut || !item.serviceHealthy),
      },
      {
        key: 'running',
        title: '运行中',
        description: '适合观察执行时长和服务响应是否正常。',
        items: filteredActions.filter((item) => item.execution_status === 'running' && !item.isTimedOut && item.serviceHealthy),
      },
      {
        key: 'queued',
        title: '排队中',
        description: '重点关注等待时间较长或集中在同一服务的动作。',
        items: filteredActions.filter((item) => item.execution_status === 'queued' && !item.isTimedOut && item.serviceHealthy),
      },
      {
        key: 'completed',
        title: '已完成 / 已取消',
        description: '用于回看近期执行情况和重复重试动作。',
        items: filteredActions.filter((item) => !['running', 'queued', 'failed'].includes(item.execution_status) && !item.isTimedOut && item.serviceHealthy),
      },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [filteredActions]);

  const activeFilterCount = React.useMemo(
    () => [showOnlyExceptions, selectedServiceId !== 'all', selectedStage !== 'all', quickFilter !== 'all', Boolean(searchText.trim())].filter(Boolean).length,
    [quickFilter, searchText, selectedServiceId, selectedStage, showOnlyExceptions],
  );

  const formatTimeoutHint = (item: any) => {
    if (!item.timeout_at) return '未设置超时';
    if (item.isTimedOut) return`已超时 ${formatTime(item.timeout_at)}`;
    return`超时点 ${formatTime(item.timeout_at)}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-5 gap-4">
          {[
          { label: '排队动作', value: queueMetrics.queued, bg: LK.surfaceRaised, color: LK.body },
          { label: '运行中', value: queueMetrics.running, bg:`${LK.primary}14`, color: LK.primary },
          { label: '失败动作', value: queueMetrics.failed, bg:`${LK.error}14`, color: LK.error },
          { label: '疑似超时', value: queueMetrics.timedOut, bg:`${LK.warning}14`, color: LK.warning },
          { label: '服务风险', value: queueMetrics.serviceRisk, bg:`${LK.success}14`, color: LK.success },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border p-4" style={{ backgroundColor: item.bg, borderColor: LK.border }}>
            <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70" style={{ color: LK.muted }}>{item.label}</div>
            <div className="mt-3 text-3xl font-semibold" style={{ color: LK.ink }}>{item.value}</div>
            <div className="mt-1 text-xs opacity-80" style={{ color: LK.body }}>{item.label === '服务风险' ? '绑定服务未激活或未注册的动作数' : '基于当前筛选前的项目动作计算'}</div>
          </div>
        ))}
      </div>

      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5 flex items-center justify-between gap-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>项目动作队列</h3>
            <p className="text-xs mt-1" style={{ color: LK.muted }}>从项目视角统一查看排队、运行、失败、超时风险与服务关联状态，支持直接跳转和处置</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>
              <Activity size={14} style={{ color: LK.muted }} />
              {filteredActions.length} / {projectActions.length}
            </div>
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: LK.primary, color: '#ffffff' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
            >
              <RefreshCw size={13} />
              刷新
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {(queueMetrics.failed > 0 || queueMetrics.timedOut > 0 || queueMetrics.serviceRisk > 0) && (
            <div className="rounded-xl border px-4 py-4" style={{ background: `linear-gradient(to right, ${LK.warning}14, ${LK.error}14)`, borderColor: LK.warning }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: LK.ink }}>
                    <AlertTriangle size={15} style={{ color: LK.warning }} />
                    异常动作优先看板
                  </div>
                  <p className="text-xs" style={{ color: LK.body }}>失败、超时和服务异常动作会直接拖慢阶段推进，建议优先恢复这些链路。</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button onClick={() => setQuickFilter('timed_out')} className="rounded-lg px-3 py-2 font-semibold transition-colors" style={{ backgroundColor: `${LK.warning}33`, color: LK.warning }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor =`${LK.warning}4D`; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor =`${LK.warning}33`; }}>超时 {queueMetrics.timedOut}</button>
                  <button onClick={() => setQuickFilter('service_risk')} className="rounded-lg px-3 py-2 font-semibold transition-colors" style={{ backgroundColor: `${LK.success}33`, color: LK.success }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor =`${LK.success}4D`; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor =`${LK.success}33`; }}>服务风险 {queueMetrics.serviceRisk}</button>
                  <button onClick={() => {
                    setShowOnlyExceptions(true);
                    setQuickFilter('all');
                  }} className="rounded-lg px-3 py-2 font-semibold transition-colors" style={{ backgroundColor: LK.error, color: '#ffffff' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.error; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.error; }}>只看异常</button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_repeat(3,minmax(0,0.5fr))_auto] gap-3">
              <label className="relative block">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: LK.muted }} />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜索案例、案例ID、服务、动作类型、阶段或摘要"
                  className="w-full rounded-lg pl-10 pr-4 py-3 text-sm outline-none"
                  style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
                />
              </label>
              <select
                value={selectedStage}
                onChange={(event) => setSelectedStage(event.target.value)}
                className="rounded-lg px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
              >
                <option value="all">全部阶段</option>
                {stageOptions.map((item) => (
                  <option key={item} value={item}>{labelOf(item, STAGE_LABELS)}</option>
                ))}
              </select>
              <select
                value={selectedServiceId}
                onChange={(event) => setSelectedServiceId(event.target.value)}
                className="rounded-lg px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
              >
                <option value="all">全部服务</option>
                {serviceOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select
                value={quickFilter}
                onChange={(event) => setQuickFilter(event.target.value as 'all' | 'timed_out' | 'retryable' | 'service_risk')}
                className="rounded-lg px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
              >
                <option value="all">全部动作</option>
                <option value="timed_out">只看超时</option>
                <option value="retryable">只看可重试</option>
                <option value="service_risk">只看服务异常</option>
              </select>
              <button
                onClick={() => setShowOnlyExceptions((prev) => !prev)}
                className="px-4 py-3 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: showOnlyExceptions ? LK.error : LK.primary, color: '#ffffff' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                {showOnlyExceptions ? '显示全部动作' : '只看异常动作'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>快捷聚焦</span>
              {[
                { key: 'all', label: '全部', count: filteredActions.length },
                { key: 'timed_out', label: '超时动作', count: queueMetrics.timedOut },
                { key: 'retryable', label: '可重试', count: queueMetrics.retryable },
                { key: 'service_risk', label: '服务异常', count: queueMetrics.serviceRisk },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setQuickFilter(item.key as 'all' | 'timed_out' | 'retryable' | 'service_risk')}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: quickFilter === item.key ? LK.primary : LK.surfaceRaised,
                    color: quickFilter === item.key ? '#ffffff' : LK.body,
                    border: quickFilter === item.key ? 'none' :`1px solid ${LK.border}`
                  }}
                  onMouseEnter={(e) => { if (quickFilter !== item.key) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                  onMouseLeave={(e) => { if (quickFilter !== item.key) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; } }}
                >
                  {item.label} {item.count}
                </button>
              ))}
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setSearchText('');
                    setShowOnlyExceptions(false);
                    setSelectedServiceId('all');
                    setSelectedStage('all');
                    setQuickFilter('all');
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'transparent', color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }}
                >
                  清空筛选
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ACTION_QUEUE_FILTERS.map((item) => (
              <button key={item} onClick={() => setActionQueueFilter(item)} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest transition-colors" style={{
                backgroundColor: actionQueueFilter === item ? LK.primary : LK.surfaceRaised,
                color: actionQueueFilter === item ? '#ffffff' : LK.body
              }} onMouseEnter={(e) => { if (actionQueueFilter !== item) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }} onMouseLeave={(e) => { if (actionQueueFilter !== item) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; } }}>
                {labelOf(item, ACTION_STATUS_LABELS)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[1.35fr_0.65fr] gap-4">
            <div className="space-y-3 max-h-[46rem] overflow-y-auto pr-1">
              {filteredActions.length === 0 ? (
                <div className="rounded-xl border border-dashed px-5 py-8 text-sm" style={{ backgroundColor: LK.surfaceRaised, borderColor: LK.borderSoft, color: LK.body }}>
                  <div className="font-semibold" style={{ color: LK.inkSoft }}>当前筛选条件下没有动作</div>
                  <p className="mt-2 text-xs" style={{ color: LK.body }}>可以清空筛选回看全部队列，或切到能力注册页检查服务是否已激活并正确绑定阶段。</p>
                </div>
              ) : (
                groupedActions.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="sticky top-0 z-10 rounded-lg border px-4 py-3 backdrop-blur" style={{ borderColor: LK.border, backgroundColor: LK.surfaceGlass }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold" style={{ color: LK.ink }}>{group.title}</div>
                          <div className="mt-1 text-xs" style={{ color: LK.body }}>{group.description}</div>
                        </div>
                        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>{group.items.length} 条</div>
                      </div>
                    </div>

                    {group.items.map((item) => (
                      <div key={`queue-${item.id}`} className="rounded-xl border px-4 py-4" style={{
                        borderColor: item.execution_status === 'failed' || item.isTimedOut ? LK.error : LK.border,
                        backgroundColor: item.execution_status === 'failed' || item.isTimedOut ?`${LK.error}14` :`${LK.surface}0A`
                      }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-3 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}>{labelOf(item.action_type, ACTION_TYPE_LABELS)}</span>
                              <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>{labelOf(item.execution_status, ACTION_STATUS_LABELS)}</span>
                              <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>{labelOf(item.stage, STAGE_LABELS)}</span>
                              {item.target_service_id && (
                                <button
                                  onClick={() => setSelectedServiceId(item.target_service_id)}
                                  className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-colors"
                                  style={{ backgroundColor: item.serviceHealthy ?`${LK.success}22` :`${LK.warning}22`, color: item.serviceHealthy ? LK.success : LK.warning }}
                                >
                                  {item.service?.service_name || item.target_service_id}
                                </button>
                              )}
                              {item.isTimedOut && (
                                <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>疑似超时</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold truncate" style={{ color: LK.ink }}>{item.case_title}</p>
                              <p className="mt-1 text-xs" style={{ color: LK.body }}>{item.result_summary || '等待结果或尚未生成摘要'}</p>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px]" style={{ color: LK.muted }}>
                              <div className="flex flex-wrap gap-3">
                                <span>派发：{item.dispatch_status || '暂无'}</span>
                                <span>重试：{item.retry_count}</span>
                                <span>创建：{formatTime(item.created_at)}</span>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <span>等待时长：{formatSeconds(item.queueWaitSeconds)}</span>
                                <span>运行时长：{formatSeconds(item.runDurationSeconds)}</span>
                                <span>{formatTimeoutHint(item)}</span>
                              </div>
                            </div>
                            {!item.serviceHealthy && (
                              <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold" style={{ backgroundColor: `${LK.warning}14`, color: LK.warning }}>
                                <AlertTriangle size={13} />
                                目标服务未激活或未注册，建议先检查能力注册页。
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setSelectedCaseId(item.case_id);
                                setWorkspaceView('cases');
                                setActiveTab('actions');
                              }}
                              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                              style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
                            >
                              打开案例
                            </button>
                            <button
                              onClick={() => handleActionControl(item.id, 'retry')}
                              disabled={actionOperatingId === item.id || !item.canRetry}
                              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              style={{ backgroundColor: item.canRetry ? LK.success : LK.surfaceRaised, color: item.canRetry ? '#ffffff' : LK.muted }}
                            >
                              {actionOperatingId === item.id ? '处理中...' : '重试'}
                            </button>
                            <button
                              onClick={() => handleActionControl(item.id, 'cancel')}
                              disabled={actionOperatingId === item.id || !item.canCancel}
                              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              style={{ backgroundColor: item.canCancel ? LK.surfaceRaised : LK.surface, color: item.canCancel ? LK.inkSoft : LK.muted }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>运行判断</div>
                <div className="mt-3 space-y-2 text-sm" style={{ color: LK.body }}>
                  <p>项目运行中案例 {overview?.metrics?.running_cases || 0} 个，等待外部回调 {overview?.metrics?.waiting_external || 0} 个。</p>
                  <p>如果失败动作和疑似超时同时增长，优先检查服务健康、能力声明和回调链路。</p>
                  <p>当前筛选命中 {filteredActions.length} 条动作，已启用 {activeFilterCount} 个本地筛选条件。</p>
                </div>
              </div>

              <div className="rounded-xl border p-4" style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>阶段拥塞分布</div>
                <div className="mt-3 space-y-3">
                  {stageBreakdown.length === 0 ? (
                    <div className="text-sm" style={{ color: LK.muted }}>暂无阶段队列分布</div>
                  ) : (
                    stageBreakdown.map((item) => (
                      <button
                        key={item.stage}
                        onClick={() => setSelectedStage(item.stage)}
                        className="w-full rounded-lg border px-3 py-3 text-left transition-colors"
                        style={{
                          borderColor: selectedStage === item.stage ? LK.primary : LK.border,
                          backgroundColor: selectedStage === item.stage ? LK.primary : LK.surfaceRaised,
                          color: selectedStage === item.stage ? '#ffffff' : LK.inkSoft
                        }}
                        onMouseEnter={(e) => { if (selectedStage !== item.stage) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                        onMouseLeave={(e) => { if (selectedStage !== item.stage) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.inkSoft; } }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{labelOf(item.stage, STAGE_LABELS)}</div>
                          <div className="text-xs font-semibold">{item.count}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border p-4" style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>阻塞服务 Top</div>
                <div className="mt-3 space-y-3">
                  {topBlockedServices.length === 0 ? (
                    <div className="text-sm" style={{ color: LK.muted }}>当前没有明显堆积服务</div>
                  ) : (
                    topBlockedServices.map((item) => (
                      <button
                        key={item.serviceId}
                        onClick={() => setSelectedServiceId(item.serviceId)}
                        className="w-full rounded-lg border px-3 py-3 text-left transition-colors"
                        style={{
                          borderColor: selectedServiceId === item.serviceId ? LK.primary : LK.border,
                          backgroundColor: selectedServiceId === item.serviceId ? LK.primary : LK.surfaceRaised,
                          color: selectedServiceId === item.serviceId ? '#ffffff' : LK.inkSoft
                        }}
                        onMouseEnter={(e) => { if (selectedServiceId !== item.serviceId) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                        onMouseLeave={(e) => { if (selectedServiceId !== item.serviceId) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.inkSoft; } }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: selectedServiceId === item.serviceId ? '#ffffff' : LK.ink }}>{item.serviceName}</div>
                            <div className="mt-1 text-[11px]" style={{ color: selectedServiceId === item.serviceId ? '#cbd5e1' : LK.muted }}>{item.serviceId}</div>
                          </div>
                          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: item.unhealthy ?`${LK.warning}22` :`${LK.success}22`, color: item.unhealthy ? LK.warning : LK.success }}>
                            {item.unhealthy ? '待检查' : '正常'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ color: selectedServiceId === item.serviceId ? '#cbd5e1' : LK.body }}>
                          <span>排队/运行 {item.pending}</span>
                          <span>失败/超时 {item.failed}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ReproConfigWorkspace: React.FC<{
  serviceForm: any;
  setServiceForm: (value: any) => void;
  defaultServiceForm: any;
  submittingService: boolean;
  handleRegisterService: (event: React.FormEvent) => Promise<void>;
  services: any[];
  projectActions: any[];
}> = ({
  serviceForm,
  setServiceForm,
  defaultServiceForm,
  submittingService,
  handleRegisterService,
  services,
  projectActions,
}) => {
  const [serviceSearch, setServiceSearch] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState<'all' | 'validation' | 'finished'>('all');
  const [actionFilter, setActionFilter] = React.useState<'all' | (typeof REPRO_ACTION_TYPES)[number]>('all');

  const reproServices = services.filter((item) =>
    (item.capabilities || []).some((cap: any) => REPRO_ACTION_TYPES.includes(cap.action_type)),
  );

  const templates = [
    {
      key: 'validation-http',
      label: 'HTTP 验证器',
      values: {
        module_role: 'validator',
        service_type: 'validator',
        action_type: 'validation',
        bind_stage: 'validation',
        report_channel: 'callback',
        capability_code: 'http_validation_default',
        association_note: '用于 validation 阶段的 HTTP 自动化复现与确认',
      },
    },
    {
      key: 'validation-poc',
      label: 'POC 生成器',
      values: {
        module_role: 'proof-provider',
        service_type: 'poc_generator',
        action_type: 'poc_generation',
        bind_stage: 'validation',
        report_channel: 'callback',
        capability_code: 'poc_generate_default',
        association_note: '用于 validation 阶段生成 POC 并回传验证材料',
      },
    },
    {
      key: 'validation-exp',
      label: 'EXP 生成器',
      values: {
        module_role: 'proof-provider',
        service_type: 'exp_generator',
        action_type: 'exp_generation',
        bind_stage: 'validation',
        report_channel: 'callback',
        capability_code: 'exp_generate_default',
        association_note: '用于 validation 阶段生成 EXP 或更高强度验证内容',
      },
    },
    {
      key: 'finished-sync',
      label: '上报回传器',
      values: {
        module_role: 'reporter',
        service_type: 'reporter',
        action_type: 'proof_verification',
        bind_stage: 'finished',
        report_channel: 'callback',
        capability_code: 'report_sync_default',
        association_note: '用于 finished 阶段回传复核结论与关联证据摘要',
      },
    },
  ];

  const coverageDefinitions = [
    {
      stage: 'validation',
      requirements: [
        { key: 'validation', label: '验证执行', matcher: (cap: any, service: any) => (cap.meta?.bind_stage || service.meta?.bind_stage || 'validation') === 'validation' && cap.action_type === 'validation' },
        { key: 'poc_generation', label: 'POC 生成', matcher: (cap: any, service: any) => (cap.meta?.bind_stage || service.meta?.bind_stage || 'validation') === 'validation' && cap.action_type === 'poc_generation' },
        { key: 'exp_generation', label: 'EXP 生成', matcher: (cap: any, service: any) => (cap.meta?.bind_stage || service.meta?.bind_stage || 'validation') === 'validation' && cap.action_type === 'exp_generation' },
      ],
    },
    {
      stage: 'finished',
      requirements: [
        { key: 'proof_verification', label: '结果回传', matcher: (cap: any, service: any) => (cap.meta?.bind_stage || service.meta?.bind_stage || 'validation') === 'finished' && cap.action_type === 'proof_verification' },
      ],
    },
  ];

  const stageMatrix = ['validation', 'finished'].map((stage) => ({
    stage,
    services: reproServices.filter((item) =>
      (item.capabilities || []).some((cap: any) => (cap.meta?.bind_stage || cap.meta?.lifecycle_stage || item.meta?.bind_stage || 'validation') === stage),
    ),
  }));
  const missingStages = stageMatrix.filter((item) => item.services.length === 0).map((item) => item.stage);

  const coverageMatrix = coverageDefinitions.map((group) => ({
    ...group,
    rows: group.requirements.map((req) => {
      const matchedServices = reproServices.filter((service) =>
        (service.capabilities || []).some((cap: any) => req.matcher(cap, service)),
      );
      return {
        ...req,
        matchedServices,
      };
    }),
  }));

  const reproActionStats = React.useMemo(() => {
    const grouped = new Map<string, { total: number; queued: number; running: number; failed: number }>();
    (projectActions || []).forEach((action) => {
      if (!action.target_service_id) return;
      const current = grouped.get(action.target_service_id) || { total: 0, queued: 0, running: 0, failed: 0 };
      current.total += 1;
      if (action.execution_status === 'queued') current.queued += 1;
      if (action.execution_status === 'running') current.running += 1;
      if (action.execution_status === 'failed') current.failed += 1;
      grouped.set(action.target_service_id, current);
    });
    return grouped;
  }, [projectActions]);

  const filteredReproServices = React.useMemo(() => {
    const keyword = serviceSearch.trim().toLowerCase();
    return reproServices.filter((item) => {
      const hitStage = stageFilter === 'all' || (item.capabilities || []).some((cap: any) => (cap.meta?.bind_stage || item.meta?.bind_stage || 'validation') === stageFilter);
      if (!hitStage) return false;
      if (actionFilter !== 'all' && !(item.capabilities || []).some((cap: any) => cap.action_type === actionFilter)) return false;
      if (!keyword) return true;
      return [
        item.service_id,
        item.service_name,
        item.endpoint,
        item.meta?.association_note,
        ...(item.capabilities || []).flatMap((cap: any) => [cap.capability_code, cap.action_type, cap.meta?.bind_stage]),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword));
    });
  }, [actionFilter, reproServices, serviceSearch, stageFilter]);

  const loadTemplate = (template: any) => setServiceForm({ ...serviceForm, ...template.values });

  const editService = (item: any) => {
    const capability = (item.capabilities || [])[0] || {};
    setServiceForm({
      ...defaultServiceForm,
      service_id: item.service_id || '',
      service_name: item.service_name || '',
      service_type: item.service_type || defaultServiceForm.service_type,
      endpoint: item.endpoint || '',
      healthcheck_url: item.healthcheck_url || '',
      callback_mode: item.callback_mode || defaultServiceForm.callback_mode,
      auth_mode: item.auth_mode || defaultServiceForm.auth_mode,
      version: item.version || defaultServiceForm.version,
      action_type: capability.action_type || defaultServiceForm.action_type,
      bind_stage: capability.meta?.bind_stage || item.meta?.bind_stage || defaultServiceForm.bind_stage,
      capability_code: capability.capability_code || '',
      report_channel: capability.meta?.report_channel || item.meta?.report_channel || defaultServiceForm.report_channel,
      module_role: capability.meta?.module_role || item.meta?.module_role || defaultServiceForm.module_role,
      association_note: item.meta?.association_note || defaultServiceForm.association_note,
      priority: capability.priority ?? defaultServiceForm.priority,
      timeout_seconds: capability.timeout_seconds ?? defaultServiceForm.timeout_seconds,
      concurrency_limit: capability.concurrency_limit ?? defaultServiceForm.concurrency_limit,
    });
  };

  const reproOverview = React.useMemo(() => {
    const total = reproServices.length;
    const validation = reproServices.filter((item) =>
      (item.capabilities || []).some((cap: any) => (cap.meta?.bind_stage || item.meta?.bind_stage || 'validation') === 'validation'),
    ).length;
    const finished = reproServices.filter((item) =>
      (item.capabilities || []).some((cap: any) => (cap.meta?.bind_stage || item.meta?.bind_stage || 'validation') === 'finished'),
    ).length;
    const risky = reproServices.filter((item) => {
      const stats = reproActionStats.get(item.service_id) || { total: 0, failed: 0 };
      return !item.healthcheck_url || stats.failed > 0;
    }).length;
    return { total, validation, finished, risky };
  }, [reproActionStats, reproServices]);

  const flowSteps = [
    { key: 'validation', label: '验证执行', actionType: 'validation' },
    { key: 'poc_generation', label: 'POC 生成', actionType: 'poc_generation' },
    { key: 'exp_generation', label: 'EXP 生成', actionType: 'exp_generation' },
    { key: 'proof_verification', label: '结果回传', actionType: 'proof_verification' },
  ];

  const flowStatus = React.useMemo(
    () => flowSteps.map((step) => ({
      ...step,
      count: reproServices.filter((service) => (service.capabilities || []).some((cap: any) => cap.action_type === step.actionType)).length,
    })),
    [reproServices],
  );

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[0.95fr_1.05fr] gap-6 items-start">
      <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>漏洞上报复现模块配置</h3>
          <p className="mt-1 text-xs" style={{ color: LK.muted }}>为复现、验证与终态回传模块配置注册信息与生命周期绑定关系。</p>
        </div>
        <form onSubmit={handleRegisterService} className="p-6 grid grid-cols-1 gap-3">
          {missingStages.length > 0 && (
            <div className="rounded-xl border p-4" style={{ backgroundColor: `${LK.warning}22`, borderColor: LK.warning }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.warning }}>缺口补齐建议</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingStages.map((stage) => {
                  const recommendedTemplate = stage === 'validation' ? templates.find((item) => item.key === 'validation-http') : templates.find((item) => item.key === 'finished-sync');
                  return (
                    <button
                      key={`missing-template-${stage}`}
                      type="button"
                      onClick={() => recommendedTemplate && loadTemplate(recommendedTemplate)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                      style={{ backgroundColor: LK.surface, color: LK.warning, border: `1px solid ${LK.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.warning; e.currentTarget.style.color = LK.warning; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.warning; }}
                    >
                      补齐 {labelOf(stage, STAGE_LABELS)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>快速模板</div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => loadTemplate(template)}
                  className="px-3 py-3 rounded-lg text-left text-xs font-semibold transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; }}
                >
                  <div>{template.label}</div>
                  <div className="mt-1 text-[11px] font-medium" style={{ color: LK.muted }}>{template.values.association_note}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={serviceForm.service_id} onChange={(event) => setServiceForm({ ...serviceForm, service_id: event.target.value })} placeholder="模块标识" className="form-input" required />
            <input value={serviceForm.service_name} onChange={(event) => setServiceForm({ ...serviceForm, service_name: event.target.value })} placeholder="模块名称" className="form-input" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={serviceForm.module_role} onChange={(event) => setServiceForm({ ...serviceForm, module_role: event.target.value })} className="form-select">
              <option value="reproducer">复现模块</option>
              <option value="reporter">上报模块</option>
              <option value="validator">验证模块</option>
              <option value="proof-provider">证明模块</option>
            </select>
            <select value={serviceForm.service_type} onChange={(event) => setServiceForm({ ...serviceForm, service_type: event.target.value })} className="form-select">
              <option value="validator">验证服务</option>
              <option value="analyzer">分析服务</option>
              <option value="poc_generator">验证脚本生成服务</option>
              <option value="exp_generator">利用证明生成服务</option>
              <option value="reporter">回传服务</option>
            </select>
          </div>
          <input value={serviceForm.endpoint} onChange={(event) => setServiceForm({ ...serviceForm, endpoint: event.target.value })} placeholder="模块地址" className="form-input" required />
          <input value={serviceForm.healthcheck_url} onChange={(event) => setServiceForm({ ...serviceForm, healthcheck_url: event.target.value })} placeholder="健康检查地址" className="form-input" />
          <div className="grid grid-cols-3 gap-3">
            <input value={serviceForm.version} onChange={(event) => setServiceForm({ ...serviceForm, version: event.target.value })} placeholder="版本" className="form-input" />
            <select value={serviceForm.action_type} onChange={(event) => setServiceForm({ ...serviceForm, action_type: event.target.value })} className="form-select">
              {REPRO_ACTION_TYPES.map((item) => <option key={item} value={item}>{labelOf(item, ACTION_TYPE_LABELS)}</option>)}
            </select>
            <select value={serviceForm.bind_stage} onChange={(event) => setServiceForm({ ...serviceForm, bind_stage: event.target.value })} className="form-select">
              <option value="validation">验证</option>
              <option value="finished">已结束</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={serviceForm.capability_code} onChange={(event) => setServiceForm({ ...serviceForm, capability_code: event.target.value })} placeholder="能力标识" className="form-input" required />
            <select value={serviceForm.report_channel} onChange={(event) => setServiceForm({ ...serviceForm, report_channel: event.target.value })} className="form-select">
              <option value="callback">回调</option>
              <option value="polling">轮询</option>
              <option value="manual">人工</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input type="number" value={serviceForm.priority} onChange={(event) => setServiceForm({ ...serviceForm, priority: Number(event.target.value) || 100 })} placeholder="优先级" className="form-input" />
            <input type="number" value={serviceForm.timeout_seconds} onChange={(event) => setServiceForm({ ...serviceForm, timeout_seconds: Number(event.target.value) || 300 })} placeholder="超时秒数" className="form-input" />
            <input type="number" value={serviceForm.concurrency_limit} onChange={(event) => setServiceForm({ ...serviceForm, concurrency_limit: Number(event.target.value) || 1 })} placeholder="并发上限" className="form-input" />
          </div>
          <textarea value={serviceForm.association_note} onChange={(event) => setServiceForm({ ...serviceForm, association_note: event.target.value })} placeholder="关联说明：例如用于验证阶段的 HTTP 复现与自动确认" className="form-textarea min-h-[6rem] resize-none" />
          <div className="flex gap-3">
            <button type="submit" disabled={submittingService} className="flex-1 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50" style={{ backgroundColor: LK.primary, color: '#ffffff' }} onMouseEnter={(e) => { if (!submittingService) e.currentTarget.style.backgroundColor = LK.primaryDeep; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}>
              <Plus size={16} />
              {submittingService ? '注册中...' : '注册并关联复现模块'}
            </button>
            <button
              type="button"
              onClick={() => setServiceForm(defaultServiceForm)}
              className="px-5 py-3 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
            >
              清空
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-6">
        <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>阶段覆盖概览</h3>
            <p className="mt-1 text-xs" style={{ color: LK.muted }}>先看模块覆盖和质量，再进入下方链路矩阵与模块清单。</p>
          </div>
          <div className="p-6 grid grid-cols-1 xl:grid-cols-4 gap-4">
            {[
              { label: '复现模块总数', value: reproOverview.total, bg: LK.surfaceRaised, color: LK.body },
              { label: '验证阶段模块', value: reproOverview.validation, bg:`${LK.success}14`, color: LK.success },
              { label: '结束阶段模块', value: reproOverview.finished, bg:`${LK.info}14`, color: LK.info },
              { label: '质量待检查', value: reproOverview.risky, bg:`${LK.warning}14`, color: LK.warning },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border px-4 py-4" style={{ backgroundColor: item.bg, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70" style={{ color: LK.muted }}>{item.label}</div>
                <div className="mt-2 text-3xl font-semibold" style={{ color: LK.ink }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="px-6 pb-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
            {stageMatrix.map((item) => (
              <div key={`coverage-${item.stage}`} className="rounded-xl border px-4 py-4" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>{labelOf(item.stage, STAGE_LABELS)}</div>
                <div className="mt-2 text-3xl font-semibold" style={{ color: LK.ink }}>{item.services.length}</div>
                <div className="mt-2 text-xs" style={{ color: LK.body }}>
                  {item.services.length === 0 ? '当前阶段尚未配置模块' :`当前阶段已配置 ${item.services.length} 个模块`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>链路覆盖矩阵</h3>
            <p className="mt-1 text-xs" style={{ color: LK.muted }}>按关键动作确认验证链路和终态回传链路是否完整，而不只是看有没有服务。</p>
          </div>
          <div className="px-6 pt-6">
            <div className="rounded-xl border p-4" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>阶段动作流</div>
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-4 gap-3">
                {flowStatus.map((item) => (
                  <div key={item.key} className="rounded-lg border px-3 py-3" style={{ borderColor: item.count > 0 ? LK.success : LK.warning, backgroundColor: item.count > 0 ? LK.surface :`${LK.warning}14` }}>
                    <div className="text-xs font-semibold" style={{ color: LK.ink }}>{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold" style={{ color: LK.ink }}>{item.count}</div>
                    <div className="mt-1 text-[11px]" style={{ color: LK.body }}>{item.count > 0 ? '已接入模块' : '当前缺失'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {coverageMatrix.map((group) => (
              <div key={`coverage-group-${group.stage}`} className="rounded-xl border p-4" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold" style={{ color: LK.ink }}>{labelOf(group.stage, STAGE_LABELS)}</div>
                  <div className="text-[11px]" style={{ color: LK.muted }}>{group.rows.filter((row) => row.matchedServices.length > 0).length} / {group.rows.length} 已覆盖</div>
                </div>
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {group.rows.map((row) => (
                    <div key={`${group.stage}-${row.key}`} className="rounded-lg border px-3 py-3" style={{ borderColor: row.matchedServices.length > 0 ? LK.success : LK.warning, backgroundColor: row.matchedServices.length > 0 ?`${LK.success}14` :`${LK.warning}14` }}>
                      <div className="text-xs font-semibold" style={{ color: LK.ink }}>{row.label}</div>
                      <div className="mt-1 text-[11px]" style={{ color: LK.body }}>
                        {row.matchedServices.length > 0 ?`已配置 ${row.matchedServices.length} 个服务` : '当前缺失'}
                      </div>
                      {row.matchedServices.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.matchedServices.slice(0, 2).map((service) => (
                            <span key={`${row.key}-${service.service_id}`} className="px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: `1px solid ${LK.border}` }}>
                              {service.service_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>配置建议</h3>
            <p className="mt-1 text-xs" style={{ color: LK.muted }}>根据当前覆盖情况给出下一步补齐建议。</p>
          </div>
          <div className="p-6 space-y-3">
            {missingStages.length === 0 ? (
              <div className="rounded-xl border px-4 py-4 text-sm" style={{ borderColor: LK.success, backgroundColor: `${LK.success}14`, color: LK.success }}>
                验证与结束两个关键阶段都已经存在至少一个复现或回传模块，可以继续优化模块质量与回调策略。
              </div>
            ) : (
              missingStages.map((stage) => (
                <div key={`advice-${stage}`} className="rounded-xl border px-4 py-4 text-sm" style={{ borderColor: LK.warning, backgroundColor: `${LK.warning}14`, color: LK.warning }}>
                  <span className="font-semibold">{labelOf(stage, STAGE_LABELS)}</span>
                  {stage === 'validation' && ' 阶段还缺验证或复现模块，建议优先注册 HTTP 验证器或自动确认模块。'}
                  {stage === 'finished' && ' 阶段还缺上报回传或复核模块，建议注册结果同步或结论回传模块。'}
                </div>
              ))
            )}
            {filteredReproServices.filter((item) => !item.healthcheck_url).length > 0 && (
              <div className="rounded-xl border px-4 py-4 text-sm" style={{ borderColor: LK.info, backgroundColor: `${LK.info}14`, color: LK.info }}>
                当前有 {filteredReproServices.filter((item) => !item.healthcheck_url).length} 个复现模块没有健康检查地址，建议补齐，避免覆盖存在但不可观测。
              </div>
            )}
          </div>
        </div>

        <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>阶段关联视图</h3>
            <p className="mt-1 text-xs" style={{ color: LK.muted }}>展示复现与上报模块在漏洞生命周期中的绑定位置。</p>
          </div>
          <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
            {stageMatrix.map((item) => (
              <div key={item.stage} className="rounded-xl border px-4 py-4" style={{ backgroundColor: `${LK.surface}0A`, borderColor: LK.border }}>
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.muted }}>{labelOf(item.stage, STAGE_LABELS)}</div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: LK.ink }}>{item.services.length}</div>
                <div className="mt-3 space-y-2">
                  {item.services.length === 0 ? (
                    <div className="text-xs" style={{ color: LK.muted }}>暂无绑定服务</div>
                  ) : (
                    item.services.map((service) => (
                      <div key={`${item.stage}-${service.service_id}`} className="rounded-lg border px-3 py-2" style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
                        <div className="text-xs font-semibold" style={{ color: LK.ink }}>{service.service_name}</div>
                        <div className="mt-1 text-[11px]" style={{ color: LK.muted }}>{service.service_id}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass} style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>已注册复现能力</h3>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <input
              value={serviceSearch}
              onChange={(event) => setServiceSearch(event.target.value)}
              placeholder="搜索复现服务、动作类型、能力标识或关联说明"
              className="px-4 py-3 rounded-lg outline-none"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
              onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
            />
            <div className="flex gap-2">
              {['all', 'validation', 'finished'].map((item) => (
                <button
                  key={item}
                  onClick={() => setStageFilter(item as 'all' | 'validation' | 'finished')}
                  className="px-4 py-3 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: stageFilter === item ? LK.primary : LK.surfaceRaised,
                    color: stageFilter === item ? '#ffffff' : LK.body
                  }}
                  onMouseEnter={(e) => { if (stageFilter !== item) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                  onMouseLeave={(e) => { if (stageFilter !== item) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; } }}
                >
                  {item === 'all' ? '全部阶段' : labelOf(item, STAGE_LABELS)}
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 flex flex-wrap gap-2" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            {['all', ...REPRO_ACTION_TYPES].map((item) => (
              <button
                key={`repro-action-${item}`}
                onClick={() => setActionFilter(item as 'all' | (typeof REPRO_ACTION_TYPES)[number])}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: actionFilter === item ? LK.primary : LK.surfaceRaised,
                  color: actionFilter === item ? '#ffffff' : LK.body
                }}
                onMouseEnter={(e) => { if (actionFilter !== item) { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; } }}
                onMouseLeave={(e) => { if (actionFilter !== item) { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; } }}
              >
                {item === 'all' ? '全部动作' : labelOf(item, ACTION_TYPE_LABELS)}
              </button>
            ))}
            {(serviceSearch || stageFilter !== 'all' || actionFilter !== 'all') && (
              <button
                onClick={() => {
                  setServiceSearch('');
                  setStageFilter('all');
                  setActionFilter('all');
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.surface, color: LK.body, border: `1px solid ${LK.border}` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.body; }}
              >
                清空筛选
              </button>
            )}
          </div>
          <div className="max-h-[34rem] overflow-y-auto" style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
            {filteredReproServices.length === 0 ? (
              <div className="px-6 py-8 text-sm" style={{ color: LK.muted }}>当前还没有注册任何复现或证明模块</div>
            ) : (
              filteredReproServices.map((item) => {
                const stats = reproActionStats.get(item.service_id) || { total: 0, queued: 0, running: 0, failed: 0 };
                return (
                <div key={item.service_id} className="px-6 py-4 space-y-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold" style={{ color: LK.ink }}>{item.service_name}</div>
                        {!item.healthcheck_url && <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>缺健康检查</span>}
                        {stats.failed > 0 && <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>有失败动作</span>}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: LK.body }}>{item.endpoint}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: LK.muted }}>
                        <span>累计动作 {stats.total}</span>
                        <span>排队 {stats.queued}</span>
                        <span>运行 {stats.running}</span>
                        <span>失败 {stats.failed}</span>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>{labelOf(item.meta?.module_role || item.service_type, { ...MODULE_ROLE_LABELS, ...SERVICE_TYPE_LABELS })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(item.capabilities || []).map((cap: any) => (
                      <span key={`${item.service_id}-${cap.capability_code}`} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>
                        {labelOf(cap.meta?.bind_stage || item.meta?.bind_stage || 'validation', STAGE_LABELS)} · {labelOf(cap.action_type, ACTION_TYPE_LABELS)}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-lg px-3 py-2 font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft }}>优先级 {Math.min(...(item.capabilities || []).map((cap: any) => cap.priority ?? 100))}</span>
                    <span className="rounded-lg px-3 py-2 font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft }}>超时 {Math.max(...(item.capabilities || []).map((cap: any) => cap.timeout_seconds ?? 300))}s</span>
                    <span className="rounded-lg px-3 py-2 font-semibold" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft }}>并发 {Math.max(...(item.capabilities || []).map((cap: any) => cap.concurrency_limit ?? 1))}</span>
                  </div>
                  {item.meta?.association_note && (
                    <div className="text-xs" style={{ color: LK.body }}>{item.meta.association_note}</div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editService(item)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
                    >
                      回填编辑
                    </button>
                  </div>
                </div>
              )})
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
