import React from 'react';
import { Loader2 } from 'lucide-react';

import { cx } from '../../utils/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn-icon',
  danger: 'btn-danger-soft',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconOnly = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  if (process.env.NODE_ENV !== 'production' && iconOnly && !ariaLabel) {
    console.warn('[design-system] Button: iconOnly requires an aria-label for accessibility.');
  }

  const base = iconOnly ? 'btn-icon' : variantClass[variant];
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cx(
        base,
        size === 'sm' && !iconOnly && 'px-3 py-1.5 text-xs',
        fullWidth && 'w-full',
        isDisabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {!iconOnly && children}
    </button>
  );
});
