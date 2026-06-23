
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { installGlobalGetRequestDedupe } from './clients/base';
import { ensureLocalMonaco } from './utils/monaco';
import { ThemeProvider } from './theme/ThemeProvider';

try {
  ensureLocalMonaco();
} catch (error) {
  console.error('[bootstrap] Failed to initialize Monaco', error);
}

installGlobalGetRequestDedupe();

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unknown error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 px-4">
          <div className="max-w-xl w-full rounded-2xl bg-white border border-rose-200 p-6 shadow-sm">
            <div className="text-lg font-bold text-rose-700">页面加载失败</div>
            <div className="mt-2 text-sm text-theme-text-secondary">
              前端发生运行时错误，请刷新页面重试；如仍失败，请将下方错误信息反馈给管理员。
            </div>
            <pre className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3 overflow-auto">
              {this.state.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
