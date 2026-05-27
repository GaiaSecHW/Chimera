import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PlayCircle, X } from 'lucide-react';

import { api } from '../../clients/api';
import { clearExecutionReturnContext } from '../../utils/executionReturnContext';
import { B2SElfTaskInput, B2STaskDetail } from '../../clients/binaryToSource';
import { DataflowInputRef } from '../../clients/dataflowVulnScanner';
import {
  AppDfaTaskDetail,
  AppDfaTaskResult,
  AppEaTaskDetail,
  AppEaTaskResult,
  AppSaResultModule,
  AppSaTaskDetail,
  AppSaTaskResult,
} from '../../types/types';
import { FirmwareTaskResult, FirmwareUnpackTask } from '../../clients/firmwareUnpacker';

type SourceKind = 'firmware_unpack' | 'system_analysis' | 'binary_to_source' | 'entry_analysis' | 'dataflow_analysis';
type DownstreamMode = 'binary' | 'source';
type TargetStage = 'system_analysis' | 'binary_to_source' | 'entry_analysis' | 'dataflow_analysis' | 'vuln_scan';

type Candidate = {
  key: string;
  label: string;
  description?: string;
  disabledReason?: string;
  payload: Record<string, any>;
};

type CreatedTask = {
  id: string;
  label: string;
  targetStage: TargetStage;
};

type Props = {
  projectId: string;
  sourceKind: SourceKind;
  task: FirmwareUnpackTask | AppSaTaskDetail | B2STaskDetail | AppEaTaskDetail | AppDfaTaskDetail | null;
  className?: string;
  buttonClassName?: string;
};

const TARGET_LABEL: Record<TargetStage, string> = {
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
  vuln_scan: '数据流漏洞扫描',
};

const SOURCE_LABEL: Record<SourceKind, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
};

const DEFAULT_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50';

function taskIdOf(task: Props['task']): string {
  if (!task) return '';
  return String((task as any).task_id || (task as any).id || '');
}

function taskNameOf(task: Props['task']): string {
  if (!task) return '';
  return String((task as any).task_name || (task as any).name || (task as any).firmware_path || taskIdOf(task) || 'task');
}

function isComplete(sourceKind: SourceKind, task: Props['task']): boolean {
  if (!task) return false;
  const status = String((task as any).status || '').toLowerCase();
  if (sourceKind === 'firmware_unpack') return status === 'success';
  if (sourceKind === 'binary_to_source') {
    const detail = task as B2STaskDetail;
    return status === 'success' || (status === 'partial_success' && detail.items?.some((item) => item.status === 'success'));
  }
  return status === 'passed' || status === 'success';
}

function basename(path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized || 'item';
}

