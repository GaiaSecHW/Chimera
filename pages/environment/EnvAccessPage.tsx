import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Copy, Loader2, Network, Save, Server, Terminal } from 'lucide-react';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';

const WEB_E2E_API_BASE = `${API_BASE}/api/app/web-e2e`;
type DeployTab = 'normal-node' | 'k8s-cluster';
type ProjectAccessInfo = {
  description: string;
  updated_at?: string;
};

const getPublicWebE2EBase = (): string => `${window.location.origin}${WEB_E2E_API_BASE}`;

const buildAccessCommands = (projectId: string) => {
  const baseUrl = getPublicWebE2EBase();
  const installUrl = `${baseUrl}/agents/install?project_id=${encodeURIComponent(projectId)}&type=normal&gaiasec_dir=/gaiasec`;
  return {
    normalScript: `curl -ks -o start.sh '${installUrl}' && bash start.sh deploy`,
    proxyScript: `curl -ks -o start.sh '${baseUrl}/agents/install?project_id=${encodeURIComponent(projectId)}&type=proxy&gaiasec_dir=/gaiasec' && bash start.sh deploy`,
    k8sDaemonSetYaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: gaiasec
  namespace: default
spec:
  selector:
    matchLabels:
      name: gaiasec
  template:
    metadata:
      labels:
        name: gaiasec
    spec:
      hostIPC: true
      hostPID: true
      hostNetwork: true
      containers:
      - name: gaiasec-pod
        resources:
          limits:
            cpu:"1"
            memory:"500Mi"
        command:
        - /bin/sh
        - -c
        - chroot /hostfs /bin/bash -c"cd / && curl -ks -o start.sh '${installUrl}' && bash start.sh && tail -f /dev/null"
        image: docker.io/alpine:3.13
        securityContext:
          privileged: true
          runAsUser: 0
          runAsGroup: 0
        volumeMounts:
        - mountPath: /hostfs
          name: hostfs
      volumes:
      - name: hostfs
        hostPath:
          path: /`,
  };
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below handles browsers that expose clipboard but reject writes.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

const requestWebE2E = async (url: string, init?: RequestInit): Promise<any> => {
  const raw = await handleResponse(await fetch(url, { ...init, headers: { ...getHeaders(), ...(init?.headers || {}) } }));
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    if (raw.success === false) throw new Error(raw.message || 'WEB 端到端 API 请求失败');
    return raw.data;
  }
  return raw;
};

const normalizeProjectAccessInfo = (raw: any): ProjectAccessInfo => {
  const source = raw?.project || raw;
  return {
    description: String(source?.description || ''),
    updated_at: source?.updated_at || source?.updatedAt,
  };
};

const fetchProjectAccessInfo = async (projectId: string): Promise<ProjectAccessInfo> => {
  const raw = await requestWebE2E(`${WEB_E2E_API_BASE}/projects/${encodeURIComponent(projectId)}`);
  return normalizeProjectAccessInfo(raw || {});
};

const saveProjectAccessInfo = async (projectId: string, payload: ProjectAccessInfo): Promise<ProjectAccessInfo> => {
  const raw = await requestWebE2E(`${WEB_E2E_API_BASE}/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    body: JSON.stringify({ description: payload.description }),
  });
  return normalizeProjectAccessInfo(raw || payload);
};

const formatTime = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
};

const Section: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-xl border border-theme-border bg-theme-surface p-6 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold text-theme-text-primary">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-theme-text-muted">{description}</p>
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

const ProjectAccessInfoSection: React.FC<{
  value: ProjectAccessInfo;
  loading: boolean;
  saving: boolean;
  error: string;
  onChange: (value: ProjectAccessInfo) => void;
  onSave: () => void;
}> = ({ value, loading, saving, error, onChange, onSave }) => (
  <Section title="WEB 访问配置" description="填写被测 Web URL、账号密码、登录步骤和测试范围。分析流程会直接使用这里的项目级配置。">
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          保存配置
        </button>
      </div>
      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">{error}</div> : null}
      <label className="block">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">Description</div>
        <textarea
          value={value.description}
          disabled={loading}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          placeholder="填写 Web 访问 URL、账号密码、登录步骤、验证码说明、测试范围、特殊入口或其他分析需要注意的信息。"
          className="form-textarea mt-2 min-h-44 w-full resize-y leading-6 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </label>
      <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
        {loading ? '正在加载配置...' : value.updated_at ? `最近更新：${formatTime(value.updated_at)}` : '尚未保存 WEB 访问配置'}
      </div>
    </div>
  </Section>
);

const CommandBlock: React.FC<{
  title: string;
  description: string;
  command: string;
  language: 'shell' | 'yaml' | 'plaintext';
  onCopy: (value: string) => void;
  tall?: boolean;
  compact?: boolean;
}> = ({ title, description, command, language, onCopy, tall = false, compact = false }) => (
  <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-theme-text-primary">{title}</div>
        <div className="mt-1 text-sm leading-6 text-theme-text-muted">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onCopy(command)}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-theme-surface px-3 py-2 text-xs font-medium text-white transition hover:bg-theme-elevated"
      >
        <Copy size={14} />
        复制
      </button>
    </div>
    <div className={`mt-3 overflow-hidden rounded-lg border border-theme-border bg-theme-bg-app ${tall ? 'h-[520px]' : compact ? 'h-[104px]' : 'h-[260px]'}`}>
      <MonacoEditor
        height="100%"
        language={language}
        value={command}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          renderWhitespace: 'selection',
          contextmenu: false,
          folding: false,
        }}
      />
    </div>
  </div>
);

