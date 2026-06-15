import http from 'http';
import https from 'https';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Strip sourceMappingURL comments from Monaco editor files to avoid
// "Could not read source map" ENOENT errors in the browser devtools.
const stripMonacoSourcemaps = {
  name: 'strip-monaco-sourcemaps',
  transform(code: string, id: string) {
    if (id.includes('monaco-editor')) {
      return { code: code.replace(/\/\/# sourceMappingURL=\S+\.map/g, ''), map: null };
    }
  },
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildTime = env.BUILD_TIME || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 3000 });
    const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 3000 });
    const turingHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 20, keepAliveMsecs: 3000 });
    const buildVersion = String(env.SECFLOW_BUILD_VERSION || '').trim() || 'dev';
    const aigwProxyTarget = String(env.VITE_AIGW_PROXY_TARGET || 'https://secflow.ai.icsl.huawei.com').trim();
    const aigwProxyIsHttps = aigwProxyTarget.startsWith('https://');
    const aigwProxyAgent = aigwProxyIsHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;
    // codemap manager(知识图谱):本地 dev 经 ingress 域名访问 k8s 里的 manager,
    // 与节点 IP 解耦(manager pod 换节点也不用改)。需在本机 /etc/hosts 加:
    //   172.31.30.101 codemap-manager.ai.icsl.huawei.com
    // 可用 VITE_CODEMAP_MANAGER_TARGET 覆盖(如 port-forward 时填 http://127.0.0.1:8090)。
    const codemapManagerTarget = String(env.VITE_CODEMAP_MANAGER_TARGET || 'http://codemap-manager.ai.icsl.huawei.com').trim();
    return {
      // Use an absolute base in dev so HMR/module requests stay rooted at the
      // Vite server, while production builds keep relative assets for static hosting.
      base: mode === 'development' ? '/' : './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
        proxy: {
          // Turing App Security (M2M + upload) — /turing/api/* → turing backend
          '/turing/api': {
            target: 'http://turing.ai.icsl.huawei.com/turing-app-security',
            changeOrigin: true,
            secure: false,
            agent: turingHttpAgent,
            rewrite: (path) => path.replace(/^\/turing/, ''),
          },
          '/api/aigw': {
            target: aigwProxyTarget,
            changeOrigin: true,
            secure: false,
            ws: true,
            agent: aigwProxyAgent,
            configure: (proxy) => {
              proxy.on('error', (err: Error & { code?: string }, _req, res) => {
                if (err.code === 'ECONNRESET' && res && !('headersSent' in res && (res as any).headersSent)) {
                  try {
                    (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                    (res as any).end(JSON.stringify({ detail: 'aigw upstream reset – retrying' }));
                  } catch { /* already committed */ }
                }
              });
            },
          },
          '/api/app/kernel-scan': {
            target: 'https://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
          },
          '/api/app/ai4red': {
            target: 'http://ai4red.secflow.ai.icsl.huawei.com/',
            changeOrigin: true,
            secure: false,
            ws: true,
            agent: keepAliveHttpAgent,
          },
          // codemap-lite manager(知识图谱)。本地 dev 直连 k8s 里 hostNetwork 的
          // manager(默认节点 IP:8090)。必须排在 catch-all '/api' 之前,否则会被
          // 代理到远程 secflow。剥掉 /api/codemap-manager 前缀 → manager 的 /tasks。
          '/api/codemap-manager': {
            target: codemapManagerTarget,
            changeOrigin: true,
            secure: false,
            agent: keepAliveHttpAgent,
            rewrite: (path) => path.replace(/^\/api\/codemap-manager/, ''),
          },
          '/api/agentmanage': {
            target: 'https://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
            ws: true,
            agent: keepAliveHttpsAgent,
            configure: (proxy) => {
              proxy.on('error', (err: Error & { code?: string }, _req, res) => {
                if (err.code === 'ECONNRESET' && res && !('headersSent' in res && (res as any).headersSent)) {
                  try {
                    (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                    (res as any).end(JSON.stringify({ detail: 'stale socket reset – retrying' }));
                  } catch { /* already committed */ }
                  return;
                }
              });
            },
          },
          '/api': {
            target: 'https://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
            ws: true,
            // keepAlive:true keeps sockets in a pool instead of destroying
            // them after each request. keepAlive:false caused Node to destroy
            // the socket immediately after each response; on Windows the OS
            // then sends TCP RST to Nginx, Nginx echoes RST back, and
            // Node fires ECONNRESET -> Vite returns empty 500 -> ERR_ABORTED.
            agent: keepAliveHttpsAgent,
            configure: (proxy) => {
              // If a stale pooled socket is reused and gets ECONNRESET,
              // send 503 JSON so fetchWithRetry can retry on a fresh socket.
              proxy.on('error', (err: Error & { code?: string }, _req, res) => {
                if (err.code === 'ECONNRESET' && res && !('headersSent' in res && (res as any).headersSent)) {
                  try {
                    (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                    (res as any).end(JSON.stringify({ detail: 'stale socket reset – retrying' }));
                  } catch { /* already committed */ }
                  return;
                }
              });
            },
          },
          '/ws': {
            target: 'wss://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
            ws: true,
            agent: keepAliveHttpsAgent,
          },
        },
      },
      plugins: [react(), stripMonacoSourcemaps],
      define: {
        __BUILD_TIME__: JSON.stringify(buildTime),
        __CHIMERA_BUILD_VERSION__: JSON.stringify(buildVersion),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
