import type { ProjectFilesystemEntry } from '../types/types';
import { fileserverApi } from './fileserver';

export const DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT = '/dataflow-vuln-scanner/runs';

export const DATAFLOW_FILESERVER_RUNS_ROOT_CANDIDATES = [
  DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  '/DATAFLOW_VULN_SCANNER/runs',
];

const RUNNING_WORKFLOW_STATES = new Set([
  'created',
  'start_plugins',
  'worker',
  'reflect',
  'summary',
  'global_review',
  'result_review',
  'end_plugins',
  'running',
  'queued',
  'pending',
  'cancel_requested',
]);

const TERMINAL_STATUSES = new Set([
  'completed',
  'succeeded',
  'failed',
  'interrupted',
  'cancelled',
  'stopped',
  'review_error',
  'review_plateau',
  'summary_incomplete',
  'runtime_output_limit',
  'runtime_timeout',
  'blocked_context_window',
  'blocked_quota',
  'provider_rate_limited',
  'model_contract_violation',
  'no_workspace',
  'error',
]);

interface RunProvider {
  list: (path: string) => Promise<{ directories: ProjectFilesystemEntry[]; files: ProjectFilesystemEntry[] }>;
  readText: (path: string) => Promise<string>;
}

export interface DataflowFileserverRunFile {
  category: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  type: string;
}

export interface DataflowFileserverRunSession {
  session_id: string;
  format: 'jsonl' | 'calls' | 'hybrid';
  worker_id: string;
  jsonl_path: string;
  jsonl_files?: string[];
  size: number;
  mtime: number;
  calls: any[];
  kind?: string;
  cycle?: number;
  advisor_id?: string;
  result_file?: string;
  model?: string;
  thinking?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  tools?: string;
  latest_heartbeat?: string;
  call_count?: number;
  completed_calls?: number;
  failed_calls?: number;
  total_duration_ms?: number;
  total_output_len?: number;
  total_prompt_len?: number;
}

export interface DataflowFileserverRunSummary {
  name: string;
  path: string;
  status: string;
  start_time: string;
  start_epoch: number;
  duration_seconds: number;
  last_activity: string;
  model: string;
  provider: string;
  thinking: string;
  max_cycles: number;
  cycles_used: number;
  result_count: number;
  passed_count: number;
  failed_count: number;
  workflow_mode: string;
  updated_at?: string | null;
}

export interface DataflowFileserverRunOverview extends DataflowFileserverRunSummary {
  config: Record<string, any>;
  error?: string | null;
  cycles: Record<string, any>[];
  results: Record<string, any>[];
  removed_results: Record<string, any>[];
  manifests: Record<string, any>;
  latest_issues: Record<string, any>[];
  atomic_work_path: string;
}

export interface DataflowFileserverRunDetail extends DataflowFileserverRunOverview {
  files: DataflowFileserverRunFile[];
  sessions: DataflowFileserverRunSession[];
  run_log: string;
  raw: Record<string, any>;
}

