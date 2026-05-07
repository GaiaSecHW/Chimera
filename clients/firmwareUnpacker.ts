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
  matched_skill: string | null;
  matched_skill_version: number | null;
  matched_skill_score: number | null;
  fallback_to_llm: boolean;
  generated_skill_path: string | null;
  generated_skill_status: string | null;
  promotion_success_count: number | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface FirmwareTaskResourceContainer {
  name: string | null;
  cpu_millicores: number;
  memory_mib: number;
}

export interface FirmwareTaskResourceUsage {
  task_id: string;
  worker_id: string | null;
  available: boolean;
  pod_name: string | null;
  namespace: string | null;
  phase: string | null;
  timestamp: string | null;
  window: string | null;
  cpu_millicores: number | null;
  memory_mib: number | null;
  pod_cpu_limit_millicores: number | null;
  pod_memory_limit_mib: number | null;
  containers: FirmwareTaskResourceContainer[];
  message: string | null;
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

export interface FirmwareConcurrencyInfo {
  mode: string;
  resource_based: boolean;
  effective_max_concurrent: number;
  executor_capacity: number;
  manual_max_concurrent: number;
  auto_max_concurrent: number;
  cpu_based_limit: number | null;
  memory_based_limit: number | null;
  cpu_millis_per_task: number;
  memory_mb_per_task: number;
  reserved_cpu_millis: number;
  reserved_memory_mb: number;
  pod_cpu_limit_millicores: number | null;
  pod_memory_limit_mib: number | null;
  pod_cpu_request_millicores: number | null;
  pod_memory_request_mib: number | null;
}

export interface FirmwareClusterInfo {
  this_worker: string;
  total_workers: number;
  alive_workers: number;
  workers: FirmwareWorkerInstance[];
  task_counts: Record<string, number>;
  total_tasks: number;
  concurrency: FirmwareConcurrencyInfo;
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

export interface FirmwareToolEntry {
  filename: string;
  path: string;
  name: string;
  format_id: string;
  description: string;
  extensions: string[];
  magic_hex: string;
  keywords: string[];
  binwalk_sigs: string[];
  skill_status: string;
  skill_version: number;
  family_id: string;
  promotion_success_count: number;
  promotion_threshold: number;
}

export interface FirmwareToolList {
  total: number;
  items: FirmwareToolEntry[];
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
    matched_skill: asNullableString(record.matched_skill),
    matched_skill_version: asNullableNumber(record.matched_skill_version),
    matched_skill_score: asNullableNumber(record.matched_skill_score),
    fallback_to_llm: asBoolean(record.fallback_to_llm),
    generated_skill_path: asNullableString(record.generated_skill_path),
    generated_skill_status: asNullableString(record.generated_skill_status),
    promotion_success_count: asNullableNumber(record.promotion_success_count),
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

const normalizeTaskResourceUsage = (value: unknown): FirmwareTaskResourceUsage => {
  const record = asRecord(value);
  const containers = asArray(record.containers).map((item) => {
    const entry = asRecord(item);
    return {
      name: asNullableString(entry.name),
      cpu_millicores: asNumber(entry.cpu_millicores, 0),
      memory_mib: asNumber(entry.memory_mib, 0),
    };
  });
  return {
    task_id: asString(record.task_id),
    worker_id: asNullableString(record.worker_id),
    available: asBoolean(record.available),
    pod_name: asNullableString(record.pod_name),
    namespace: asNullableString(record.namespace),
    phase: asNullableString(record.phase),
    timestamp: asNullableString(record.timestamp),
    window: asNullableString(record.window),
    cpu_millicores: asNullableNumber(record.cpu_millicores),
    memory_mib: asNullableNumber(record.memory_mib),
    pod_cpu_limit_millicores: asNullableNumber(record.pod_cpu_limit_millicores),
    pod_memory_limit_mib: asNullableNumber(record.pod_memory_limit_mib),
    containers,
    message: asNullableString(record.message),
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
  const concurrencyRecord = asRecord(record.concurrency);
  return {
    this_worker: asString(record.this_worker),
    total_workers: asNumber(record.total_workers, workers.length),
    alive_workers: asNumber(record.alive_workers, workers.filter((item) => item.is_alive).length),
    workers,
    task_counts,
    total_tasks: asNumber(record.total_tasks, Object.values(task_counts).reduce((sum, count) => sum + count, 0)),
    concurrency: {
      mode: asString(concurrencyRecord.mode, 'auto'),
      resource_based: asBoolean(concurrencyRecord.resource_based),
      effective_max_concurrent: asNumber(concurrencyRecord.effective_max_concurrent, 1),
      executor_capacity: asNumber(concurrencyRecord.executor_capacity, 1),
      manual_max_concurrent: asNumber(concurrencyRecord.manual_max_concurrent, 1),
      auto_max_concurrent: asNumber(concurrencyRecord.auto_max_concurrent, 1),
      cpu_based_limit: asNullableNumber(concurrencyRecord.cpu_based_limit),
      memory_based_limit: asNullableNumber(concurrencyRecord.memory_based_limit),
      cpu_millis_per_task: asNumber(concurrencyRecord.cpu_millis_per_task, 250),
      memory_mb_per_task: asNumber(concurrencyRecord.memory_mb_per_task, 512),
      reserved_cpu_millis: asNumber(concurrencyRecord.reserved_cpu_millis, 100),
      reserved_memory_mb: asNumber(concurrencyRecord.reserved_memory_mb, 256),
      pod_cpu_limit_millicores: asNullableNumber(concurrencyRecord.pod_cpu_limit_millicores),
      pod_memory_limit_mib: asNullableNumber(concurrencyRecord.pod_memory_limit_mib),
      pod_cpu_request_millicores: asNullableNumber(concurrencyRecord.pod_cpu_request_millicores),
      pod_memory_request_mib: asNullableNumber(concurrencyRecord.pod_memory_request_mib),
    },
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

const normalizeToolEntry = (value: unknown): FirmwareToolEntry => {
  const record = asRecord(value);
  return {
    filename: asString(record.filename),
    path: asString(record.path),
    name: asString(record.name),
    format_id: asString(record.format_id),
    description: asString(record.description),
    extensions: asArray(record.extensions).map((item) => asString(item)).filter(Boolean),
    magic_hex: asString(record.magic_hex),
    keywords: asArray(record.keywords).map((item) => asString(item)).filter(Boolean),
    binwalk_sigs: asArray(record.binwalk_sigs).map((item) => asString(item)).filter(Boolean),
    skill_status: asString(record.skill_status, 'candidate'),
    skill_version: asNumber(record.skill_version, 1),
    family_id: asString(record.family_id),
    promotion_success_count: asNumber(record.promotion_success_count, 0),
    promotion_threshold: asNumber(record.promotion_threshold, 5),
  };
};

const normalizeToolList = (value: unknown): FirmwareToolList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeToolEntry);
  return {
    total: asNumber(record.total, items.length),
    items,
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

  /** GET /api/app/firmware-unpacker/tasks/{id}/resource-usage */
  getTaskResourceUsage: async (taskId: string): Promise<FirmwareTaskResourceUsage> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/resource-usage`, { headers: getHeaders() });
    return normalizeTaskResourceUsage(await handleResponse(r));
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

  /** GET /api/app/firmware-unpacker/tools */
  getTools: async (): Promise<FirmwareToolList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tools`, { headers: getHeaders() });
    return normalizeToolList(await handleResponse(r));
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
