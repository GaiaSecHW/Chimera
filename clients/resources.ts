import { API_BASE, handleResponse, getHeaders, fetchWithRetry, xhrUpload, XhrUploadProgress } from './base';
import {
  ProjectResource,
  ProjectTask,
  ProjectPVC,
  OutputPvcDetail,
  PvcBrowserChildrenResponse,
  PvcBrowserFileResponse,
  PvcBrowserRootResponse,
} from '../types/types';
import { trackUploadTask } from '../services/uploadCenter';

export interface PvcFolderUploadProgress {
  phase: 'creating_directories' | 'uploading_files';
  processed: number;
  total: number;
  current?: string;
  uploaded_bytes?: number;
  total_bytes?: number;
  speed_bytes_per_sec?: number;
}

export interface PvcFolderUploadFailure {
  path: string;
  error: string;
}

export interface PvcUploadProgress {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

export interface PvcFolderUploadResult {
  total_files: number;
  processed_files: number;
  uploaded_files: number;
  failed_files: number;
  created_directories: number;
  skipped_directories: number;
  canceled: boolean;
  elapsed_ms: number;
  failures: PvcFolderUploadFailure[];
}

const normalizeBrowserPath = (value: string) => {
  const raw = (value || '/').trim();
  if (!raw || raw === '/') return '/';
  const parts = raw.split('/').filter(Boolean);
  return `/${parts.join('/')}`;
};

const joinBrowserPath = (parent: string, name: string) => {
  const normalizedParent = normalizeBrowserPath(parent);
  if (normalizedParent === '/') return `/${name}`;
  return `${normalizedParent}/${name}`;
};

const getRelativePath = (file: File): string => {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.trim()) return rel.trim();
  return file.name;
};

const toPvcUploadProgress = (event: XhrUploadProgress): PvcUploadProgress => ({
  loaded_bytes: event.loaded_bytes,
  total_bytes: event.total_bytes,
  speed_bytes_per_sec: event.speed_bytes_per_sec,
  elapsed_ms: event.elapsed_ms,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const GATEWAY_ACTIVATION_MAX_RETRIES = 18;
const GATEWAY_ACTIVATION_RETRY_DELAY_MS = 700;

const isGatewayActivatingError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    message.includes('file gateway worker unavailable') ||
    message.includes('connection refused') ||
    message.includes('server disconnected without sending a response') ||
    message.includes('upstream connect error') ||
    message.includes('bad gateway') ||
    message.includes('api error (502)') ||
    message.includes('api error (503)')
  );
};

const withGatewayActivationRetry = async <T>(runner: () => Promise<T>): Promise<T> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= GATEWAY_ACTIVATION_MAX_RETRIES; attempt += 1) {
    try {
      return await runner();
    } catch (error) {
      lastError = error;
      if (!isGatewayActivatingError(error) || attempt >= GATEWAY_ACTIVATION_MAX_RETRIES) {
        throw error;
      }
      await sleep(GATEWAY_ACTIVATION_RETRY_DELAY_MS);
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('PVC 文件网关启动失败'));
};