const normalizeProjectPath = (value: string) => {
  const text = String(value || '/').trim() || '/';
  const withRoot = text.startsWith('/') ? text : `/${text}`;
  return withRoot.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const joinPath = (...parts: string[]) => {
  const joined = parts
    .map((part, index) => {
      const text = String(part || '');
      if (index === 0) return text.replace(/\/+$/g, '');
      return text.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
  return normalizeProjectPath(joined || '/');
};

const relativePath = (path: string, base: string) => {
  const normalizedPath = normalizeProjectPath(path);
  const normalizedBase = normalizeProjectPath(base);
  if (normalizedPath === normalizedBase) return '';
  if (normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath.slice(normalizedBase.length + 1);
  }
  return normalizedPath.replace(/^\//, '');
};

const basename = (path: string) => String(path || '').split('/').filter(Boolean).pop() || '';
const stem = (path: string) => basename(path).replace(/\.[^.]+$/, '');

const isObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readJson = async (provider: RunProvider, path: string): Promise<Record<string, any>> => {
  try {
    const parsed = JSON.parse(await provider.readText(path));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const readText = async (provider: RunProvider, path: string): Promise<string> => {
  try {
    return await provider.readText(path);
  } catch {
    return '';
  }
};

const safeList = async (provider: RunProvider, path: string) => {
  try {
    return await provider.list(path);
  } catch {
    return null;
  }
};

const getFileType = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.jsonl')) return 'jsonl';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
};

const parseIsoEpoch = (value?: string | null) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
};

const parseTimestampFromName = (name: string) => {
  const match = String(name || '').match(/(\d{8})_(\d{6})(?:$|\D)/) || String(name || '').match(/(\d{8})_(\d{6})/);
  if (!match) return '';
  const [, date, time] = match;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
};

const parseStartEpochFromName = (name: string) => {
  const text = parseTimestampFromName(name);
  if (!text) return 0;
  const parsed = Date.parse(`${text.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
};

const normalizeRunStatus = (rawStatus?: string | null, runMeta?: Record<string, any>) => {
  const text = String(rawStatus || '').trim().toLowerCase();
  const metaStatus = String(runMeta?.status || '').trim().toLowerCase();
  if (runMeta?.finished_at && TERMINAL_STATUSES.has(metaStatus)) return metaStatus;
  if (TERMINAL_STATUSES.has(text)) return text;
  if (RUNNING_WORKFLOW_STATES.has(text)) {
    return text === 'pending' || text === 'queued' ? text : 'running';
  }
  return text || 'pending';
};

const numberValue = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const sortByCycleName = (a: ProjectFilesystemEntry, b: ProjectFilesystemEntry) => {
  const left = numberValue(a.name.match(/cycle_(\d+)/)?.[1], 0);
  const right = numberValue(b.name.match(/cycle_(\d+)/)?.[1], 0);
  if (left !== right) return left - right;
  return a.name.localeCompare(b.name);
};

const listFiles = async (provider: RunProvider, path: string, pattern?: RegExp) => {
  const payload = await safeList(provider, path);
  const files = payload?.files || [];
  return pattern ? files.filter((file) => pattern.test(file.name)) : files;
};

const listDirectories = async (provider: RunProvider, path: string, pattern?: RegExp) => {
  const payload = await safeList(provider, path);
  const dirs = payload?.directories || [];
  return pattern ? dirs.filter((dir) => pattern.test(dir.name)) : dirs;
};

const padCycle = (cycle: number | string) => String(numberValue(cycle, 0)).padStart(3, '0');

const sortByName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

const parseJsonLines = async (provider: RunProvider, path: string) => {
  const text = await readText(provider, path);
  const items: Record<string, any>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isObject(parsed)) items.push(parsed);
    } catch {
      // ignore malformed lines
    }
  }
  return items;
};

const sessionIdentity = (sessionId: string) => {
  const workerMatch = sessionId.match(/^worker_(.+)_cycle_(\d+)$/);
  if (workerMatch) {
    return {
      kind: 'worker',
      cycle: numberValue(workerMatch[2], 0),
      label: workerMatch[1],
      advisor_id: '',
      result_file: '',
    };
  }

  const globalMatch = sessionId.match(/^global_review_cycle_(\d+)_(.+)$/);
  if (globalMatch) {
    return {
      kind: 'global_review',
      cycle: numberValue(globalMatch[1], 0),
      label: globalMatch[2],
      advisor_id: globalMatch[2],
      result_file: '',
    };
  }

  const resultMatch = sessionId.match(/^result_review_cycle_(\d+)_(result_\d+)_(.+)$/);
  if (resultMatch) {
    return {
      kind: 'result_review',
      cycle: numberValue(resultMatch[1], 0),
      label: `${resultMatch[2]}.md`,
      advisor_id: resultMatch[3],
      result_file: `${resultMatch[2]}.md`,
    };
  }

  return {
    kind: 'session',
    cycle: 0,
    label: sessionId,
    advisor_id: '',
    result_file: '',
  };
};

const summarizeGlobalReviewAdvisors = (config: Record<string, any>) => {
  const workflows = isObject(config.workflows) ? config.workflows : {};
  const atomic = Array.isArray(workflows.atomic) ? workflows.atomic : [];
  const advisors: Record<string, any>[] = [];
  for (const workflow of atomic) {
    const roles = isObject(workflow?.roles) ? workflow.roles : {};
    const advisorGroup = isObject(roles.advisors) ? roles.advisors : {};
    const globalReview = Array.isArray(advisorGroup.global_review) ? advisorGroup.global_review : [];
    for (const advisor of globalReview) {
      advisors.push({
        instance_id: String(advisor?.instance_id || ''),
        role_name: String(advisor?.role_name || ''),
        score_fields: Array.isArray(advisor?.score_fields) ? advisor.score_fields : [],
        score_thresholds: isObject(advisor?.score_thresholds) ? advisor.score_thresholds : {},
        score_thresholds_start: isObject(advisor?.score_thresholds_start) ? advisor.score_thresholds_start : {},
      });
    }
  }
  return advisors;
};

const extractConfigSummary = (config: Record<string, any>) => {
  const agents = Array.isArray(config.agents) ? config.agents : [];
  const worker = agents.find((item: any) => String(item?.id || '').endsWith('worker')) || agents[0] || {};
  const runtime = isObject(worker.runtime_config) ? worker.runtime_config : {};
  const sdk = isObject(runtime.sdk_specific) ? runtime.sdk_specific : {};
  const globalConfig = isObject(config.global) ? config.global : {};
  const executionConfig = isObject(config.execution) ? config.execution : {};
  return {
    model: String(runtime.model || ''),
    provider: String(sdk.provider || ''),
    thinking: String(sdk.thinking || ''),
    timeout_seconds: numberValue(runtime.timeout_seconds, 0),
    max_review_cycles: numberValue(globalConfig.max_review_cycles, 0),
    parallel_result_review: Boolean(globalConfig.parallel_result_review),
    parallel_result_review_limit: numberValue(globalConfig.parallel_result_review_limit, 0),
    execution_id: String(executionConfig.execution_id || ''),
    task_file: String(executionConfig.input_task?.task_file || ''),
    global_review_advisors: summarizeGlobalReviewAdvisors(config),
  };
};

const deriveWorkspaceCandidate = (runPath: string, runName: string, config: Record<string, any>) => {
  const workspaceRoot = String(config.global?.workspace_root || '').trim();
  if (!workspaceRoot) return '';
  const marker = `/${runName}/`;
  const index = workspaceRoot.lastIndexOf(marker);
  if (index < 0) return '';
  const relative = workspaceRoot.slice(index + marker.length);
  return relative ? joinPath(runPath, relative) : '';
};

type AtomicDirMatch = 'none' | 'possible' | 'definite';

const classifyAtomicDir = async (
  provider: RunProvider,
  path: string,
  payload: { directories: ProjectFilesystemEntry[]; files: ProjectFilesystemEntry[] }
): Promise<AtomicDirMatch> => {
  if (!payload.directories.some((dir) => dir.name === '_meta')) return 'none';
  if (payload.directories.some((dir) => ['results', 'final_output', 'reviews', 'sessions', 'removed_results'].includes(dir.name))) {
    return 'definite';
  }
  const meta = await safeList(provider, joinPath(path, '_meta'));
  const hasWorkflowMeta = !!meta?.files.some((file) => ['workflow_result.json', 'state.json', 'abnormal_exit.json'].includes(file.name));
  if (!hasWorkflowMeta) return 'none';
  const hasNestedExecutionDirs = payload.directories.some((dir) =>
    !['_meta', 'input', 'output', 'detached_logs'].includes(dir.name)
    && (/^stage_\d+/.test(dir.name) || /^pipeline_/.test(dir.name) || /^vuln_scan/.test(dir.name) || /_run_\d+$/.test(dir.name))
  );
  return hasNestedExecutionDirs ? 'possible' : 'definite';
};

const findAtomicUnder = async (provider: RunProvider, path: string, maxDepth: number, visited: Set<string>): Promise<string> => {
  const normalized = normalizeProjectPath(path);
  if (visited.has(normalized)) return '';
  visited.add(normalized);
  const payload = await safeList(provider, normalized);
  if (!payload) return '';
  const atomicMatch = await classifyAtomicDir(provider, normalized, payload);
  if (atomicMatch === 'definite') return normalized;
  if (maxDepth <= 0) return atomicMatch === 'possible' ? normalized : '';

  for (const dir of payload.directories) {
    if (['_meta', 'input', 'output', 'detached_logs'].includes(dir.name)) continue;
    const found = await findAtomicUnder(provider, dir.path, maxDepth - 1, visited);
    if (found) return found;
  }
  return atomicMatch === 'possible' ? normalized : '';
};

const findAtomicWorkPath = async (provider: RunProvider, runPath: string, runName: string, config: Record<string, any>) => {
  const derived = deriveWorkspaceCandidate(runPath, runName, config);
  const candidates = [derived, joinPath(runPath, 'workspace'), joinPath(runPath, 'ws'), runPath].filter(Boolean);
  const visited = new Set<string>();
  for (const candidate of candidates) {
    const found = await findAtomicUnder(provider, candidate, candidate === runPath ? 4 : 3, visited);
    if (found) return found;
  }
  return '';
};

const findLastActivity = async (provider: RunProvider, runPath: string, atomicPath: string) => {
  const candidates: string[] = [];
  if (atomicPath) {
    const state = await readJson(provider, joinPath(atomicPath, '_meta/state.json'));
    if (state.timestamp) candidates.push(String(state.timestamp));
    const summaries = (await listFiles(provider, joinPath(atomicPath, '_meta/review_summaries'), /^cycle_\d+\.json$/)).sort(sortByCycleName);
    if (summaries.length) {
      const latest = await readJson(provider, summaries[summaries.length - 1].path);
      if (latest.timestamp) candidates.push(String(latest.timestamp));
    }
    const workerDirs = await listDirectories(provider, joinPath(atomicPath, 'sessions'));
    for (const workerDir of workerDirs) {
      const jsonlFiles = await listFiles(provider, workerDir.path, /\.jsonl$/);
      for (const jsonlFile of jsonlFiles) {
        if (jsonlFile.updated_at) candidates.push(String(jsonlFile.updated_at));
      }
    }
  }
  const runLog = (await listFiles(provider, runPath)).find((file) => file.name === 'run.log');
  if (runLog?.updated_at) candidates.push(String(runLog.updated_at));
  return candidates.sort().pop() || '';
};

const computeDuration = (runName: string, runMeta: Record<string, any>, atomicWorkflow: Record<string, any>, lastActivity: string, status: string) => {
  const start = parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName);
  let end = parseIsoEpoch(String(runMeta.finished_at || ''));
  if (!end && status === 'running') end = Math.floor(Date.now() / 1000);
  if (!end) end = parseIsoEpoch(String(atomicWorkflow.timestamp || '')) || parseIsoEpoch(lastActivity);
  return start && end && end >= start ? end - start : 0;
};

const manifestPathSummary = (path: string, data: Record<string, any>) => ({
  path,
  exists: Object.keys(data).length > 0,
});

const loadManifestSummary = async (provider: RunProvider, atomicPath: string) => {
  const relationsPath = joinPath(atomicPath, '_meta/result_relations_manifest.json');
  const resultsPath = joinPath(atomicPath, '_meta/results_manifest.json');
  const coveragePath = joinPath(atomicPath, '_meta/coverage_ledger.json');
  const [relations, results, coverage] = await Promise.all([
    readJson(provider, relationsPath),
    readJson(provider, resultsPath),
    readJson(provider, coveragePath),
  ]);
  return {
    result_relations_manifest: manifestPathSummary(relativePath(relationsPath, atomicPath), relations),
    results_manifest: manifestPathSummary(relativePath(resultsPath, atomicPath), results),
    coverage_ledger: manifestPathSummary(relativePath(coveragePath, atomicPath), coverage),
    total_result_files: numberValue(results.total_result_files, Array.isArray(relations.all_results) ? relations.all_results.length : 0),
    active_result_count: numberValue(results.active_result_count, 0),
    inactive_result_count: numberValue(results.inactive_result_count, Array.isArray(relations.inactive_results) ? relations.inactive_results.length : 0),
    taskable_result_count: numberValue(results.taskable_result_count, Array.isArray(relations.taskable_results) ? relations.taskable_results.length : 0),
    supplemental_result_count: numberValue(results.supplemental_result_count, Array.isArray(relations.supplemental_results) ? relations.supplemental_results.length : 0),
    excluded_result_count: Array.isArray(results.excluded_results) ? results.excluded_results.length : Array.isArray(relations.excluded_results) ? relations.excluded_results.length : 0,
    missing_referenced_results: Array.isArray(coverage.missing_referenced_results) ? coverage.missing_referenced_results : [],
    unreferenced_active_results: Array.isArray(coverage.unreferenced_active_results) ? coverage.unreferenced_active_results : [],
  };
};

const readFirstHeading = async (provider: RunProvider, path: string) => {
  const text = await readText(provider, path);
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    if (line.startsWith('#')) return line.replace(/^#+\s*/, '').trim();
  }
  return '';
};

const latestResultReview = async (provider: RunProvider, atomicPath: string, filename: string) => {
  const reviewRoot = joinPath(atomicPath, 'reviews/results', stem(filename));
  const cycleDirs = (await listDirectories(provider, reviewRoot, /^cycle_\d+$/)).sort(sortByCycleName).reverse();
  for (const cycleDir of cycleDirs) {
    const reviewFiles = (await listFiles(provider, cycleDir.path, /\.json$/)).sort((a, b) => a.name.localeCompare(b.name));
    if (reviewFiles[0]) {
      return {
        data: await readJson(provider, reviewFiles[0].path),
        path: relativePath(reviewFiles[0].path, atomicPath),
      };
    }
  }
  return { data: {}, path: '' };
};

const loadCycleGlobalReviews = async (provider: RunProvider, atomicPath: string, cycle: number) => {
  const cycleDir = joinPath(atomicPath, `reviews/global/cycle_${padCycle(cycle)}`);
  const reviewFiles = (await listFiles(provider, cycleDir, /\.json$/)).sort(sortByName);
  return Promise.all(reviewFiles.map(async (file) => {
    const data = await readJson(provider, file.path);
    return {
      advisor_id: String(data.advisor_instance_id || stem(file.name)),
      path: relativePath(file.path, atomicPath),
      role_name: String(data.role_name || ''),
      passed: Boolean(data.passed),
      verdict: String(data.verdict || ''),
      scores: isObject(data.scores) ? data.scores : {},
      confidence: numberValue(data.confidence, 0),
      feedback: String(data.feedback || ''),
      feedback_detail: String(data.feedback_detail || ''),
      schema_valid: data.schema_valid,
      parser_mode: String(data.parser_mode || ''),
      repair_attempts: numberValue(data.repair_attempts, 0),
      issues: Array.isArray(data.issues) ? data.issues : [],
      resolved_issue_ids: Array.isArray(data.resolved_issue_ids) ? data.resolved_issue_ids : [],
      raw_response: String(data.raw_response || ''),
    };
  }));
};

const loadCycleResultReviews = async (provider: RunProvider, atomicPath: string, cycle: number) => {
  const resultRoot = joinPath(atomicPath, 'reviews/results');
  const resultDirs = (await listDirectories(provider, resultRoot)).sort(sortByName);
  const reviews: Record<string, any>[] = [];

  for (const resultDir of resultDirs) {
    const cycleDir = joinPath(resultDir.path, `cycle_${padCycle(cycle)}`);
    const reviewFiles = (await listFiles(provider, cycleDir, /\.json$/)).sort(sortByName);
    for (const file of reviewFiles) {
      const data = await readJson(provider, file.path);
      reviews.push({
        result_file: String(data.result_file || `${resultDir.name}.md`),
        path: relativePath(file.path, atomicPath),
        advisor_id: String(data.advisor_instance_id || stem(file.name)),
        passed: Boolean(data.passed),
        verdict: String(data.verdict || ''),
        confidence: numberValue(data.confidence, 0),
        feedback: String(data.feedback || ''),
        feedback_detail: String(data.feedback_detail || ''),
        schema_valid: data.schema_valid,
        parser_mode: String(data.parser_mode || ''),
        repair_attempts: numberValue(data.repair_attempts, 0),
        scores: isObject(data.scores) ? data.scores : {},
        raw_response: String(data.raw_response || ''),
      });
    }
  }

  return reviews;
};

const loadCycleCheckpoints = async (provider: RunProvider, atomicPath: string, cycle: number) => {
  const root = joinPath(atomicPath, `_meta/checkpoints/steps/cycle_${padCycle(cycle)}`);
  const phaseDirs = (await listDirectories(provider, root)).sort(sortByName);
  const grouped: Record<string, any[]> = {};

  for (const phaseDir of phaseDirs) {
    const phaseFiles = (await listFiles(provider, phaseDir.path, /\.json$/)).sort(sortByName);
    grouped[phaseDir.name] = await Promise.all(phaseFiles.map(async (file) => ({
      name: file.name,
      path: relativePath(file.path, atomicPath),
      data: await readJson(provider, file.path),
    })));
  }

  return grouped;
};

const loadCycleReflection = async (provider: RunProvider, atomicPath: string, cycle: number) => {
  const files = (await listFiles(provider, joinPath(atomicPath, '_meta/reflections'), new RegExp(`^cycle_${padCycle(cycle)}_.*\\.json$`))).sort(sortByName);
  if (!files.length) return null;
  const file = files[0];
  return {
    name: file.name,
    path: relativePath(file.path, atomicPath),
    data: await readJson(provider, file.path),
  };
};

const collectResults = async (provider: RunProvider, atomicPath: string) => {
  let resultsDir = joinPath(atomicPath, 'results');
  let payload = await safeList(provider, resultsDir);
  if (!payload) {
    resultsDir = joinPath(atomicPath, 'final_output/results');
    payload = await safeList(provider, resultsDir);
  }
  if (!payload) return [];

  const [resultsManifest, relationsManifest] = await Promise.all([
    readJson(provider, joinPath(atomicPath, '_meta/results_manifest.json')),
    readJson(provider, joinPath(atomicPath, '_meta/result_relations_manifest.json')),
  ]);
  const nextTasks = await readJson(provider, joinPath(atomicPath, 'output/next_tasks.json'));
  const entries = Array.isArray(resultsManifest.entries)
    ? resultsManifest.entries
    : Array.isArray(relationsManifest.relationships)
      ? relationsManifest.relationships
      : [];
  const entryByName = new Map(entries.filter(isObject).map((item) => [String(item.filename || ''), item]));
  const taskPathByStem = new Map(
    (Array.isArray(nextTasks.tasks) ? nextTasks.tasks : [])
      .filter(isObject)
      .map((item) => {
        const id = String(item.id || '');
        const filePath = String(item.file || '');
        const relative = filePath.startsWith(atomicPath) ? relativePath(filePath, atomicPath) : filePath;
        return [id, relative] as const;
      })
  );
  const resultFiles = payload.files.filter((file) => /^result_\d+\.md$/.test(file.name)).sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(resultFiles.map(async (file) => {
    const [title, review] = await Promise.all([
      readFirstHeading(provider, file.path),
      latestResultReview(provider, atomicPath, file.name),
    ]);
    const manifestEntry = entryByName.get(file.name) || {};
    const latestReview = review.data || {};
    return {
      filename: file.name,
      path: relativePath(file.path, atomicPath),
      title,
      size: numberValue(file.size, 0),
      passed: latestReview.passed,
      verdict: latestReview.verdict || '',
      confidence: numberValue(latestReview.confidence, 0),
      review_cycle: numberValue(latestReview.cycle, 0),
      feedback: latestReview.feedback || '',
      feedback_detail: latestReview.feedback_detail || '',
      schema_valid: latestReview.schema_valid,
      parser_mode: latestReview.parser_mode || '',
      review_path: review.path,
      role: manifestEntry.role || '',
      lifecycle_status: manifestEntry.lifecycle_status || '',
      active: manifestEntry.active ?? true,
      taskable: manifestEntry.taskable ?? true,
      delivery_bucket: manifestEntry.delivery_bucket || 'results',
      multi_finding: Boolean(manifestEntry.multi_finding),
      vulnerability_headings: Array.isArray(manifestEntry.vulnerability_headings) ? manifestEntry.vulnerability_headings : [],
      related_to: manifestEntry.related_to || '',
      inference_signals: Array.isArray(manifestEntry.inference_signals) ? manifestEntry.inference_signals : [],
      task_result_path: taskPathByStem.get(stem(file.name)) || '',
      final_output_path: manifestEntry.delivery_bucket === 'result_supplements'
        ? `final_output/result_supplements/${file.name}`
        : `final_output/results/${file.name}`,
    };
  }));
};

const collectRemovedResults = async (provider: RunProvider, atomicPath: string) => {
  const removedRoot = joinPath(atomicPath, 'removed_results');
  const cycleDirs = (await listDirectories(provider, removedRoot, /^cycle_\d+$/)).sort(sortByCycleName);
  const removed: Record<string, any>[] = [];
  for (const cycleDir of cycleDirs) {
    const metaFiles = (await listFiles(provider, cycleDir.path, /^result_\d+\.json$/)).sort((a, b) => a.name.localeCompare(b.name));
    for (const metaFile of metaFiles) {
      const data = await readJson(provider, metaFile.path);
      let mdPath = metaFile.path.replace(/\.json$/, '.md');
      const backupPath = String(data.backup_path || '');
      if (backupPath && normalizeProjectPath(backupPath).startsWith(`${normalizeProjectPath(atomicPath)}/`)) {
        mdPath = normalizeProjectPath(backupPath);
      }
      removed.push({
        filename: data.original_filename || basename(mdPath),
        path: relativePath(mdPath, atomicPath),
        meta_path: relativePath(metaFile.path, atomicPath),
        cycle: numberValue(data.removed_in_cycle, numberValue(cycleDir.name.match(/cycle_(\d+)/)?.[1], 0)),
        lifecycle_status: data.lifecycle_status || 'inactive',
        reason: data.reason || '',
        signals: Array.isArray(data.signals) ? data.signals : [],
      });
    }
  }
  return removed;
};

const collectCycleSummaries = async (provider: RunProvider, atomicPath: string) => {
  const summaryFiles = (await listFiles(provider, joinPath(atomicPath, '_meta/review_summaries'), /^cycle_\d+\.json$/)).sort(sortByCycleName);
  return Promise.all(summaryFiles.map(async (summaryFile) => {
    const summary = await readJson(provider, summaryFile.path);
    const cycle = numberValue(summary.cycle, numberValue(summaryFile.name.match(/cycle_(\d+)/)?.[1], 0));
    const cycleKey = padCycle(cycle);
    const [metrics, issues] = await Promise.all([
      readJson(provider, joinPath(atomicPath, `_meta/cycle_metrics/cycle_${cycleKey}.json`)),
      readJson(provider, joinPath(atomicPath, `_meta/review_feedback/cycle_${cycleKey}.json`)),
    ]);
    const globalReview = isObject(summary.global_review) ? summary.global_review : {};
    const resultReview = isObject(summary.result_review) ? summary.result_review : {};
    return {
      cycle,
      timestamp: summary.timestamp || '',
      outcome: summary.outcome || '',
      workflow_mode: summary.workflow_mode || '',
      global_passed: Boolean(globalReview.passed),
      global_advisors: Array.isArray(globalReview.advisor_results) ? globalReview.advisor_results : [],
      failed_advisor_id: globalReview.failed_advisor_id || '',
      failed_role_name: globalReview.failed_role_name || '',
      result_total: numberValue(resultReview.total, 0),
      result_passed: numberValue(resultReview.passed_count, 0),
      result_failed: numberValue(resultReview.failed_count, 0),
      passed_files: Array.isArray(resultReview.passed_files) ? resultReview.passed_files : [],
      failed_files: Array.isArray(resultReview.failed_files) ? resultReview.failed_files : [],
      scores: isObject(metrics.scores) ? metrics.scores : {},
      global_failure_scope: metrics.global_failure_scope || '',
      failed_result_count: numberValue(metrics.failed_result_count, numberValue(resultReview.failed_count, 0)),
      current_failed_result_count: numberValue(metrics.current_failed_result_count, numberValue(resultReview.failed_count, 0)),
      historical_removed_result_count: numberValue(metrics.historical_removed_result_count, 0),
      unreviewed_new_result_count: numberValue(metrics.unreviewed_new_result_count, 0),
      unreviewed_new_result_files: Array.isArray(metrics.unreviewed_new_result_files) ? metrics.unreviewed_new_result_files : [],
      issue_count: numberValue(metrics.issue_count, Array.isArray(issues.issues) ? issues.issues.length : 0),
      issue_ids: Array.isArray(metrics.issue_ids) ? metrics.issue_ids : [],
      summary_size: numberValue(metrics.summary_size, 0),
      plateau_status: isObject(summary.plateau_status) ? summary.plateau_status : {},
      issues: Array.isArray(issues.issues) ? issues.issues : [],
    };
  }));
};

const collectCycles = async (provider: RunProvider, atomicPath: string) => {
  const summaryFiles = (await listFiles(provider, joinPath(atomicPath, '_meta/review_summaries'), /^cycle_\d+\.json$/)).sort(sortByCycleName);
  return Promise.all(summaryFiles.map(async (summaryFile) => {
    const summary = await readJson(provider, summaryFile.path);
    const cycle = numberValue(summary.cycle, numberValue(summaryFile.name.match(/cycle_(\d+)/)?.[1], 0));
    const cycleKey = padCycle(cycle);
    const [
      metrics,
      issues,
      globalReviews,
      resultReviews,
      summarySnapshot,
      previousLimitationsSnapshot,
      reflection,
      checkpoints,
    ] = await Promise.all([
      readJson(provider, joinPath(atomicPath, `_meta/cycle_metrics/cycle_${cycleKey}.json`)),
      readJson(provider, joinPath(atomicPath, `_meta/review_feedback/cycle_${cycleKey}.json`)),
      loadCycleGlobalReviews(provider, atomicPath, cycle),
      loadCycleResultReviews(provider, atomicPath, cycle),
      readText(provider, joinPath(atomicPath, `_meta/summary_snapshots/cycle_${cycleKey}_after_summary.md`)),
      readText(provider, joinPath(atomicPath, `_meta/previous_limitations_snapshots/cycle_${cycleKey}_previous_limitations.md`)),
      loadCycleReflection(provider, atomicPath, cycle),
      loadCycleCheckpoints(provider, atomicPath, cycle),
    ]);
    const globalReview = isObject(summary.global_review) ? summary.global_review : {};
    const resultReview = isObject(summary.result_review) ? summary.result_review : {};
    return {
      cycle,
      timestamp: summary.timestamp || '',
      outcome: summary.outcome || '',
      workflow_mode: summary.workflow_mode || '',
      global_passed: Boolean(globalReview.passed),
      global_advisors: Array.isArray(globalReview.advisor_results) ? globalReview.advisor_results : [],
      global_review_issues: Array.isArray(globalReview.issues) ? globalReview.issues : [],
      failed_advisor_id: globalReview.failed_advisor_id || '',
      failed_role_name: globalReview.failed_role_name || '',
      result_total: numberValue(resultReview.total, 0),
      result_passed: numberValue(resultReview.passed_count, 0),
      result_failed: numberValue(resultReview.failed_count, 0),
      passed_files: Array.isArray(resultReview.passed_files) ? resultReview.passed_files : [],
      failed_files: Array.isArray(resultReview.failed_files) ? resultReview.failed_files : [],
      scores: isObject(metrics.scores) ? metrics.scores : {},
      metrics,
      global_failure_scope: metrics.global_failure_scope || '',
      failed_result_count: numberValue(metrics.failed_result_count, numberValue(resultReview.failed_count, 0)),
      current_failed_result_count: numberValue(metrics.current_failed_result_count, numberValue(resultReview.failed_count, 0)),
      historical_removed_result_count: numberValue(metrics.historical_removed_result_count, 0),
      unreviewed_new_result_count: numberValue(metrics.unreviewed_new_result_count, 0),
      unreviewed_new_result_files: Array.isArray(metrics.unreviewed_new_result_files) ? metrics.unreviewed_new_result_files : [],
      issue_count: numberValue(metrics.issue_count, Array.isArray(issues.issues) ? issues.issues.length : 0),
      issue_ids: Array.isArray(metrics.issue_ids) ? metrics.issue_ids : [],
      summary_size: numberValue(metrics.summary_size, 0),
      plateau_status: isObject(summary.plateau_status) ? summary.plateau_status : {},
      issues: Array.isArray(issues.issues) ? issues.issues : [],
      review_feedback: issues,
      last_global_scores: isObject(issues.last_global_scores) ? issues.last_global_scores : {},
      last_global_feedback: String(issues.last_global_feedback || ''),
      summary_path: relativePath(summaryFile.path, atomicPath),
      metrics_path: `_meta/cycle_metrics/cycle_${cycleKey}.json`,
      review_feedback_path: `_meta/review_feedback/cycle_${cycleKey}.json`,
      summary_snapshot_path: `_meta/summary_snapshots/cycle_${cycleKey}_after_summary.md`,
      previous_limitations_path: `_meta/previous_limitations_snapshots/cycle_${cycleKey}_previous_limitations.md`,
      summary_snapshot: summarySnapshot,
      previous_limitations_snapshot: previousLimitationsSnapshot,
      global_reviews: globalReviews,
      result_reviews: resultReviews,
      reflection,
      checkpoints,
    };
  }));
};

interface WalkRoot {
  path: string;
  maxDepth: number;
}

const normalizeWalkRoots = (roots: WalkRoot[]) => {
  const byPath = new Map<string, number>();
  for (const root of roots) {
    const normalized = normalizeProjectPath(root.path);
    const current = byPath.get(normalized) ?? -1;
    if (root.maxDepth > current) {
      byPath.set(normalized, root.maxDepth);
    }
  }
  return Array.from(byPath.entries())
    .map(([path, maxDepth]) => ({ path, maxDepth }))
    .sort((a, b) => b.maxDepth - a.maxDepth || a.path.localeCompare(b.path));
};

const walkSelectedRoots = async (provider: RunProvider, roots: WalkRoot[], basePath: string, limit = 800) => {
  const entries: DataflowFileserverRunFile[] = [];
  const seenFiles = new Set<string>();
  const queue = normalizeWalkRoots(roots).map((root) => ({
    path: root.path,
    depth: 0,
    maxDepth: root.maxDepth,
  }));
  const visited = new Set<string>();

  while (queue.length && entries.length < limit) {
    const item = queue.shift()!;
    const normalized = normalizeProjectPath(item.path);
    if (visited.has(normalized) || item.depth > item.maxDepth) continue;
    visited.add(normalized);
    const payload = await safeList(provider, normalized);
    if (!payload) continue;

    for (const file of payload.files) {
      if (entries.length >= limit) break;
      if (seenFiles.has(file.path)) continue;
      seenFiles.add(file.path);
      const rel = relativePath(file.path, basePath);
      entries.push({
        category: categorizeRunFile(rel),
        path: rel,
        name: file.name,
        size: numberValue(file.size, 0),
        mtime: parseIsoEpoch(file.updated_at || ''),
        type: getFileType(file.name),
      });
    }
    if (item.depth >= item.maxDepth) continue;
    for (const dir of payload.directories) {
      if (dir.name === 'source' || dir.name === 'node_modules' || dir.name === '.git') continue;
      queue.push({ path: dir.path, depth: item.depth + 1, maxDepth: item.maxDepth });
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
};

const collectRunFiles = async (provider: RunProvider, runPath: string, atomicPath: string) => {
  const roots: WalkRoot[] = [{ path: runPath, maxDepth: atomicPath ? 32 : 8 }];
  return walkSelectedRoots(provider, roots, runPath, 5000);
};

const categorizeRunFile = (path: string) => {
  if (/^config\.json$|^run\.log$|^execution_meta\.json$/.test(path)) return 'Run Root';
  if (path.startsWith('input/') || path.startsWith('trigger_inputs/')) return 'Input';
  if (path.includes('/output/task_result_') || path.startsWith('output/task_result_')) return 'Outputs / Task Results';
  if (path.includes('/output/next_tasks.json') || path.startsWith('output/next_tasks.json')) return 'Outputs / Task Queue';
  if (path.endsWith('/previous_limitations.md') || path === 'previous_limitations.md') return 'Outputs';
  if (path.includes('/supporting_docs/') || path.startsWith('supporting_docs/') || path.startsWith('final_output/supporting_docs/')) return 'Outputs / Supporting Docs';
  if (path.includes('/removed_results/') || path.startsWith('removed_results/')) return 'Outputs / Removed Results';
  if (path.includes('/final_output/result_supplements/') || path.startsWith('final_output/result_supplements/')) return 'Outputs / Result Supplements';
  if (path.includes('/results/') || path.startsWith('results/') || path.startsWith('final_output/results/')) return 'Outputs / Results';
  if (path.includes('/final_output/index.json')) return 'Outputs / Final Output';
  if (path.includes('/final_output/result_relations_manifest.json')) return 'Outputs / Final Output';
  if (path.endsWith('summary.md') || path.startsWith('final_output/')) return 'Outputs';
  if (path.includes('/results_archive.tar.gz')) return 'Outputs / Archive';
  if (path.includes('/_meta/result_relations_manifest.json') || path.includes('/_meta/results_manifest.json') || path.includes('/_meta/coverage_ledger.json')) return 'Meta / Result Manifests';
  if (path.includes('/_meta/checkpoints/')) return 'Meta / Checkpoints';
  if (path.includes('/_meta/reflections/')) return 'Meta / Reflections';
  if (path.includes('/_meta/review_summaries/')) return 'Meta / Review Summaries';
  if (path.includes('/_meta/cycle_metrics/')) return 'Meta / Cycle Metrics';
  if (path.includes('/_meta/review_feedback/')) return 'Meta / Review Feedback';
  if (path.includes('/_meta/summary_snapshots/')) return 'Meta / Summary Snapshots';
  if (path.includes('/_meta/previous_limitations_snapshots/')) return 'Meta / Previous Limitations';
  if (path.includes('/_meta/state_transitions.jsonl')) return 'Meta / State Transitions';
  if (path.includes('/plugins/start/') || path.includes('/plugins/end/')) return 'Plugins';
  if (path.includes('/reviews/global/')) return 'Reviews / Global';
  if (path.includes('/reviews/results/')) return 'Reviews / Results';
  if (path.includes('/sessions/')) return 'Sessions';
  if (path.includes('/working/')) return 'Workspace / Working';
  if (path.includes('/_meta/')) return 'Meta';
  return 'Workspace';
};

const pushIndexedRunFile = (
  entries: DataflowFileserverRunFile[],
  seen: Set<string>,
  file: ProjectFilesystemEntry,
  basePath: string,
  category: string,
  limit: number
) => {
  if (entries.length >= limit || seen.has(file.path)) return;
  seen.add(file.path);
  entries.push({
    category,
    path: relativePath(file.path, basePath),
    name: file.name,
    size: numberValue(file.size, 0),
    mtime: parseIsoEpoch(file.updated_at || ''),
    type: getFileType(file.name),
  });
};

const listRunDirectoryFiles = async (
  provider: RunProvider,
  directoryPath: string,
  pattern?: RegExp
) => {
  const payload = await safeList(provider, directoryPath);
  if (!payload) return [] as ProjectFilesystemEntry[];
  return pattern ? payload.files.filter((file) => pattern.test(file.name)) : payload.files;
};

const collectDashboardRunFiles = async (
  provider: RunProvider,
  runPath: string,
  atomicPath: string,
  limit = 1200
) => {
  const entries: DataflowFileserverRunFile[] = [];
  const seen = new Set<string>();
  const addNamedFile = async (directoryPath: string, filename: string, basePath: string, category: string) => {
    if (entries.length >= limit) return;
    const files = await listRunDirectoryFiles(provider, directoryPath);
    const matched = files.find((file) => file.name === filename);
    if (matched) pushIndexedRunFile(entries, seen, matched, basePath, category, limit);
  };
  const addDirectoryFiles = async (directoryPath: string, basePath: string, category: string, pattern?: RegExp) => {
    if (entries.length >= limit) return;
    const files = await listRunDirectoryFiles(provider, directoryPath, pattern);
    for (const file of files.sort(sortByName)) {
      pushIndexedRunFile(entries, seen, file, basePath, category, limit);
      if (entries.length >= limit) break;
    }
  };

  await addNamedFile(runPath, 'config.json', runPath, 'Run Root');
  await addNamedFile(runPath, 'run.log', runPath, 'Run Root');
  await addNamedFile(joinPath(runPath, 'input'), 'task.md', runPath, 'Input');

  if (!atomicPath) return entries.sort((a, b) => a.path.localeCompare(b.path));

  await addNamedFile(atomicPath, 'summary.md', atomicPath, 'Outputs');
  await addNamedFile(atomicPath, 'previous_limitations.md', atomicPath, 'Outputs');
  await addDirectoryFiles(joinPath(atomicPath, 'results'), atomicPath, 'Outputs / Results', /^result_\d+\.md$/);
  await addDirectoryFiles(joinPath(atomicPath, 'supporting_docs'), atomicPath, 'Outputs / Supporting Docs');

  const removedCycleDirs = (await listDirectories(provider, joinPath(atomicPath, 'removed_results'), /^cycle_\d+$/)).sort(sortByCycleName);
  for (const cycleDir of removedCycleDirs) {
    await addDirectoryFiles(cycleDir.path, atomicPath, 'Outputs / Removed Results', /\.(md|json)$/);
    if (entries.length >= limit) break;
  }

  for (const name of ['state.json', 'workflow_result.json', 'abnormal_exit.json']) {
    await addNamedFile(joinPath(atomicPath, '_meta'), name, atomicPath, 'Meta');
  }
  for (const name of ['result_relations_manifest.json', 'results_manifest.json', 'coverage_ledger.json']) {
    await addNamedFile(joinPath(atomicPath, '_meta'), name, atomicPath, 'Meta / Result Manifests');
  }
  await addNamedFile(joinPath(atomicPath, '_meta/checkpoints'), 'current_step.json', atomicPath, 'Meta / Checkpoints');

  const checkpointCycleDirs = (await listDirectories(provider, joinPath(atomicPath, '_meta/checkpoints/steps'), /^cycle_\d+$/)).sort(sortByCycleName);
  for (const cycleDir of checkpointCycleDirs) {
    const phaseDirs = (await listDirectories(provider, cycleDir.path)).sort(sortByName);
    for (const phaseDir of phaseDirs) {
      await addDirectoryFiles(phaseDir.path, atomicPath, 'Meta / Checkpoints', /\.json$/);
      if (entries.length >= limit) break;
    }
    if (entries.length >= limit) break;
  }

  await addDirectoryFiles(joinPath(atomicPath, '_meta/reflections'), atomicPath, 'Meta / Reflections', /\.json$/);
  await addDirectoryFiles(joinPath(atomicPath, '_meta/review_summaries'), atomicPath, 'Meta / Review Summaries', /\.json$/);
  await addDirectoryFiles(joinPath(atomicPath, '_meta/cycle_metrics'), atomicPath, 'Meta / Cycle Metrics', /\.json$/);
  await addDirectoryFiles(joinPath(atomicPath, '_meta/review_feedback'), atomicPath, 'Meta / Review Feedback', /\.json$/);
  await addDirectoryFiles(joinPath(atomicPath, '_meta/summary_snapshots'), atomicPath, 'Meta / Summary Snapshots', /\.(md|json)$/);
  await addDirectoryFiles(joinPath(atomicPath, '_meta/previous_limitations_snapshots'), atomicPath, 'Meta / Previous Limitations', /\.(md|json)$/);
  await addDirectoryFiles(joinPath(atomicPath, 'plugins/start'), atomicPath, 'Plugins', /\.json$/);
  await addDirectoryFiles(joinPath(atomicPath, 'plugins/end'), atomicPath, 'Plugins', /\.json$/);

  const globalReviewDirs = (await listDirectories(provider, joinPath(atomicPath, 'reviews/global'), /^cycle_\d+$/)).sort(sortByCycleName);
  for (const cycleDir of globalReviewDirs) {
    await addDirectoryFiles(cycleDir.path, atomicPath, 'Reviews / Global', /\.json$/);
    if (entries.length >= limit) break;
  }

  const resultReviewDirs = (await listDirectories(provider, joinPath(atomicPath, 'reviews/results'))).sort(sortByName);
  for (const resultDir of resultReviewDirs) {
    const cycleDirs = (await listDirectories(provider, resultDir.path, /^cycle_\d+$/)).sort(sortByCycleName);
    for (const cycleDir of cycleDirs) {
      await addDirectoryFiles(cycleDir.path, atomicPath, 'Reviews / Results', /\.json$/);
      if (entries.length >= limit) break;
    }
    if (entries.length >= limit) break;
  }

  const sessionDirs = (await listDirectories(provider, joinPath(atomicPath, 'sessions'))).sort(sortByName);
  for (const sessionDir of sessionDirs) {
    await addDirectoryFiles(sessionDir.path, atomicPath, 'Sessions', /\.jsonl$/);
    const callDirs = (await listDirectories(provider, joinPath(sessionDir.path, 'calls'))).sort(sortByName);
    for (const callDir of callDirs) {
      await addDirectoryFiles(callDir.path, atomicPath, 'Sessions', /\.(json|md|txt)$/);
      if (entries.length >= limit) break;
    }
    if (entries.length >= limit) break;
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
};

const collectSessions = async (provider: RunProvider, atomicPath: string) => {
  if (!atomicPath) return [];

  const sessionsRoot = joinPath(atomicPath, 'sessions');
  const workerDirs = (await listDirectories(provider, sessionsRoot)).sort(sortByName);
  const sessions: DataflowFileserverRunSession[] = [];

  for (const workerDir of workerDirs) {
    const identity = sessionIdentity(workerDir.name);
    const callsDir = joinPath(workerDir.path, 'calls');
    const [jsonlFiles, callDirs] = await Promise.all([
      listFiles(provider, workerDir.path, /\.jsonl$/),
      listDirectories(provider, callsDir),
    ]);

    const calls = await Promise.all(callDirs
      .sort(sortByName)
      .map(async (callDir) => {
        const [requestData, responseData, heartbeatData, callFiles] = await Promise.all([
          readJson(provider, joinPath(callDir.path, 'request.json')),
          readJson(provider, joinPath(callDir.path, 'response.json')),
          readJson(provider, joinPath(callDir.path, 'heartbeat.json')),
          listFiles(provider, callDir.path),
        ]);
        const fileMap: Record<string, string> = {};
        for (const [key, filename] of Object.entries({
          request: 'request.json',
          response: 'response.json',
          heartbeat: 'heartbeat.json',
          user_prompt: 'user_prompt.md',
          system_prompt: 'system_prompt.md',
          stdout: 'stdout.txt',
          stderr: 'stderr.txt',
          stdout_events: 'stdout_events.json',
          command: 'command.txt',
          response_text: 'response.txt',
        })) {
          const matched = callFiles.find((file) => file.name === filename);
          if (matched) {
            fileMap[key] = relativePath(matched.path, atomicPath);
          }
        }
        return {
          call_id: callDir.name,
          turn: numberValue(requestData.turn_number, 0),
          agent_id: String(requestData.agent_id || heartbeatData.agent_id || ''),
          runtime: String(requestData.runtime || heartbeatData.runtime || ''),
          mode: String(requestData.mode || responseData.mode || ''),
          model: String(requestData.model || responseData.model || ''),
          thinking: String(requestData.thinking || ''),
          tools: String(requestData.tools || ''),
          started_at: String(requestData.started_at || ''),
          finished_at: String(responseData.finished_at || heartbeatData.timestamp || ''),
          conversation_id: String(responseData.conversation_id || requestData.session_id || ''),
          turn_count: numberValue(responseData.turn_count, 0),
          is_continuation: Boolean(requestData.is_continuation),
          user_prompt_len: numberValue(requestData.user_prompt_len, 0),
          sys_prompt_len: numberValue(requestData.sys_prompt_len, 0),
          status: String(responseData.status || heartbeatData.status || ''),
          duration_ms: numberValue(responseData.duration_ms, 0),
          output_len: numberValue(responseData.output_len, 0),
          output_total_bytes: numberValue(responseData.output_total_bytes, 0),
          stderr_total_bytes: numberValue(responseData.stderr_total_bytes, 0),
          message_count: numberValue(responseData.message_count, 0),
          event_count: numberValue(responseData.event_count, 0),
          event_total_count: numberValue(responseData.event_total_count, 0),
          events_truncated_count: numberValue(responseData.events_truncated_count, 0),
          trace_truncated: Boolean(responseData.trace_truncated),
          token_usage: isObject(responseData.token_usage) ? responseData.token_usage : {},
          attempts: Array.isArray(responseData.attempts) ? responseData.attempts : [],
          heartbeat: heartbeatData,
          command_display: String(requestData.command_display || ''),
          error: responseData.error ?? heartbeatData.detail?.error ?? null,
          files: fileMap,
        };
      }));

    const sortedJsonl = jsonlFiles.sort(sortByName);
    const size = sortedJsonl.reduce((sum, file) => sum + numberValue(file.size, 0), 0);
    const mtime = sortedJsonl.reduce((latest, file) => Math.max(latest, parseIsoEpoch(file.updated_at || '')), 0);
    const totalDurationMs = calls.reduce((sum, call) => sum + numberValue(call.duration_ms, 0), 0);
    const totalOutputLen = calls.reduce((sum, call) => sum + numberValue(call.output_len, 0), 0);
    const totalPromptLen = calls.reduce((sum, call) => sum + numberValue(call.user_prompt_len, 0) + numberValue(call.sys_prompt_len, 0), 0);
    const completedCalls = calls.filter((call) => String(call.status || '').toLowerCase() === 'completed').length;
    const failedCalls = calls.filter((call) => !!call.error || ['failed', 'error', 'cancelled'].includes(String(call.status || '').toLowerCase())).length;
    const latestCall = (calls[calls.length - 1] || {}) as Record<string, any>;
    const firstCall = (calls[0] || {}) as Record<string, any>;

    if (!sortedJsonl.length && !calls.length) continue;

    sessions.push({
      session_id: workerDir.name,
      format: sortedJsonl.length && calls.length ? 'hybrid' : sortedJsonl.length ? 'jsonl' : 'calls',
      worker_id: identity.label || workerDir.name,
      jsonl_path: sortedJsonl[0] ? relativePath(sortedJsonl[0].path, atomicPath) : '',
      jsonl_files: sortedJsonl.map((file) => relativePath(file.path, atomicPath)),
      size,
      mtime,
      calls,
      kind: identity.kind,
      cycle: identity.cycle,
      advisor_id: identity.advisor_id,
      result_file: identity.result_file,
      model: String(firstCall.model || ''),
      thinking: String(firstCall.thinking || ''),
      status: String(latestCall.status || ''),
      started_at: String(firstCall.started_at || ''),
      finished_at: String(latestCall.finished_at || ''),
      tools: String(firstCall.tools || ''),
      latest_heartbeat: String(latestCall.heartbeat?.timestamp || ''),
      call_count: calls.length,
      completed_calls: completedCalls,
      failed_calls: failedCalls,
      total_duration_ms: totalDurationMs,
      total_output_len: totalOutputLen,
      total_prompt_len: totalPromptLen,
    });
  }

  return sessions.sort((a, b) => {
    const cycleDiff = numberValue(a.cycle, 0) - numberValue(b.cycle, 0);
    if (cycleDiff !== 0) return cycleDiff;
    return a.session_id.localeCompare(b.session_id);
  });
};

const buildRunCatalog = async (
  provider: RunProvider,
  runPath: string,
  atomicPath: string,
  files: DataflowFileserverRunFile[],
  cycles: Record<string, any>[]
) => {
  if (!atomicPath) {
    return {
      file_scan: {
        total_files: files.length,
        category_counts: files.reduce<Record<string, number>>((acc, file) => {
          acc[file.category] = (acc[file.category] || 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  const [currentStep, nextTasks, finalOutputIndex, finalOutputRelations, stateTransitions] = await Promise.all([
    readJson(provider, joinPath(atomicPath, '_meta/checkpoints/current_step.json')),
    readJson(provider, joinPath(atomicPath, 'output/next_tasks.json')),
    readJson(provider, joinPath(atomicPath, 'final_output/index.json')),
    readJson(provider, joinPath(atomicPath, 'final_output/result_relations_manifest.json')),
    parseJsonLines(provider, joinPath(atomicPath, '_meta/state_transitions.jsonl')),
  ]);

  const relativeFiles = files.map((file) => ({
    ...file,
    atomic_relative_path: file.path.startsWith('workspace/') ? relativePath(joinPath(runPath, file.path), atomicPath) : file.path,
  }));
  const categoryCounts = files.reduce<Record<string, number>>((acc, file) => {
    acc[file.category] = (acc[file.category] || 0) + 1;
    return acc;
  }, {});

  const filterFiles = (predicate: (file: DataflowFileserverRunFile) => boolean) => files.filter(predicate).sort((a, b) => a.path.localeCompare(b.path));

  return {
    file_scan: {
      total_files: files.length,
      category_counts: categoryCounts,
    },
    checkpoints: {
      current_step: currentStep,
      files: filterFiles((file) => file.category === 'Meta / Checkpoints'),
    },
    task_outputs: {
      next_tasks: nextTasks,
      task_result_files: filterFiles((file) => /(^|\/)output\/task_result_\d+\.md$/.test(file.path)),
    },
    final_output: {
      index: finalOutputIndex,
      result_relations_manifest: finalOutputRelations,
      files: filterFiles((file) => file.path.includes('/final_output/') || file.path.startsWith('final_output/')),
    },
    supporting_docs: {
      active: filterFiles((file) => (file.path.includes('/supporting_docs/') || file.path.startsWith('supporting_docs/')) && !file.path.includes('/final_output/supporting_docs/')),
      final_output: filterFiles((file) => file.path.includes('/final_output/supporting_docs/') || file.path.startsWith('final_output/supporting_docs/')),
    },
    previous_limitations_snapshots: cycles
      .filter((cycle) => String(cycle.previous_limitations_snapshot || '').trim())
      .map((cycle) => ({
        cycle: cycle.cycle,
        path: cycle.previous_limitations_path,
        content: cycle.previous_limitations_snapshot,
      })),
    summary_snapshots: cycles
      .filter((cycle) => String(cycle.summary_snapshot || '').trim())
      .map((cycle) => ({
        cycle: cycle.cycle,
        path: cycle.summary_snapshot_path,
        content: cycle.summary_snapshot,
      })),
    reflections: cycles
      .filter((cycle) => cycle.reflection)
      .map((cycle) => ({
        cycle: cycle.cycle,
        ...(cycle.reflection || {}),
      })),
    plugins: {
      start: filterFiles((file) => file.path.includes('/plugins/start/') || file.path.startsWith('plugins/start/')),
      end: filterFiles((file) => file.path.includes('/plugins/end/') || file.path.startsWith('plugins/end/')),
    },
    state_transitions: stateTransitions,
    results_archive: files.find((file) => file.path.endsWith('results_archive.tar.gz')) || null,
    uncategorized_workspace_files: relativeFiles.filter((file) => file.category === 'Workspace' || file.category === 'Workspace / Working'),
  };
};

const tailLines = (text: string, lines = 2000) => text.split(/\r?\n/).slice(-lines).join('\n');

const inspectRunSummaryWithProvider = async (
  provider: RunProvider,
  runPath: string,
  runName: string,
  updatedAt?: string | null
): Promise<DataflowFileserverRunSummary> => {
  const config = await readJson(provider, joinPath(runPath, 'config.json'));
  const configSummary = extractConfigSummary(config);
  const runMeta = await readJson(provider, joinPath(runPath, '_meta/run_timestamps.json'));
  const executionSummary = await readJson(provider, joinPath(runPath, 'output/execution_summary.json'));
  const atomicPath = await findAtomicWorkPath(provider, runPath, runName, config);
  const [workflowResult, state] = atomicPath
    ? await Promise.all([
        readJson(provider, joinPath(atomicPath, '_meta/workflow_result.json')),
        readJson(provider, joinPath(atomicPath, '_meta/state.json')),
      ])
    : [{}, {}];
  const summaries = atomicPath
    ? (await listFiles(provider, joinPath(atomicPath, '_meta/review_summaries'), /^cycle_\d+\.json$/)).sort(sortByCycleName)
    : [];
  const latestSummary = summaries.length ? await readJson(provider, summaries[summaries.length - 1].path) : {};
  const resultReview = isObject(latestSummary.result_review) ? latestSummary.result_review : {};
  const resultsManifest = atomicPath ? await readJson(provider, joinPath(atomicPath, '_meta/results_manifest.json')) : {};
  const lastActivity = await findLastActivity(provider, runPath, atomicPath);
  const status = normalizeRunStatus(workflowResult.status || state.current_state || executionSummary.status || runMeta.status, runMeta);
  const cyclesUsed = numberValue(workflowResult.detail?.cycles_used, numberValue(latestSummary.cycle, 0));
  const resultCount = numberValue(resultsManifest.taskable_result_count, numberValue(resultReview.total, 0));
  return {
    name: runName,
    path: runPath,
    status,
    start_time: parseTimestampFromName(runName),
    start_epoch: parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName) || parseIsoEpoch(updatedAt || ''),
    duration_seconds: computeDuration(runName, runMeta, workflowResult, lastActivity, status),
    last_activity: lastActivity,
    model: configSummary.model,
    provider: configSummary.provider,
    thinking: configSummary.thinking,
    max_cycles: configSummary.max_review_cycles,
    cycles_used: cyclesUsed,
    result_count: resultCount,
    passed_count: numberValue(resultReview.passed_count, 0),
    failed_count: numberValue(resultReview.failed_count, 0),
    workflow_mode: String(latestSummary.workflow_mode || ''),
    updated_at: updatedAt,
  };
};

const inspectRunOverviewWithProvider = async (provider: RunProvider, runPath: string, runName: string): Promise<DataflowFileserverRunOverview> => {
  const config = await readJson(provider, joinPath(runPath, 'config.json'));
  const configSummary = extractConfigSummary(config);
  const runMeta = await readJson(provider, joinPath(runPath, '_meta/run_timestamps.json'));
  const executionSummary = await readJson(provider, joinPath(runPath, 'output/execution_summary.json'));
  const atomicPath = await findAtomicWorkPath(provider, runPath, runName, config);
  const [workflowResult, state] = atomicPath
    ? await Promise.all([
        readJson(provider, joinPath(atomicPath, '_meta/workflow_result.json')),
        readJson(provider, joinPath(atomicPath, '_meta/state.json')),
      ])
    : [{}, {}];
  const status = normalizeRunStatus(workflowResult.status || state.current_state || executionSummary.status || runMeta.status, runMeta);
  const lastActivity = await findLastActivity(provider, runPath, atomicPath);

  if (!atomicPath) {
    return {
      name: runName,
      path: runPath,
      status,
      start_time: parseTimestampFromName(runName),
      start_epoch: parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName),
      duration_seconds: computeDuration(runName, runMeta, workflowResult, lastActivity, status),
      last_activity: lastActivity,
      model: configSummary.model,
      provider: configSummary.provider,
      thinking: configSummary.thinking,
      max_cycles: configSummary.max_review_cycles,
      cycles_used: 0,
      result_count: 0,
      passed_count: 0,
      failed_count: 0,
      workflow_mode: '',
      config: configSummary,
      cycles: [],
      results: [],
      removed_results: [],
      manifests: {},
      latest_issues: [],
      atomic_work_path: '',
      error: workflowResult.detail?.error || workflowResult.error || executionSummary.error || null,
    };
  }

  const [cycles, results, removedResults, manifests, latestFeedback] = await Promise.all([
    collectCycleSummaries(provider, atomicPath),
    collectResults(provider, atomicPath),
    collectRemovedResults(provider, atomicPath),
    loadManifestSummary(provider, atomicPath),
    (async () => {
      const feedbackFiles = (await listFiles(provider, joinPath(atomicPath, '_meta/review_feedback'), /^cycle_\d+\.json$/)).sort(sortByCycleName);
      return feedbackFiles.length ? readJson(provider, feedbackFiles[feedbackFiles.length - 1].path) : {};
    })(),
  ]);
  const latestIssues = Array.isArray((latestFeedback as Record<string, any>).issues)
    ? (latestFeedback as Record<string, any>).issues
    : cycles.length && Array.isArray(cycles[cycles.length - 1].issues)
      ? cycles[cycles.length - 1].issues
      : [];
  const latestCycle = (cycles[cycles.length - 1] || {}) as Record<string, any>;

  return {
    name: runName,
    path: runPath,
    status,
    start_time: parseTimestampFromName(runName),
    start_epoch: parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName),
    duration_seconds: computeDuration(runName, runMeta, workflowResult, lastActivity, status),
    last_activity: lastActivity,
    model: configSummary.model,
    provider: configSummary.provider,
    thinking: configSummary.thinking,
    max_cycles: configSummary.max_review_cycles,
    cycles_used: numberValue(workflowResult.detail?.cycles_used, cycles.length),
    result_count: numberValue(manifests.taskable_result_count, results.length),
    passed_count: numberValue(latestCycle.result_passed, 0),
    failed_count: numberValue(latestCycle.result_failed, 0),
    workflow_mode: String(latestCycle.workflow_mode || ''),
    config: configSummary,
    error: workflowResult.detail?.error || workflowResult.error || executionSummary.error || null,
    cycles,
    results,
    removed_results: removedResults,
    manifests,
    latest_issues: latestIssues,
    atomic_work_path: atomicPath,
  };
};

const inspectRunDetailWithProvider = async (provider: RunProvider, runPath: string, runName: string): Promise<DataflowFileserverRunDetail> => {
  const config = await readJson(provider, joinPath(runPath, 'config.json'));
  const configSummary = extractConfigSummary(config);
  const runMeta = await readJson(provider, joinPath(runPath, '_meta/run_timestamps.json'));
  const executionSummary = await readJson(provider, joinPath(runPath, 'output/execution_summary.json'));
  const atomicPath = await findAtomicWorkPath(provider, runPath, runName, config);
  const [workflowResult, state] = atomicPath
    ? await Promise.all([
        readJson(provider, joinPath(atomicPath, '_meta/workflow_result.json')),
        readJson(provider, joinPath(atomicPath, '_meta/state.json')),
      ])
    : [{}, {}];
  const status = normalizeRunStatus(workflowResult.status || state.current_state || executionSummary.status || runMeta.status, runMeta);
  const lastActivity = await findLastActivity(provider, runPath, atomicPath);

  if (!atomicPath) {
    const files = await collectRunFiles(provider, runPath, '');
    const sessions = await collectSessions(provider, '');
    return {
      name: runName,
      path: runPath,
      status,
      start_time: parseTimestampFromName(runName),
      start_epoch: parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName),
      duration_seconds: computeDuration(runName, runMeta, workflowResult, lastActivity, status),
      last_activity: lastActivity,
      model: configSummary.model,
      provider: configSummary.provider,
      thinking: configSummary.thinking,
      max_cycles: configSummary.max_review_cycles,
      cycles_used: 0,
      result_count: 0,
      passed_count: 0,
      failed_count: 0,
      workflow_mode: '',
      config: configSummary,
      cycles: [],
      results: [],
      removed_results: [],
      manifests: {},
      latest_issues: [],
      atomic_work_path: '',
      files,
      sessions,
      run_log: tailLines(await readText(provider, joinPath(runPath, 'run.log'))),
      raw: {
        run_meta: runMeta,
        execution_summary: executionSummary,
        task_markdown: await readText(provider, joinPath(runPath, 'input/task.md')),
        summary_markdown: '',
        catalog: {
          file_scan: {
            total_files: files.length,
            category_counts: files.reduce<Record<string, number>>((acc, file) => {
              acc[file.category] = (acc[file.category] || 0) + 1;
              return acc;
            }, {}),
          },
        },
      },
    };
  }

  const [cycles, results, removedResults, manifests, files, runLog, taskMarkdown, summaryMarkdown, previousLimitations, latestFeedback, currentStep, nextTasks, finalOutputIndex, finalOutputRelations, stateTransitions] = await Promise.all([
    collectCycles(provider, atomicPath),
    collectResults(provider, atomicPath),
    collectRemovedResults(provider, atomicPath),
    loadManifestSummary(provider, atomicPath),
    collectRunFiles(provider, runPath, atomicPath),
    readText(provider, joinPath(runPath, 'run.log')),
    readText(provider, joinPath(atomicPath, 'input/task.md')),
    readText(provider, joinPath(atomicPath, 'summary.md')),
    readText(provider, joinPath(atomicPath, 'previous_limitations.md')),
    (async () => {
      const feedbackFiles = (await listFiles(provider, joinPath(atomicPath, '_meta/review_feedback'), /^cycle_\d+\.json$/)).sort(sortByCycleName);
      return feedbackFiles.length ? readJson(provider, feedbackFiles[feedbackFiles.length - 1].path) : {};
    })(),
    readJson(provider, joinPath(atomicPath, '_meta/checkpoints/current_step.json')),
    readJson(provider, joinPath(atomicPath, 'output/next_tasks.json')),
    readJson(provider, joinPath(atomicPath, 'final_output/index.json')),
    readJson(provider, joinPath(atomicPath, 'final_output/result_relations_manifest.json')),
    parseJsonLines(provider, joinPath(atomicPath, '_meta/state_transitions.jsonl')),
  ]);
  const [sessions, catalog] = await Promise.all([
    collectSessions(provider, atomicPath),
    buildRunCatalog(provider, runPath, atomicPath, files, cycles),
  ]);
  const latestIssues = Array.isArray((latestFeedback as Record<string, any>).issues)
    ? (latestFeedback as Record<string, any>).issues
    : cycles.length && Array.isArray(cycles[cycles.length - 1].issues)
      ? cycles[cycles.length - 1].issues
      : [];
  const latestCycle = (cycles[cycles.length - 1] || {}) as Record<string, any>;

  return {
    name: runName,
    path: runPath,
    status,
    start_time: parseTimestampFromName(runName),
    start_epoch: parseIsoEpoch(String(runMeta.started_at || '')) || parseStartEpochFromName(runName),
    duration_seconds: computeDuration(runName, runMeta, workflowResult, lastActivity, status),
    last_activity: lastActivity,
    model: configSummary.model,
    provider: configSummary.provider,
    thinking: configSummary.thinking,
    max_cycles: configSummary.max_review_cycles,
    cycles_used: numberValue(workflowResult.detail?.cycles_used, cycles.length),
    result_count: numberValue(manifests.taskable_result_count, results.length),
    passed_count: numberValue(latestCycle.result_passed, 0),
    failed_count: numberValue(latestCycle.result_failed, 0),
    workflow_mode: String(latestCycle.workflow_mode || ''),
    config: configSummary,
    error: workflowResult.detail?.error || workflowResult.error || executionSummary.error || null,
    cycles,
    results,
    removed_results: removedResults,
    manifests,
    latest_issues: latestIssues,
    atomic_work_path: atomicPath,
    files,
    sessions,
    run_log: tailLines(runLog),
    raw: {
      run_meta: runMeta,
      execution_summary: executionSummary,
      workflow_result: workflowResult,
      state,
      task_markdown: taskMarkdown,
      summary_markdown: summaryMarkdown,
      previous_limitations_markdown: previousLimitations,
      latest_feedback: latestFeedback,
      current_step: currentStep,
      next_tasks: nextTasks,
      final_output_index: finalOutputIndex,
      final_output_result_relations_manifest: finalOutputRelations,
      state_transitions: stateTransitions,
      catalog,
    },
  };
};

const createFileserverProvider = (projectId: string): RunProvider => ({
  list: async (path) => {
    const payload = await fileserverApi.getProjectFilesystemChildren(projectId, normalizeProjectPath(path));
    return {
      directories: payload.directories || [],
      files: payload.files || [],
    };
  },
  readText: async (path) => {
    const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, normalizeProjectPath(path));
    return blob.text();
  },
});

const isRunDirectory = (entry: ProjectFilesystemEntry) => {
  if (entry.node_type !== 'directory' && entry.node_type !== 'subproject') return false;
  if (!entry.name || entry.name === 'detached_logs' || entry.name.startsWith('.')) return false;
  return true;
};

interface ResolvedFileserverRunPaths {
  safeName: string;
  runPath: string;
  config: Record<string, any>;
  atomicPath: string;
}

const fileserverRunPathCache = new Map<string, Promise<ResolvedFileserverRunPaths>>();

const fileserverRunCacheKey = (projectId: string, rootPath: string, runName: string) =>
  `${projectId}::${normalizeProjectPath(rootPath)}::${String(runName || '').split('/').filter(Boolean).pop() || ''}`;

const resolveFileserverRunPaths = async (
  provider: RunProvider,
  projectId: string,
  rootPath: string,
  runName: string,
  options?: { force?: boolean }
): Promise<ResolvedFileserverRunPaths> => {
  const safeName = String(runName || '').split('/').filter(Boolean).pop() || '';
  if (!safeName) throw new Error('run name is required');
  const cacheKey = fileserverRunCacheKey(projectId, rootPath, safeName);
  if (options?.force) {
    fileserverRunPathCache.delete(cacheKey);
  }
  const cached = fileserverRunPathCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const runPath = joinPath(rootPath, safeName);
    const config = await readJson(provider, joinPath(runPath, 'config.json'));
    const atomicPath = await findAtomicWorkPath(provider, runPath, safeName, config);
    return {
      safeName,
      runPath,
      config,
      atomicPath,
    };
  })();

  fileserverRunPathCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (error) {
    fileserverRunPathCache.delete(cacheKey);
    throw error;
  }
};

export const listDataflowFileserverRuns = async (
  projectId: string,
  rootCandidates: string[] = DATAFLOW_FILESERVER_RUNS_ROOT_CANDIDATES
): Promise<{ rootPath: string; runs: DataflowFileserverRunSummary[] }> => {
  const provider = createFileserverProvider(projectId);
  const candidates = rootCandidates.length ? rootCandidates : DATAFLOW_FILESERVER_RUNS_ROOT_CANDIDATES;
  let lastError: unknown = null;

  for (const candidate of candidates) {
    const rootPath = normalizeProjectPath(candidate);
    try {
      const payload = await provider.list(rootPath);
      const runDirs = (payload.directories || []).filter(isRunDirectory);
      const runs = await Promise.all(
        runDirs.map((entry) => inspectRunSummaryWithProvider(provider, entry.path, entry.name, entry.updated_at))
      );
      runs.sort((a, b) => (b.start_epoch || parseIsoEpoch(b.updated_at || '')) - (a.start_epoch || parseIsoEpoch(a.updated_at || '')));
      return { rootPath, runs };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('dataflow-vuln-scanner/runs path not found');
};

export const inspectDataflowFileserverRunOverview = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunOverview> => {
  const provider = createFileserverProvider(projectId);
  const { safeName, runPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  return inspectRunOverviewWithProvider(provider, runPath, safeName);
};

export const inspectDataflowFileserverRunCycle = async (
  projectId: string,
  rootPath: string,
  runName: string,
  cycle: number
): Promise<Record<string, any>> => {
  const provider = createFileserverProvider(projectId);
  const { atomicPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  if (!atomicPath) throw new Error('atomic work dir not found');
  return {
    cycle,
    global_reviews: await loadCycleGlobalReviews(provider, atomicPath, cycle),
    result_reviews: await loadCycleResultReviews(provider, atomicPath, cycle),
    summary_snapshot: await readText(provider, joinPath(atomicPath, `_meta/summary_snapshots/cycle_${padCycle(cycle)}_after_summary.md`)),
    metrics: await readJson(provider, joinPath(atomicPath, `_meta/cycle_metrics/cycle_${padCycle(cycle)}.json`)),
  };
};

export const listDataflowFileserverRunSessions = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunSession[]> => {
  const provider = createFileserverProvider(projectId);
  const { atomicPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  if (!atomicPath) return [];
  return collectSessions(provider, atomicPath);
};

export const listDataflowFileserverRunFiles = async (
  projectId: string,
  rootPath: string,
  runName: string,
  limit = 1200
): Promise<DataflowFileserverRunFile[]> => {
  const provider = createFileserverProvider(projectId);
  const { runPath, atomicPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  return collectDashboardRunFiles(provider, runPath, atomicPath, limit);
};

export const getDataflowFileserverRunLog = async (
  projectId: string,
  rootPath: string,
  runName: string,
  lines = 2000
): Promise<string> => {
  const provider = createFileserverProvider(projectId);
  const { runPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  return tailLines(await readText(provider, joinPath(runPath, 'run.log')), lines);
};

export const inspectDataflowFileserverRun = async (
  projectId: string,
  rootPath: string,
  runName: string
): Promise<DataflowFileserverRunDetail> => {
  const provider = createFileserverProvider(projectId);
  const { safeName, runPath } = await resolveFileserverRunPaths(provider, projectId, rootPath, runName);
  return inspectRunDetailWithProvider(provider, runPath, safeName);
};
