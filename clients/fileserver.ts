import { API_BASE, getHeaders, handleResponse, xhrUpload, XhrUploadProgress } from './base';
import {
  DirectoryChildrenResponse,
  ExplorerRootResponse,
  FileDirectory,
  FileSubproject,
  ManagedFile,
  ProjectInputUploadDetail,
  ProjectInputUploadBrowseResponse,
  ProjectInputUploadResolveResponse,
  ProjectInputUploadListResponse,
  ProjectInputUploadRecord,
  ProjectInputOverview,
  ProjectInputUploadStats,
  ProjectFilesystemChildrenResponse,
  ProjectFilesystemEntry,
  ProjectFilesystemRootResponse,
  ProjectPathChildrenResponse,
} from '../types/types';
import { trackUploadTask } from '../services/uploadCenter';

export interface FileserverUploadProgress {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

export interface FileWatchOpenOptions {
  path_mode?: 'project_filesystem';
  read_mode?: 'line' | 'byte';
  start_from?: 'head' | 'tail';
  start_line?: number;
  start_byte?: number;
}

export interface FileWatchSnapshotMessage {
  type: 'snapshot';
  request_id: string;
  project_id: string;
  path: string;
  path_mode: string;
  read_mode: 'line' | 'byte';
  exists: boolean;
  start_line?: number | null;
  start_byte?: number | null;
  queue_class?: string;
  ts: string;
}

export interface FileWatchDeltaMessage {
  type: 'delta';
  read_mode: 'line' | 'byte';
  from_line?: number;
  to_line?: number;
  lines?: string[];
  from_byte?: number;
  to_byte?: number;
  encoding?: string;
  content_base64?: string;
  request_id: string;
  project_id: string;
  path: string;
  ts: string;
}

export interface FileWatchEventMessage {
  type: 'file_event';
  event: 'created' | 'deleted' | 'renamed' | 'truncated' | 'permission_changed' | 'metadata_changed' | 'closed';
  request_id: string;
  project_id: string;
  path: string;
  size?: number;
  mtime?: number;
  inode?: number;
  ts: string;
}

export interface FileWatchHeartbeatMessage {
  type: 'heartbeat';
  request_id: string;
  project_id: string;
  path: string;
  read_mode: 'line' | 'byte';
  line_offset?: number | null;
  byte_offset?: number | null;
  ts: string;
}

export interface FileWatchErrorMessage {
  type: 'error';
  request_id?: string;
  project_id?: string;
  path?: string;
  message: string;
  ts?: string;
}

export interface ArchiveTaskCreateRequest {
  project_id: string;
  items: string[];
  archive_name?: string;
}

export interface ArchiveTaskSubmitResponse {
  task_id: string;
  status: string;
  accepted_at: string;
  request_id?: string;
  queue_class?: string;
}

export interface ProjectInputUploadAcceptedResponse {
  upload_id: string;
  batch_id: string;
  status: string;
  accepted_at: string;
  request_id?: string;
  queue_class?: string;
}

export interface ArchiveTaskStatusResponse {
  task_id: string;
  task_type?: string;
  project_id?: string;
  status: string;
  progress: number;
  accepted_at: string;
  finished_at?: string | null;
  result?: {
    project_id?: string;
    mode?: 'project_filesystem' | 'vuln_project_path' | string;
    items?: string[];
    archive_name?: string;
    download_path?: string;
    archive_size?: number;
    file_count?: number;
    expires_at?: string;
  } | null;
  error?: string | null;
}

export type FileWatchMessage =
  | FileWatchSnapshotMessage
  | FileWatchDeltaMessage
  | FileWatchEventMessage
  | FileWatchHeartbeatMessage
  | FileWatchErrorMessage;

const toUploadProgress = (event: XhrUploadProgress): FileserverUploadProgress => ({
  loaded_bytes: event.loaded_bytes,
  total_bytes: event.total_bytes,
  speed_bytes_per_sec: event.speed_bytes_per_sec,
  elapsed_ms: event.elapsed_ms,
});

const getUploadHeaders = () => {
  const headers: Record<string, string> = { ...getHeaders() };
  delete headers['Content-Type'];
  return headers;
};

const getWsBase = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

export const fileserverApi = {
  getRoot: async (projectId: string): Promise<ExplorerRootResponse> => {
    const response = await fetch(`${API_BASE}/api/fileserver/explorer/root?project_id=${encodeURIComponent(projectId)}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectFilesystemRoot: async (projectId: string): Promise<ProjectFilesystemRootResponse> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/root?project_id=${encodeURIComponent(projectId)}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectFilesystemChildren: async (projectId: string, path: string): Promise<ProjectFilesystemChildrenResponse> => {
    const query = new URLSearchParams({ project_id: projectId, path }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/children?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  createProjectFilesystemDirectory: async (payload: {
    project_id: string;
    path: string;
  }): Promise<ProjectFilesystemEntry> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/directories`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  uploadProjectFilesystemFile: async (payload: {
    project_id: string;
    path: string;
    file: File;
    overwrite?: boolean;
  }, options?: {
    onProgress?: (progress: FileserverUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }): Promise<ProjectFilesystemEntry> => {
    const formData = new FormData();
    formData.append('project_id', payload.project_id);
    formData.append('path', payload.path);
    formData.append('overwrite', payload.overwrite ? 'true' : 'false');
    formData.append('file', payload.file);
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: FileserverUploadProgress) => void }) => xhrUpload<ProjectFilesystemEntry>({
      url: `${API_BASE}/api/fileserver/project-filesystem/files/upload`,
      method: 'POST',
      headers: getUploadHeaders(),
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
      source: options?.sourceLabel || '项目文件上传',
      name: payload.file.name || 'file',
      size: payload.file.size || 0,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  renameProjectFilesystemNode: async (payload: {
    project_id: string;
    path: string;
    name: string;
  }): Promise<ProjectFilesystemEntry> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  moveProjectFilesystemNode: async (payload: {
    project_id: string;
    source_path: string;
    target_directory_path: string;
  }): Promise<ProjectFilesystemEntry> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/move`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteProjectFilesystemNode: async (projectId: string, path: string, recursive = true): Promise<{ message: string }> => {
    const query = new URLSearchParams({
      project_id: projectId,
      path,
      recursive: String(recursive),
    }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem?${query}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  fetchProjectFilesystemPreviewBlob: async (projectId: string, path: string): Promise<Blob> => {
    const query = new URLSearchParams({ project_id: projectId, path }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/preview?${query}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    return response.blob();
  },

  fetchProjectFilesystemDownloadBlob: async (projectId: string, path: string): Promise<Blob> => {
    const query = new URLSearchParams({ project_id: projectId, path }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/download?${query}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    return response.blob();
  },

  createProjectFilesystemArchiveTask: async (payload: ArchiveTaskCreateRequest): Promise<ArchiveTaskSubmitResponse> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-filesystem/archive-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  listProjectInputUploads: async (
    projectId: string,
    options?: string | {
      inputType?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<ProjectInputUploadListResponse> => {
    const normalizedOptions = typeof options === 'string' ? { inputType: options } : options;
    const query = new URLSearchParams({ project_id: projectId });
    if (normalizedOptions?.inputType) query.set('input_type', normalizedOptions.inputType);
    if (normalizedOptions?.status) query.set('status', normalizedOptions.status);
    if (normalizedOptions?.page) query.set('page', String(normalizedOptions.page));
    if (normalizedOptions?.pageSize) query.set('page_size', String(normalizedOptions.pageSize));
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectInputUploadStats: async (projectId: string, inputType: string): Promise<ProjectInputUploadStats> => {
    const query = new URLSearchParams({ project_id: projectId, input_type: inputType }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/stats?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectInputOverview: async (projectId: string): Promise<ProjectInputOverview> => {
    const query = new URLSearchParams({ project_id: projectId }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/overview?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectInputUploadDetail: async (uploadId: string): Promise<ProjectInputUploadDetail> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/${encodeURIComponent(uploadId)}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  browseProjectInputUpload: async (projectId: string, uploadId: string, relativePath = ''): Promise<ProjectInputUploadBrowseResponse> => {
    const query = new URLSearchParams({ project_id: projectId, relative_path: relativePath }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/${encodeURIComponent(uploadId)}/browse?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  resolveProjectInputUpload: async (projectId: string, uploadId: string, relativePath = ''): Promise<ProjectInputUploadResolveResponse> => {
    const query = new URLSearchParams({ project_id: projectId, relative_path: relativePath }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/${encodeURIComponent(uploadId)}/resolve?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  createProjectInputUpload: async (payload: {
    project_id: string;
    input_type: string;
    keep_original?: boolean;
    upload_mode?: 'raw' | 'archive';
    files: File[];
  }, options?: {
    onProgress?: (progress: FileserverUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }): Promise<ProjectInputUploadAcceptedResponse> => {
    const formData = new FormData();
    formData.append('project_id', payload.project_id);
    formData.append('input_type', payload.input_type);
    formData.append('keep_original', payload.keep_original ? 'true' : 'false');
    if (payload.upload_mode) {
      formData.append('upload_mode', payload.upload_mode);
    }
    for (const file of payload.files) {
      formData.append('files', file);
    }
    const totalSize = payload.files.reduce((sum, file) => sum + (file.size || 0), 0);
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: FileserverUploadProgress) => void }) => xhrUpload<ProjectInputUploadAcceptedResponse>({
      url: `${API_BASE}/api/fileserver/project-input/uploads`,
      method: 'POST',
      headers: getUploadHeaders(),
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
      source: options?.sourceLabel || '外部输入上传',
      name: payload.files.map((file) => file.name || 'file').join(', '),
      size: totalSize,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  appendProjectInputUpload: async (payload: {
    upload_id: string;
    keep_original?: boolean;
    upload_mode?: 'raw' | 'archive';
    files: File[];
  }, options?: {
    onProgress?: (progress: FileserverUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }): Promise<ProjectInputUploadAcceptedResponse> => {
    const formData = new FormData();
    formData.append('keep_original', payload.keep_original ? 'true' : 'false');
    if (payload.upload_mode) {
      formData.append('upload_mode', payload.upload_mode);
    }
    for (const file of payload.files) {
      formData.append('files', file);
    }
    const totalSize = payload.files.reduce((sum, file) => sum + (file.size || 0), 0);
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: FileserverUploadProgress) => void }) => xhrUpload<ProjectInputUploadAcceptedResponse>({
      url: `${API_BASE}/api/fileserver/project-input/uploads/${encodeURIComponent(payload.upload_id)}/append`,
      method: 'POST',
      headers: getUploadHeaders(),
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
      source: options?.sourceLabel || '外部输入追加上传',
      name: payload.files.map((file) => file.name || 'file').join(', '),
      size: totalSize,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  updateProjectInputUploadDisplayName: async (payload: {
    upload_id: string;
    project_id: string;
    display_name: string;
  }): Promise<ProjectInputUploadRecord> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads/${encodeURIComponent(payload.upload_id)}/display-name`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        project_id: payload.project_id,
        display_name: payload.display_name,
      }),
    });
    return handleResponse(response);
  },

  deleteProjectInputUploads: async (payload: {
    project_id: string;
    input_type: string;
    upload_ids: string[];
  }): Promise<{ deleted_ids: string[]; failed_items: Array<{ upload_id: string; message: string }> }> => {
    const response = await fetch(`${API_BASE}/api/fileserver/project-input/uploads`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  createVulnProjectPathArchiveTask: async (payload: ArchiveTaskCreateRequest): Promise<ArchiveTaskSubmitResponse> => {
    const response = await fetch(`${API_BASE}/api/fileserver/vuln/project-path/archive-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  listArchiveTasks: async (projectId: string, limit = 100): Promise<ArchiveTaskStatusResponse[]> => {
    const query = new URLSearchParams({ project_id: projectId, limit: String(limit) }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/archive-tasks?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  fetchArchiveTaskDownloadBlob: async (taskId: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/fileserver/archive-tasks/${encodeURIComponent(taskId)}/download`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    return response.blob();
  },

  openProjectFileWatchWebSocket: (projectId: string, path: string, options: FileWatchOpenOptions = {}): WebSocket => {
    const token = localStorage.getItem('chimera_token');
    const params = new URLSearchParams({
      project_id: projectId,
      path,
      path_mode: options.path_mode || 'project_filesystem',
      read_mode: options.read_mode || 'line',
      start_from: options.start_from || 'head',
    });
    if (options.start_line !== undefined) params.append('start_line', String(options.start_line));
    if (options.start_byte !== undefined) params.append('start_byte', String(options.start_byte));
    if (token) params.append('token', token);
    return new WebSocket(`${getWsBase()}${API_BASE}/api/fileserver/ws/watch?${params.toString()}`);
  },

  getSubprojectChildren: async (projectId: string, subprojectId: number): Promise<DirectoryChildrenResponse> => {
    const response = await fetch(
      `${API_BASE}/api/fileserver/subprojects/${subprojectId}/children?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getDirectoryChildren: async (projectId: string, directoryId: number): Promise<DirectoryChildrenResponse> => {
    const response = await fetch(
      `${API_BASE}/api/fileserver/directories/${directoryId}/children?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getVulnProjectPathChildren: async (projectId: string, path: string): Promise<ProjectPathChildrenResponse> => {
    const query = new URLSearchParams({ project_id: projectId, path }).toString();
    const response = await fetch(`${API_BASE}/api/fileserver/vuln/project-path/children?${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  createSubproject: async (payload: { project_id: string; name: string; description?: string }): Promise<FileSubproject> => {
    const response = await fetch(`${API_BASE}/api/fileserver/subprojects`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  renameSubproject: async (
    projectId: string,
    subprojectId: number,
    payload: { name?: string; description?: string }
  ): Promise<FileSubproject> => {
    const response = await fetch(
      `${API_BASE}/api/fileserver/subprojects/${subprojectId}?project_id=${encodeURIComponent(projectId)}`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }
    );
    return handleResponse(response);
  },

  deleteSubproject: async (projectId: string, subprojectId: number, recursive = true): Promise<{ message: string }> => {
    const response = await fetch(
      `${API_BASE}/api/fileserver/subprojects/${subprojectId}?project_id=${encodeURIComponent(projectId)}&recursive=${String(recursive)}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );
    return handleResponse(response);
  },

  createDirectory: async (payload: {
    project_id: string;
    subproject_id: number;
    parent_id?: number | null;
    name: string;
  }): Promise<FileDirectory> => {
    const response = await fetch(`${API_BASE}/api/fileserver/directories`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  renameDirectory: async (directoryId: number, name: string): Promise<FileDirectory> => {
    const response = await fetch(`${API_BASE}/api/fileserver/directories/${directoryId}/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    return handleResponse(response);
  },

  moveDirectory: async (directoryId: number, targetParentId: number | null): Promise<FileDirectory> => {
    const response = await fetch(`${API_BASE}/api/fileserver/directories/${directoryId}/move`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ target_parent_id: targetParentId }),
    });
    return handleResponse(response);
  },

  deleteDirectory: async (projectId: string, directoryId: number, recursive = true): Promise<{ message: string }> => {
    const response = await fetch(
      `${API_BASE}/api/fileserver/directories/${directoryId}?project_id=${encodeURIComponent(projectId)}&recursive=${String(recursive)}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );
    return handleResponse(response);
  },

  uploadFile: async (payload: {
    project_id: string;
    subproject_id: number;
    directory_id?: number | null;
    file: File;
  }, options?: {
    onProgress?: (progress: FileserverUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }): Promise<ManagedFile> => {
    const formData = new FormData();
    formData.append('project_id', payload.project_id);
    formData.append('subproject_id', String(payload.subproject_id));
    if (payload.directory_id !== undefined && payload.directory_id !== null) {
      formData.append('directory_id', String(payload.directory_id));
    }
    formData.append('file', payload.file);
    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: FileserverUploadProgress) => void }) => xhrUpload<ManagedFile>({
      url: `${API_BASE}/api/fileserver/files/upload`,
      method: 'POST',
      headers: getUploadHeaders(),
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
      source: options?.sourceLabel || '项目文件上传',
      name: payload.file.name || 'file',
      size: payload.file.size || 0,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  renameFile: async (fileId: number, filename: string): Promise<ManagedFile> => {
    const response = await fetch(`${API_BASE}/api/fileserver/files/${fileId}/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ filename }),
    });
    return handleResponse(response);
  },

  moveFile: async (fileId: number, targetDirectoryId: number | null): Promise<ManagedFile> => {
    const response = await fetch(`${API_BASE}/api/fileserver/files/${fileId}/move`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ target_directory_id: targetDirectoryId }),
    });
    return handleResponse(response);
  },

  deleteFile: async (fileId: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/api/fileserver/files/${fileId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  fetchPreviewBlob: async (fileId: number): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/fileserver/files/${fileId}/preview`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    return response.blob();
  },

  fetchDownloadBlob: async (fileId: number): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/fileserver/files/${fileId}/download`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    return response.blob();
  },
};
