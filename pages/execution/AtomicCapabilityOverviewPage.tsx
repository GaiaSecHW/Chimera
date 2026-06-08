import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  Network,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import { getAuthHeaders } from '../../clients/base';
import type { ViewType } from '../../types/types';
import {
  atomicCapabilityCatalog,
  type AtomicCapabilityApiGroup,
  type AtomicCapabilityDescriptor,
} from './atomicCapabilityCatalog';

interface AtomicCapabilityOverviewPageProps {
  projectId: string;
  onNavigate: (view: ViewType) => void;
}

interface OnlineDocsState {
  loading: boolean;
  available: boolean;
  statusMessage: string;
  openapiUrl: string | null;
  docsUrl: string | null;
  redocUrl: string | null;
  title: string | null;
  version: string | null;
  pathCount: number | null;
}

const buildK8sRootUrl = (capability: AtomicCapabilityDescriptor): string =>
  `http://${capability.k8sServiceHost}:${capability.port}`;

const buildK8sApiBase = (capability: AtomicCapabilityDescriptor): string =>
  `${buildK8sRootUrl(capability)}${capability.apiPrefix}`;

const buildAbsolutePlatformUrl = (path: string): string => {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
};

const createInitialDocsState = (): OnlineDocsState => ({
  loading: false,
  available: false,
  statusMessage: '打开卡片后将自动探测在线 API 文档。',
  openapiUrl: null,
  docsUrl: null,
  redocUrl: null,
  title: null,
  version: null,
  pathCount: null,
});

