import { API_BASE, getHeaders, handleResponse } from './base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirmwareUnpackerHealth {
  status: string;
  worker_id?: string;
}

export interface FirmwareUnpackPayload {
  firmware_path: string;
  project_id?: string;
}

export interface FirmwareUnpackSubmitResult {
  task_id: string;
  status: string;
  message: string;
  input_path?: string;
  output_path?: string;
  run_path?: string;
}

export interface FirmwareUnpackTask {
  id: string;
  project_id: string | null;
  firmware_path: string;
  output_path: string;
  /** pending | running | cancelling | cancelled | success | failed */
  status: string;
  worker_id: string | null;
  result_status: string | null;
  result_message: string | null;
  rounds: number | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface FirmwareUnpackTaskList {
  total: number;
  offset: number;
  limit: number;
  items: FirmwareUnpackTask[];
}

export interface FirmwareWorkerInstance {
  worker_id: string;
  hostname: string | null;
  pod_ip: string | null;
  started_at: string | null;
  last_heartbeat: string | null;
  is_alive: boolean;
  active_tasks: number;
}

export interface FirmwareClusterInfo {
  this_worker: string;
  total_workers: number;
  alive_workers: number;
  workers: FirmwareWorkerInstance[];
  task_counts: Record<string, number>;
  total_tasks: number;
}

export interface FirmwareConfigEntry {
  key: string;
  value: string;
  value_type: string;
  description: string | null;
  updated_at: string | null;
}

export interface FirmwareConfigList {
  total: number;
  items: FirmwareConfigEntry[];
}

export interface TaskListQuery {
  project_id?: string;
  status?: string;
  worker_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const asNullableString = (value: unknown): string | null =>
  value == null ? null : String(value);

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asNullableNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const lowered = String(value ?? '').trim().toLowerCase();
  return lowered === 'true' || lowered === '1' || lowered === 'yes';
};

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

const normalizeTask = (value: unknown): FirmwareUnpackTask => {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    project_id: asNullableString(record.project_id),
    firmware_path: asString(record.firmware_path),
    output_path: asString(record.output_path),
    status: asString(record.status, 'unknown'),
    worker_id: asNullableString(record.worker_id),
    result_status: asNullableString(record.result_status),
    result_message: asNullableString(record.result_message),
    rounds: asNullableNumber(record.rounds),
    error_message: asNullableString(record.error_message),
    created_at: asNullableString(record.created_at),
    started_at: asNullableString(record.started_at),
    completed_at: asNullableString(record.completed_at),
  };
};

const normalizeTaskList = (value: unknown): FirmwareUnpackTaskList => {
  const record = asRecord(value);
  const rawItems = Array.isArray(value)
    ? value
    : asArray(record.items).length > 0
      ? asArray(record.items)
      : asArray(record.tasks).length > 0
        ? asArray(record.tasks)
        : asArray(record.item);
  const items = rawItems.map(normalizeTask);
  return {
    total: asNumber(record.total, items.length),
    offset: asNumber(record.offset, 0),
    limit: asNumber(record.limit, items.length || 20),
    items,
  };
};

const normalizeHealth = (value: unknown): FirmwareUnpackerHealth => {
  const record = asRecord(value);
  return {
    status: asString(record.status, typeof value === 'string' ? value : 'unknown'),
    worker_id: record.worker_id == null ? undefined : asString(record.worker_id),
  };
};

const normalizeWorker = (value: unknown): FirmwareWorkerInstance => {
  const record = asRecord(value);
  return {
    worker_id: asString(record.worker_id),
    hostname: asNullableString(record.hostname),
    pod_ip: asNullableString(record.pod_ip),
    started_at: asNullableString(record.started_at),
    last_heartbeat: asNullableString(record.last_heartbeat),
    is_alive: asBoolean(record.is_alive),
    active_tasks: asNumber(record.active_tasks, 0),
  };
};

