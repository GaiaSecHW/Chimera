
import { API_BASE, handleResponse, getHeaders, xhrUpload, XhrUploadProgress } from './base';
import { DeployScriptListResponse } from '../types/types';
import { trackUploadTask } from '../services/uploadCenter';

export interface DeployUploadProgress {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

const toUploadProgress = (event: XhrUploadProgress): DeployUploadProgress => ({
  loaded_bytes: event.loaded_bytes,
  total_bytes: event.total_bytes,
  speed_bytes_per_sec: event.speed_bytes_per_sec,
  elapsed_ms: event.elapsed_ms,
});

export const deployScriptApi = {
  getHealth: async () => 
    handleResponse(await fetch(`${API_BASE}/api/deploy-script/health`, { headers: getHeaders() })),
  
  getReady: async () => 
    handleResponse(await fetch(`${API_BASE}/api/deploy-script/ready`, { headers: getHeaders() })),

  listFiles: async (path: string = ''): Promise<DeployScriptListResponse> => {
    // 处理路径前缀，确保以 / 开头且不重复
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const url = `${API_BASE}/api/deploy-script/files${safePath}`;
    return handleResponse(await fetch(url, { headers: getHeaders() }));
  },

  getContent: async (path: string): Promise<string> => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const response = await fetch(`${API_BASE}/api/deploy-script/files${safePath}/content`, { headers: getHeaders() });
    if (!response.ok) throw new Error("无法读取文件内容");
    return response.text();
  },

  downloadUrl: (path: string) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE}/api/deploy-script/file${safePath}/download`;
  },

  uploadFile: async (path: string, file: File, options?: {
    onProgress?: (progress: DeployUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const formData = new FormData();
    formData.append('file', file);
    
    const headers = getHeaders();
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders['Content-Type'];
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: DeployUploadProgress) => void }) =>
      xhrUpload<any>({
        url: `${API_BASE}/api/deploy-script/file${safePath}`,
        method: 'POST',
        headers: uploadHeaders,
        formData,
        signal: params?.signal ?? options?.signal,
        onProgress: (event) => {
          const progress = toUploadProgress(event);
          options?.onProgress?.(progress);
          params?.onProgress?.(progress);
        },
      });
    if (options?.trackGlobal === false) return execute();
    return trackUploadTask({
      source: options?.sourceLabel || '部署脚本上传',
      name: file.name || 'script-file',
      size: file.size || 0,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  batchUpload: async (path: string, files: File[], options?: {
    onProgress?: (progress: DeployUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const headers = getHeaders();
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders['Content-Type'];
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: DeployUploadProgress) => void }) =>
      xhrUpload<any>({
        url: `${API_BASE}/api/deploy-script/files${safePath}/batch`,
        method: 'POST',
        headers: uploadHeaders,
        formData,
        signal: params?.signal ?? options?.signal,
        onProgress: (event) => {
          const progress = toUploadProgress(event);
          options?.onProgress?.(progress);
          params?.onProgress?.(progress);
        },
      });
    if (options?.trackGlobal === false) return execute();
    return trackUploadTask({
      source: options?.sourceLabel || '部署脚本批量上传',
      name: files.length > 1 ? `${files.length} 个文件` : (files[0]?.name || 'batch-upload'),
      size: files.reduce((sum, item) => sum + (item.size || 0), 0),
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  editFile: async (path: string, content: string) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return handleResponse(await fetch(`${API_BASE}/api/deploy-script/file${safePath}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ content })
    }));
  },

  deletePath: async (path: string) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return handleResponse(await fetch(`${API_BASE}/api/deploy-script/file${safePath}`, {
      method: 'DELETE',
      headers: getHeaders()
    }));
  },

  createDirectory: async (path: string) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return handleResponse(await fetch(`${API_BASE}/api/deploy-script/directory${safePath}`, {
      method: 'POST',
      headers: getHeaders()
    }));
  },

  rename: async (path: string, newName: string) => {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return handleResponse(await fetch(`${API_BASE}/api/deploy-script/file${safePath}/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ new_name: newName })
    }));
  }
};
