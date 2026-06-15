export const AGENT_MANAGE_API_BASE = '/api/agentmanage';

export const agentManageApiPath = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${AGENT_MANAGE_API_BASE}${normalizedPath}`;
};
