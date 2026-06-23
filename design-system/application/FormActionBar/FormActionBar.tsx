import React from 'react';

import { Button } from '../../primitives/Button';
import { cx } from '../../utils/cx';

export interface FormActionBarProps {
  saving?: boolean;
  saveText?: string;
  resetText?: string;
  onSave: () => void;
  onReset?: () => void;
  disabled?: boolean;
  extra?: React.ReactNode;
  className?: string;
}

export const FormActionBar: React.FC<FormActionBarProps> = ({
  saving = false,
  saveText = '保存',
  resetText = '重置',
  onSave,
  onReset,
  disabled = false,
  extra,
  className,
}) => (
  <div className={cx('flex items-center justify-end gap-2', className)}>
    {extra && <div className="mr-auto">{extra}</div>}
    {onReset && (
      <Button variant="secondary" onClick={onReset} disabled={saving}>
        {resetText}
      </Button>
    )}
    <Button variant="primary" onClick={onSave} loading={saving} disabled={disabled}>
      {saveText}
    </Button>
  </div>
);
