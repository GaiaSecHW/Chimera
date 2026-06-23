export type BinarySecurityReturnContext = {
  view: 'binary-security-detail' | 'source-security-detail' | 'kg-source-security-detail' | 'binary-module-security-detail';
  taskId: string;
  taskType: 'binary' | 'source' | 'binary_module';
};

export type ExecutionReturnContext =
  | { view: 'entry-analysis-task' }
  | { view: 'system-analysis-task' }
  | { view: 'dataflow-analysis-task' }
  | { view: 'dataflow-vuln-scan-task' }
  | { view: 'cfg-guided-explore-task' }
  | { view: 'cfg-db-vuln-tool' }
  | { view: 'pentest-exec-b2s' }
  | { view: 'pentest-exec-b2s-detail'; b2sTaskId: string };

type NavigateDetail = {
  view?: string;
  helperKey?: string;
  processMonitorServiceKey?: string;
  binarySecurityTaskId?: string;
  sourceSecurityTaskId?: string;
  b2sTaskId?: string;
  dataflowVulnScanTaskId?: string;
  cfgGuidedExploreTaskId?: string;
};

export type BinarySecurityTaskOrigin = {
  task_origin_type?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
};

const STORAGE_KEY = 'chimera:binarySecurityReturnContext';
const EXECUTION_RETURN_STORAGE_KEY = 'chimera:executionReturnContext';
const TASK_CENTER_RETURN_STORAGE_KEY = 'chimera:taskCenterReturnContext';

export const saveBinarySecurityReturnContext = (context: BinarySecurityReturnContext) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
};

export const getBinarySecurityReturnContext = (): BinarySecurityReturnContext | null => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BinarySecurityReturnContext>;
    if (
      (parsed.view === 'binary-security-detail' || parsed.view === 'source-security-detail' || parsed.view === 'kg-source-security-detail' || parsed.view === 'binary-module-security-detail')
      && (parsed.taskType === 'binary' || parsed.taskType === 'source' || parsed.taskType === 'binary_module')
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

export const saveExecutionReturnContext = (context: ExecutionReturnContext) => {
  sessionStorage.setItem(EXECUTION_RETURN_STORAGE_KEY, JSON.stringify(context));
};

export const getExecutionReturnContext = (): ExecutionReturnContext | null => {
  const raw = sessionStorage.getItem(EXECUTION_RETURN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExecutionReturnContext>;
    if (
      (parsed.view === 'entry-analysis-task'
        || parsed.view === 'system-analysis-task'
        || parsed.view === 'dataflow-analysis-task'
        || parsed.view === 'dataflow-vuln-scan-task'
        || parsed.view === 'cfg-guided-explore-task'
        || parsed.view === 'pentest-exec-b2s')
    ) {
      return { view: parsed.view };
    }
    if (parsed.view === 'pentest-exec-b2s-detail' && typeof parsed.b2sTaskId === 'string' && parsed.b2sTaskId.trim()) {
      return { view: parsed.view, b2sTaskId: parsed.b2sTaskId.trim() };
    }
  } catch {
    // ignore malformed data
  }
  return null;
};

export const clearExecutionReturnContext = () => {
  sessionStorage.removeItem(EXECUTION_RETURN_STORAGE_KEY);
};

export const hasExecutionReturnContext = () => Boolean(getExecutionReturnContext());

export const hasBinarySecurityReturnContext = () => Boolean(getBinarySecurityReturnContext());

export const saveTaskCenterReturnContext = () => {
  sessionStorage.setItem(TASK_CENTER_RETURN_STORAGE_KEY, '1');
};

export const consumeTaskCenterReturnContext = (): boolean => {
  const hasContext = sessionStorage.getItem(TASK_CENTER_RETURN_STORAGE_KEY) === '1';
  if (hasContext) {
    sessionStorage.removeItem(TASK_CENTER_RETURN_STORAGE_KEY);
  }
  return hasContext;
};

export const getBinarySecurityOriginReturnContext = (
  origin?: BinarySecurityTaskOrigin | null,
): BinarySecurityReturnContext | null => {
  const parentTaskId = String(origin?.parent_task_id || '').trim();
  if (String(origin?.task_origin_type || '').trim() !== 'binary_security' || !parentTaskId) {
    return null;
  }
  const parentTaskType = String(origin?.parent_task_type || '').trim();
  const taskType = parentTaskType === 'source' ? 'source' : parentTaskType === 'binary_module' ? 'binary_module' : 'binary';
  return {
    view: taskType === 'source' ? 'source-security-detail' : taskType === 'binary_module' ? 'binary-module-security-detail' : 'binary-security-detail',
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
  window.dispatchEvent(new CustomEvent<NavigateDetail>('chimera-navigate-view', { detail }));
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

const navigateToExecutionContext = (context: ExecutionReturnContext): boolean => {
  const detail: NavigateDetail =
    context.view === 'pentest-exec-b2s-detail'
      ? { view: context.view, b2sTaskId: context.b2sTaskId }
      : { view: context.view };
  window.dispatchEvent(new CustomEvent<NavigateDetail>('chimera-navigate-view', { detail }));
  return true;
};

export const navigateBackToExecutionView = (): boolean => {
  const context = getExecutionReturnContext();
  if (!context) return false;
  clearExecutionReturnContext();
  return navigateToExecutionContext(context);
};
