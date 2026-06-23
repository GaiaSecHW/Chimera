import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

interface NoticeState {
  title: string;
  message: string;
  level: NoticeLevel;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface PromptState {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText: string;
  cancelText: string;
  resolve: (value: string | null) => void;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

const noticeStyles: Record<NoticeLevel, { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'bg-blue-500/15 border-blue-500/20 text-blue-400 shadow-panel',
    icon: <Info size={16} className="text-blue-400" />,
  },
  success: {
    box: 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400 shadow-panel',
    icon: <CheckCircle2 size={16} className="text-emerald-400" />,
  },
  warning: {
    box: 'bg-amber-500/15 border-amber-500/20 text-amber-400 shadow-panel',
    icon: <AlertTriangle size={16} className="text-amber-400" />,
  },
  error: {
    box: 'bg-rose-500/15 border-rose-500/20 text-rose-400 shadow-panel',
    icon: <AlertTriangle size={16} className="text-rose-400" />,
  },
};

export const useUiFeedback = () => {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((
    message: string,
    level: NoticeLevel = 'info',
    title = level === 'success' ? '操作成功' : level === 'error' ? '操作失败' : '提示'
  ) => {
    setNotice({ title, message, level });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({
        title: options.title || '请确认',
        message: options.message,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        danger: !!options.danger,
        resolve,
      });
    }), []);

  const prompt = useCallback((options: PromptOptions) =>
    new Promise<string | null>((resolve) => {
      setPromptValue(options.defaultValue || '');
      setPromptState({
        title: options.title || '请输入',
        message: options.message,
        placeholder: options.placeholder,
        defaultValue: options.defaultValue,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        resolve,
      });
    }), []);

  const feedbackNodes = useMemo(
    () => (
      <>
        {notice && (
          <div className="fixed top-6 right-6 z-[99990] animate-in slide-in-from-top-2 duration-200">
            <div className={`w-[380px] max-w-[90vw] border rounded-2xl shadow-xl px-4 py-3 ${noticeStyles[notice.level].box}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{noticeStyles[notice.level].icon}</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-widest uppercase">{notice.title}</p>
                  <p className="text-sm font-semibold mt-1 leading-relaxed break-words">{notice.message}</p>
                </div>
                <button
                  onClick={() => setNotice(null)}
                  className="ml-auto p-1 rounded-lg hover:bg-theme-elevated/50 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmState && (
          <div className="fixed inset-0 z-[270] bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-lg bg-theme-surface rounded-3xl border border-theme-border shadow-section overflow-hidden">
              <div className="p-7 border-b border-theme-border">
                <p className="text-[10px] font-semibold tracking-widest text-theme-text-faint uppercase">确认操作</p>
                <h3 className="text-2xl font-semibold text-theme-text-primary mt-2">{confirmState.title}</h3>
                <p className="text-sm text-theme-text-secondary mt-3 leading-relaxed whitespace-pre-wrap">{confirmState.message}</p>
              </div>
              <div className="p-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    confirmState.resolve(false);
                    setConfirmState(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-theme-elevated text-theme-text-secondary font-bold hover:bg-theme-surface transition-all"
                >
                  {confirmState.cancelText}
                </button>
                <button
                  onClick={() => {
                    confirmState.resolve(true);
                    setConfirmState(null);
                  }}
                  className={`px-5 py-2.5 rounded-xl text-theme-text-inverse font-bold transition-all ${
                    confirmState.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmState.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}

        {promptState && (
          <div className="fixed inset-0 z-[270] bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-lg bg-theme-surface rounded-3xl border border-theme-border shadow-section overflow-hidden">
              <div className="p-7 border-b border-theme-border">
                <p className="text-[10px] font-semibold tracking-widest text-theme-text-faint uppercase">输入信息</p>
                <h3 className="text-2xl font-semibold text-theme-text-primary mt-2">{promptState.title}</h3>
                <p className="text-sm text-theme-text-secondary mt-3 leading-relaxed whitespace-pre-wrap">{promptState.message}</p>
                <input
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={promptState.placeholder}
                  className="form-input mt-4 w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      promptState.resolve(promptValue);
                      setPromptState(null);
                    }
                  }}
                />
              </div>
              <div className="p-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    promptState.resolve(null);
                    setPromptState(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-theme-elevated text-theme-text-secondary font-bold hover:bg-theme-surface transition-all"
                >
                  {promptState.cancelText}
                </button>
                <button
                  onClick={() => {
                    promptState.resolve(promptValue);
                    setPromptState(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
                >
                  {promptState.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    ),
    [notice, confirmState, promptState, promptValue]
  );

  return {
    notify,
    confirm,
    prompt,
    feedbackNodes,
  };
};
