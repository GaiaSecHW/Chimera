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
            // keepAlive:false prevents stale-socket 502s on long-idle connections.
            agent: new http.Agent({ keepAlive: false }),
            // Nginx resets the TCP connection after sending a complete response
            // (RST instead of FIN). Node's http-proxy emits 'error' ECONNRESET
            // and Vite returns 500 to the browser even though the full response
            // was already forwarded.  Swallow ECONNRESET when headers were
            // already sent so the browser receives the real status + body.
            configure: (proxy) => {
              proxy.on('error', (err: Error & { code?: string }, _req, res) => {
                if (err.code === 'ECONNRESET') {
                  // response was fully forwarded – nothing left to do
                  return;
                }
                // for genuine errors, surface a JSON 502 if possible
                if (res && 'headersSent' in res && !(res as any).headersSent) {
                  (res as any).writeHead(502, { 'Content-Type': 'application/json' });
                  (res as any).end(JSON.stringify({ detail: `proxy error: ${err.message}` }));
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
