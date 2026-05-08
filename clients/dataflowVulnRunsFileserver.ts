import {
  dataflowVulnScannerApi,
  DataflowHistoryRunCycle,
  DataflowHistoryRunDetail,
  DataflowHistoryRunFile,
  DataflowHistoryRunMutationResponse,
  DataflowHistoryRunResolve,
  DataflowHistoryRunRetryPayload,
  DataflowHistoryRunSession,
  DataflowHistoryRunSummary,
} from './dataflowVulnScanner';

export const DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT = '/dataflow-vuln-scanner/runs';

export type DataflowFileserverRunFile = DataflowHistoryRunFile;
export type DataflowFileserverRunSession = DataflowHistoryRunSession;
export type DataflowFileserverRunSummary = DataflowHistoryRunSummary;
export type DataflowFileserverRunOverview = DataflowHistoryRunDetail;
export type DataflowFileserverRunDetail = DataflowHistoryRunDetail;

const resolveCache = new Map<string, Promise<DataflowHistoryRunResolve>>();
const overviewCache = new Map<string, { promise: Promise<DataflowFileserverRunOverview>; expiresAt: number }>();
const OVERVIEW_CACHE_TTL_MS = 1500;

const normalizeProjectPath = (value: string) => {
  const text = String(value || '/').trim() || '/';
  const withRoot = text.startsWith('/') ? text : `/${text}`;
  return withRoot.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const resolveCacheKey = (projectId: string, rootPath: string, runName: string) =>
  `${projectId}::${normalizeProjectPath(rootPath)}::${String(runName || '').split('/').filter(Boolean).pop() || ''}`;

const clearResolveCache = (projectId: string, rootPath: string, runName: string) => {
  resolveCache.delete(resolveCacheKey(projectId, rootPath, runName));
  overviewCache.delete(resolveCacheKey(projectId, rootPath, runName));
};

const resolveRun = async (
  projectId: string,
  rootPath: string,
  runName: string,
  options?: { force?: boolean }
): Promise<DataflowHistoryRunResolve> => {
  const safeName = String(runName || '').split('/').filter(Boolean).pop() || '';
  if (!safeName) throw new Error('run name is required');
  const cacheKey = resolveCacheKey(projectId, rootPath, safeName);
  if (options?.force) {
    resolveCache.delete(cacheKey);
  }
  const cached = resolveCache.get(cacheKey);
  if (cached) return cached;
  const promise = (async () => {
    const normalizedRootPath = normalizeProjectPath(rootPath);
    return dataflowVulnScannerApi.resolveHistoryRun(projectId, safeName, normalizedRootPath);
  })();
  resolveCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (error) {
    resolveCache.delete(cacheKey);
    throw error;
  }
};

export const inspectDataflowFileserverRunOverview = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunOverview> => {
  const cacheKey = resolveCacheKey(projectId, rootPath, runName);
  const now = Date.now();
  const cached = overviewCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  const promise = (async () => {
    const resolved = await resolveRun(projectId, rootPath, runName);
    return dataflowVulnScannerApi.getHistoryRun(resolved.history_run_id);
  })();
  overviewCache.set(cacheKey, { promise, expiresAt: now + OVERVIEW_CACHE_TTL_MS });
  try {
    return await promise;
  } catch (error) {
    overviewCache.delete(cacheKey);
    throw error;
  }
};

export const inspectDataflowFileserverRunCycle = async (
  projectId: string,
  rootPath: string,
  runName: string,
  cycle: number
): Promise<DataflowHistoryRunCycle> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.getHistoryRunCycle(resolved.history_run_id, cycle);
};

export const listDataflowFileserverRunSessions = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunSession[]> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.listHistoryRunSessions(resolved.history_run_id);
};

export const listDataflowFileserverRunFiles = async (
  projectId: string,
  rootPath: string,
  runName: string,
  limit = 1200
): Promise<DataflowFileserverRunFile[]> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.listHistoryRunFiles(resolved.history_run_id, limit);
};

export const getDataflowFileserverRunLog = async (
  projectId: string,
  rootPath: string,
  runName: string,
  lines = 2000
): Promise<string> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  const payload = await dataflowVulnScannerApi.getHistoryRunLog(resolved.history_run_id, lines);
  return payload.content || '';
};

export const getDataflowFileserverRunFile = async (
  projectId: string,
  rootPath: string,
  runName: string,
  path: string
): Promise<{ path: string; type: string; content: string }> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.getHistoryRunFile(resolved.history_run_id, path);
};

export const getDataflowFileserverRunSessionFile = async (
  projectId: string,
  rootPath: string,
  runName: string,
  path: string
): Promise<Record<string, any>> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.getHistoryRunSessionFile(resolved.history_run_id, path);
};

export const inspectDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunDetail> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.getHistoryRun(resolved.history_run_id);
};

export const adoptDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowHistoryRunMutationResponse> => {
  const resolved = await resolveRun(projectId, rootPath, runName, { force: true });
  const payload = await dataflowVulnScannerApi.adoptHistoryRun(resolved.history_run_id);
  clearResolveCache(projectId, rootPath, runName);
  return payload;
};

export const cancelDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowHistoryRunMutationResponse> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  const payload = await dataflowVulnScannerApi.cancelHistoryRun(resolved.history_run_id);
  clearResolveCache(projectId, rootPath, runName);
  return payload;
};

export const retryDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string,
  retryPayload: DataflowHistoryRunRetryPayload = {}
): Promise<DataflowHistoryRunMutationResponse> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  const payload = await dataflowVulnScannerApi.retryHistoryRun(resolved.history_run_id, retryPayload);
  clearResolveCache(projectId, rootPath, runName);
  return payload;
};

export const deleteDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowHistoryRunMutationResponse> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  const payload = await dataflowVulnScannerApi.deleteHistoryRun(resolved.history_run_id);
  clearResolveCache(projectId, rootPath, runName);
  return payload;
};
