export const API_BASE = '';

export const getHeaders = () => {
  const token = localStorage.getItem('secflow_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
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
    if (errorData.code) (error as any).code = errorData.code;
    if (errorData.details) (error as any).details = errorData.details;
    throw error;
  }

  const parsed = await parseResponseBody(response);
  return parsed;
};

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
        rejectOnce(new Error(extractErrorMessage(errorData, status)));
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
