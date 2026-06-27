import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../theme/ThemeProvider';

const CAIRN_BLACKBOARD_SRC = '/nazhua/';

const BlackboardPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { theme } = useTheme();

  const sendTheme = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'theme', theme: theme || 'light' },
      '*',
    );
  };

  useEffect(() => {
    sendTheme();
  }, [theme]);

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
        ref={iframeRef}
        title="黑板 Cairn Blackboard"
        src={CAIRN_BLACKBOARD_SRC}
        onLoad={() => { setStatus('ready'); sendTheme(); }}
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
