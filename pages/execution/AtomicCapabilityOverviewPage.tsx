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
import { PageHeader } from '../../design-system';
import type { ViewType } from '../../types/types';
import {
  atomicCapabilityCatalog,
  type AtomicCapabilityApiGroup,
  type AtomicCapabilityDescriptor,
} from './atomicCapabilityCatalog';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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

const buildK8sRootUrl = (capability: AtomicCapabilityDescriptor): string =>`http://${capability.k8sServiceHost}:${capability.port}`;

const buildK8sApiBase = (capability: AtomicCapabilityDescriptor): string =>`${buildK8sRootUrl(capability)}${capability.apiPrefix}`;

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

const endpointMethodTone = (method: string): { bg: string; color: string; border: string } => {
  switch (method) {
    case 'GET':
      return { bg: 'rgba(73,197,255,0.15)', color: '#49c5ff', border: '#49c5ff' };
    case 'POST':
      return { bg: 'rgba(69,192,111,0.15)', color: '#45c06f', border: '#45c06f' };
    case 'PUT':
      return { bg: 'rgba(213,161,58,0.15)', color: '#d5a13a', border: '#d5a13a' };
    case 'DELETE':
      return { bg: 'rgba(241,93,93,0.15)', color: '#f15d5d', border: '#f15d5d' };
    default:
      return { bg: 'rgba(114,128,154,0.15)', color: '#72809a', border: '#72809a' };
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

const ApiGroupSection: React.FC<{ group: AtomicCapabilityApiGroup; index: number }> = ({ group, index }) => {
  const tones = [
    'from-cyan-500 to-sky-600',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-fuchsia-600',
    'from-amber-500 to-orange-600',
  ];
  const tone = tones[index % tones.length] || tones[0];

  const getGradientColors = (t: string): { from: string; to: string } => {
    if (t.includes('cyan')) return { from: '#06b6d4', to: '#0284c7' };
    if (t.includes('emerald')) return { from: '#10b981', to: '#0d9488' };
    if (t.includes('violet')) return { from: '#8b5cf6', to: '#a855f7' };
    if (t.includes('amber')) return { from: '#f59e0b', to: '#ea580c' };
    return { from: '#4f73ff', to: '#3f63f1' };
  };

  const gradient = getGradientColors(tone);

  return (
    <section style={{ borderRadius: '20px', border: '1px solid #26324a', backgroundColor: 'rgba(17,26,43,0.9)', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ marginTop: '4px', display: 'flex', height: '44px', width: '44px', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '16px', background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`, color: '#fff' }}>
          <Sparkles size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ fontSize: '18px', fontWeight: 600, color: '#f5f7ff' }}>{group.groupName}</h4>
          <p style={{ marginTop: '4px', fontSize: '14px', lineHeight: '20px', color: '#a4aec4' }}>{group.description}</p>
        </div>
      </div>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {group.endpoints.map((endpoint) => {
          const tones = endpointMethodTone(endpoint.method);
          return (
            <div key={`${endpoint.method}-${endpoint.path}`} style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'inline-flex', borderRadius: '9999px', border: `1px solid ${tones.border}`, padding: '4px 10px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', backgroundColor: tones.bg, color: tones.color }}>
                  {endpoint.method}
                </span>
                <code style={{ wordBreak: 'break-all', fontSize: '14px', fontWeight: 600, color: '#d6def0', fontFamily: MONO }}>{endpoint.path}</code>
              </div>
              <p style={{ marginTop: '12px', fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>{endpoint.purpose}</p>
              <div style={{ marginTop: '12px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } } as any}>
                <div style={{ borderRadius: '12px', border: '1px solid #26324a', backgroundColor: '#111a2b', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>请求说明</div>
                  <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '20px', color: '#d6def0' }}>{endpoint.requestSummary}</div>
                </div>
                <div style={{ borderRadius: '12px', border: '1px solid #26324a', backgroundColor: '#111a2b', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>响应说明</div>
                  <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '20px', color: '#d6def0' }}>{endpoint.responseSummary}</div>
                </div>
              </div>
              {endpoint.notes ? (
                <div style={{ marginTop: '12px', borderRadius: '12px', border: '1px solid #d5a13a', backgroundColor: 'rgba(213,161,58,0.1)', padding: '8px 12px', fontSize: '14px', color: '#d5a13a' }}>
                  {endpoint.notes}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};

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
    <div style={{ padding: '32px', paddingBottom: '40px', paddingTop: '32px' }}>
      <PageHeader
        title="原子能力总览"
        description="聚焦当前平台已上线的五类原子能力。每张卡片展示能力定位、输入输出链路、K8S 服务入口和核心 API。点击卡片即可查看内置接口文档、K8S 内访问地址以及在线 OpenAPI 文档探测结果。"
      />
      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(17,26,43,0.9)', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>原子能力</div>
          <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 600, color: '#f5f7ff' }}>{atomicCapabilityCatalog.length}</div>
        </div>
        <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(17,26,43,0.9)', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>已选项目</div>
          <div style={{ marginTop: '8px', wordBreak: 'break-all', fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>{projectId || '未选择项目'}</div>
        </div>
        <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(17,26,43,0.9)', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>展示内容</div>
          <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>能力简介 / K8S API / API 文档</div>
        </div>
      </div>

      <section style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '20px', '@media (min-width: 1280px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@media (min-width: 1536px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } } as any}>
        {atomicCapabilityCatalog.map((capability) => {
          const Icon = capability.icon;
          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => setSelectedCapabilityId(capability.id)}
              style={{ borderRadius: '24px', border: '1px solid #26324a', backgroundColor: 'rgba(17,26,43,0.95)', padding: '24px', textAlign: 'left', transitionProperty: 'transform, border-color', transitionDuration: '150ms', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#4f73ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#26324a'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', height: '56px', width: '56px', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '20px', background: 'linear-gradient(135deg, #06b6d4, #2563eb)', color: '#fff' }}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: '#f5f7ff' }}>{capability.name}</h3>
                  </div>
                </div>
                <span style={{ borderRadius: '9999px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '4px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>
                  {capability.serviceName}
                </span>
              </div>

              <p style={{ marginTop: '20px', minHeight: '48px', fontSize: '14px', lineHeight: '28px', color: '#d6def0' }}>{capability.summary}</p>

              <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
                <div style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>输入</div>
                  <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '24px', color: '#d6def0' }}>{capability.inputDescription}</div>
                </div>
                <div style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>输出</div>
                  <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '24px', color: '#d6def0' }}>{capability.outputDescription}</div>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {capability.tags.map((tag) => (
                  <span key={tag} style={{ borderRadius: '9999px', border: '1px solid #49c5ff', backgroundColor: 'rgba(73,197,255,0.1)', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#49c5ff' }}>
                    {tag}
                  </span>
                ))}
              </div>

              <div style={{ marginTop: '20px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } } as any}>
                <div style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>K8S 服务名</div>
                  <div style={{ marginTop: '8px', wordBreak: 'break-all', fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>{capability.k8sServiceHost}</div>
                </div>
                <div style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#72809a' }}>API 前缀</div>
                  <div style={{ marginTop: '8px', wordBreak: 'break-all', fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>{capability.apiPrefix}</div>
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedCapabilityId(capability.id);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '16px', backgroundColor: '#4f73ff', padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#f5f7ff', transitionProperty: 'background-color', transitionDuration: '150ms', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3f63f1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4f73ff'; }}
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#d6def0', transitionProperty: 'border-color, background-color', transitionDuration: '150ms', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4f73ff'; e.currentTarget.style.backgroundColor = '#26324a'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#26324a'; e.currentTarget.style.backgroundColor = '#18233a'; }}
                >
                  进入能力页面
                </button>
              </div>
            </button>
          );
        })}
      </section>

      {selectedCapability ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 260, backgroundColor: 'rgba(2,6,23,0.55)', padding: '16px', backdropFilter: 'blur(4px)', '@media (min-width: 768px)': { padding: '32px' } } as any} onClick={() => setSelectedCapabilityId('')}>
          <div
            style={{ margin: '0 auto', display: 'flex', height: '100%', width: '100%', maxWidth: '80rem', flexDirection: 'column', overflow: 'hidden', borderRadius: '24px', border: '1px solid #26324a', backgroundColor: '#111a2b' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', borderBottom: '1px solid #26324a', background: 'linear-gradient(90deg, #111a2b, #18233a)', padding: '20px 24px', '@media (min-width: 768px)': { padding: '20px 32px' } } as any}>
              <div style={{ minWidth: 0 }}>
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                  <h2 style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: '#f5f7ff' }}>{selectedCapability.name}</h2>
                  <span style={{ borderRadius: '9999px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#72809a' }}>
                    {selectedCapability.serviceName}
                  </span>
                </div>
                <p style={{ marginTop: '12px', maxWidth: '64rem', fontSize: '14px', lineHeight: '28px', color: '#d6def0' }}>{selectedCapability.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapabilityId('')}
                style={{ borderRadius: '16px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px', color: '#a4aec4', transitionProperty: 'color', transitionDuration: '150ms', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f5f7ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#a4aec4'; }}
                title="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
 <section className="rounded-[1.8rem] border border-theme-border bg-theme-bg-app p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">能力简介</div>
                      <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">面向分析链路的能力定位</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-theme-text-secondary">{selectedCapability.summary}</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">输入</div>
                      <div className="mt-3 text-sm leading-7 text-theme-text-secondary">{selectedCapability.inputDescription}</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">输出</div>
                      <div className="mt-3 text-sm leading-7 text-theme-text-secondary">{selectedCapability.outputDescription}</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4 md:col-span-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">关键标签</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedCapability.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-cyan-500/20 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

 <section className="rounded-[1.8rem] border border-theme-border bg-theme-bg-app p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                      <Network size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">K8S API 访问</div>
                      <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">集群内 Service 与 API 路径</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">Service 根地址</div>
                      <code className="mt-2 block break-all font-mono text-theme-text-primary">{buildK8sRootUrl(selectedCapability)}</code>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">API Base</div>
                      <code className="mt-2 block break-all font-mono text-theme-text-primary">{buildK8sApiBase(selectedCapability)}</code>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">示例访问地址</div>
                      <div className="mt-2 space-y-2">
                        <code className="block break-all font-mono text-theme-text-primary">{`${buildK8sApiBase(selectedCapability)}/health`}</code>
                        <code className="block break-all font-mono text-theme-text-primary">{`${buildK8sApiBase(selectedCapability)}/tasks`}</code>
                        <code className="block break-all font-mono text-theme-text-primary">{`${buildK8sApiBase(selectedCapability)}/metrics/summary`}</code>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

 <section className="mt-5 rounded-[1.8rem] border border-theme-border bg-theme-bg-app p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
                      <Server size={20} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400">项目 API 文档</div>
                      <h3 className="mt-1 text-lg font-semibold text-theme-text-primary">在线文档入口与 OpenAPI 探测</h3>
                    </div>
                  </div>
                  {onlineDocsState.loading ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                      <Loader2 size={15} className="animate-spin" />
                      正在探测
                    </div>
                  ) : (
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                      onlineDocsState.available
                        ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
                        : 'border-amber-500/20 bg-amber-500/15 text-amber-400'
                    }`}>
                      {onlineDocsState.available ? <ShieldCheck size={15} /> : <Server size={15} />}
                      {onlineDocsState.available ? '在线文档可访问' : '已回退到内置说明'}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">探测结果</div>
                    <p className="mt-2 text-sm leading-7 text-theme-text-secondary">{onlineDocsState.statusMessage}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">OpenAPI 标题</div>
                        <div className="mt-2 text-sm font-semibold text-theme-text-primary">{onlineDocsState.title || '未探测到'}</div>
                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">版本</div>
                        <div className="mt-2 text-sm font-semibold text-theme-text-primary">{onlineDocsState.version || '未探测到'}</div>
                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">接口路径数</div>
                        <div className="mt-2 text-sm font-semibold text-theme-text-primary">{onlineDocsState.pathCount ?? '未探测到'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">文档入口</div>
                    <div className="mt-3 space-y-3">
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">K8S Swagger UI</div>
                        <code className="mt-2 block break-all font-mono text-sm text-theme-text-primary">{`${buildK8sRootUrl(selectedCapability)}${selectedCapability.docsPath}`}</code>
                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">K8S OpenAPI JSON</div>
                        <code className="mt-2 block break-all font-mono text-sm text-theme-text-primary">{`${buildK8sRootUrl(selectedCapability)}${selectedCapability.openapiPath}`}</code>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {onlineDocsState.docsUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.docsUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-3 text-sm font-semibold text-white transition hover:bg-theme-elevated"
                          >
                            Swagger UI
                            <ExternalLink size={15} />
                          </button>
                        ) : null}
                        {onlineDocsState.openapiUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.openapiUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary transition hover:bg-theme-elevated"
                          >
                            OpenAPI JSON
                            <ExternalLink size={15} />
                          </button>
                        ) : null}
                        {onlineDocsState.redocUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(buildAbsolutePlatformUrl(onlineDocsState.redocUrl || ''), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary transition hover:bg-theme-elevated"
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">核心接口清单</div>
                    <h3 className="mt-1 text-xl font-semibold text-theme-text-primary">按能力分组的稳定 API 说明</h3>
                  </div>
                  <div className="rounded-full border border-theme-border bg-theme-bg-app px-4 py-2 text-sm font-semibold text-theme-text-secondary">
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