const endpointMethodTone = (method: string): string => {
  switch (method) {
    case 'GET':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'POST':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'PUT':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'DELETE':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const sectionIconTone = (index: number): string => {
  const tones = [
    'from-cyan-500 to-sky-600',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-fuchsia-600',
    'from-amber-500 to-orange-600',
  ];
  return tones[index % tones.length] || tones[0];
};

const probeOnlineDocs = async (capability: AtomicCapabilityDescriptor): Promise<OnlineDocsState> => {
  const authHeaders = getAuthHeaders();
  for (const openapiCandidate of capability.platformOpenapiCandidates) {
    try {
      const response = await fetch(openapiCandidate, { headers: authHeaders });
      if (!response.ok) continue;
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !payload.openapi || typeof payload.paths !== 'object') {
        continue;
      }
      const docsUrl = capability.platformDocsCandidates[0] || null;
      const redocUrl = capability.platformRedocCandidates[0] || null;
      return {
        loading: false,
        available: true,
        statusMessage: '已探测到在线 OpenAPI 文档，可直接跳转查看。',
        openapiUrl: openapiCandidate,
        docsUrl,
        redocUrl,
        title: typeof payload.info?.title === 'string' ? payload.info.title : capability.name,
        version: typeof payload.info?.version === 'string' ? payload.info.version : null,
        pathCount: Object.keys(payload.paths || {}).length,
      };
    } catch {
      continue;
    }
  }

  for (const docsCandidate of capability.platformDocsCandidates) {
    try {
      const response = await fetch(docsCandidate, { headers: authHeaders });
      if (!response.ok) continue;
      const responseText = await response.text();
      if (!responseText.includes('Swagger') && !responseText.includes('Redoc') && !responseText.includes('<html')) {
        continue;
      }
      return {
        loading: false,
        available: true,
        statusMessage: '已探测到在线 API 文档入口，但未读取到 OpenAPI JSON 摘要。',
        openapiUrl: null,
        docsUrl: docsCandidate,
        redocUrl: capability.platformRedocCandidates[0] || null,
        title: capability.name,
        version: null,
        pathCount: null,
      };
    } catch {
      continue;
    }
  }

  return {
    loading: false,
    available: false,
    statusMessage: '在线文档暂不可用，已回退到内置接口说明与 K8S 访问说明。',
    openapiUrl: null,
    docsUrl: null,
    redocUrl: null,
    title: null,
    version: null,
    pathCount: null,
  };
};

const ApiGroupSection: React.FC<{ group: AtomicCapabilityApiGroup; index: number }> = ({ group, index }) => (
  <section className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
    <div className="flex items-start gap-4">
      <div className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${sectionIconTone(index)} text-white shadow-lg`}>
        <Sparkles size={18} />
      </div>
      <div className="min-w-0">
        <h4 className="text-lg font-black text-slate-900">{group.groupName}</h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{group.description}</p>
      </div>
    </div>
    <div className="mt-5 space-y-3">
      {group.endpoints.map((endpoint) => (
        <div key={`${endpoint.method}-${endpoint.path}`} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[0.2em] ${endpointMethodTone(endpoint.method)}`}>
              {endpoint.method}
            </span>
            <code className="break-all text-sm font-semibold text-slate-800">{endpoint.path}</code>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800">{endpoint.purpose}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">请求说明</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{endpoint.requestSummary}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">响应说明</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{endpoint.responseSummary}</div>
            </div>
          </div>
          {endpoint.notes ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {endpoint.notes}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </section>
);

export const AtomicCapabilityOverviewPage: React.FC<AtomicCapabilityOverviewPageProps> = ({ projectId, onNavigate }) => {
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string>('');
  const [onlineDocsState, setOnlineDocsState] = useState<OnlineDocsState>(createInitialDocsState);

  const selectedCapability = useMemo(
    () => atomicCapabilityCatalog.find((item) => item.id === selectedCapabilityId) || null,
    [selectedCapabilityId],
  );

  useEffect(() => {
    if (!selectedCapability) return undefined;
    let active = true;
    setOnlineDocsState({
      loading: true,
      available: false,
      statusMessage: '正在探测在线 API 文档...',
      openapiUrl: null,
      docsUrl: null,
      redocUrl: null,
      title: null,
      version: null,
      pathCount: null,
    });
    void probeOnlineDocs(selectedCapability).then((nextState) => {
      if (active) {
        setOnlineDocsState(nextState);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedCapability]);

  useEffect(() => {
    if (!selectedCapability) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedCapabilityId('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCapability]);

  return (
    <div className="px-8 pb-10 pt-8">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-cyan-50/70 to-sky-50 p-7 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-cyan-700">
              <Sparkles size={14} />
              Atomic Capabilities
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">原子能力总览</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              聚焦当前平台已上线的五类原子能力。每张卡片展示能力定位、输入输出链路、K8S 服务入口和核心 API。
              点击卡片即可查看内置接口文档、K8S 内访问地址以及在线 OpenAPI 文档探测结果。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">原子能力</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{atomicCapabilityCatalog.length}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">已选项目</div>
              <div className="mt-2 break-all text-sm font-bold text-slate-800">{projectId || '未选择项目'}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">展示内容</div>
              <div className="mt-2 text-sm font-bold text-slate-800">能力简介 / K8S API / API 文档</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {atomicCapabilityCatalog.map((capability) => {
          const Icon = capability.icon;
          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => setSelectedCapabilityId(capability.id)}
              className="group rounded-[2rem] border border-slate-200 bg-white/95 p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-200/70">
                    <Icon size={24} />
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-700">Atomic Capability</div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{capability.name}</h3>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {capability.serviceName}
                </span>
              </div>

              <p className="mt-5 min-h-[48px] text-sm leading-7 text-slate-600">{capability.summary}</p>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输入</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{capability.inputDescription}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输出</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{capability.outputDescription}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {capability.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">K8S 服务名</div>
                  <div className="mt-2 break-all text-sm font-bold text-slate-800">{capability.k8sServiceHost}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">API 前缀</div>
                  <div className="mt-2 break-all font-mono text-sm font-semibold text-slate-800">{capability.apiPrefix}</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedCapabilityId(capability.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-all hover:bg-slate-800"
                >
                  查看 API 说明
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate(capability.viewId);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  进入能力页面
                </button>
              </div>
            </button>
          );
        })}
      </section>

      {selectedCapability ? (
        <div className="fixed inset-0 z-[260] bg-slate-950/55 p-4 backdrop-blur-sm md:p-8" onClick={() => setSelectedCapabilityId('')}>
          <div
            className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 px-6 py-5 md:px-8">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-700">Atomic Capability Detail</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black tracking-tight text-slate-900">{selectedCapability.name}</h2>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                    {selectedCapability.serviceName}
                  </span>
                </div>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{selectedCapability.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapabilityId('')}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:text-slate-800"
                title="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">能力简介</div>
                      <h3 className="mt-1 text-lg font-black text-slate-900">面向分析链路的能力定位</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-600">{selectedCapability.summary}</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输入</div>
                      <div className="mt-3 text-sm leading-7 text-slate-700">{selectedCapability.inputDescription}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输出</div>
                      <div className="mt-3 text-sm leading-7 text-slate-700">{selectedCapability.outputDescription}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">关键标签</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedCapability.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <Network size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">K8S API 访问</div>
                      <h3 className="mt-1 text-lg font-black text-slate-900">集群内 Service 与 API 路径</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Service 根地址</div>
                      <code className="mt-2 block break-all font-mono text-slate-800">{buildK8sRootUrl(selectedCapability)}</code>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">API Base</div>
                      <code className="mt-2 block break-all font-mono text-slate-800">{buildK8sApiBase(selectedCapability)}</code>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">示例访问地址</div>
                      <div className="mt-2 space-y-2">
                        <code className="block break-all font-mono text-slate-800">{`${buildK8sApiBase(selectedCapability)}/health`}</code>
                        <code className="block break-all font-mono text-slate-800">{`${buildK8sApiBase(selectedCapability)}/tasks`}</code>
                        <code className="block break-all font-mono text-slate-800">{`${buildK8sApiBase(selectedCapability)}/metrics/summary`}</code>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                      <Server size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">项目 API 文档</div>
                      <h3 className="mt-1 text-lg font-black text-slate-900">在线文档入口与 OpenAPI 探测</h3>
                    </div>
                  </div>
                  {onlineDocsState.loading ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                      <Loader2 size={15} className="animate-spin" />
                      正在探测
                    </div>
                  ) : (
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                      onlineDocsState.available
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {onlineDocsState.available ? <ShieldCheck size={15} /> : <Server size={15} />}
                      {onlineDocsState.available ? '在线文档可访问' : '已回退到内置说明'}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">探测结果</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{onlineDocsState.statusMessage}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-white bg-white px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">OpenAPI 标题</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{onlineDocsState.title || '未探测到'}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">版本</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{onlineDocsState.version || '未探测到'}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">接口路径数</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{onlineDocsState.pathCount ?? '未探测到'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">文档入口</div>
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-white bg-white px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">K8S Swagger UI</div>
                        <code className="mt-2 block break-all font-mono text-sm text-slate-800">{`${buildK8sRootUrl(selectedCapability)}${selectedCapability.docsPath}`}</code>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">K8S OpenAPI JSON</div>
                        <code className="mt-2 block break-all font-mono text-sm text-slate-800">{`${buildK8sRootUrl(selectedCapability)}${selectedCapability.openapiPath}`}</code>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {onlineDocsState.docsUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.docsUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                          >
                            Swagger UI
                            <ExternalLink size={15} />
                          </button>
                        ) : null}
                        {onlineDocsState.openapiUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.openapiUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                          >
                            OpenAPI JSON
                            <ExternalLink size={15} />
                          </button>
                        ) : null}
                        {onlineDocsState.redocUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.redocUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                          >
                            Redoc
                            <ExternalLink size={15} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-5 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">核心接口清单</div>
                    <h3 className="mt-1 text-xl font-black text-slate-900">按能力分组的稳定 API 说明</h3>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
                    共 {selectedCapability.apiGroups.reduce((total, group) => total + group.endpoints.length, 0)} 个核心接口
                  </div>
                </div>
                {selectedCapability.apiGroups.map((group, index) => (
                  <ApiGroupSection key={group.groupName} group={group} index={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
