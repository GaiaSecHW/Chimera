import { API_BASE, getHeaders, handleResponse } from './base';
import type {
  SecOctoMemory,
  SecOctoMemoriesResponse,
  SecOctoMemoryStatus,
  SecOctoCompileTask,
  SecOctoCompileTasksResponse,
  SecOctoVulnFinding,
  SecOctoVulnStats,
  SecOctoReport,
  SecOctoAnnotation,
  SecOctoTask,
  SecOctoTaskStats,
  SecOctoSkill,
  SecOctoSkillHealth,
  SecOctoProposal,
  SecOctoProposalTimeline,
  SecOctoDecision,
  SecOctoDecisionTimeline,
} from '../types/secocto';

const TIMEOUT = 8000;

const withTimeout = (init: RequestInit, ms: number = TIMEOUT): RequestInit => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return {
    ...init,
    signal: ctrl.signal,
    headers: { ...getHeaders(), ...(init.headers || {}), Accept: 'application/json' },
  } as RequestInit;
};

const buildQs = (params: Record<string, string | number | undefined>): string => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
};

const memoriesApi = {
  list: async (params?: { title?: string; limit?: number; offset?: number }): Promise<SecOctoMemoriesResponse> => {
    const qs = buildQs({ title: params?.title, limit: params?.limit, offset: params?.offset });
    const url = `${API_BASE}/api/memories-api/memories${qs}`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  status: async (): Promise<SecOctoMemoryStatus> => {
    const url = `${API_BASE}/api/memories-api/status`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  curateList: async (params?: { limit?: number; offset?: number }): Promise<SecOctoCompileTasksResponse> => {
    const qs = buildQs({ limit: params?.limit, offset: params?.offset });
    const url = `${API_BASE}/api/memories-api/curate${qs}`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  curateRun: async (): Promise<SecOctoCompileTask | null> => {
    const url = `${API_BASE}/api/memories-api/curate`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), cache: 'no-store' }));
  },

  curateDryRun: async (): Promise<SecOctoCompileTask | null> => {
    const url = `${API_BASE}/api/memories-api/curate/dry-run`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), cache: 'no-store' }));
  },
};

const wikiApi = {
  fetchMd: async (fastpath: string): Promise<string> => {
    const safe = String(fastpath || '').split('/').map(encodeURIComponent).join('/');
    const url = `${API_BASE}/api/wiki-api/${safe}`;
    const init = withTimeout({}, TIMEOUT);
    (init.headers as Record<string, string>)['Accept'] = 'text/plain, text/markdown, */*';
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  },
};

const VULN_BASE = `${API_BASE}/api/secocto-vuln`;

