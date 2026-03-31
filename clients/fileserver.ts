import { API_BASE, getHeaders, handleResponse } from './base';
import {
  DirectoryChildrenResponse,
  ExplorerRootResponse,
  FileDirectory,
  FileSubproject,
  ManagedFile,
  ProjectPathChildrenResponse,
} from '../types/types';

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
  }): Promise<ManagedFile> => {
    const formData = new FormData();
    formData.append('project_id', payload.project_id);
    formData.append('subproject_id', String(payload.subproject_id));
    if (payload.directory_id !== undefined && payload.directory_id !== null) {
      formData.append('directory_id', String(payload.directory_id));
    }
    formData.append('file', payload.file);
    const response = await fetch(`${API_BASE}/api/fileserver/files/upload`, {
      method: 'POST',
      headers: getUploadHeaders(),
      body: formData,
    });
    return handleResponse(response);
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
