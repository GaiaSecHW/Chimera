import React, { useState } from 'react';

interface AgentTraceObserverPageProps {}

// Agent Trace Observer (spec §6.2) ships its own SPA at
// `/ui/agent-trace-observer/`, served by the FastAPI backend at the same
// host. Same-origin path-prefix is added via the chimera-deploy
// `09-agent-trace-observer-service/patch/secflow-ingress-append.json-patch.json`.
//
// v1 integration is iframe-based: the observatory has its own SSE bus,
// timeline visualizer, and component tree which would be a non-trivial
// vendoring exercise (vs the leaderboard which is a small dashboard).
// Iframe also gives clean isolation for long-running SSE without
// conflicting with the parent SPA connection budget.
const OBSERVER_SRC = '/ui/agent-trace-observer/';

export const AgentTraceObserverPage: React.FC<AgentTraceObserverPageProps> = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 120px)',
        background: 'var(--bg-surface, #0e1116)',
      }}
    >
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: 'var(--text-muted, #8aa0b8)',
            fontSize: 14,
          }}
        >
          加载 Agent Trace Observer 中…
        </div>
      )}
      {status === 'error' && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: 'var(--text-danger, #ff6b6b)',
            fontSize: 14,
            padding: '0 24px',
          }}
        >
          观测器无法加载 — 请确认 <code>secflow-ingress</code> 已应用
          <code>patch/secflow-ingress-append.json-patch.json</code> 且
          <code>agent-trace-observer</code> Pod 处于 Ready。
        </div>
      )}
      <iframe
        title="Agent Trace Observer"
        src={OBSERVER_SRC}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 'calc(100vh - 120px)',
          border: 0,
          background: 'transparent',
          display: status === 'error' ? 'none' : 'block',
        }}
      />
    </div>
  );
};
