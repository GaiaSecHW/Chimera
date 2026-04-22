import { AgentService } from '../../types/types';

export type ServiceTerminalMode = 'attach' | 'shell';

export interface OpenServiceTerminalWindowOptions {
  projectId: string;
  service: Pick<AgentService, 'agent_key' | 'name' | 'is_stale'>;
  mode?: ServiceTerminalMode;
  container?: string;
  shell?: string;
  fallbackShell?: string;
}

export const buildServiceTerminalWindowUrl = ({
  projectId,
  service,
  mode = 'shell',
  container = '',
  shell = '/bin/bash',
  fallbackShell = '/bin/sh',
}: OpenServiceTerminalWindowOptions): string => {
  const params = new URLSearchParams({
    service_terminal: '1',
    project_id: projectId,
    agent_key: service.agent_key || '',
    service_name: service.name,
    container: container.trim(),
    mode,
    shell: shell.trim() || '/bin/bash',
    fallback_shell: fallbackShell.trim() || '/bin/sh',
  });

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
};

export const openServiceTerminalWindow = (options: OpenServiceTerminalWindowOptions): Window | null => {
  const url = buildServiceTerminalWindowUrl(options);
  return window.open(url, '_blank', 'noopener,noreferrer');
};
