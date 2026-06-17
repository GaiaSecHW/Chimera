import React, { useMemo, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Copy, Network, Server, Terminal } from 'lucide-react';
import { API_BASE } from '../../clients/base';
import { useUiFeedback } from '../../components/UiFeedback';

const WEB_E2E_API_BASE = `${API_BASE}/api/app/web-e2e`;
type DeployTab = 'normal-node' | 'k8s-cluster';

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

const Section: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm">
    <div>
      <h2 className="text-lg font-black text-theme-text-primary">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-theme-text-muted">{description}</p>
    </div>
    <div className="mt-5">{children}</div>
  </section>
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
  <div className="rounded-xl border border-theme-border bg-theme-bg-app p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-sm font-bold text-theme-text-primary">{title}</div>
        <div className="mt-1 text-sm leading-6 text-theme-text-muted">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onCopy(command)}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-theme-surface px-3 py-2 text-xs font-bold text-white transition hover:bg-theme-elevated"
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
  const commands = useMemo(() => buildAccessCommands(projectId), [projectId]);

  const handleCopy = async (value: string) => {
    const ok = await copyText(value);
    notify(ok ? '部署命令已复制' : '复制失败，请手动复制命令', ok ? 'success' : 'error');
  };

  return (
    <div className="min-h-full bg-theme-bg-app px-8 py-8">
      {feedbackNodes}
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-400">
              <Terminal size={14} />
              Environment Access
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-theme-text-primary">环境接入</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-theme-text-secondary">
              面向测试环境的接入入口。选择部署方式后，在目标节点或集群执行命令，上线后的 Agent 会进入环境管理页面。
            </p>
          </div>
          <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary shadow-sm">
            <span className="font-bold text-theme-text-primary">项目 ID：</span>
            <span className="font-mono">{projectId || '-'}</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Server className="text-blue-400" size={22} />
            <div className="mt-3 text-base font-black text-theme-text-primary">普通节点</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合单机、虚机和物理机，直接部署 Agent 到目标环境。</p>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Network className="text-cyan-400" size={22} />
            <div className="mt-3 text-base font-black text-theme-text-primary">代理接入</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合网络受限环境，通过代理模式完成 Agent 接入。</p>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface p-5 shadow-sm">
            <Terminal className="text-emerald-400" size={22} />
            <div className="mt-3 text-base font-black text-theme-text-primary">K8s 集群</div>
            <p className="mt-2 text-sm leading-6 text-theme-text-muted">适合集群节点批量覆盖，通过 DaemonSet 统一上线。</p>
          </div>
        </div>

        <Section title="部署命令" description="命令使用当前项目 ID 和当前平台访问地址生成，请保持原样执行。">
          <div className="mb-5 inline-flex rounded-xl bg-theme-elevated p-1">
            <button
              type="button"
              onClick={() => setActiveTab('normal-node')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'normal-node' ? 'bg-theme-surface text-theme-text-primary shadow-sm' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
            >
              普通节点
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('k8s-cluster')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'k8s-cluster' ? 'bg-theme-surface text-theme-text-primary shadow-sm' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
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
