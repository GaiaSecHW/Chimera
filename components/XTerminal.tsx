import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface XTerminalProps {
  ws: WebSocket | null;
  connected: boolean;
  podName: string;
  onClose: () => void;
  showHeader?: boolean;
}

export const XTerminal: React.FC<XTerminalProps> = ({
  ws,
  connected,
  podName,
  onClose,
  showHeader = true
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const readTerminalTheme = useCallback(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const background = rootStyle.getPropertyValue('--xterm-bg').trim() || '#1a1a2e';
    const foreground = rootStyle.getPropertyValue('--xterm-fg').trim() || '#eaeaea';
    const cursor = rootStyle.getPropertyValue('--xterm-cursor').trim() || '#00ff88';

    return {
      background,
      foreground,
      cursor,
      cursorAccent: background,
      selectionBackground: 'rgba(38, 79, 120, 0.45)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    };
  }, []);

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: readTerminalTheme(),
      fontFamily: '"Cascadia Code", "Fira Code", "Source Code Pro", Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    term.focus();

    const focusTerminal = () => term.focus();
    terminalRef.current.addEventListener('click', focusTerminal);

    // 延迟fit以确保容器尺寸正确
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    // 输出欢迎信息
    term.writeln('\x1b[32m✓ 终端已初始化，等待连接...\x1b[0m');

    return () => {
      terminalRef.current?.removeEventListener('click', focusTerminal);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = readTerminalTheme();
    xtermRef.current.refresh(0, xtermRef.current.rows - 1);
  }, [readTerminalTheme]);

  // 处理窗口resize
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          try {
            fitAddonRef.current.fit();
            // 发送resize到后端
            if (ws && ws.readyState === WebSocket.OPEN) {
              const { rows, cols } = xtermRef.current;
              ws.send(JSON.stringify({ resize: { rows, cols } }));
            }
          } catch (e) {
            console.debug('Resize fit error:', e);
          }
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [ws]);

  // 处理用户输入
  useEffect(() => {
    if (!xtermRef.current || !ws) return;

    const disposable = xtermRef.current.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [ws, isInitialized]);

  // 处理WebSocket消息
  useEffect(() => {
    if (!xtermRef.current || !ws) return;

    const handleMessage = (event: MessageEvent) => {
      if (xtermRef.current) {
        xtermRef.current.write(event.data);
      }
    };

    const handleError = () => {
      if (xtermRef.current) {
        xtermRef.current.write('\r\n\x1b[31m✗ 连接错误\x1b[0m\r\n');
      }
    };

    const handleClose = () => {
      if (xtermRef.current) {
        xtermRef.current.write('\r\n\x1b[33m✗ 连接已关闭\x1b[0m\r\n');
      }
    };

    const handleOpen = () => {
      if (xtermRef.current) {
        xtermRef.current.clear();
        xtermRef.current.focus();
        // 发送初始终端大小
        const { rows, cols } = xtermRef.current;
        ws.send(JSON.stringify({ resize: { rows, cols } }));
      }
    };

    ws.addEventListener('message', handleMessage);
    ws.addEventListener('error', handleError);
    ws.addEventListener('close', handleClose);

    // 如果WebSocket已经连接
    if (ws.readyState === WebSocket.OPEN) {
      handleOpen();
    } else {
      ws.addEventListener('open', handleOpen);
    }

    return () => {
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('error', handleError);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('open', handleOpen);
    };
  }, [ws, isInitialized]);

  // 连接状态变化时更新提示
  useEffect(() => {
    if (!xtermRef.current || !isInitialized) return;

    if (ws && !connected && ws.readyState !== WebSocket.CONNECTING) {
      xtermRef.current.write('\r\n\x1b[33m提示: 连接已断开\x1b[0m\r\n');
    }
  }, [connected, ws, isInitialized]);

  // 处理终端resize事件
  useEffect(() => {
    if (!xtermRef.current || !ws) return;

    const disposable = xtermRef.current.onResize(({ rows, cols }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ resize: { rows, cols } }));
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [ws, isInitialized]);

  return (
    <div className="flex flex-col h-full">
      {/* 终端标题栏 */}
      {showHeader && (
        <div className="flex items-center justify-between border-b border-theme-border bg-theme-elevated px-4 py-2">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="font-mono text-sm text-theme-text-primary">{podName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              connected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {connected ? '已连接' : '未连接'}
            </span>
            <button
              onClick={onClose}
              className="rounded transition-all p-1.5 text-theme-text-faint hover:bg-theme-sidebar-muted hover:text-theme-text-primary"
              title="关闭终端"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 终端容器 */}
      <div
        ref={terminalRef}
        className="flex-1 p-2 overflow-hidden"
        style={{
          minHeight: showHeader ? '400px' : '100%',
          backgroundColor: 'var(--xterm-bg)',
        }}
      />
    </div>
  );
};
