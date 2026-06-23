import React from 'react';

import { cx } from '../../utils/cx';

export interface FormFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}) => (
  <div className={cx('flex flex-col gap-1', className)}>
    <label htmlFor={htmlFor} className="form-label">
      {label}
      {required && <span className="required"> *</span>}
      {hint && <span className="ml-2 font-normal text-theme-text-muted">{hint}</span>}
    </label>
    {children}
    {error && <p className="text-xs text-state-danger">{error}</p>}
  </div>
);
