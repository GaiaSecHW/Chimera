import http from 'http';
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
    return {
      // Use an absolute base in dev so HMR/module requests stay rooted at the
      // Vite server, while production builds keep relative assets for static hosting.
      base: mode === 'development' ? '/' : './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
        proxy: {
          '/api/app/kernel-scan': {
            target: 'http://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
          },
          '/api': {
            target: 'http://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
            ws: true,
            // keepAlive:true keeps sockets in a pool instead of destroying
            // them after each request. keepAlive:false caused Node to destroy
            // the socket immediately after each response; on Windows the OS
            // then sends TCP RST to Nginx, Nginx echoes RST back, and
            // Node fires ECONNRESET -> Vite returns empty 500 -> ERR_ABORTED.
            agent: new http.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 3000 }),
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
            target: 'ws://secflow.ai.icsl.huawei.com',
            changeOrigin: true,
            secure: false,
            ws: true,
          },
        },
      },
      plugins: [react(), stripMonacoSourcemaps],
      define: {
        __BUILD_TIME__: JSON.stringify(buildTime),
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
