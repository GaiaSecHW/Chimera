import type { ProjectInputUploadRecord } from '../../types/types.ts';

export const ALLOWED_ARCHIVE_SUFFIXES = ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz'];

export const formatUploadBytes = (value?: number | null) => {
  const size = Number(value || 0);
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = size;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const isAllowedArchiveFileName = (name: string) => {
  const lowered = (name || '').toLowerCase();
  return ALLOWED_ARCHIVE_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
};

export const getUploadModeLabel = (keepOriginal: boolean) => (keepOriginal ? '保留原始文件' : '解压导入');

export const getLatestBatchSummary = (record: ProjectInputUploadRecord) => {
  const batch = record.latest_batch;
  if (!batch) return '暂无批次信息';
  const modeLabel = batch.mode === 'append' ? '追加上传' : '首次上传';
  return `${modeLabel} · ${batch.submitted_file_count} 个压缩包`;
};

export const filterUploadRecords = (records: ProjectInputUploadRecord[], searchTerm: string) => {
  const keyword = searchTerm.trim().toLowerCase();
  if (!keyword) return records;
  return records.filter((record) => {
    const latestError = `${record.last_error || ''} ${record.latest_batch?.error_summary || ''}`.toLowerCase();
    return (
      record.upload_id.toLowerCase().includes(keyword) ||
      record.target_path.toLowerCase().includes(keyword) ||
      latestError.includes(keyword)
    );
  });
};
