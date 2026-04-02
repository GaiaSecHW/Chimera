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
