import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react';

import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { toolRegistryApi } from '../../clients/toolRegistry';
import type {
  ProbeTestResponse,
  ToolCreate,
  ToolKind,
  ToolListItem,
  ToolStatus,
} from '../../clients/toolRegistry';
import {
  Button,
  FormField,
  Input,
  PageHeader,
  PageSection,
  SegmentedControl,
  Select,
} from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';

interface AgentAppOption {
  id: string;
  name: string;
  engine: string;
}

const TOOL_ID_PATTERN = /^[A-Z]{1,10}$/;

const DEFAULT_FORM: FormState = {
  id: '',
  name: '',
  description: '',
  kind: 'microservice',
  view_id: '',
  icon: '',
  menu_group: '开发者工具',
  current_version: '',
  // microservice
  namespace: '',
  deployment: '',
  api_prefix: '',
  health_path: '/health',
  service_port: '8080',
  catalogJson: '',
  // agent
  agent_app_id: '',
};

interface FormState {
  id: string;
  name: string;
  description: string;
  kind: ToolKind;
  // shared registration fields
  view_id: string;
  icon: string;
  menu_group: string;
  current_version: string;
  // microservice-only
  namespace: string;
  deployment: string;
  api_prefix: string;
  health_path: string;
  service_port: string;
  catalogJson: string;
  // agent-only
  agent_app_id: string;
}

type ErrorMap = Partial<Record<keyof FormState | 'catalog' | 'root', string>>;

const isInt = (value: string): boolean => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));

const validate = (form: FormState): ErrorMap => {
  const errors: ErrorMap = {};
  if (!form.id.trim()) errors.id = '请输入工具 ID';
  else if (!TOOL_ID_PATTERN.test(form.id.trim())) errors.id = 'ID 须为 1-10 位大写字母（如 BINSEC）';
  if (!form.name.trim()) errors.name = '请输入工具名称';
  if (!form.view_id.trim()) errors.view_id = '请输入 view_id（菜单/路由标识）';
  if (form.kind === 'microservice') {
    if (!form.namespace.trim()) errors.namespace = '请输入 K8s namespace';
    if (!form.deployment.trim()) errors.deployment = '请输入 deployment 名称';
    if (!form.api_prefix.trim()) errors.api_prefix = '请输入 api_prefix';
    if (!form.health_path.trim()) errors.health_path = '请输入 health_path';
    if (!form.service_port.trim()) errors.service_port = '请输入 service_port';
    else if (!isInt(form.service_port)) errors.service_port = 'service_port 须为整数';
    if (form.catalogJson.trim()) {
      try { JSON.parse(form.catalogJson); } catch { errors.catalog = 'catalog 不是合法 JSON'; }
    }
  } else {
    if (!form.agent_app_id) errors.agent_app_id = '请选择关联的 Agent App';
  }
  return errors;
};

const buildPayload = (form: FormState): ToolCreate => {
  const base = {
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    kind: form.kind,
  };
  if (form.kind === 'microservice') {
    let catalog: Record<string, unknown> | undefined;
    if (form.catalogJson.trim()) catalog = JSON.parse(form.catalogJson) as Record<string, unknown>;
    return {
      ...base,
      microservice: {
        namespace: form.namespace.trim(),
        deployment: form.deployment.trim(),
        api_prefix: form.api_prefix.trim(),
        health_path: form.health_path.trim(),
        service_port: Number(form.service_port),
        view_id: form.view_id.trim(),
        icon: form.icon.trim() || undefined,
        menu_group: form.menu_group.trim() || undefined,
        current_version: form.current_version.trim() || undefined,
        catalog,
      },
    };
  }
  return {
    ...base,
    agent: {
      agent_app_id: form.agent_app_id,
      view_id: form.view_id.trim(),
      icon: form.icon.trim() || undefined,
      menu_group: form.menu_group.trim() || undefined,
      current_version: form.current_version.trim() || undefined,
    },
  };
};

