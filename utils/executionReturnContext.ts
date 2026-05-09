export type BinarySecurityReturnContext = {
  view: 'binary-security-detail' | 'source-security-detail';
  taskId: string;
  taskType: 'binary' | 'source';
};

type NavigateDetail = {
  view?: string;
  helperKey?: string;
  processMonitorServiceKey?: string;
  binarySecurityTaskId?: string;
  sourceSecurityTaskId?: string;
};

export type BinarySecurityTaskOrigin = {
  task_origin_type?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
};

const STORAGE_KEY = 'secflow:binarySecurityReturnContext';

export const saveBinarySecurityReturnContext = (context: BinarySecurityReturnContext) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
};

export const getBinarySecurityReturnContext = (): BinarySecurityReturnContext | null => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BinarySecurityReturnContext>;
    if (
      (parsed.view === 'binary-security-detail' || parsed.view === 'source-security-detail')
      && (parsed.taskType === 'binary' || parsed.taskType === 'source')
      && typeof parsed.taskId === 'string'
      && parsed.taskId.trim()
    ) {
      return {
        view: parsed.view,
        taskId: parsed.taskId.trim(),
        taskType: parsed.taskType,
      };
    }
  } catch {
    // ignore malformed data
  }
  return null;
};

export const clearBinarySecurityReturnContext = () => {
  sessionStorage.removeItem(STORAGE_KEY);
};

export const hasBinarySecurityReturnContext = () => Boolean(getBinarySecurityReturnContext());

export const getBinarySecurityOriginReturnContext = (
  origin?: BinarySecurityTaskOrigin | null,
): BinarySecurityReturnContext | null => {
  const parentTaskId = String(origin?.parent_task_id || '').trim();
  if (String(origin?.task_origin_type || '').trim() !== 'binary_security' || !parentTaskId) {
    return null;
  }
  const taskType = String(origin?.parent_task_type || '').trim() === 'source' ? 'source' : 'binary';
  return {
    view: taskType === 'source' ? 'source-security-detail' : 'binary-security-detail',
    taskId: parentTaskId,
    taskType,
  };
};

export const hasBinarySecurityReturnTarget = (origin?: BinarySecurityTaskOrigin | null) => (
  Boolean(getBinarySecurityOriginReturnContext(origin)) || hasBinarySecurityReturnContext()
);

const navigateToBinarySecurityContext = (context: BinarySecurityReturnContext): boolean => {
  const detail: NavigateDetail =
    context.taskType === 'source'
      ? { view: context.view, sourceSecurityTaskId: context.taskId }
      : { view: context.view, binarySecurityTaskId: context.taskId };
  window.dispatchEvent(new CustomEvent<NavigateDetail>('secflow-navigate-view', { detail }));
  return true;
};

export const navigateBackByTaskOrigin = (origin?: BinarySecurityTaskOrigin | null): boolean => {
  const context = getBinarySecurityOriginReturnContext(origin);
  if (!context) return false;
  clearBinarySecurityReturnContext();
  return navigateToBinarySecurityContext(context);
};

export const navigateBackToBinarySecurityTask = (): boolean => {
  const context = getBinarySecurityReturnContext();
  if (!context) return false;
  clearBinarySecurityReturnContext();
  return navigateToBinarySecurityContext(context);
};
