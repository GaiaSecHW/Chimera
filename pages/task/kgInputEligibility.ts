import { api } from '../../clients/api';
import {
  USABLE_UPLOAD_STATUSES,
  buildCodemapTaskId,
} from '../../clients/codemapManager';
import type {
  CodemapAuditSources,
  CodemapTaskStatus,
} from '../../clients/codemapManager';
import type { ProjectInputUploadRecord } from '../../types/types';

export type KgInputEligibilityReasonCode =
  | 'ok'
  | 'upload_not_ready'
  | 'entry_analysis_unavailable'
  | 'entry_analysis_running'
  | 'entry_analysis_failed'
  | 'entry_analysis_not_ready'
  | 'entry_analysis_empty';

export interface KgInputEligibility {
  uploadId: string;
  allowed: boolean;
  reasonCode: KgInputEligibilityReasonCode;
  reasonText: string;
  uploadStatus: string;
  codemapTaskStatus: string | null;
  graphStatus: string | null;
  attackStatus: string | null;
  attackEntries: number | null;
  dbName: string | null;
}

const REASON_TEXT: Record<KgInputEligibilityReasonCode, string> = {
  ok: '已识别到可用入口',
  upload_not_ready: '上传记录尚未处理完成，暂不可用于知识图谱漏洞挖掘',
  entry_analysis_unavailable: '当前无法获取入口分析结果',
  entry_analysis_running: '入口分析仍在进行中',
  entry_analysis_failed: '入口分析失败且未识别到可用入口',
  entry_analysis_not_ready: '入口分析尚未完成',
  entry_analysis_empty: '入口分析已完成，但未识别到可用入口',
};

const CONCURRENCY = 4;

const makeEligibility = (
  record: ProjectInputUploadRecord,
  overrides: Partial<KgInputEligibility>,
): KgInputEligibility => ({
  uploadId: record.upload_id,
  allowed: false,
  reasonCode: 'entry_analysis_unavailable',
  reasonText: REASON_TEXT.entry_analysis_unavailable,
  uploadStatus: String(record.status || ''),
  codemapTaskStatus: null,
  graphStatus: null,
  attackStatus: null,
  attackEntries: null,
  dbName: null,
  ...overrides,
});

const fetchTaskStatus = async (uploadId: string): Promise<CodemapTaskStatus | null> => {
  try {
    return await api.codemapManager.getTaskStatus(buildCodemapTaskId(uploadId));
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
};

const fetchAuditSources = async (uploadId: string): Promise<CodemapAuditSources | null> => {
  try {
    return await api.codemapManager.getAuditSources(uploadId);
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const buildKgInputEligibility = async (
  record: ProjectInputUploadRecord,
): Promise<KgInputEligibility> => {
  if (String(record.input_type || '').trim().toLowerCase() !== 'code') {
    return makeEligibility(record, {
      reasonCode: 'entry_analysis_unavailable',
      reasonText: REASON_TEXT.entry_analysis_unavailable,
    });
  }
  if (!USABLE_UPLOAD_STATUSES.has(record.status)) {
    return makeEligibility(record, {
      reasonCode: 'upload_not_ready',
      reasonText: REASON_TEXT.upload_not_ready,
    });
  }

  const task = await fetchTaskStatus(record.upload_id);
  if (!task) {
    return makeEligibility(record, {
      reasonCode: 'entry_analysis_unavailable',
      reasonText: REASON_TEXT.entry_analysis_unavailable,
    });
  }

  const taskStatus = String(task.status || '').trim() || null;
  const attackStatus = task.attack?.status ? String(task.attack.status).trim() : null;
  const dbName = task.db_name ? String(task.db_name).trim() : null;

  const audit = await fetchAuditSources(record.upload_id);
  if (!audit) {
    return makeEligibility(record, {
      codemapTaskStatus: taskStatus,
      attackStatus,
      dbName,
      reasonCode: 'entry_analysis_unavailable',
      reasonText: REASON_TEXT.entry_analysis_unavailable,
    });
  }

  const graphStatus = audit.graph_status ? String(audit.graph_status).trim() : null;
  const attackEntries = Number(audit.analysis?.attack_entries ?? 0);

  if (attackEntries > 0) {
    return makeEligibility(record, {
      allowed: true,
      reasonCode: 'ok',
      reasonText: REASON_TEXT.ok,
      codemapTaskStatus: taskStatus,
      graphStatus,
      attackStatus,
      attackEntries,
      dbName,
    });
  }

  if (attackStatus === 'running') {
    return makeEligibility(record, {
      codemapTaskStatus: taskStatus,
      graphStatus,
      attackStatus,
      attackEntries,
      dbName,
      reasonCode: 'entry_analysis_running',
      reasonText: REASON_TEXT.entry_analysis_running,
    });
  }
  if (attackStatus === 'failed') {
    return makeEligibility(record, {
      codemapTaskStatus: taskStatus,
      graphStatus,
      attackStatus,
      attackEntries,
      dbName,
      reasonCode: 'entry_analysis_failed',
      reasonText: REASON_TEXT.entry_analysis_failed,
    });
  }
  if (attackStatus !== 'ok') {
    return makeEligibility(record, {
      codemapTaskStatus: taskStatus,
      graphStatus,
      attackStatus,
      attackEntries,
      dbName,
      reasonCode: 'entry_analysis_not_ready',
      reasonText: REASON_TEXT.entry_analysis_not_ready,
    });
  }
  if (attackEntries <= 0) {
    return makeEligibility(record, {
      codemapTaskStatus: taskStatus,
      graphStatus,
      attackStatus,
      attackEntries,
      dbName,
      reasonCode: 'entry_analysis_empty',
      reasonText: REASON_TEXT.entry_analysis_empty,
    });
  }

  return makeEligibility(record, {
    codemapTaskStatus: taskStatus,
    graphStatus,
    attackStatus,
    attackEntries,
    dbName,
  });
};

export const loadKgInputEligibility = async (
  records: ProjectInputUploadRecord[],
): Promise<Record<string, KgInputEligibility>> => {
  const codeRecords = records.filter((record) => String(record.input_type || '').trim().toLowerCase() === 'code');
  const result: Record<string, KgInputEligibility> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < codeRecords.length) {
      const currentIndex = cursor;
      cursor += 1;
      const record = codeRecords[currentIndex];
      result[record.upload_id] = await buildKgInputEligibility(record);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, codeRecords.length || 1) }, () => worker()));
  return result;
};