const vulnApi = {
  stats: async (): Promise<SecOctoVulnStats> => {
    const url = `${VULN_BASE}/stats`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 3000), cache: 'no-store' }));
  },

  findings: async (params?: { severity?: string; status?: string; rule_id?: string; limit?: number; offset?: number }): Promise<{ items: SecOctoVulnFinding[]; total: number }> => {
    const qs = buildQs({ severity: params?.severity, status: params?.status, rule_id: params?.rule_id, limit: params?.limit, offset: params?.offset });
    const url = `${VULN_BASE}/findings${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: res.items || [], total: res.total ?? res.length ?? 0 };
  },

  findingById: async (id: number): Promise<SecOctoVulnFinding> => {
    const url = `${VULN_BASE}/findings/${id}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  updateStatus: async (findingId: number, status: string): Promise<SecOctoVulnFinding | null> => {
    const url = `${VULN_BASE}/findings/${findingId}/status`;
    const res = await fetch(url, {
      ...withTimeout({ method: 'PATCH' }),
      body: JSON.stringify({ status }),
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    return handleResponse(res);
  },

  createAnnotation: async (findingId: number, payload: Record<string, any>): Promise<SecOctoAnnotation | null> => {
    const url = `${VULN_BASE}/findings/${findingId}/annotate`;
    const res = await fetch(url, {
      ...withTimeout({ method: 'POST' }),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    return handleResponse(res);
  },

  reportById: async (id: number): Promise<SecOctoReport> => {
    const url = `${VULN_BASE}/reports/${id}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  reportsByTaskId: async (taskId: string): Promise<SecOctoReport[]> => {
    const qs = buildQs({ task_id: taskId });
    const url = `${VULN_BASE}/reports${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  healthz: async (): Promise<Record<string, any>> => {
    const url = `${VULN_BASE}/healthz`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 3000), cache: 'no-store' }));
  },
};

const tasksApi = {
  list: async (params?: { status?: string; agent_type?: string; limit?: number; offset?: number }): Promise<{ items: SecOctoTask[]; total: number }> => {
    const qs = buildQs({ status: params?.status, agent_type: params?.agent_type, limit: params?.limit, offset: params?.offset });
    const url = `${API_BASE}/api/tasks-api/tasks${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: res.items || [], total: res.total ?? res.length ?? 0 };
  },

  byId: async (taskId: string): Promise<SecOctoTask> => {
    const url = `${API_BASE}/api/tasks-api/tasks/${encodeURIComponent(taskId)}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  stats: async (): Promise<SecOctoTaskStats> => {
    const url = `${API_BASE}/api/tasks-api/stats`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  submitFeedback: async (taskId: string, payload: Record<string, any>): Promise<any> => {
    const url = `${API_BASE}/api/tasks-api/tasks/${encodeURIComponent(taskId)}/feedback`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload), cache: 'no-store' }));
  },
};

const skillsApi = {
  list: async (params?: { limit?: number; offset?: number }): Promise<{ items: SecOctoSkill[]; total: number }> => {
    const qs = buildQs({ limit: params?.limit, offset: params?.offset });
    const url = `${API_BASE}/api/skills-api/skills${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: res.items || [], total: res.total ?? res.length ?? 0 };
  },

  healthz: async (): Promise<SecOctoSkillHealth> => {
    const url = `${API_BASE}/api/skills-api/healthz`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  bySlug: async (slug: string): Promise<SecOctoSkill> => {
    const url = `${API_BASE}/api/skills-api/skills/demo/${encodeURIComponent(slug)}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  proposals: async (fullName: string): Promise<SecOctoProposal[]> => {
    const qs = buildQs({ full_name: fullName });
    const url = `${API_BASE}/api/skills-api/proposals${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  proposalTimeline: async (proposalId: number): Promise<SecOctoProposalTimeline[]> => {
    const url = `${API_BASE}/api/skills-api/proposals/${proposalId}/timeline`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  decisions: async (fullName: string): Promise<SecOctoDecision[]> => {
    const qs = buildQs({ full_name: fullName });
    const url = `${API_BASE}/api/skills-api/decisions${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  decisionTimeline: async (decisionId: number): Promise<SecOctoDecisionTimeline[]> => {
    const url = `${API_BASE}/api/skills-api/decisions/${decisionId}/timeline`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  rejectDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${API_BASE}/api/skills-api/decisions/${decisionId}/reject`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  pickDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${API_BASE}/api/skills-api/decisions/${decisionId}/pick`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  approveDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${API_BASE}/api/skills-api/decisions/${decisionId}/approve`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  evolve: async (skill: string, payload: Record<string, any>): Promise<any> => {
    const [ns, slug] = skill.includes('/') ? skill.split('/') : ['', skill];
    const url = `${API_BASE}/api/skills-api/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}/decisions`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload), cache: 'no-store' }));
  },
};

const giteaApi = {
  fetchDiff: async (fullName: string, prNumber: number): Promise<string> => {
    const url = `${API_BASE}/api/gitea/${encodeURIComponent(fullName)}/pulls/${prNumber}.diff`;
    const res = await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  },
};

export const secoctoClients = {
  memories: memoriesApi,
  wiki: wikiApi,
  vuln: vulnApi,
  tasks: tasksApi,
  skills: skillsApi,
  gitea: giteaApi,
};
