import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/ai4secbench-leaderboard`;

export const leaderboardApi = {
  getLeaderboard: async (params: {
    domain_key?: string;
    task_type?: string;
    group_mode?: string;
    include_skills?: string;
  }): Promise<any> => {
    const search = new URLSearchParams();
    if (params.domain_key) search.set('domain_key', params.domain_key);
    if (params.task_type) search.set('task_type', params.task_type);
    search.set('group_mode', params.group_mode === 'family' ? 'family' : 'version');
    search.set('include_skills', params.include_skills === '0' ? '0' : '1');
    const response = await fetch(`${PREFIX}/leaderboard?${search.toString()}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getAgentStats: async (snapshotKey: string): Promise<any> => {
    const response = await fetch(
      `${PREFIX}/agents/${encodeURIComponent(snapshotKey)}/stats`,
      { headers: getHeaders() },
    );
    return handleResponse(response);
  },
};
