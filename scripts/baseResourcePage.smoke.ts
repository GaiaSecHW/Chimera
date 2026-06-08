import assert from 'node:assert/strict';

import {
  ALLOWED_ARCHIVE_SUFFIXES,
  filterUploadRecords,
  formatUploadBytes,
  getLatestBatchSummary,
  getUploadModeLabel,
  isAllowedArchiveFileName,
} from '../pages/assets/baseResourcePageModel.ts';
import type { ProjectInputUploadRecord } from '../types/types.ts';

const sampleRecord: ProjectInputUploadRecord = {
  upload_id: 'upload-001',
  project_id: 'demo-project',
  input_type: 'code',
  status: 'partial_failed',
  keep_original: false,
  source_archive_count: 2,
  stored_file_count: 12,
  stored_total_size_bytes: 5 * 1024 * 1024,
  target_path: '/user_input/code/upload-001',
  last_error: 'skip invalid path: ../escape.txt',
  created_by: 'tester',
  created_at: '2026-06-08T08:00:00Z',
  updated_at: '2026-06-08T08:10:00Z',
  finished_at: '2026-06-08T08:10:00Z',
  latest_batch: {
    batch_id: 'batch-001',
    status: 'partial_failed',
    mode: 'append',
    keep_original: false,
    submitted_file_count: 2,
    processed_file_count: 12,
    processed_size_bytes: 5 * 1024 * 1024,
    error_summary: 'skip invalid path: ../escape.txt',
    created_at: '2026-06-08T08:00:00Z',
    finished_at: '2026-06-08T08:10:00Z',
  },
};

assert.equal(ALLOWED_ARCHIVE_SUFFIXES.includes('.zip'), true);
assert.equal(isAllowedArchiveFileName('firmware.tar.gz'), true);
assert.equal(isAllowedArchiveFileName('bundle.7z'), false);

assert.equal(getUploadModeLabel(false), '解压导入');
assert.equal(getUploadModeLabel(true), '保留原始文件');

assert.equal(getLatestBatchSummary(sampleRecord), '追加上传 · 2 个压缩包');
assert.equal(getLatestBatchSummary({ ...sampleRecord, latest_batch: null }), '暂无批次信息');

assert.equal(formatUploadBytes(0), '0 B');
assert.equal(formatUploadBytes(1024), '1.0 KB');
assert.equal(formatUploadBytes(5 * 1024 * 1024), '5.0 MB');

const filteredById = filterUploadRecords([sampleRecord], 'upload-001');
assert.equal(filteredById.length, 1);

const filteredByPath = filterUploadRecords([sampleRecord], 'user_input/code');
assert.equal(filteredByPath.length, 1);

const filteredByError = filterUploadRecords([sampleRecord], 'escape');
assert.equal(filteredByError.length, 1);

const filteredMiss = filterUploadRecords([sampleRecord], 'no-match');
assert.equal(filteredMiss.length, 0);

console.log('baseResourcePage.smoke.ts passed');
