import React from 'react';
import { Search } from 'lucide-react';

import { Input } from '../../primitives/Input';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索…',
  onSubmit,
  className,
}) => (
  <Input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') onSubmit?.();
    }}
    placeholder={placeholder}
    prefix={<Search size={14} />}
    className={className}
  />
);