export const EnvAccessPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [activeTab, setActiveTab] = useState<DeployTab>('normal-node');
  const [accessInfo, setAccessInfo] = useState<ProjectAccessInfo>({ description: '' });
  const [accessInfoLoading, setAccessInfoLoading] = useState(false);
  const [accessInfoSaving, setAccessInfoSaving] = useState(false);
  const [accessInfoError, setAccessInfoError] = useState('');
  const commands = useMemo(() => buildAccessCommands(projectId), [projectId]);

  const handleCopy = async (value: string) => {
    const ok = await copyText(value);
    notify(ok ? '部署命令已复制' : '复制失败，请手动复制命令', ok ? 'success' : 'error');
  };

  const loadProjectAccessInfo = useCallback(async () => {
    if (!projectId) {
      setAccessInfo({ description: '' });
      setAccessInfoError('');
      return;
    }
    setAccessInfoLoading(true);
    setAccessInfoError('');
    try {
      const next = await fetchProjectAccessInfo(projectId);
      setAccessInfo(next);
    } catch (err: any) {
      const message = err?.message || '加载 WEB 访问配置失败';
      setAccessInfoError(message);
      notify(message, 'error');
    } finally {
      setAccessInfoLoading(false);
    }
  }, [notify, projectId]);

  useEffect(() => {
    void loadProjectAccessInfo();
  }, [loadProjectAccessInfo]);

  const handleSaveProjectAccessInfo = useCallback(async () => {
    if (!projectId) return;
    setAccessInfoSaving(true);
    setAccessInfoError('');
    try {
      const saved = await saveProjectAccessInfo(projectId, accessInfo);
      setAccessInfo(saved);
      notify('WEB 访问配置已保存', 'success');
    } catch (err: any) {
      const message = err?.message || '保存 WEB 访问配置失败';
      setAccessInfoError(message);
      notify(message, 'error');
    } finally {
      setAccessInfoSaving(false);
    }
  }, [accessInfo, notify, projectId]);

  return (
    <div className="min-h-full bg-theme-bg-app px-8 py-8">
      {feedbackNodes}
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="环境接入"
          description="面向测试环境的接入入口。选择部署方式后，在目标节点或集群执行命令，上线后的 Agent 会进入环境管理页面。"
          actions={<div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary shadow-sm"><span className="font-semibold text-theme-text-primary">项目 ID：</span><span className="font-mono">{projectId || '-'}</span></div>}
        />

        <ProjectAccessInfoSection
          value={accessInfo}
          loading={accessInfoLoading}
          saving={accessInfoSaving}
          error={accessInfoError}
          onChange={setAccessInfo}
          onSave={handleSaveProjectAccessInfo}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Server className="text-blue-400" size={22} />
            <div className="mt-3 text-base font-semibold text-theme-text-primary">普通节点</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合单机、虚机和物理机，直接部署 Agent 到目标环境。</p>
          </div>
          <div className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Network className="text-cyan-400" size={22} />
            <div className="mt-3 text-base font-semibold text-theme-text-primary">代理接入</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合网络受限环境，通过代理模式完成 Agent 接入。</p>
          </div>
          <div className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Terminal className="text-emerald-400" size={22} />
            <div className="mt-3 text-base font-semibold text-theme-text-primary">K8s 集群</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合集群节点批量覆盖，通过 DaemonSet 统一上线。</p>
          </div>
        </div>

        <Section title="部署命令" description="命令使用当前项目 ID 和当前平台访问地址生成，请保持原样执行。">
          <div className="mb-5 inline-flex rounded-xl bg-theme-elevated p-1">
            <button
              type="button"
              onClick={() => setActiveTab('normal-node')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === 'normal-node' ? 'bg-theme-surface text-theme-text-primary shadow-sm' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
            >
              普通节点
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('k8s-cluster')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === 'k8s-cluster' ? 'bg-theme-surface text-theme-text-primary shadow-sm' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
            >
              K8s 部署
            </button>
          </div>

          {activeTab === 'normal-node' ? (
            <div className="space-y-4">
              <CommandBlock title="普通模式部署" description="直接连接到服务器，适用于大多数场景。" command={commands.normalScript} language="shell" onCopy={handleCopy} compact />
              <CommandBlock title="代理模式部署" description="通过代理服务器连接，适用于网络受限环境。" command={commands.proxyScript} language="shell" onCopy={handleCopy} compact />
            </div>
          ) : (
            <div className="space-y-4">
              <CommandBlock title="K8s DaemonSet 部署" description="通过 DaemonSet 在 K8s 集群的所有节点上部署测试节点。" command={commands.k8sDaemonSetYaml} language="yaml" onCopy={handleCopy} tall />
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-400">
                使用命令：kubectl apply -f gaiasec-daemonset.yaml 部署到 K8s 集群
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};