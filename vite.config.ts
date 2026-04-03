import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildTime = env.BUILD_TIME || new Date().toISOString().replace('T', ' ').slice(0, 19);
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://secflow.sothothv2.com',
            changeOrigin: true,
            secure: false,
            ws: true,
          },
        },
      },
      plugins: [react()],
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