function dirname(path?: string | null): string {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return normalized.startsWith('/') ? '/' : '';
  return `${normalized.startsWith('/') ? '/' : ''}${parts.slice(0, -1).join('/')}`;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

function joinPath(base: string, child: string): string {
  if (!base) return child;
  if (!child) return base;
  if (child.startsWith('/')) return child;
  return `${base.replace(/\/+$/, '')}/${child.replace(/^\/+/, '')}`;
}

function dataflowVulnInputRef(projectId: string, path: string): DataflowInputRef {
  const normalized = String(path || '').replace(/\\/g, '/').trim();
  const projectRoot = `/data/files/${projectId}`;
  if (normalized === projectRoot) {
    return { source: 'project_filesystem', path: '/', filename: basename(normalized) };
  }
  if (normalized.startsWith(`${projectRoot}/`)) {
    return {
      source: 'project_filesystem',
      path: `/${normalized.slice(projectRoot.length + 1).replace(/^\/+/, '')}`,
      filename: basename(normalized),
    };
  }
  if (normalized.startsWith('/data/files/')) {
    return { source: 'absolute_path', path: normalized, filename: basename(normalized) };
  }
  return { source: 'project_filesystem', path: normalized.startsWith('/') ? normalized : `/${normalized}`, filename: basename(normalized) };
}

function navigateTo(targetStage: TargetStage, id: string, navigate: ReturnType<typeof useNavigate>) {
  if (!id) return;
  clearExecutionReturnContext();
  if (targetStage === 'system_analysis') {
    window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'system-analysis-detail', systemAnalysisTaskId: id } }));
    return;
  }
  if (targetStage === 'binary_to_source') {
    window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'pentest-exec-b2s-detail', b2sTaskId: id } }));
    return;
  }
  if (targetStage === 'entry_analysis') {
    window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-detail', entryAnalysisTaskId: id } }));
    return;
  }
  if (targetStage === 'dataflow_analysis') {
    window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: id } }));
    return;
  }
  navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(id)}`);
}

function inferMode(task: Props['task']): DownstreamMode {
  const mode = String((task as any)?.analysis_mode || (task as any)?.parent_task_type || '').toLowerCase();
  return mode === 'source' ? 'source' : 'binary';
}

function moduleElfCandidate(module: AppSaResultModule): string {
  const files = module.files || [];
  const moduleDir = module.module_dir_path || '';
  const binaryLike = files.find((file) => /\.(elf|so|ko|o|a|axf)$/i.test(file)) || files[0] || '';
  return binaryLike.startsWith('/') ? binaryLike : joinPath(moduleDir, binaryLike);
}

function systemCandidates(result: AppSaTaskResult | null, mode: DownstreamMode): Candidate[] {
  const modules = result?.modules || [];
  return modules.map((module) => {
    const moduleName = module.module_name || `module-${module.rank}`;
    if (mode === 'binary') {
      const elfPath = moduleElfCandidate(module);
      return {
        key: moduleName,
        label: moduleName,
        description: `${module.file_count || module.files?.length || 0} 个文件 · 风险 ${module.risk_level || '-'}`,
        disabledReason: !module.module_dir_path || !elfPath ? '缺少模块目录或 ELF 输入文件' : undefined,
        payload: {
          module,
          elfPath,
          fileList: module.files || [],
        },
      };
    }
    return {
      key: moduleName,
      label: moduleName,
      description: `${module.file_count || module.files?.length || 0} 个文件 · 源码入口分析`,
      disabledReason: !module.module_dir_path ? '缺少模块目录' : undefined,
      payload: {
        module,
        inputPath: module.module_dir_path,
        sourcePath: result?.output_root || module.module_dir_path,
      },
    };
  });
}

function b2sCandidates(detail: B2STaskDetail): Candidate[] {
  return (detail.items || []).map((item) => ({
    key: item.id,
    label: stripExt(basename(item.elf_path)),
    description: `${basename(item.elf_path)} · ${item.generated_files?.length || 0} 个结果文件`,
    disabledReason: item.status !== 'success' ? '仅成功 item 可创建入口分析' : !item.output_dir ? '缺少输出源码目录' : undefined,
    payload: { item },
  }));
}

function parseFunctionName(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.includes('|')) {
    const cells = text.split('|').map((part) => part.trim()).filter(Boolean);
    const candidate = cells.find((part) => /^[A-Za-z_~][\w:~<>.,*&\s-]*\)?$/.test(part) && !/^(file|文件|line|行号|函数|function)$/i.test(part));
    return candidate || cells[cells.length - 1] || text;
  }
  const match = text.match(/([A-Za-z_~][\w:~]*)\s*\(/);
  return match?.[1] || text.replace(/^[-*\d.\s]+/, '').trim();
}

function entryCandidates(result: AppEaTaskResult | null): Candidate[] {
  const rows = (result?.functions || []).map(parseFunctionName).filter(Boolean);
  const unique = Array.from(new Set(rows));
  return unique.map((functionName, index) => ({
    key: `${functionName}-${index}`,
    label: functionName,
    description: '函数级数据流分析',
    payload: { functionName },
  }));
}

function dataflowCandidates(result: AppDfaTaskResult | null): Candidate[] {
  const files = (result?.dataflow_files?.length ? result.dataflow_files : result?.output_files) || [];
  const markdownFiles = files.filter((file) => /\.m(?:ark)?d$/i.test(file.name || file.relative_path));
  return markdownFiles.map((file) => {
    const path = joinPath(result?.output_root || '', file.relative_path);
    const dataFlowDir = result?.output_root || dirname(path);
    return {
      key: file.relative_path,
      label: file.name || basename(file.relative_path),
      description: `${file.relative_path} · ${file.size || 0} bytes`,
      disabledReason: !dataFlowDir ? '缺少结果目录' : undefined,
      payload: { file, dataFlowPath: path, dataFlowDir },
    };
  });
}

export const DownstreamTaskCreator: React.FC<Props> = ({
  projectId,
  sourceKind,
  task,
  className = '',
  buttonClassName,
}) => {
  const navigate = useNavigate();
  const executionApi = api.domains.execution;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<DownstreamMode>(inferMode(task));
  const [result, setResult] = useState<any>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [taskPrefix, setTaskPrefix] = useState('');
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<CreatedTask[]>([]);
  const [showRaw, setShowRaw] = useState(false);

  const available = isComplete(sourceKind, task);
  const taskId = taskIdOf(task);
  const sourceName = taskNameOf(task);
  const targetStage: TargetStage = useMemo(() => {
    if (sourceKind === 'firmware_unpack') return 'system_analysis';
    if (sourceKind === 'system_analysis') return mode === 'binary' ? 'binary_to_source' : 'entry_analysis';
    if (sourceKind === 'binary_to_source') return 'entry_analysis';
    if (sourceKind === 'entry_analysis') return 'dataflow_analysis';
    return 'vuln_scan';
  }, [mode, sourceKind]);

  const modeOptions: DownstreamMode[] = sourceKind === 'system_analysis' || sourceKind === 'entry_analysis' || sourceKind === 'dataflow_analysis'
    ? ['binary', 'source']
    : sourceKind === 'firmware_unpack' || sourceKind === 'binary_to_source'
      ? ['binary']
      : ['binary', 'source'];

  const candidates = useMemo<Candidate[]>(() => {
    if (!task) return [];
    if (sourceKind === 'firmware_unpack') {
      const fwResult = result as FirmwareTaskResult | null;
      const inputPath = fwResult?.output_root || (task as FirmwareUnpackTask).output_path;
      return [{
        key: taskId,
        label: basename((task as FirmwareUnpackTask).firmware_path),
        description: inputPath,
        disabledReason: !inputPath ? '缺少解包结果目录' : undefined,
        payload: { inputPath },
      }];
    }
    if (sourceKind === 'system_analysis') return systemCandidates(result as AppSaTaskResult | null, mode);
    if (sourceKind === 'binary_to_source') return b2sCandidates(task as B2STaskDetail);
    if (sourceKind === 'entry_analysis') return entryCandidates(result as AppEaTaskResult | null);
    if (sourceKind === 'dataflow_analysis') return dataflowCandidates(result as AppDfaTaskResult | null);
    return [];
  }, [mode, result, sourceKind, task, taskId]);

  const selectableCandidates = candidates.filter((item) => !item.disabledReason);
  const selectedCandidates = selectableCandidates.filter((item) => selectedKeys.has(item.key));
  const defaultPrefix = taskPrefix.trim() || sourceName;

  const loadResult = async () => {
    if (!task || !taskId || sourceKind === 'binary_to_source') return;
    setLoading(true);
    setMessage('');
    try {
      let data: unknown = null;
      if (sourceKind === 'firmware_unpack') data = await executionApi.firmwareUnpacker.getTaskResult(taskId);
      if (sourceKind === 'system_analysis') data = await executionApi.appSystemAnalyse.getTaskResult(taskId);
      if (sourceKind === 'entry_analysis') data = await executionApi.appEntryAnalyse.getTaskResult(taskId);
      if (sourceKind === 'dataflow_analysis') data = await executionApi.appDataflowAnalyse.getTaskResult(taskId);
      setResult(data);
    } catch (err: any) {
      setMessage(`加载结果失败: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const openModal = async () => {
    setOpen(true);
    setMode(inferMode(task));
    setTaskPrefix(`${sourceName}-${TARGET_LABEL[targetStage]}`);
    setCreated([]);
    setMessage('');
    if (sourceKind !== 'binary_to_source') await loadResult();
  };

  React.useEffect(() => {
    setSelectedKeys(new Set(selectableCandidates.map((item) => item.key)));
  }, [candidates.length, mode, open]);

  const createTasks = async () => {
    if (!task || selectedCandidates.length === 0) return;
    setSubmitting(true);
    setMessage('');
    setCreated([]);
    try {
      const rows: CreatedTask[] = [];
      if (sourceKind === 'firmware_unpack') {
        const candidate = selectedCandidates[0];
        const createdTask = await executionApi.appSystemAnalyse.createTask({
          project_id: projectId,
          task_name: defaultPrefix,
          input_path: String(candidate.payload.inputPath),
          analysis_mode: 'binary',
        });
        rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'system_analysis' });
      } else if (sourceKind === 'system_analysis' && mode === 'binary') {
        const elfTasks: B2SElfTaskInput[] = selectedCandidates.map((candidate) => ({
          elf_path: String(candidate.payload.elfPath),
          file_list: candidate.payload.fileList || [],
          output_subdir: String(candidate.label || candidate.key),
          metadata: candidate.payload.module || {},
        }));
        const createdTask = await executionApi.binaryToSource.createTask(projectId, {
          name: defaultPrefix,
          tags: ['manual-downstream', 'system-analysis'],
          elf_tasks: elfTasks,
        });
        rows.push({ id: createdTask.id, label: createdTask.name, targetStage: 'binary_to_source' });
      } else if (sourceKind === 'system_analysis' && mode === 'source') {
        for (const candidate of selectedCandidates) {
          const module = candidate.payload.module as AppSaResultModule;
          const createdTask = await executionApi.appEntryAnalyse.createTask({
            project_id: projectId,
            task_name: `${defaultPrefix}-${candidate.label}`,
            input_path: String(candidate.payload.inputPath),
            module_name: module.module_name,
            source_path: String(candidate.payload.sourcePath || candidate.payload.inputPath),
          });
          rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'entry_analysis' });
        }
      } else if (sourceKind === 'binary_to_source') {
        for (const candidate of selectedCandidates) {
          const item = candidate.payload.item as B2STaskDetail['items'][number];
          const moduleName = stripExt(basename(item.elf_path));
          const createdTask = await executionApi.appEntryAnalyse.createTask({
            project_id: projectId,
            task_name: `${defaultPrefix}-${moduleName}`,
            input_path: item.output_dir,
            module_name: moduleName,
            source_path: item.output_dir,
          });
          rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'entry_analysis' });
        }
      } else if (sourceKind === 'entry_analysis') {
        const entryTask = task as AppEaTaskDetail;
        for (const candidate of selectedCandidates) {
          const functionName = String(candidate.payload.functionName);
          const createdTask = await executionApi.appDataflowAnalyse.createTask({
            project_id: projectId,
            task_name: `${defaultPrefix}-${functionName}`,
            input_path: entryTask.source_path || entryTask.input_path,
            prompt_content: `分析函数 ${functionName} 的外部输入数据流`,
            function_name: functionName,
          });
          rows.push({ id: createdTask.task_id, label: createdTask.task_name, targetStage: 'dataflow_analysis' });
        }
      } else if (sourceKind === 'dataflow_analysis') {
        const dfaTask = task as AppDfaTaskDetail;
        for (const candidate of selectedCandidates) {
          const createdTask = await executionApi.dataflowVulnScanner.createTask({
            project_id: projectId,
            title: `${defaultPrefix}-${candidate.label}`,
            task_markdown: `基于数据流分析结果 ${candidate.label} 执行漏洞扫描。`,
            data_flow: dataflowVulnInputRef(projectId, String(candidate.payload.dataFlowDir || dirname(String(candidate.payload.dataFlowPath)))),
            source_dir: dataflowVulnInputRef(projectId, dfaTask.input_path),
          });
          rows.push({ id: createdTask.task_id, label: createdTask.title || createdTask.task_id, targetStage: 'vuln_scan' });
        }
      }
      setCreated(rows);
      setMessage(rows.length ? `已创建 ${rows.length} 个${TARGET_LABEL[targetStage]}任务` : '没有创建任务');
    } catch (err: any) {
      setMessage(`创建失败: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAll = () => {
    if (selectedCandidates.length === selectableCandidates.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(selectableCandidates.map((item) => item.key)));
    }
  };

  if (!task) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void openModal()}
        disabled={!available}
        className={buttonClassName || DEFAULT_BUTTON_CLASS}
        title={available ? '创建下游手动任务' : '任务完成后可创建下游手动任务'}
      >
        <PlayCircle size={14} />
        创建下游任务
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">Manual Downstream Task</div>
                <h2 className="mt-2 text-2xl font-black text-slate-900">创建{TARGET_LABEL[targetStage]}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  来源：{SOURCE_LABEL[sourceKind]} · 新任务按手动任务创建，不记录父任务来源。
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-auto px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">任务名前缀</label>
                    <input
                      value={taskPrefix}
                      onChange={(event) => setTaskPrefix(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-300"
                    />
                    {modeOptions.length > 1 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {modeOptions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setMode(item)}
                            className={`rounded-xl border px-3 py-2 text-xs font-black ${mode === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            {item === 'binary' ? '二进制任务模式' : '源码任务模式'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
                        {mode === 'binary' ? '二进制任务模式' : '源码任务模式'}
                      </div>
                    )}
                  </div>

                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">候选输入</div>
                        <div className="mt-1 text-xs text-slate-500">可选 {selectableCandidates.length} / 总计 {candidates.length}</div>
                      </div>
                      <button type="button" onClick={toggleAll} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        {selectedCandidates.length === selectableCandidates.length ? '取消全选' : '全选'}
                      </button>
                    </div>
                    {loading ? (
                      <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-semibold text-slate-500">
                        <Loader2 size={16} className="animate-spin" />
                        加载结果中...
                      </div>
                    ) : candidates.length === 0 ? (
                      <div className="px-4 py-12 text-center text-sm text-slate-500">没有可用于创建下游任务的结果。</div>
                    ) : (
                      <div className="max-h-[360px] divide-y divide-slate-100 overflow-auto">
                        {candidates.map((candidate) => {
                          const checked = selectedKeys.has(candidate.key);
                          const disabled = Boolean(candidate.disabledReason);
                          return (
                            <label key={candidate.key} className={`flex items-start gap-3 px-4 py-3 ${disabled ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'}`}>
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={checked}
                                onChange={() => {
                                  const next = new Set(selectedKeys);
                                  if (next.has(candidate.key)) next.delete(candidate.key);
                                  else next.add(candidate.key);
                                  setSelectedKeys(next);
                                }}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="break-all text-sm font-black text-slate-800">{candidate.label}</div>
                                {candidate.description ? <div className="mt-1 break-all text-xs text-slate-500">{candidate.description}</div> : null}
                                {candidate.disabledReason ? <div className="mt-1 text-xs font-semibold text-amber-600">{candidate.disabledReason}</div> : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">目标阶段</div>
                    <div className="mt-2 text-xl font-black text-slate-900">{TARGET_LABEL[targetStage]}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-600">
                      将创建 {selectedCandidates.length} 个手动下游任务。
                    </div>
                  </div>
                  {message ? (
                    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.includes('失败') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {message}
                    </div>
                  ) : null}
                  {created.length > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 text-sm font-black text-slate-900">已创建任务</div>
                      <div className="space-y-2">
                        {created.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigateTo(item.targetStage, item.id, navigate)}
                            className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:bg-white"
                          >
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-black text-slate-800">{item.label}</span>
                              <span className="block font-mono text-slate-500">{item.id}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {result ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <button type="button" onClick={() => setShowRaw((value) => !value)} className="flex w-full items-center justify-between text-left text-xs font-black text-slate-600">
                        结果原始摘要
                        {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {showRaw ? <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-100">{JSON.stringify(result, null, 2)}</pre> : null}
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                关闭
              </button>
              <button
                type="button"
                onClick={() => void createTasks()}
                disabled={submitting || loading || selectedCandidates.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                创建下游任务
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
};
