import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 底部 footer 区 — 通常放确认/取消按钮 */
  footer?: React.ReactNode;
  /** Tailwind max-w 类,默认 max-w-lg */
  maxWidth?: string;
}

/**
 * SecOcto 子页通用 Modal — 与 MemoriesPage 卡片 modal 等价的体验:
 *  - 背景模糊点击关闭
 *  - ESC 关闭
 *  - 打开时锁定 body 滚动
 *  - 右上角 X 按钮
 *  - 可选 footer 区(放确认/取消按钮)
 *
 * 用 Chimera theme tokens 上色,不引入新 design system。
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} mx-4 bg-theme-surface rounded-2xl border border-theme-border shadow-xl overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-theme-border">
          <h3 className="text-base font-semibold text-theme-text-primary truncate">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-theme-text-faint hover:text-theme-text-primary hover:bg-theme-bg-elevated transition-colors shrink-0"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto text-sm">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-theme-border bg-theme-bg-elevated/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
