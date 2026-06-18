import React from 'react';

import { cx } from '../../utils/cx';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  invalid?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, prefix, suffix, className, ...rest },
  ref,
) {
  const inputClass = cx(
    'form-input',
    invalid && 'border-state-danger-border',
    prefix && 'pl-9',
    suffix && 'pr-9',
    className,
  );

  if (!prefix && !suffix) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={inputClass} {...rest} />;
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted">
          {prefix}
        </span>
      )}
      <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputClass, 'w-full')} {...rest} />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-text-muted">{suffix}</span>
      )}
    </div>
  );
});
