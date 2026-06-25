import { API_BASE, getHeaders, handleResponse } from './base';

const BASE = `${API_BASE}/api/app/vuln-verify`;

export interface VulnVerifyServiceConfig {
  default_model?: string | null;
}

export interface VulnVerifyServiceConfigResponse {
  config: VulnVerifyServiceConfig;
  effective_default_model?: string | null;
  source?: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export const vulnVerifyApi = {
  getServiceConfig: async (projectId: string): Promise<VulnVerifyServiceConfigResponse> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/service-config`, { headers: getHeaders() })),

  saveServiceConfig: async (projectId: string, config: VulnVerifyServiceConfig): Promise<VulnVerifyServiceConfigResponse> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/service-config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    })),
};