const loadAgentApps = async (): Promise<AgentAppOption[]> => {
  const response = await fetch(agentManageApiPath('/agent-apps'), { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  return apps.map((app: { id: string; name: string; engine: string }) => ({ id: app.id, name: app.name, engine: app.engine }));
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  draft: '草稿', pending: '待审核', online: '已上线', offline: '已下架',
};
const STATUS_TONE: Record<ToolStatus, string> = {
  draft: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  offline: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const HEALTH_TONE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  unhealthy: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  unknown: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
};

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className ?? ''}`}>
    {children}
  </span>
);

const formatTime = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const inputGridClass = 'grid grid-cols-1 gap-4 md:grid-cols-2';

export const ToolRegistrationPage: React.FC = () => {
  const { feedbackNodes, notify } = useUiFeedback();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeTestResponse | null>(null);
  const [probeError, setProbeError] = useState('');
  const [agentApps, setAgentApps] = useState<AgentAppOption[]>([]);
  const [agentAppsLoading, setAgentAppsLoading] = useState(false);
  const [myTools, setMyTools] = useState<ToolListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const refreshMyTools = async () => {
    setListLoading(true);
    try {
      const result = await toolRegistryApi.listMine({ page: 1, page_size: 100 });
      setMyTools(Array.isArray(result?.items) ? result.items : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : '我的工具列表加载失败', 'error');
      setMyTools([]);
    } finally {
      setListLoading(false);
    }
  };

  const refreshAgentApps = async () => {
    setAgentAppsLoading(true);
    try {
      const apps = await loadAgentApps();
      setAgentApps(apps);
    } catch {
      setAgentApps([]);
    } finally {
      setAgentAppsLoading(false);
    }
  };

  useEffect(() => {
    void refreshMyTools();
    void refreshAgentApps();
  }, []);

  const handleKindChange = (kind: string) => {
    setForm((prev) => ({ ...prev, kind: kind as ToolKind }));
    setErrors({});
    setProbeResult(null);
    setProbeError('');
  };

  const handleProbe = async () => {
    if (form.kind !== 'microservice') return;
    const probeErrors: ErrorMap = {};
    if (!form.namespace.trim()) probeErrors.namespace = '请输入 namespace';
    if (!form.deployment.trim()) probeErrors.deployment = '请输入 deployment';
    if (!form.health_path.trim()) probeErrors.health_path = '请输入 health_path';
    if (!form.service_port.trim() || !isInt(form.service_port)) probeErrors.service_port = 'service_port 须为整数';
    if (Object.keys(probeErrors).length > 0) {
      setErrors(probeErrors);
      return;
    }
    setProbeLoading(true);
    setProbeResult(null);
    setProbeError('');
    try {
      const result = await toolRegistryApi.probeTest({
        namespace: form.namespace.trim(),
        deployment: form.deployment.trim(),
        service_port: Number(form.service_port),
        health_path: form.health_path.trim(),
      });
      setProbeResult(result);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : '探活请求失败');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleSubmit = async () => {
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = buildPayload(form);
      const created = await toolRegistryApi.create(payload);
      notify(`工具 ${created.id} 已提交注册，状态：待审核（pending）`, 'success');
      setForm(DEFAULT_FORM);
      setProbeResult(null);
      setProbeError('');
      await refreshMyTools();
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具注册失败';
      notify(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setProbeResult(null);
    setProbeError('');
  };

  const kindOptions = useMemo(() => [
    { value: 'microservice', label: '微服务', icon: <Server size={14} /> },
    { value: 'agent', label: 'Agent', icon: <Bot size={14} /> },
  ], []);

  const agentAppOptions = useMemo(
    () => agentApps.map((app) => ({ label: `${app.name}（${app.engine}）`, value: app.id })),
    [agentApps],
  );

  return (
    <div className="space-y-6 p-8 pb-10">
      {feedbackNodes}
      <PageHeader
        title="工具注册"
        description="向工具注册中心登记新工具（微服务或 Agent）。注册后状态为 pending，待超级管理员审核通过后上线进菜单 / 过闸门。菜单排序由后台管理员调整，注册时无需填写。"
      />

      <PageSection
        title="注册新工具"
        description="带 * 为必填。工具 ID 须为 1-10 位大写字母；微服务需填 K8s 连通信息，Agent 需选择已上传的 Agent App。"
      >
        <div className="space-y-5">
          <FormField label="工具类型" required>
            <SegmentedControl
              aria-label="工具类型"
              value={form.kind}
              onChange={handleKindChange}
              options={kindOptions}
            />
          </FormField>

          <div className={inputGridClass}>
            <FormField label="工具 ID" required error={errors.id} hint="1-10 位大写字母">
              <Input
                value={form.id}
                onChange={(e) => setField('id', e.target.value.toUpperCase())}
                placeholder="如 BINSEC"
                invalid={!!errors.id}
                maxLength={10}
              />
            </FormField>
            <FormField label="工具名称" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="如 盖亚-二进制固件"
                invalid={!!errors.name}
              />
            </FormField>
            <FormField label="view_id" required error={errors.view_id} hint="菜单/路由标识">
              <Input
                value={form.view_id}
                onChange={(e) => setField('view_id', e.target.value)}
                placeholder="如 BinarySecurity"
                invalid={!!errors.view_id}
              />
            </FormField>
            <FormField label="icon" hint="图标标识（可选）">
              <Input
                value={form.icon}
                onChange={(e) => setField('icon', e.target.value)}
                placeholder="如 shield"
              />
            </FormField>
            <FormField label="menu_group" hint="菜单分组">
              <Input
                value={form.menu_group}
                onChange={(e) => setField('menu_group', e.target.value)}
                placeholder="如 开发者工具"
              />
            </FormField>
            <FormField label="current_version" hint="当前版本（可选）">
              <Input
                value={form.current_version}
                onChange={(e) => setField('current_version', e.target.value)}
                placeholder="如 v1 或 commit-sha"
              />
            </FormField>
          </div>

          <FormField label="工具说明">
            <textarea
              className="form-input w-full resize-y"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="说明工具的用途、能力和适用场景"
            />
          </FormField>

          {form.kind === 'microservice' ? (
            <div className="space-y-5 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                <Server size={15} /> 微服务连通信息
              </div>
              <div className={inputGridClass}>
                <FormField label="deployment" required error={errors.deployment}>
                  <Input
                    value={form.deployment}
                    onChange={(e) => setField('deployment', e.target.value)}
                    placeholder="如 binary-security"
                    invalid={!!errors.deployment}
                  />
                </FormField>
                <FormField label="namespace" required error={errors.namespace}>
                  <Input
                    value={form.namespace}
                    onChange={(e) => setField('namespace', e.target.value)}
                    placeholder="如 secflow"
                    invalid={!!errors.namespace}
                  />
                </FormField>
                <FormField label="service_port" required error={errors.service_port}>
                  <Input
                    value={form.service_port}
                    onChange={(e) => setField('service_port', e.target.value)}
                    placeholder="如 8080"
                    inputMode="numeric"
                    invalid={!!errors.service_port}
                  />
                </FormField>
                <FormField label="api_prefix" required error={errors.api_prefix}>
                  <Input
                    value={form.api_prefix}
                    onChange={(e) => setField('api_prefix', e.target.value)}
                    placeholder="如 /api/binary-security"
                    invalid={!!errors.api_prefix}
                  />
                </FormField>
                <FormField label="health_path" required error={errors.health_path}>
                  <Input
                    value={form.health_path}
                    onChange={(e) => setField('health_path', e.target.value)}
                    placeholder="如 /health"
                    invalid={!!errors.health_path}
                  />
                </FormField>
              </div>

              <FormField label="catalog" error={errors.catalog} hint="JSON 对象，可选">
                <textarea
                  className="form-input w-full resize-y font-mono text-xs"
                  rows={4}
                  value={form.catalogJson}
                  onChange={(e) => setField('catalogJson', e.target.value)}
                  placeholder='{"summary":"...","tags":["..."],"usageSections":[]}'
                />
              </FormField>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={handleProbe} disabled={probeLoading} icon={<Activity size={14} />}>
                  {probeLoading ? '探活中…' : '探活连通性测试'}
                </Button>
                <span className="text-xs text-theme-text-muted">
                  注册前先测探活 URL：<code className="font-mono">http://{'{deployment}.{namespace}.svc.cluster.local:{port}{path}'}</code>
                </span>
              </div>

              {probeError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <XCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{probeError}</span>
                </div>
              ) : null}
              {probeResult ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-theme-border bg-theme-surface p-3 text-xs">
                  {probeResult.reachable ? (
                    <Badge className={HEALTH_TONE.healthy}><CheckCircle2 size={11} /> 可达</Badge>
                  ) : (
                    <Badge className={HEALTH_TONE.unhealthy}><XCircle size={11} /> 不可达</Badge>
                  )}
                  {probeResult.status_code ? <span className="text-theme-text-secondary">HTTP {probeResult.status_code}</span> : null}
                  {typeof probeResult.elapsed_ms === 'number' ? <span className="text-theme-text-secondary">{probeResult.elapsed_ms} ms</span> : null}
                  {probeResult.url ? <span className="truncate font-mono text-theme-text-muted">{probeResult.url}</span> : null}
                  {probeResult.reason ? <span className="text-theme-text-secondary">{probeResult.reason}</span> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-theme-border bg-theme-elevated/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                <Bot size={15} /> Agent 关联
              </div>
              <FormField label="关联 Agent App" required error={errors.agent_app_id} hint="从 secflow-platform-agent 已上传的 Agent App 中选择">
                <Select
                  options={agentAppOptions}
                  placeholder={agentAppsLoading ? '加载中…' : agentApps.length === 0 ? '暂无可选 Agent App' : '请选择 Agent App'}
                  value={form.agent_app_id}
                  onChange={(e) => setField('agent_app_id', e.target.value)}
                  invalid={!!errors.agent_app_id}
                />
              </FormField>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-theme-border pt-4">
            <Button variant="secondary" onClick={handleReset} disabled={submitting}>重置</Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<Plus size={14} />}>
              提交注册
            </Button>
          </div>
        </div>
      </PageSection>

      <PageSection
        title="我的工具"
        description="管理员可见全部工具；普通用户仅见自己注册的。注册成功后此处显示状态。"
        actions={
          <Button variant="secondary" onClick={refreshMyTools} disabled={listLoading} icon={<RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />}>
            刷新
          </Button>
        }
      >
        {listLoading && myTools.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-theme-border bg-theme-surface px-4 py-10 text-sm text-theme-text-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载…
          </div>
        ) : myTools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center">
            <Database className="mx-auto text-theme-text-muted" size={28} />
            <h3 className="mt-2 text-sm font-semibold text-theme-text-primary">暂无已注册工具</h3>
            <p className="mt-1 text-xs text-theme-text-muted">提交上方注册表单后，工具将出现在此列表。</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-theme-elevated text-[11px] uppercase tracking-wider text-theme-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">ID</th>
                  <th className="px-4 py-2.5 font-semibold">名称</th>
                  <th className="px-4 py-2.5 font-semibold">类型</th>
                  <th className="px-4 py-2.5 font-semibold">状态</th>
                  <th className="px-4 py-2.5 font-semibold">健康</th>
                  <th className="px-4 py-2.5 font-semibold">版本</th>
                  <th className="px-4 py-2.5 font-semibold">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border">
                {myTools.map((tool) => (
                  <tr key={tool.id} className="bg-theme-surface hover:bg-theme-elevated/50">
                    <td className="px-4 py-2.5 font-mono text-theme-text-primary">{tool.id}</td>
                    <td className="px-4 py-2.5 text-theme-text-primary">{tool.name}{tool.is_builtin ? <span className="ml-1 text-[10px] text-theme-text-muted">内置</span> : null}</td>
                    <td className="px-4 py-2.5 text-theme-text-secondary">{tool.kind === 'microservice' ? '微服务' : 'Agent'}</td>
                    <td className="px-4 py-2.5"><Badge className={STATUS_TONE[tool.status]}>{STATUS_LABEL[tool.status]}</Badge></td>
                    <td className="px-4 py-2.5"><Badge className={HEALTH_TONE[tool.health_status ?? 'unknown']}>{tool.health_status ?? 'unknown'}</Badge></td>
                    <td className="px-4 py-2.5 text-theme-text-secondary">{tool.current_version || '-'}</td>
                    <td className="px-4 py-2.5 text-theme-text-muted">{formatTime(tool.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </div>
  );
};