export const resourcesApi = {
  // Health Check
  getHealth: async (): Promise<{ status: string }> => {
    const response = await fetch(`${API_BASE}/api/resource/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // Resources
  list: async (projectId: string, type?: string): Promise<ProjectResource[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (type) params.append('resource_type', type);
    
    // 使用模板字符串拼接，避免 new URL 在 base 为空时报错
    const url = `${API_BASE}/api/resource/resources?${params.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });
    const data = await handleResponse(res);
    return data.resources || [];
  },

  upload: async (
    formData: FormData,
    options?: {
      onProgress?: (progress: PvcUploadProgress) => void;
      signal?: AbortSignal;
      trackGlobal?: boolean;
      sourceLabel?: string;
    }
  ): Promise<{ task_id: string; resource_uuid: string; message: string }> => {
    const headers = getHeaders();
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders['Content-Type'];
    const file = formData.get('file');
    const fileName = file instanceof File ? file.name : 'archive-upload';
    const fileSize = file instanceof File ? file.size : 0;
    const projectId = String(formData.get('project_ids') || '').trim();
    const shouldTrack = options?.trackGlobal !== false;

    const execute = async (params?: { signal?: AbortSignal; onProgress?: (progress: PvcUploadProgress) => void }) => {
      return xhrUpload<{ task_id: string; resource_uuid: string; message: string }>({
        url: `${API_BASE}/api/resource/resources/upload`,
        method: 'POST',
        headers: uploadHeaders,
        formData,
        signal: params?.signal ?? options?.signal,
        onProgress: (event) => {
          const progress = toPvcUploadProgress(event);
          options?.onProgress?.(progress);
          params?.onProgress?.(progress);
        },
      });
    };

    if (!shouldTrack) {
      return execute();
    }

    return trackUploadTask({
      source: options?.sourceLabel || '公共资源 ZIP 上传',
      name: fileName,
      size: fileSize,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
      postProcess: async (result) => {
        if (!result?.task_id || !projectId) return;
        const finalStates = new Set(['succeeded', 'failed', 'error', 'cancelled']);
        const maxRound = 90;
        for (let idx = 0; idx < maxRound; idx += 1) {
          const detail = await resourcesApi.getTaskDetail(result.task_id);
          const status = String(detail?.status || '').toLowerCase();
          if (finalStates.has(status)) {
            if (status === 'failed' || status === 'error' || status === 'cancelled') {
              throw new Error(detail?.error_message || detail?.message || '后端任务处理失败');
            }
            return;
          }
          await sleep(2000);
        }
        throw new Error('后端任务处理超时，请到任务管理页面查看');
      },
    });
  },

  getById: async (id: number): Promise<ProjectResource> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${id}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  delete: async (id: number) => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  downloadFile: (uuid: string) => {
    return `${API_BASE}/api/resource/resources/${uuid}/file?token=${localStorage.getItem('secflow_token')}`;
  },

  createOutputPvc: async (payload: { name: string; description?: string; project_id: string; pvc_size?: number }): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/resource/output-pvc`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getOutputPvcDetail: async (id: number): Promise<OutputPvcDetail> => {
    const response = await fetch(`${API_BASE}/api/resource/output-pvc/${id}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteOutputPvc: async (id: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/resource/output-pvc/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getTasks: async (projectId: string, params: { task_type?: string; status?: string } = {}): Promise<ProjectTask[]> => {
    const queryParams = new URLSearchParams({ project_id: projectId });
    if (params.task_type) queryParams.append('task_type', params.task_type);
    if (params.status) queryParams.append('status', params.status);
    
    const url = `${API_BASE}/api/resource/tasks?${queryParams.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });
    const data = await handleResponse(res);
    return data.tasks || [];
  },

  getTaskDetail: async (taskId: string): Promise<ProjectTask> => {
    const response = await fetch(`${API_BASE}/api/resource/tasks/${taskId}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getTaskLogs: async (taskId: string): Promise<{ task_id: string; logs: string[] }> => {
    const response = await fetch(`${API_BASE}/api/resource/tasks/${taskId}/logs`, { headers: getHeaders() });
    return handleResponse(response);
  },

  deleteTask: async (taskId: string) => {
    const response = await fetch(`${API_BASE}/api/resource/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getPVCs: async (projectId: string): Promise<{ pvcs: ProjectPVC[]; total: number }> => {
    const response = await fetch(`${API_BASE}/api/resource/pvcs?project_id=${projectId}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getPvcBrowserRoot: async (resourceId: number): Promise<PvcBrowserRootResponse> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${resourceId}/browser/root`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getPvcBrowserTree: async (resourceId: number): Promise<PvcBrowserRootResponse> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${resourceId}/browser/tree`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getPvcBrowserChildren: async (resourceId: number, path = '/'): Promise<PvcBrowserChildrenResponse> => {
    return withGatewayActivationRetry(async () => {
      const response = await fetchWithRetry(
        `${API_BASE}/api/resource/resources/${resourceId}/browser/children?path=${encodeURIComponent(path)}`,
        { headers: getHeaders() },
        { retries: 1, retryDelayMs: 300, retryOnStatus: [502, 503, 504] }
      );
      return handleResponse(response);
    });
  },

  getPvcBrowserFile: async (resourceId: number, path: string, maxBytes = 1048576): Promise<PvcBrowserFileResponse> => {
    return withGatewayActivationRetry(async () => {
      const response = await fetchWithRetry(
        `${API_BASE}/api/resource/resources/${resourceId}/browser/file?path=${encodeURIComponent(path)}&max_bytes=${maxBytes}`,
        { headers: getHeaders() },
        { retries: 1, retryDelayMs: 300, retryOnStatus: [502, 503, 504] }
      );
      return handleResponse(response);
    });
  },

  fetchPvcBrowserPreviewBlob: async (resourceId: number, path: string): Promise<Blob> => {
    return withGatewayActivationRetry(async () => {
      const response = await fetchWithRetry(
        `${API_BASE}/api/resource/resources/${resourceId}/browser/download?path=${encodeURIComponent(path)}`,
        { headers: getHeaders() },
        { retries: 1, retryDelayMs: 300, retryOnStatus: [502, 503, 504] }
      );
      if (!response.ok) {
        await handleResponse(response);
      }
      return response.blob();
    });
  },

  fetchPvcBrowserDownloadBlob: async (resourceId: number, path: string): Promise<Blob> => {
    return withGatewayActivationRetry(async () => {
      const response = await fetchWithRetry(
        `${API_BASE}/api/resource/resources/${resourceId}/browser/download?path=${encodeURIComponent(path)}`,
        { headers: getHeaders() },
        { retries: 1, retryDelayMs: 300, retryOnStatus: [502, 503, 504] }
      );
      if (!response.ok) {
        await handleResponse(response);
      }
      return response.blob();
    });
  },

  uploadPvcBrowserFile: async (
    resourceId: number,
    path: string,
    file: File,
    onProgressOrOptions?: ((progress: PvcUploadProgress) => void) | {
      onProgress?: (progress: PvcUploadProgress) => void;
      signal?: AbortSignal;
      trackGlobal?: boolean;
      sourceLabel?: string;
    }
  ): Promise<{ message: string; path: string; size: number }> => {
    const formData = new FormData();
    formData.append('path', path);
    formData.append('file', file);
    const headers = getHeaders();
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders['Content-Type'];
    const options = typeof onProgressOrOptions === 'function'
      ? { onProgress: onProgressOrOptions }
      : (onProgressOrOptions || {});
    const shouldTrack = options.trackGlobal !== false;
    const sourceLabel = options.sourceLabel || 'PVC 文件上传';
    const execute = async (params?: { signal?: AbortSignal; onProgress?: (progress: PvcUploadProgress) => void }) => {
      return xhrUpload<{ message: string; path: string; size: number }>({
        url: `${API_BASE}/api/resource/resources/${resourceId}/browser/upload`,
        method: 'POST',
        headers: uploadHeaders,
        formData,
        signal: params?.signal ?? options.signal,
        onProgress: (event) => {
          const progress = toPvcUploadProgress(event);
          options.onProgress?.(progress);
          params?.onProgress?.(progress);
        },
      });
    };
    if (!shouldTrack) return execute();
    return trackUploadTask({
      source: sourceLabel,
      name: file.name || 'pvc-file',
      size: file.size || 0,
      run: ({ signal, onProgress }) => execute({
        signal,
        onProgress,
      }),
    });
  },

  createPvcBrowserDirectory: async (resourceId: number, path: string, name: string): Promise<{ message: string; path: string }> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${resourceId}/browser/directories`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ path, name }),
    });
    return handleResponse(response);
  },

  renamePvcBrowserNode: async (resourceId: number, path: string, targetName: string): Promise<{ message: string; path: string }> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${resourceId}/browser/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ path, target_name: targetName }),
    });
    return handleResponse(response);
  },

  movePvcBrowserNode: async (resourceId: number, path: string, targetPath: string): Promise<{ message: string; path: string }> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${resourceId}/browser/move`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ path, target_path: targetPath }),
    });
    return handleResponse(response);
  },

  deletePvcBrowserNode: async (resourceId: number, path: string): Promise<{ message: string; path: string }> => {
    const response = await fetch(
      `${API_BASE}/api/resource/resources/${resourceId}/browser/node?path=${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );
    return handleResponse(response);
  },

  createManualPvc: async (payload: {
    name: string;
    description?: string;
    project_id: string;
    pvc_size?: number;
    resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
  }): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/pvc-manual`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getPvcResourceDetail: async (id: number): Promise<OutputPvcDetail> => {
    const response = await fetch(`${API_BASE}/api/resource/resources/${id}/pvc-detail`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  uploadPvcBrowserFolder: async (params: {
    resourceId: number;
    basePath: string;
    files: File[];
    onProgress?: (progress: PvcFolderUploadProgress) => void;
    shouldCancel?: () => boolean;
  }): Promise<PvcFolderUploadResult> => {
    const execute = async () => {
      const startedAt = Date.now();
      const basePath = normalizeBrowserPath(params.basePath || '/');
      const files = params.files || [];
      const failures: PvcFolderUploadFailure[] = [];
      let createdDirectories = 0;
      let skippedDirectories = 0;
      let uploadedFiles = 0;
      let processedFiles = 0;
      let canceled = false;
      const totalBytes = files.reduce((sum, item) => sum + (item.size || 0), 0);
      let uploadedBytesCompleted = 0;
      let activeFileLoaded = 0;
      let activeFileSpeed = 0;

      const directoryPaths = new Set<string>();
      const fileTargets = files.map((file) => {
        const relative = getRelativePath(file).replace(/^\/+/, '');
        const segments = relative.split('/').filter(Boolean);
        segments.pop();
        const relativeDir = segments.join('/');
        const targetDirectory = relativeDir ? joinBrowserPath(basePath, relativeDir) : basePath;
        if (relativeDir) {
          const pathSegments = relativeDir.split('/').filter(Boolean);
          let cursor = basePath;
          for (const segment of pathSegments) {
            cursor = joinBrowserPath(cursor, segment);
            directoryPaths.add(cursor);
          }
        }
        return {
          file,
          relative,
          targetDirectory,
        };
      });

      const orderedDirectories = Array.from(directoryPaths).sort((a, b) => {
        const depthA = a.split('/').filter(Boolean).length;
        const depthB = b.split('/').filter(Boolean).length;
        return depthA - depthB || a.localeCompare(b);
      });

      for (let i = 0; i < orderedDirectories.length; i += 1) {
        if (params.shouldCancel?.()) {
          canceled = true;
          break;
        }
        const fullPath = orderedDirectories[i];
        const normalized = normalizeBrowserPath(fullPath);
        const parent = normalized.includes('/') ? normalizeBrowserPath(normalized.substring(0, normalized.lastIndexOf('/')) || '/') : '/';
        const name = normalized.split('/').filter(Boolean).pop() || '';

        params.onProgress?.({
          phase: 'creating_directories',
          processed: i,
          total: orderedDirectories.length,
          current: fullPath,
        });

        try {
          await resourcesApi.createPvcBrowserDirectory(params.resourceId, parent, name);
          createdDirectories += 1;
        } catch (error: any) {
          const message = String(error?.message || error || '');
          if (message.includes('File exists') || message.includes('already exists')) {
            skippedDirectories += 1;
          } else {
            failures.push({ path: fullPath, error: message || '创建目录失败' });
          }
        }
      }

      for (let i = 0; i < fileTargets.length; i += 1) {
        if (params.shouldCancel?.()) {
          canceled = true;
          break;
        }
        const current = fileTargets[i];
        let currentFileLoaded = 0;
        let uploadSucceeded = false;
        params.onProgress?.({
          phase: 'uploading_files',
          processed: i,
          total: fileTargets.length,
          current: current.relative,
          uploaded_bytes: Math.max(0, uploadedBytesCompleted),
          total_bytes: totalBytes,
          speed_bytes_per_sec: activeFileSpeed,
        });
        try {
          await resourcesApi.uploadPvcBrowserFile(
            params.resourceId,
            current.targetDirectory,
            current.file,
            {
              onProgress: (progress) => {
                currentFileLoaded = Math.max(0, Math.min(progress.loaded_bytes, current.file.size || progress.total_bytes || 0));
                activeFileLoaded = currentFileLoaded;
                activeFileSpeed = progress.speed_bytes_per_sec;
                params.onProgress?.({
                  phase: 'uploading_files',
                  processed: i,
                  total: fileTargets.length,
                  current: current.relative,
                  uploaded_bytes: Math.max(0, uploadedBytesCompleted + activeFileLoaded),
                  total_bytes: totalBytes,
                  speed_bytes_per_sec: activeFileSpeed,
                });
              },
            }
          );
          uploadedFiles += 1;
          uploadSucceeded = true;
        } catch (error: any) {
          failures.push({
            path: current.relative,
            error: String(error?.message || error || '上传失败'),
          });
        } finally {
          uploadedBytesCompleted += uploadSucceeded ? current.file.size || currentFileLoaded : currentFileLoaded;
          activeFileLoaded = 0;
          activeFileSpeed = 0;
          processedFiles += 1;
        }
      }

      params.onProgress?.({
        phase: 'uploading_files',
        processed: fileTargets.length,
        total: fileTargets.length,
        uploaded_bytes: Math.max(0, uploadedBytesCompleted),
        total_bytes: totalBytes,
        speed_bytes_per_sec: 0,
      });

      return {
        total_files: fileTargets.length,
        processed_files: processedFiles,
        uploaded_files: uploadedFiles,
        failed_files: failures.length,
        created_directories: createdDirectories,
        skipped_directories: skippedDirectories,
        canceled,
        elapsed_ms: Date.now() - startedAt,
        failures,
      } as PvcFolderUploadResult;
    };
    return execute();
  },
};
