import React from 'react';

import { cx } from '../../utils/cx';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  padding?: CardPadding;
  as?: 'div' | 'section' | 'article';
}

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { padding = 'md', as = 'div', className, children, ...rest },
  ref,
) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={cx(
        'rounded-xl border border-theme-border bg-theme-surface',
        paddingClass[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});
