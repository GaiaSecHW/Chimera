import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import { cx } from '../../utils/cx';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: 'md' | 'xl';
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  size = 'md',
  title,
  description,
  footer,
  closeOnOverlay = true,
  closeOnEsc = true,
  children,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const nodes = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeOnEsc, onClose],
  );

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    const focusTimer = window.setTimeout(() => {
      const node = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (node ?? containerRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      previousActiveRef.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        tabIndex={-1}
        className={cx('modal-container', size === 'xl' ? 'modal-xl' : 'modal-md', 'outline-none', className)}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-theme-border p-5">
            <div className="min-w-0">
              {title && (
                <h3 id={labelId} className="text-lg font-semibold text-theme-text-primary">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-sm text-theme-text-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="btn-icon shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-theme-border p-4">{footer}</div>
        )}
      </div>
    </div>
  );
};
