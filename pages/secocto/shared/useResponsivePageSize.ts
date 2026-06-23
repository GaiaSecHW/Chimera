import { useEffect, useState } from 'react';

export interface ResponsivePageSizeBreakpoint {
  /** 完整的 media query 字符串(如 "(min-width: 1024px)" 或 "(min-height: 1100px)") */
  query: string;
  /** 命中该查询时使用的 pageSize */
  size: number;
}

export interface ResponsivePageSizeConfig {
  /** 按从"大屏 / 高视口优先"顺序排列,首个匹配命中 */
  breakpoints: ResponsivePageSizeBreakpoint[];
  /** 全部不匹配 / SSR / 不支持 matchMedia 时的回退 */
  fallback: number;
}

// Overview 页历史口径:按视口"高度"分档,选项 [5, 10, 20]
const OVERVIEW_DEFAULT: ResponsivePageSizeConfig = {
  breakpoints: [
    { query: '(min-height: 1100px)', size: 20 },
    { query: '(min-height: 750px)', size: 10 },
  ],
  fallback: 5,
};

function computeResponsivePageSize(config: ResponsivePageSizeConfig): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return config.fallback;
  }
  for (const bp of config.breakpoints) {
    if (window.matchMedia(bp.query).matches) return bp.size;
  }
  return config.fallback;
}

export function getInitialResponsivePageSize(config: ResponsivePageSizeConfig = OVERVIEW_DEFAULT): number {
  return computeResponsivePageSize(config);
}

export function useResponsivePageSize(config: ResponsivePageSizeConfig = OVERVIEW_DEFAULT): number {
  const [size, setSize] = useState<number>(() => computeResponsivePageSize(config));

  // 直接展开 query 字符串作为依赖键,避免外部传匿名 config 触发 effect 死循环
  const depKey = config.breakpoints.map((b) => `${b.query}=${b.size}`).join('|') + `~${config.fallback}`;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mqls = config.breakpoints.map((bp) => window.matchMedia(bp.query));
    const onChange = () => {
      const next = computeResponsivePageSize(config);
      setSize((prev) => (prev === next ? prev : next));
    };
    mqls.forEach((m) => m.addEventListener('change', onChange));
    return () => {
      mqls.forEach((m) => m.removeEventListener('change', onChange));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return size;
}
