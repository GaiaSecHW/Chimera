import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Plug, PlugZap, TerminalSquare } from 'lucide-react';
import { api } from '../../clients/api';
import { XTerminal } from '../../components/XTerminal';

type TerminalMode = 'attach' | 'shell';

const isIpHost = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

const buildWsCandidates = (rawUrl: string): string[] => {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const candidates: string[] = [];
    const seen = new Set<string>();

    const pushCandidate = (value: string) => {
      if (!seen.has(value)) {
        seen.add(value);
        candidates.push(value);
      }
    };

    pushCandidate(parsed.toString());

    const sameHost = parsed.host === window.location.host;
    const publicDomainHost =
      !!parsed.hostname &&
      !isIpHost(parsed.hostname) &&
      parsed.hostname !== 'localhost' &&
      !parsed.hostname.endsWith('.local');

    // 对外域名经 ingress 暴露时，WS 往往只在 TLS 入口上稳定可用。
    if (parsed.protocol === 'ws:' && (window.location.protocol === 'https:' || sameHost || publicDomainHost)) {
      const secure = new URL(parsed.toString());
      secure.protocol = 'wss:';
      pushCandidate(secure.toString());
    }

    return candidates;
  } catch {
    return [rawUrl];
  }
};

const parseQuery = () => {
  const q = new URLSearchParams(window.location.search);
  return {
    projectId: q.get('project_id') || '',
    agentKey: q.get('agent_key') || '',
    serviceName: q.get('service_name') || '',
    container: q.get('container') || '',
    shell: q.get('shell') || '/bin/bash',
    fallbackShell: q.get('fallback_shell') || '/bin/sh',
    mode: (q.get('mode') === 'attach' ? 'attach' : 'shell') as TerminalMode,
  };
};

