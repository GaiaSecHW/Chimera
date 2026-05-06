import {
  dataflowVulnScannerApi,
  DataflowHistoryRunCycle,
  DataflowHistoryRunDetail,
  DataflowHistoryRunFile,
  DataflowHistoryRunResolve,
  DataflowHistoryRunSession,
  DataflowHistoryRunSummary,
} from './dataflowVulnScanner';

export const DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT = '/dataflow-vuln-scanner/runs';

export const DATAFLOW_FILESERVER_RUNS_ROOT_CANDIDATES = [
  DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  '/DATAFLOW_VULN_SCANNER/runs',
];

export type DataflowFileserverRunFile = DataflowHistoryRunFile;
export type DataflowFileserverRunSession = DataflowHistoryRunSession;
export type DataflowFileserverRunSummary = DataflowHistoryRunSummary;
export type DataflowFileserverRunOverview = DataflowHistoryRunDetail;
export type DataflowFileserverRunDetail = DataflowHistoryRunDetail;

const resolveCache = new Map<string, Promise<DataflowHistoryRunResolve>>();

const normalizeProjectPath = (value: string) => {
  const text = String(value || '/').trim() || '/';
  const withRoot = text.startsWith('/') ? text : `/${text}`;
  return withRoot.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const resolveCacheKey = (projectId: string, rootPath: string, runName: string) =>
  `${projectId}::${normalizeProjectPath(rootPath)}::${String(runName || '').split('/').filter(Boolean).pop() || ''}`;

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
  const promise = dataflowVulnScannerApi.resolveHistoryRun(projectId, safeName, normalizeProjectPath(rootPath));
  resolveCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (error) {
    resolveCache.delete(cacheKey);
    throw error;
  }
};

export const listDataflowFileserverRuns = async (
  projectId: string,
  _rootCandidates: string[] = DATAFLOW_FILESERVER_RUNS_ROOT_CANDIDATES
): Promise<{ rootPath: string; runs: DataflowFileserverRunSummary[] }> => {
  const runs = await dataflowVulnScannerApi.listHistoryRuns(projectId);
  const preferredRoot = runs.find((item) => item.root_path)?.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT;
  return {
    rootPath: preferredRoot,
    runs,
  };
};

export const inspectDataflowFileserverRunOverview = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunOverview> => {
  const resolved = await resolveRun(projectId, rootPath, runName);
  return dataflowVulnScannerApi.getHistoryRun(resolved.history_run_id);
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
