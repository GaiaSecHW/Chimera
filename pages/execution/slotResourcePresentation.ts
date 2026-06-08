export function formatResourceCpu(millicores?: number | null): string {
  if (millicores == null || !Number.isFinite(millicores)) return '-';
  if (millicores >= 1000) {
    const cores = millicores / 1000;
    return `${cores.toFixed(Number.isInteger(cores) ? 0 : 2)} cores`;
  }
  return `${millicores}m`;
}

export function formatResourceBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}

export function formatResourceUsage(usage?: number | null, limit?: number | null, formatter?: (value?: number | null) => string): string {
  const render = formatter || ((value) => String(value ?? '-'));
  if (usage == null && limit == null) return '-';
  if (limit == null) return render(usage);
  return `${render(usage)} / ${render(limit)}`;
}

export function formatResourceRatio(usage?: number | null, limit?: number | null): string {
  if (usage == null || limit == null || !Number.isFinite(usage) || !Number.isFinite(limit) || limit <= 0) return '-';
  return `${Math.round((usage / limit) * 100)}%`;
}
