import React, { useState } from 'react';
import { X } from 'lucide-react';

interface VulnVerifyV2RightDrawerProps {
  open?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  ariaLabel: string;
  onClose: () => void;
  scrollRef?: React.Ref<HTMLDivElement>;
  widthClassName?: string;
  bodyClassName?: string;
}

const HEADER_SHADOW = 'shadow-[0_10px_24px_-22px_rgba(15,23,42,0.55)] dark:shadow-[0_10px_24px_-22px_rgba(0,0,0,0.75)]';

export const VulnVerifyV2RightDrawer: React.FC<VulnVerifyV2RightDrawerProps> = ({
  open = true,
  title,
  subtitle,
  actions,
  children,
  ariaLabel,
  onClose,
  scrollRef,
  widthClassName = 'max-w-[1080px] xl:w-[62vw] 2xl:max-w-[1180px]',
  bodyClassName = 'space-y-5 pt-5',
}) => {
  const [headerElevated, setHeaderElevated] = useState(false);

  const motionClass = open ? 'duration-300 ease-out' : 'duration-[250ms] ease-in';

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity ${motionClass} ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full transform flex-col overflow-visible border-l border-theme-border bg-theme-bg-app shadow-2xl transition-transform ${motionClass} ${widthClassName} ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div
          ref={scrollRef}
          onScroll={(event) => setHeaderElevated(event.currentTarget.scrollTop > 4)}
          className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-0 lg:px-10 lg:pb-10"
        >
          <div className={`sticky top-0 z-10 -mx-8 flex items-start justify-between gap-4 bg-theme-bg-app px-8 pb-2 pt-8 transition-shadow lg:-mx-10 lg:px-10 lg:pt-10 ${headerElevated ? HEADER_SHADOW : 'shadow-none'}`}>
            <div className="min-w-0 space-y-1">
              <div className="text-lg font-bold leading-6 text-theme-text-primary">{title}</div>
              {subtitle ? <div className="truncate text-xs text-theme-text-muted" title={typeof subtitle === 'string' ? subtitle : undefined}>{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <button
                type="button"
                onClick={onClose}
                aria-label={`关闭${ariaLabel}`}
                title={`关闭${ariaLabel}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary"
              >
                <X size={16} strokeWidth={2.1} />
              </button>
            </div>
          </div>
          <div className={bodyClassName}>{children}</div>
        </div>
      </aside>
    </div>
  );
};