export const ServiceTerminalWindowPage: React.FC = () => {
  const environmentApi = api.domains.environment;
  const initial = useMemo(parseQuery, []);
  const [projectId] = useState(initial.projectId);
  const [agentKey] = useState(initial.agentKey);
  const [serviceName] = useState(initial.serviceName);
  const [container] = useState(initial.container);
  const [mode, setMode] = useState<TerminalMode>(initial.mode);
  const [shell, setShell] = useState(initial.shell || '/bin/bash');
  const [fallbackShell] = useState(initial.fallbackShell || '/bin/sh');
  const [terminalWs, setTerminalWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const connectAttemptRef = useRef(0);

  const connectionTargets = useMemo(() => {
    if (!connectionInfo) return [];

    const currentUrl = connectionInfo?.ws_url || '';
    const items = [
      {
        key: 'active',
        label: '当前使用',
        url: currentUrl,
        active: true,
      },
      {
        key: 'ingress',
        label: 'Ingress WS',
        url: connectionInfo?.ingress_ws_url || '',
        active: !!connectionInfo?.ingress_ws_url && connectionInfo?.ingress_ws_url === currentUrl,
      },
      {
        key: 'direct',
        label: '直连 WS',
        url: connectionInfo?.direct_ws_url || '',
        active: !!connectionInfo?.direct_ws_url && connectionInfo?.direct_ws_url === currentUrl,
      },
      {
        key: 'original',
        label: '原始返回',
        url: connectionInfo?.ws_url_original || '',
        active: !!connectionInfo?.ws_url_original && connectionInfo?.ws_url_original === currentUrl,
      },
    ];

    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item.url) return false;
      const uniqueKey =`${item.label}:${item.url}`;
      if (seen.has(uniqueKey)) return false;
      seen.add(uniqueKey);
      return true;
    });
  }, [connectionInfo]);

  useEffect(() => {
    return () => {
      if (terminalWs) terminalWs.close();
    };
  }, [terminalWs]);

  useEffect(() => {
    if (!terminalWs) return;

    const heartbeat = window.setInterval(() => {
      if (terminalWs.readyState === WebSocket.OPEN) {
        try {
          terminalWs.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch {
          // noop
        }
      }
    }, 25000);

    return () => window.clearInterval(heartbeat);
  }, [terminalWs]);

  useEffect(() => {
    void connectTerminal(initial.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectTerminal = async (nextMode = mode, requestedShell = shell, allowFallback = true) => {
    const attemptId = Date.now() + Math.random();
    connectAttemptRef.current = attemptId;

    if (!agentKey || !serviceName) {
      setError('缺少必要参数：agent_key/service_name');
      return;
    }
    setError('');
    setConnecting(true);
    try {
      if (terminalWs) {
        terminalWs.close();
        setTerminalWs(null);
      }
      const conn = await environmentApi.environment.getAgentServiceExecWsConnection(agentKey, serviceName, {
        project_id: projectId || undefined,
        container: container || undefined,
        shell: (requestedShell || '/bin/bash').trim() || '/bin/bash',
        mode: nextMode,
      });
      setConnectionInfo(conn || null);
      const wsUrl = conn?.ws_url;
      if (!wsUrl) throw new Error('未获取到终端连接地址');

      if (/^ws:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?\//.test(wsUrl)) {
        throw new Error('当前策略禁止浏览器直连Agent，请使用平台中转通道（Ingress WS/WSS）。');
      }

      const candidates = buildWsCandidates(wsUrl);
      let connectedWs: WebSocket | null = null;
      let lastCloseMessage = '';

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const sock = new WebSocket(candidate);
          let settled = false;

          const cleanup = () => {
            sock.onopen = null;
            sock.onerror = null;
            sock.onclose = null;
          };

          sock.onopen = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(sock);
          };

          sock.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            try { sock.close(); } catch {}
            reject(new Error(`WebSocket握手失败: ${candidate}`));
          };

          sock.onclose = (evt) => {
            if (settled) return;
            settled = true;
            cleanup();
            const reason = evt?.reason ?`, reason=${evt.reason}` : '';
            reject(new Error(`WebSocket握手失败: ${candidate}, code=${evt?.code ?? 'unknown'}${reason}`));
          };
        }).catch((err) => {
          lastCloseMessage = err instanceof Error ? err.message : String(err || '');
          return null;
        });

        if (ws) {
          connectedWs = ws;
          if (candidate !== wsUrl) {
            setConnectionInfo((prev: any) => prev ? { ...prev, ws_url: candidate, ws_url_original: wsUrl } : prev);
          }
          break;
        }

        if (index < candidates.length - 1) {
          if (connectAttemptRef.current === attemptId) {
            setError(`主终端地址握手失败，正在回退到安全通道: ${candidates[index + 1]}`);
          }
        }
      }

      if (!connectedWs) {
        throw new Error(lastCloseMessage || '终端握手失败');
      }

      if (connectAttemptRef.current === attemptId) {
        setError('');
      }

      connectedWs.onopen = () => {
        if (connectAttemptRef.current !== attemptId) return;
        setConnected(true);
        setError('');
      };
      connectedWs.onclose = (evt) => {
        if (connectAttemptRef.current !== attemptId) return;
        setConnected(false);
        const reason = evt?.reason ?`, reason=${evt.reason}` : '';
        setError(`终端连接关闭: code=${evt?.code ?? 'unknown'}${reason}.` +`可能原因: 1) agent/容器重启; 2) 浏览器/代理主动断开; 3) ingress/HTTPS与WS协议不一致。`
        );
      };
      connectedWs.onerror = () => {
        if (connectAttemptRef.current !== attemptId) return;
        setConnected(false);
        setError('终端连接发生网络错误，请检查 ingress、HTTPS/WSS 与浏览器控制台错误信息。');
      };
      if (connectAttemptRef.current === attemptId) {
        setConnected(true);
        setError('');
        setTerminalWs(connectedWs);
      } else {
        connectedWs.close();
      }
    } catch (err: any) {
      const currentShell = (requestedShell || '/bin/bash').trim() || '/bin/bash';
      const fallback = (fallbackShell || '/bin/sh').trim() || '/bin/sh';
      if (nextMode === 'shell' && allowFallback && currentShell !== fallback) {
        if (connectAttemptRef.current === attemptId) {
          setError(`终端连接失败，正在回退到 ${fallback} ...`);
        }
        setShell(fallback);
        await connectTerminal(nextMode, fallback, false);
        return;
      }
      if (connectAttemptRef.current === attemptId) {
        setError(err?.message || '终端连接失败');
      }
    } finally {
      if (connectAttemptRef.current === attemptId) {
        setConnecting(false);
      }
    }
  };

  return (
    <div className="h-screen w-screen bg-theme-elevated text-slate-100 flex flex-col">
      <div className="px-4 py-3 border-b border-theme-border bg-slate-900/95 flex items-start gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <TerminalSquare size={16} className="text-blue-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 min-w-0">
              <p className="text-sm font-semibold leading-5 break-all">{serviceName || 'Service Terminal'}</p>
              <span className="text-[10px] text-theme-text-muted font-mono leading-4 break-all max-w-[180px]">
                {agentKey}
              </span>
            </div>
            {connectionInfo ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setShowConnectionDetails((prev) => !prev)}
                  className="max-w-full flex items-center gap-2 text-left rounded-md border border-theme-border bg-slate-950/40 px-2 py-1 hover:bg-slate-950/70 transition-colors"
                >
                  <span className="text-[10px] text-slate-200 font-bold shrink-0">连接详情</span>
                  <span className="text-[10px] text-theme-text-muted truncate">
                    {connectionTargets.find((item) => item.active)?.label || '当前连接'}
                    {connectionInfo?.ws_url ?`: ${connectionInfo.ws_url}` : ''}
                  </span>
                  <span className="shrink-0 text-theme-text-muted">
                    {showConnectionDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value === 'attach' ? 'attach' : 'shell')}
          className="form-select text-xs shrink-0"
        >
          <option value="attach">Attach 模式</option>
          <option value="shell">新建 Shell</option>
        </select>

        <input
          value={shell}
          onChange={(e) => setShell(e.target.value)}
          placeholder="/bin/bash 或 /bin/sh"
          disabled={mode === 'attach'}
          className="px-2 py-1.5 rounded-lg bg-theme-elevated border border-theme-border text-xs text-slate-100 w-40 xl:w-48 shrink-0 disabled:opacity-50"
        />

        <button
          onClick={() => void connectTerminal(mode)}
          disabled={connecting}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {connecting ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
          连接
        </button>

        <button
          onClick={() => {
            if (terminalWs) terminalWs.close();
            setTerminalWs(null);
            setConnected(false);
          }}
          className="px-3 py-1.5 rounded-lg bg-theme-elevated text-slate-200 text-xs font-medium hover:bg-theme-elevated flex items-center gap-2 shrink-0"
        >
          <PlugZap size={13} />
          断开
        </button>

        <div className="ml-auto shrink-0 flex items-center justify-end min-w-[150px]">
          {connected ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 size={13} />
              <span>已连接到容器终端</span>
            </div>
          ) : (
            <span className={`text-[11px] font-bold ${connecting ? 'text-blue-300' : 'text-amber-400'}`}>
              {connecting ? '连接中...' : '未连接'}
            </span>
          )}
        </div>
      </div>

      {error ? (
        <div className="px-4 py-2 text-xs bg-rose-500/10 text-rose-300 border-b border-rose-500/20">{error}</div>
      ) : null}

      {connectionInfo && showConnectionDetails ? (
        <div className="px-4 py-2 text-[11px] bg-theme-surface border-b border-theme-border text-theme-text-faint">
          <div className="space-y-2">
            <div className="grid gap-2">
              {connectionTargets.map((item) => (
                <div
                  key={`${item.key}-${item.url}`}
                  className={`rounded-lg border px-3 py-2 ${
                    item.active
                      ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                      : 'border-theme-border bg-slate-950/70 text-theme-text-faint'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold">{item.label}</span>
                    {item.active ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 text-[10px] font-semibold">
                        当前连接
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono break-all">{item.url}</div>
                </div>
              ))}
            </div>
            {connectionInfo?.note ? <div className="text-amber-300">{connectionInfo.note}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
        <XTerminal
          ws={terminalWs}
          connected={connected}
          podName={`${serviceName}${container ?`:${container}` : ''}`}
          onClose={() => {
            if (terminalWs) terminalWs.close();
            setTerminalWs(null);
            setConnected(false);
            window.close();
          }}
          showHeader={false}
        />
      </div>
    </div>
  );
};
