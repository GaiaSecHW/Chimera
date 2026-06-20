/**
 * SecOcto 展示层格式化助手 — 与领域无关的纯函数。
 *
 * 与 CompilePage 内部那套(YYYY-MM-DD HH:mm:ss + '—' 占位)语义不同:
 *  - 此处面向"密集表格 / 统计卡"场景:时间用紧凑 MM-DD HH:mm,
 *    数字千分位且 null 视作 0(统计卡里 0 比 '—' 更合适)。
 * 如果后续有统一收口需求再合并,目前两套都保留。
 */

export const fmtTimeCompact = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const fmtCount = (n: number | null | undefined): string => {
  if (n == null) return '0';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * 任务时长 — 输入两个 ISO 时间戳,输出 "Xh Ym" 或 "Xm";
 * 任一缺失/时长非正 返回 '—'。与 secocto-ui overview.js _fmtDuration 等价。
 */
export const fmtDuration = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!isFinite(ms) || ms <= 0) return '—';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * 相对时间 "5 分钟前" — 与 secocto-ui gate.js timeAgo 完全对齐。
 * 兼容 number(秒级 unix 时间戳 < 1e12 视为秒)+ ISO 字符串。
 * null/无法解析 → '—'。
 */
export const fmtTimeAgo = (value: string | number | null | undefined): string => {
  if (value == null || value === '') return '—';
  let ts: number;
  if (typeof value === 'number') {
    ts = value < 1e12 ? value * 1000 : value;
  } else {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    ts = d.getTime();
  }
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0) return '刚刚';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
};

/* ===================== 字符串拆分(memory 字段用) ===================== */

/**
 * memory.keywords 是逗号/分号(中英文)分隔的字符串,拆成数组。
 * 与 secocto-ui memories.js _splitKeywords 等价。
 */
export const splitKeywords = (s: string | null | undefined): string[] => {
  if (s == null) return [];
  return String(s).split(/[,，;;]\s*/).map((t) => t.trim()).filter(Boolean);
};

/**
 * memory.sources 比 keywords 多兼容空白分隔(URL 来源场景)。
 * 与 secocto-ui memories.js _splitSources 等价。
 */
export const splitSources = (s: string | null | undefined): string[] => {
  if (s == null) return [];
  return String(s).split(/[,，;\s]+/).map((t) => t.trim()).filter(Boolean);
};