const normalizeClusterInfo = (value: unknown): FirmwareClusterInfo => {
  const record = asRecord(value);
  const workers = (
    asArray(record.workers).length > 0 ? asArray(record.workers) :
    asArray(record.instances).length > 0 ? asArray(record.instances) :
    asArray(record.items)
  ).map(normalizeWorker);
  const rawTaskCounts = asRecord(record.task_counts);
  const task_counts = Object.fromEntries(
    Object.entries(rawTaskCounts).map(([key, item]) => [key, asNumber(item, 0)])
  );
  return {
    this_worker: asString(record.this_worker),
    total_workers: asNumber(record.total_workers, workers.length),
    alive_workers: asNumber(record.alive_workers, workers.filter((item) => item.is_alive).length),
    workers,
    task_counts,
    total_tasks: asNumber(record.total_tasks, Object.values(task_counts).reduce((sum, count) => sum + count, 0)),
  };
};

const normalizeConfigEntry = (value: unknown): FirmwareConfigEntry => {
  const record = asRecord(value);
  return {
    key: asString(record.key),
    value: asString(record.value),
    value_type: asString(record.value_type, 'string'),
    description: asNullableString(record.description),
    updated_at: asNullableString(record.updated_at),
  };
};

const normalizeConfigList = (value: unknown): FirmwareConfigList => {
  const record = asRecord(value);
  const rawItems = Array.isArray(value)
    ? value
    : asArray(record.items).length > 0
      ? asArray(record.items)
      : asArray(record.configs);
  const items = rawItems.map(normalizeConfigEntry);
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

const normalizeSubmitResult = (value: unknown): FirmwareUnpackSubmitResult => {
  const record = asRecord(value);
  return {
    task_id: asString(record.task_id),
    status: asString(record.status, 'pending'),
    message: asString(record.message, '任务已提交'),
    input_path: record.input_path == null ? undefined : asString(record.input_path),
    output_path: record.output_path == null ? undefined : asString(record.output_path),
    run_path: record.run_path == null ? undefined : asString(record.run_path),
  };
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const firmwareUnpackerApi = {
  /** GET /api/app/firmware-unpacker/health */
  getHealth: async (): Promise<FirmwareUnpackerHealth> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/health`, { headers: getHeaders() });
    return normalizeHealth(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/unpack → task_id */
  unpack: async (payload: FirmwareUnpackPayload): Promise<FirmwareUnpackSubmitResult> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/unpack`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return normalizeSubmitResult(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks?... — dynamic query */
  listTasks: async (query: TaskListQuery = {}): Promise<FirmwareUnpackTaskList> => {
    const p = new URLSearchParams();
    if (query.project_id) p.set('project_id', query.project_id);
    if (query.status)     p.set('status',     query.status);
    if (query.worker_id)  p.set('worker_id',  query.worker_id);
    if (query.search)     p.set('search',     query.search);
    if (query.limit  != null) p.set('limit',  String(query.limit));
    if (query.offset != null) p.set('offset', String(query.offset));
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks?${p}`, { headers: getHeaders() });
    return normalizeTaskList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id} */
  getTask: async (taskId: string): Promise<FirmwareUnpackTask> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}`, { headers: getHeaders() });
    return normalizeTask(await handleResponse(r));
  },

  /** DELETE /api/app/firmware-unpacker/tasks/{id} */
  deleteTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/{id}/cancel */
  cancelTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/{id}/retry */
  retryTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/batch-delete */
  batchDelete: async (taskIds: string[]) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/batch-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ task_ids: taskIds }),
    });
    return handleResponse(r);
  },

  /** GET /api/app/firmware-unpacker/cluster */
  getCluster: async (): Promise<FirmwareClusterInfo> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/cluster`, { headers: getHeaders() });
    return normalizeClusterInfo(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/config */
  getConfig: async (): Promise<FirmwareConfigList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config`, { headers: getHeaders() });
    return normalizeConfigList(await handleResponse(r));
  },

  /** PUT /api/app/firmware-unpacker/config/{key} */
  updateConfig: async (key: string, value: string, description?: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config/${key}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ key, value, description }),
    });
    return normalizeConfigEntry(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/config/batch-update */
  batchUpdateConfig: async (updates: Array<{ key: string; value: string }>) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config/batch-update`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    return normalizeConfigList(await handleResponse(r));
  },
};
