import { API_BASE, getHeaders, handleResponse, xhrUpload, XhrUploadProgress } from './base';
import {
  DirectoryChildrenResponse,
  ExplorerRootResponse,
  FileDirectory,
  FileSubproject,
  ManagedFile,
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
