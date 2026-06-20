import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, MessageSquareQuote } from 'lucide-react';

type DialogKind = 'alert' | 'confirm' | 'prompt';

interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
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

type DialogRequest =
  | ({ kind: 'alert'; resolve: () => void } & Required<Pick<AlertOptions, 'message'>> & Omit<AlertOptions, 'message'>)
  | ({ kind: 'confirm'; resolve: (ok: boolean) => void } & Required<Pick<ConfirmOptions, 'message'>> & Omit<ConfirmOptions, 'message'>)
  | ({ kind: 'prompt'; resolve: (value: string | null) => void } & Required<Pick<PromptOptions, 'message'>> & Omit<PromptOptions, 'message'>);

interface DialogController {
  enqueue: (request: DialogRequest) => void;
}

let dialogController: DialogController | null = null;

const enqueueDialog = (request: DialogRequest) => {
  if (dialogController) {
    dialogController.enqueue(request);
    return;
  }
  if (request.kind === 'alert') {
    window.alert(request.message);
    request.resolve();
    return;
  }
  if (request.kind === 'confirm') {
    request.resolve(window.confirm(request.message));
    return;
  }
  request.resolve(window.prompt(request.message, request.defaultValue || '') ?? null);
};

export const showAlert = (options: string | AlertOptions) =>
  new Promise<void>((resolve) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    enqueueDialog({
      kind: 'alert',
      title: normalized.title || '提示信息',
      message: normalized.message,
      confirmText: normalized.confirmText || '知道了',
      tone: normalized.tone || 'info',
      resolve,
    });
  });

export const showConfirm = (options: string | ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    enqueueDialog({
      kind: 'confirm',
      title: normalized.title || '请确认操作',
      message: normalized.message,
      confirmText: normalized.confirmText || '确认',
      cancelText: normalized.cancelText || '取消',
      danger: !!normalized.danger,
      resolve,
    });
  });

export const showPrompt = (options: string | PromptOptions) =>
  new Promise<string | null>((resolve) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    enqueueDialog({
      kind: 'prompt',
      title: normalized.title || '请输入',
      message: normalized.message,
      placeholder: normalized.placeholder,
      defaultValue: normalized.defaultValue || '',
      confirmText: normalized.confirmText || '确认',
      cancelText: normalized.cancelText || '取消',
      resolve,
    });
  });

const alertStyles = {
  info: {
    icon: <BellRing size={20} className="text-sky-400" />,
    chip: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    button: 'bg-sky-600 hover:bg-sky-700',
  },
  success: {
    icon: <CheckCircle2 size={20} className="text-emerald-400" />,
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    button: 'bg-emerald-600 hover:bg-emerald-700',
  },
  warning: {
    icon: <AlertTriangle size={20} className="text-amber-400" />,
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  error: {
    icon: <AlertTriangle size={20} className="text-rose-400" />,
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    button: 'bg-rose-600 hover:bg-rose-700',
  },
} as const;

export const DialogViewport: React.FC = () => {
  const queueRef = useRef<DialogRequest[]>([]);
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    const flush = () => {
      setActive((current) => current || queueRef.current.shift() || null);
    };
    dialogController = {
      enqueue: (request) => {
        queueRef.current.push(request);
        flush();
      },
    };
    return () => {
      dialogController = null;
    };
  }, []);

  useEffect(() => {
    if (active?.kind === 'prompt') {
      setPromptValue(active.defaultValue || '');
    }
  }, [active]);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      void showAlert({
        title: '系统提示',
        message: typeof message === 'string' ? message : JSON.stringify(message ?? ''),
      });
    };
    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  const closeAndContinue = () => {
    setActive(queueRef.current.shift() || null);
  };

  const closeAlert = () => {
    if (!active || active.kind !== 'alert') return;
    active.resolve();
    closeAndContinue();
  };

  const resolveConfirm = (ok: boolean) => {
    if (!active || active.kind !== 'confirm') return;
    active.resolve(ok);
    closeAndContinue();
  };

  const resolvePrompt = (value: string | null) => {
    if (!active || active.kind !== 'prompt') return;
    active.resolve(value);
    closeAndContinue();
  };

  const shell = useMemo(() => {
    if (!active) return null;
    const tone = active.kind === 'alert' ? active.tone || 'info' : active.kind === 'confirm' && active.danger ? 'error' : 'info';
    const style = alertStyles[tone];
    return (
      <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-6">
        <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-theme-border bg-theme-surface shadow-[0_30px_120px_rgba(15,23,42,0.32)] animate-in fade-in zoom-in-95 duration-200">
          <div className="border-b border-theme-border px-8 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-theme-elevated shadow-sm ring-1 ring-theme-border">
                {active.kind === 'prompt' ? <MessageSquareQuote size={20} className="text-violet-400" /> : style.icon}
              </div>
              <div>
                <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${style.chip}`}>
                  {active.kind === 'alert' ? 'Notice' : active.kind === 'confirm' ? 'Confirm' : 'Input'}
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-theme-text-primary">{active.title}</h3>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-sm font-medium leading-7 text-theme-text-secondary">{active.message}</p>
            {active.kind === 'prompt' && (
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder={active.placeholder}
                className="mt-6 w-full rounded-2xl border border-theme-border bg-theme-elevated px-5 py-4 text-sm font-semibold text-theme-text-primary outline-none ring-0 transition-all focus:border-violet-300 focus:shadow-[0_0_0_4px_rgba(139,92,246,0.08)]"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') resolvePrompt(null);
                  if (event.key === 'Enter') resolvePrompt(promptValue.trim());
                }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 bg-theme-surface/75 px-8 py-6">
            {active.kind === 'alert' ? (
              <button
                onClick={closeAlert}
                className={`rounded-2xl px-5 py-3 text-sm font-medium text-white transition-all ${style.button}`}
              >
                {active.confirmText}
              </button>
            ) : active.kind === 'confirm' ? (
              <>
                <button
                  onClick={() => resolveConfirm(false)}
                  className="rounded-2xl bg-theme-elevated px-5 py-3 text-sm font-medium text-theme-text-primary transition-all hover:bg-theme-surface"
                >
                  {active.cancelText}
                </button>
                <button
                  onClick={() => resolveConfirm(true)}
                  className={`rounded-2xl px-5 py-3 text-sm font-medium text-white transition-all ${active.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'}`}
                >
                  {active.confirmText}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => resolvePrompt(null)}
                  className="rounded-2xl bg-theme-elevated px-5 py-3 text-sm font-medium text-theme-text-primary transition-all hover:bg-theme-surface"
                >
                  {active.cancelText}
                </button>
                <button
                  onClick={() => resolvePrompt(promptValue.trim())}
                  className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-violet-700"
                >
                  {active.confirmText}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }, [active, promptValue]);

  return shell;
};
