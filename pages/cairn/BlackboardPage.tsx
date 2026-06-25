import React, { useState } from 'react';

// Cairn 为跨域独立服务，iframe 隔离其 SSE/图谱运行时，避免与父 SPA 状态冲突。
const CAIRN_BLACKBOARD_SRC = 'https://cairn.ai.icsl.huawei.com';

const BlackboardPage: React.FC = () => {
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
          加载黑板中…
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
          黑板无法加载 — 请确认 Cairn 服务
          (<code>{CAIRN_BLACKBOARD_SRC}</code>) 可达。
        </div>
      )}
      <iframe
        title="黑板 Cairn Blackboard"
        src={CAIRN_BLACKBOARD_SRC}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 'calc(100vh - 120px)',
          border: 'none',
          background: 'transparent',
          display: status === 'error' ? 'none' : 'block',
        }}
      />
    </div>
  );
};

export default BlackboardPage;
