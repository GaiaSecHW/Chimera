import { fileserverApi, FileserverUploadProgress, ProjectInputUploadAcceptedResponse } from '../clients/fileserver';
import { trackUploadTask } from './uploadCenter';

type InputType = 'document' | 'code' | 'software' | 'other';

interface BaseTrackedUploadParams {
  projectId: string;
  keepOriginal?: boolean;
  uploadMode?: 'raw' | 'archive';
  files: File[];
  displayName?: string;
  externalSignal?: AbortSignal;
  onProgress?: (progress: FileserverUploadProgress) => void;
}

interface CreateTrackedUploadParams extends BaseTrackedUploadParams {
  inputType: InputType;
}

interface AppendTrackedUploadParams extends BaseTrackedUploadParams {
  uploadId: string;
}

const INPUT_TYPE_LABEL: Record<InputType, string> = {
  document: '文档',
  code: '代码',
  software: '软件包',
  other: '其他',
};

const TERMINAL_SUCCESS = new Set(['succeeded', 'partial_failed']);
const TERMINAL_FAILED = new Set(['failed', 'error', 'cancelled']);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const buildTaskName = (displayName: string | undefined, files: File[]) => {
  const normalized = String(displayName || '').trim();
  if (normalized) return normalized;
  if (files.length === 1) return files[0].name || 'upload';
  const first = files[0]?.name || 'upload';
  return `${first} 等 ${files.length} 个文件`;
};

const waitForUploadProcessed = async (uploadId: string) => {
  const maxAttempts = 120;
  for (let idx = 0; idx < maxAttempts; idx += 1) {
    const detail = await fileserverApi.getProjectInputUploadDetail(uploadId);
    const status = String(detail?.status || '').toLowerCase();
    if (TERMINAL_SUCCESS.has(status)) {
      return detail;
    }
    if (TERMINAL_FAILED.has(status)) {
      throw new Error(detail?.last_error || '服务器处理上传文件失败');
    }
    await sleep(2000);
  }
  throw new Error('服务器处理上传文件超时，请稍后刷新上传记录查看结果');
};

const withProgress = (
  handler: ((progress: FileserverUploadProgress) => void) | undefined,
  tracker: (progress: FileserverUploadProgress) => void,
) => {
  return (progress: FileserverUploadProgress) => {
    handler?.(progress);
    tracker(progress);
  };
};

export const createTrackedProjectInputUpload = async (
  params: CreateTrackedUploadParams,
): Promise<ProjectInputUploadAcceptedResponse> => {
  const totalSize = params.files.reduce((sum, file) => sum + (file.size || 0), 0);
  return trackUploadTask({
    source: `${INPUT_TYPE_LABEL[params.inputType]}测试对象上传`,
    name: buildTaskName(params.displayName, params.files),
    size: totalSize,
    externalSignal: params.externalSignal,
    run: ({ signal, onProgress }) =>
      fileserverApi.createProjectInputUpload(
        {
          project_id: params.projectId,
          input_type: params.inputType,
          keep_original: params.keepOriginal,
          upload_mode: params.uploadMode,
          files: params.files,
        },
        {
          signal,
          trackGlobal: false,
          onProgress: withProgress(params.onProgress, onProgress),
        },
      ),
    postProcess: async (result) => {
      if (result?.upload_id && String(params.displayName || '').trim()) {
        await fileserverApi.updateProjectInputUploadDisplayName({
          upload_id: result.upload_id,
          project_id: params.projectId,
          display_name: String(params.displayName || '').trim(),
        });
      }
      if (result?.upload_id) {
        await waitForUploadProcessed(result.upload_id);
      }
    },
  });
};

export const appendTrackedProjectInputUpload = async (
  params: AppendTrackedUploadParams,
): Promise<ProjectInputUploadAcceptedResponse> => {
  const totalSize = params.files.reduce((sum, file) => sum + (file.size || 0), 0);
  return trackUploadTask({
    source: '测试对象追加上传',
    name: buildTaskName(params.displayName, params.files),
    size: totalSize,
    externalSignal: params.externalSignal,
    run: ({ signal, onProgress }) =>
      fileserverApi.appendProjectInputUpload(
        {
          upload_id: params.uploadId,
          keep_original: params.keepOriginal,
          upload_mode: params.uploadMode,
          files: params.files,
        },
        {
          signal,
          trackGlobal: false,
          onProgress: withProgress(params.onProgress, onProgress),
        },
      ),
    postProcess: async (result) => {
      const uploadId = result?.upload_id || params.uploadId;
      await waitForUploadProcessed(uploadId);
    },
  });
};
