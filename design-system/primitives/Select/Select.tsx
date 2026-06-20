import React from 'react';

import { cx } from '../../utils/cx';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid = false, className, value, defaultValue, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      defaultValue={defaultValue ?? (placeholder && value === undefined ? '' : undefined)}
      aria-invalid={invalid || undefined}
      className={cx('form-select', invalid && 'border-state-danger-border', className)}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});
