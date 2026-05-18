import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/app/kernel-scan`;

const withQuery = (path: string, params: Record<string, string | number | boolean | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  const separator = path.includes('?') ? '&' : '?';
  return text ? `${path}${separator}${text}` : path;
};

const noStoreHeaders = () => ({
  ...getHeaders(),
  'Cache-Control': 'no-cache, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
});

const noStoreGetInit = (): RequestInit => ({
  headers: noStoreHeaders(),
  cache: 'no-store',
});

const withCacheBust = (path: string) => withQuery(path, { _: Date.now() });

export type KernelScanCategory = 'attack_entry' | 'vuln_scan' | 'vuln_verify';

export type KernelScanPipelineMode = 'entry_only' | 'audit_only' | 'poc_only' | 'entry_audit_poc';

const CATEGORY_TO_PIPELINE: Record<KernelScanCategory, KernelScanPipelineMode> = {
  attack_entry: 'entry_only',
  vuln_scan: 'audit_only',
  vuln_verify: 'poc_only',
};

export interface KernelScanCapability {
  service: string;
  categories: KernelScanCategory[];
  executor_modes: string[];
  default_executor_mode?: string | null;
  max_parallel_tasks: number;
}

export interface KernelScanReadyState {
  status: string;
  ready: boolean;
  checks: Record<string, boolean>;
}

export interface KernelScanTaskSummary {
  task_id: string;
  attempt_id?: string | null;
  title: string;
  status: string;
  pipeline_mode?: string | null;
  kernel_dir?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
}

export interface KernelScanStageRun {
  stage_run_id: string;
  attempt_id: string;
  stage_name: 'entry' | 'audit' | 'poc' | string;
  status: string;
  return_code?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  metadata_json?: string;
}

export interface KernelScanTaskDetail extends KernelScanTaskSummary {
  current_stage?: string | null;
  latest_attempt_id?: string | null;
  attempt_count?: number;
  created_by?: string;
  updated_at?: string;
  notes?: string | null;
  stage_runs?: KernelScanStageRun[];
}

export interface KernelScanCreateTaskPayload {
  title: string;
  pipeline_mode?: KernelScanPipelineMode;
  kernel_dir?: string | null;
  entrylist?: string | null;
  report_dir?: string | null;
  notes?: string | null;
  entry_threads?: number | null;
  audit_threads?: number | null;
  poc_threads?: number | null;
}

export interface KernelScanCreateTaskResponse {
  task_id: string;
  attempt_id: string;
  status: string;
}

export interface KernelScanTaskListResponse {
  items: KernelScanTaskSummary[];
  total: number;
  page: number;
  per_page: number;
}

export interface KernelScanFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
}

export interface KernelScanBrowseResponse {
  path: string;
  parent?: string | null;
  items: KernelScanFileEntry[];
}

export interface KernelScanEntryResult {
  task_id: string;
  path: string;
  exists: boolean;
  size?: number;
  content?: string;
}

export interface KernelScanWorkspaceFileContent {
  path: string;
  name?: string;
  type?: string;
  content_type?: string;
  content: string;
  size?: number;
}

export interface KernelScanTaskEvent {
  event_seq: number;
  event_id: string;
  task_id: string;
  attempt_id?: string | null;
  stage_name?: string | null;
  event_type: string;
  level: string;
  message: string;
  payload_json?: string;
  created_at: string;
}

export interface KernelScanEventPageResponse {
  items: KernelScanTaskEvent[];
  next_cursor?: number | null;
}

export interface KernelScanAdbDevice {
  serial: string;
  status?: string;
  model?: string;
  product?: string;
  device?: string;
  transport_id?: string | number;
  raw?: string;
}

export interface KernelScanAdbDevicesResponse {
  host: string;
  devices: KernelScanAdbDevice[];
  raw?: string;
  message?: string;
  connected?: boolean;
}

const normalizeWorkspacePathVariants = (path = '') => {
  const raw = String(path || '').trim();
  const withoutWorkspaceRoot = raw
    .replace(/^\/+/, '')
    .replace(/^workspace\/?/, '');
  const absolute = withoutWorkspaceRoot ? `/workspace/${withoutWorkspaceRoot}` : '/workspace';
  const relative = withoutWorkspaceRoot;
  return Array.from(new Set([raw || '/workspace', absolute, relative]));
};

const handleWorkspaceResponseWithFallback = async <T,>(
  path: string,
  fetcher: (candidatePath: string) => Promise<T>,
): Promise<T> => {
  let lastError: unknown = null;
  for (const candidatePath of normalizeWorkspacePathVariants(path)) {
    try {
      return await fetcher(candidatePath);
    } catch (error: any) {
      lastError = error;
      if (![400, 403, 404].includes(Number(error?.status))) {
        throw error;
      }
    }
  }
  throw lastError;
};

const parseAdbDeviceLine = (line: string): KernelScanAdbDevice | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('list of devices')) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const device: KernelScanAdbDevice = {
    serial: parts[0],
    status: parts[1],
    raw: line,
  };

  parts.slice(2).forEach((part) => {
    const [key, ...rest] = part.split(':');
    const value = rest.join(':');
    if (!key || !value) return;
    if (key === 'model') device.model = value;
    if (key === 'product') device.product = value;
    if (key === 'device') device.device = value;
    if (key === 'transport_id') device.transport_id = value;
  });

  return device;
};

const normalizeAdbDevicesResponse = (payload: any, host: string): KernelScanAdbDevicesResponse => {
  if (typeof payload === 'string') {
    return {
      host,
      raw: payload,
      devices: payload.split(/\r?\n/).map(parseAdbDeviceLine).filter(Boolean) as KernelScanAdbDevice[],
    };
  }

  if (typeof payload?.output === 'string') {
    return {
      host: payload?.host || payload?.ip || host,
      raw: payload.output,
      devices: payload.output.split(/\r?\n/).map(parseAdbDeviceLine).filter(Boolean) as KernelScanAdbDevice[],
      message: payload?.message,
      connected: payload?.connected,
    };
  }

  const rawDevices = payload?.devices || payload?.items || payload?.data || payload?.adb_devices || payload?.device || payload;
  const rawDeviceItems = Array.isArray(rawDevices) ? rawDevices : [rawDevices];
  const devices = rawDeviceItems
    .map((item) => {
      if (typeof item === 'string') return parseAdbDeviceLine(item);
      return {
        serial: String(item?.serial || item?.id || item?.device_id || item?.name || ''),
        status: item?.status || item?.state,
        model: item?.model,
        product: item?.product,
        device: item?.device,
        transport_id: item?.transport_id,
        raw: item?.raw,
      };
    })
    .filter((item): item is KernelScanAdbDevice => Boolean(item?.serial));

  return {
    host: payload?.host || payload?.ip || host,
    devices,
    raw: payload?.raw || payload?.output,
    message: payload?.message,
    connected: payload?.connected,
  };
};

export const kernelScanApi = {
  getReady: async (): Promise<KernelScanReadyState> => {
    const response = await fetch(withCacheBust(`${PREFIX}/ready`), noStoreGetInit());
    return handleResponse(response);
  },

  getCapabilities: async (): Promise<KernelScanCapability> => {
    const response = await fetch(`${PREFIX}/capabilities`, noStoreGetInit());
    return handleResponse(response);
  },

  browseWorkspace: async (path = ''): Promise<KernelScanBrowseResponse> => {
    return handleWorkspaceResponseWithFallback(path, async (candidatePath) => {
      const url = withQuery(`${PREFIX}/workspace/browse`, { path: candidatePath });
      const response = await fetch(url, noStoreGetInit());
      return handleResponse(response);
    });
  },

  getWorkspaceFile: async (path: string): Promise<KernelScanWorkspaceFileContent> => {
    return handleWorkspaceResponseWithFallback(path, async (candidatePath) => {
      let lastError: unknown = null;
      for (const endpoint of ['/workspace/read', '/workspace/file']) {
        try {
          const url = withCacheBust(withQuery(`${PREFIX}${endpoint}`, { path: candidatePath }));
          const response = await fetch(url, noStoreGetInit());
          const payload = await handleResponse(response);
          if (typeof payload === 'string') {
            return { path: candidatePath, type: 'text', content: payload };
          }
          return {
            path: payload?.path || candidatePath,
            name: payload?.name,
            type: payload?.type || payload?.content_type,
            content_type: payload?.content_type,
            content: String(payload?.content ?? ''),
            size: payload?.size,
          };
        } catch (error: any) {
          lastError = error;
          if (![404, 405].includes(Number(error?.status))) {
            throw error;
          }
        }
      }
      throw lastError;
    });
  },

  listTasks: async (params: { page?: number; per_page?: number } = {}): Promise<KernelScanTaskListResponse> => {
    const url = withCacheBust(withQuery(`${PREFIX}/tasks`, {
      page: params.page ?? 1,
      per_page: params.per_page ?? 50,
    }));
    const response = await fetch(url, noStoreGetInit());
    return handleResponse(response);
  },

  getTask: async (taskId: string): Promise<KernelScanTaskDetail> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, noStoreGetInit());
    return handleResponse(response);
  },

  createTask: async (payload: KernelScanCreateTaskPayload): Promise<KernelScanCreateTaskResponse> => {
    const response = await fetch(`${PREFIX}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  connectRemoteAdbDevice: async (host: string): Promise<KernelScanAdbDevicesResponse> => {
    const trimmedHost = host.trim();
    const response = await fetch(`${PREFIX}/devices/adb/connect`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ip: trimmedHost }),
    });
    const payload = await handleResponse(response);
    return normalizeAdbDevicesResponse(payload, trimmedHost);
  },

  cancelTask: async (taskId: string): Promise<{ task_id: string; status: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteTask: async (taskId: string): Promise<{ task_id: string; status: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getTaskEvents: async (taskId: string): Promise<KernelScanEventPageResponse> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/events`, noStoreGetInit());
    return handleResponse(response);
  },

  getEntryResult: async (taskId: string): Promise<KernelScanEntryResult> => {
    const url = withCacheBust(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/entry/result`);
    const response = await fetch(url, noStoreGetInit());
    return handleResponse(response);
  },

  categoryToPipeline: (category: KernelScanCategory): KernelScanPipelineMode => CATEGORY_TO_PIPELINE[category],
};
