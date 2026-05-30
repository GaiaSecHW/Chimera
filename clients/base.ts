export const API_BASE = '';
const nativeFetch = globalThis.fetch.bind(globalThis);

export const getHeaders = () => {
  const token = localStorage.getItem('secflow_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem('secflow_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const stringifyErrorPart = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => stringifyErrorPart(item)).filter(Boolean).join('；');
  }

  if (typeof value === 'object') {
    const location = Array.isArray(value.loc) ? value.loc.join('.') : '';
    const message = value.msg || value.message || value.detail || '';
    if (location && message) return `${location}: ${message}`;
    if (message) return String(message);
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${stringifyErrorPart(item)}`)
      .filter((item) => !item.endsWith(': '))
      .join('；');
  }

  return String(value);
};

const extractErrorMessage = (errorData: any, status: number): string => {
  const candidates = [
    errorData?.detail,
    errorData?.error,
    errorData?.message,
    errorData?.details,
  ];

  for (const candidate of candidates) {
    const formatted = stringifyErrorPart(candidate).trim();
    if (formatted) return formatted;
  }

  return `API Error (${status})`;
};

const parseResponseBody = async (response: Response): Promise<any> => {
  if (response.status === 204) return null;
  const raw = await response.text();
  if (!raw) return null;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through and return plain text
    }
  }
  return raw;
};

export const handleResponse = async (response: Response) => {
  // 处理 401 Token 失效
  if (response.status === 401) {
    const isLoginRequest = response.url.includes('/api/auth/login');
    if (!isLoginRequest) {
      // 清除本地存储
      localStorage.removeItem('secflow_token');
      // 派发全局事件通知 UI 层
      window.dispatchEvent(new Event('secflow-unauthorized'));
      throw new Error('登录会话已过期，请重新登录');
    }
  }

  if (!response.ok) {
    const parsed = await parseResponseBody(response).catch(() => ({ detail: 'Unknown error' }));
    const errorData = typeof parsed === 'string' ? { detail: parsed } : (parsed || { detail: 'Unknown error' });
    const message = extractErrorMessage(errorData, response.status);
    const error = new Error(message);
    (error as any).status = response.status;
    if (errorData.code) (error as any).code = errorData.code;
    if (errorData.details) (error as any).details = errorData.details;
    throw error;
  }

  const parsed = await parseResponseBody(response);
  return parsed;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('connection reset') ||
    message.includes('err_connection_reset')
  );
};

export const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { retries?: number; retryDelayMs?: number; retryOnStatus?: number[] },
): Promise<Response> => {
  const retries = Math.max(0, options?.retries ?? 2);
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 300);
  const statusAllowlist = options?.retryOnStatus && options.retryOnStatus.length > 0
    ? options.retryOnStatus
    : [408, 429, 500, 502, 503, 504];

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await nativeFetch(input, init);
      if (!statusAllowlist.includes(response.status) || attempt >= retries) {
        return response;
      }
      await sleep(retryDelayMs * (attempt + 1));
      continue;
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt >= retries) {
        throw error;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('请求失败');
};

type DedupeGetJsonOptions = {
  ttlMs?: number;
  useRetry?: boolean;
  retryOptions?: { retries?: number; retryDelayMs?: number; retryOnStatus?: number[] };
  timeoutMs?: number;
};

const DEFAULT_GET_DEDUPE_TTL_MS = 250;
const pendingGetJsonRequests = new Map<string, { promise: Promise<any>; expiresAt: number }>();
const pendingGetResponseRequests = new Map<string, { promise: Promise<Response>; expiresAt: number }>();
let globalGetRequestDedupeInstalled = false;

const buildGetDedupeKey = (input: RequestInfo | URL, init?: RequestInit): string => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const headers = new Headers(init?.headers || {});
  return JSON.stringify({
    url,
    method: (init?.method || 'GET').toUpperCase(),
    authorization: headers.get('Authorization') || '',
    accept: headers.get('Accept') || '',
    contentType: headers.get('Content-Type') || '',
    cache: init?.cache || '',
    credentials: init?.credentials || '',
  });
};

const resolveRequestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  const requestMethod = input instanceof Request ? input.method : undefined;
  return (init?.method || requestMethod || 'GET').toUpperCase();
};

const hasAbortSignal = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  if (init?.signal) return true;
  return input instanceof Request && !!input.signal;
};

const hasDedupeBypassHeader = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  const requestHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(init?.headers || requestHeaders || undefined);
  return headers.get('x-secflow-no-request-dedupe') === '1';
};

export const fetchWithGetDedupe = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { ttlMs?: number },
): Promise<Response> => {
  const method = resolveRequestMethod(input, init);
  if (method !== 'GET' || hasAbortSignal(input, init) || hasDedupeBypassHeader(input, init)) {
    return nativeFetch(input, init);
  }

  const ttlMs = Math.max(0, options?.ttlMs ?? DEFAULT_GET_DEDUPE_TTL_MS);
  const key = buildGetDedupeKey(input, init);
  const now = Date.now();
  const existing = pendingGetResponseRequests.get(key);
  if (existing && existing.expiresAt > now) {
    const response = await existing.promise;
    return response.clone();
  }

  const promise = nativeFetch(input, init);
  pendingGetResponseRequests.set(key, {
    promise,
    expiresAt: now + ttlMs,
  });

  try {
    const response = await promise;
    return response.clone();
  } catch (error) {
    const current = pendingGetResponseRequests.get(key);
    if (current?.promise === promise) {
      pendingGetResponseRequests.delete(key);
    }
    throw error;
  } finally {
    window.setTimeout(() => {
      const current = pendingGetResponseRequests.get(key);
      if (current?.promise === promise && current.expiresAt <= Date.now()) {
        pendingGetResponseRequests.delete(key);
      }
    }, ttlMs);
  }
};

export const installGlobalGetRequestDedupe = () => {
  if (globalGetRequestDedupeInstalled) return;
  globalGetRequestDedupeInstalled = true;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    fetchWithGetDedupe(input, init)
  )) as typeof fetch;
};

const withRequestTimeout = async (
  _input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number | undefined,
  runner: (nextInit: RequestInit | undefined) => Promise<Response>,
): Promise<Response> => {
  const normalizedTimeoutMs = Math.max(0, Math.trunc(timeoutMs || 0));
  if (!normalizedTimeoutMs) {
    return runner(init);
  }

  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let timer: number | null = null;
  let abortHandler: (() => void) | null = null;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      abortHandler = () => controller.abort(upstreamSignal.reason);
      upstreamSignal.addEventListener('abort', abortHandler, { once: true });
    }
  }
  timer = window.setTimeout(() => controller.abort(new Error(`Request timed out after ${normalizedTimeoutMs}ms`)), normalizedTimeoutMs);
  try {
    return await runner({ ...(init || {}), signal: controller.signal });
  } finally {
    if (timer != null) window.clearTimeout(timer);
    if (upstreamSignal && abortHandler) {
      upstreamSignal.removeEventListener('abort', abortHandler);
    }
  }
};

const fetchWithOptionalRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: DedupeGetJsonOptions,
): Promise<Response> => (
  withRequestTimeout(
    input,
    init,
    options?.timeoutMs,
    (nextInit) => (
      options?.useRetry
        ? fetchWithRetry(input, nextInit, options.retryOptions)
        : fetchWithGetDedupe(input, nextInit)
    ),
  )
);

const getWithDedupe = async <T,>(
  input: RequestInfo | URL,
  loader: () => Promise<T>,
  init?: RequestInit,
  options?: DedupeGetJsonOptions,
): Promise<T> => {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return loader();
  }

  const ttlMs = Math.max(0, options?.ttlMs ?? DEFAULT_GET_DEDUPE_TTL_MS);
  const key = buildGetDedupeKey(input, init);
  const now = Date.now();
  const existing = pendingGetJsonRequests.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise as Promise<T>;
  }

  const promise = loader();

  pendingGetJsonRequests.set(key, {
    promise,
    expiresAt: now + ttlMs,
  });

  try {
    return await promise;
  } catch (error) {
    const current = pendingGetJsonRequests.get(key);
    if (current?.promise === promise) {
      pendingGetJsonRequests.delete(key);
    }
    throw error;
  } finally {
    window.setTimeout(() => {
      const current = pendingGetJsonRequests.get(key);
      if (current?.promise === promise && current.expiresAt <= Date.now()) {
        pendingGetJsonRequests.delete(key);
      }
    }, ttlMs);
  }
};

export const getJsonWithDedupe = async <T,>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: DedupeGetJsonOptions,
): Promise<T> => getWithDedupe(
  input,
  async () => {
    const response = await fetchWithOptionalRetry(input, init, options);
    return handleResponse(response);
  },
  init,
  options,
);

export const getTextWithDedupe = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: DedupeGetJsonOptions,
): Promise<string> => getWithDedupe(
  input,
  async () => {
    const response = await fetchWithOptionalRetry(input, init, options);
    const payload = await handleResponse(response);
    return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  },
  init,
  options,
);

export interface XhrUploadProgress {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

const parseXhrResponse = (xhr: XMLHttpRequest): any => {
  const raw = xhr.responseText || '';
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const buildApiError = (message: string, extras?: { status?: number; code?: string; details?: any }) => {
  const error = new Error(message);
  if (extras?.status != null) (error as any).status = extras.status;
  if (extras?.code) (error as any).code = extras.code;
  if (extras?.details !== undefined) (error as any).details = extras.details;
  return error;
};

export const xhrUpload = <TResult,>(params: {
  url: string;
  formData: FormData;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
  signal?: AbortSignal;
  onProgress?: (event: XhrUploadProgress) => void;
}): Promise<TResult> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const method = params.method || 'POST';
    const startedAt = Date.now();
    let lastLoaded = 0;
    let lastAt = startedAt;

    xhr.open(method, params.url, true);
    Object.entries(params.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    let settled = false;
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const resolveOnce = (value: TResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    xhr.upload.onprogress = (event) => {
      if (!params.onProgress) return;
      const now = Date.now();
      const loaded = event.loaded || 0;
      const total = event.total || 0;
      const deltaMs = Math.max(now - lastAt, 1);
      const speed = Math.max(0, ((loaded - lastLoaded) * 1000) / deltaMs);
      lastLoaded = loaded;
      lastAt = now;
      params.onProgress({
        loaded_bytes: loaded,
        total_bytes: total,
        speed_bytes_per_sec: speed,
        elapsed_ms: now - startedAt,
      });
    };

    xhr.onerror = () => {
      const payload = parseXhrResponse(xhr);
      if (xhr.status > 0) {
        const errorData = typeof payload === 'string' ? { detail: payload } : payload || { detail: `API Error (${xhr.status})` };
        rejectOnce(buildApiError(extractErrorMessage(errorData, xhr.status), {
          status: xhr.status,
          code: errorData.code,
          details: errorData.details,
        }));
        return;
      }
      rejectOnce(new Error('网络错误，上传失败'));
    };

    xhr.onabort = () => {
      rejectOnce(new Error('上传已取消'));
    };

    xhr.onload = () => {
      const status = xhr.status;
      const payload = parseXhrResponse(xhr);
      if (status === 401) {
        localStorage.removeItem('secflow_token');
        window.dispatchEvent(new Event('secflow-unauthorized'));
        rejectOnce(new Error('登录会话已过期，请重新登录'));
        return;
      }
      if (status < 200 || status >= 300) {
        const errorData = typeof payload === 'string' ? { detail: payload } : payload || { detail: 'Unknown error' };
        rejectOnce(buildApiError(extractErrorMessage(errorData, status), {
          status,
          code: errorData.code,
          details: errorData.details,
        }));
        return;
      }
      resolveOnce(payload as TResult);
    };

    const abortBySignal = () => xhr.abort();
    if (params.signal) {
      if (params.signal.aborted) {
        xhr.abort();
        return;
      }
      params.signal.addEventListener('abort', abortBySignal, { once: true });
    }

    xhr.send(params.formData);
  });
};
