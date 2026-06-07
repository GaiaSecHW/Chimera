import { API_BASE, handleResponse, getHeaders } from './base';
import { StaticPackage, PackageStats, PackageFile } from '../types/types';

export const staticPackagesApi = {
  // Health Check
  getHealth: async (): Promise<{ status: string }> => {
    const response = await fetch(`${API_BASE}/api/packages/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  list: async (): Promise<{ packages: StaticPackage[] }> => 
    handleResponse(await fetch(`${API_BASE}/api/packages`, { headers: getHeaders() })),
  
  getDetail: async (id: string): Promise<{ package: StaticPackage; files: PackageFile[]; total_files: number }> => 
    handleResponse(await fetch(`${API_BASE}/api/packages/${id}`, { headers: getHeaders() })),
  
  getFiles: async (id: string, page = 1, per_page = 50): Promise<{ files: PackageFile[]; pagination: any }> => 
    handleResponse(await fetch(`${API_BASE}/api/packages/${id}/files?page=${page}&per_page=${per_page}`, { headers: getHeaders() })),
  
  search: async (params: { name?: string; architecture?: string; version?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return handleResponse(await fetch(`${API_BASE}/api/packages/search?${query}`, { headers: getHeaders() }));
  },
  
  getStats: async (): Promise<{ statistics: PackageStats }> => 
    handleResponse(await fetch(`${API_BASE}/api/packages/statistics`, { headers: getHeaders() })),
  
  check: async (id: string) => 
    handleResponse(await fetch(`${API_BASE}/api/packages/${id}/check`, { headers: getHeaders() })),
  
  checkAll: async () => 
    handleResponse(await fetch(`${API_BASE}/api/packages/check-all`, { method: 'POST', headers: getHeaders() })),
  
  delete: async (id: string) => 
    handleResponse(await fetch(`${API_BASE}/api/packages/${id}`, { method: 'DELETE', headers: getHeaders() })),
  
  batchDelete: async (ids: string[]) => 
    handleResponse(await fetch(`${API_BASE}/api/packages/batch-delete`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify({ package_ids: ids }) 
    })),

  getArchitectures: async (): Promise<{ architectures: string[] }> =>
    handleResponse(await fetch(`${API_BASE}/api/packages/architectures`, { headers: getHeaders() })),

  // Helper for generating download links (including token for secure download)
  getDownloadUrl: (id: string) => 
    `${API_BASE}/api/packages/${id}/download?token=${localStorage.getItem('chimera_token')}`,
    
  getFileDownloadUrl: (id: string, path: string) => 
    `${API_BASE}/api/packages/${id}/files/download?path=${encodeURIComponent(path)}&token=${localStorage.getItem('chimera_token')}`
};