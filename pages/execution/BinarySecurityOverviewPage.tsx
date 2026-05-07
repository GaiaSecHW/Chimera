import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Loader2, Plus, RefreshCw, ShieldAlert, Upload } from 'lucide-react';

import { BinarySecurityInputFile, BinarySecurityTask, BinarySecurityTaskType } from '../../clients/binarySecurity';
import { fileserverApi } from '../../clients/fileserver';
import { api } from '../../clients/api';

interface Props {
  projectId: string;
  taskType: BinarySecurityTaskType;
  onOpenTask: (taskId: string) => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled']);
const BINARY_STAGES = ['firmware_unpack', 'system_analysis', 'binary_to_source', 'entry_analysis', 'dataflow_analysis', 'vuln_scan'];
const SOURCE_STAGES = ['system_analysis', 'entry_analysis', 'dataflow_analysis', 'vuln_scan'];

const statusTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial_success':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    case 'pending_upload':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'uploading':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'ready_to_start':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'dispatching':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const formatStageLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    firmware_unpack: '固件解包',
    system_analysis: '系统分析',
    binary_to_source: '二进制反编译',
    entry_analysis: '入口分析',
    dataflow_analysis: '数据流分析',
    vuln_scan: '漏洞扫描',
  };
  return map[value || ''] || (value || '-');
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');
const fmtSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
const fmtSpeed = (value: number) => `${fmtSize(value)}/s`;

const STAGE_PARALLELISM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'firmware_unpack', label: '固件解包最大并行数' },
  { key: 'system_analysis', label: '系统分析最大并行数' },
  { key: 'binary_to_source', label: '二进制逆向最大并行数' },
  { key: 'entry_analysis', label: '入口分析最大并行数' },
  { key: 'dataflow_analysis', label: '数据流分析最大并行数' },
  { key: 'vuln_scan', label: '数据流漏洞挖掘最大并行数' },
];

export const BinarySecurityOverviewPage: React.FC<Props> = ({ projectId, taskType, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const [items, setItems] = useState<BinarySecurityTask[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(50);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadSpeed, setUploadSpeed] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [maxRetries, setMaxRetries] = useState(2);
  const [continueOnFailure, setContinueOnFailure] = useState(true);
  const [stageParallelism, setStageParallelism] = useState<Record<string, number>>({
    firmware_unpack: 4,
    system_analysis: 4,
    binary_to_source: 4,
    entry_analysis: 4,
    dataflow_analysis: 4,
    vuln_scan: 4,
  });

  const isSourceTask = taskType === 'source';
  const pageTitle = isSourceTask ? '源码扫描' : '二进制安全';
  const createTitle = isSourceTask ? '创建源码扫描任务' : '创建二进制安全任务';
  const emptyLabel = isSourceTask ? '当前项目还没有源码扫描任务。' : '当前项目还没有二进制安全任务。';
  const namePrefix = isSourceTask ? 'source-security' : 'binary-security';
  const stages = isSourceTask ? SOURCE_STAGES : BINARY_STAGES;

  const fileKey = (file: File) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return isSourceTask ? (rel || file.name) : file.name;
  };

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executionApi.binarySecurity.listTasks(projectId, undefined, taskType);
      setItems(data.items || []);
      setRunningCount(data.running_count || 0);
      setQueuedCount(data.queued_count || 0);
      setMaxConcurrentTasks(data.max_concurrent_tasks || 50);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!projectId) return;
    const confirmed = window.confirm('删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？');
    if (!confirmed) return;
    setError(null);
    try {
      await executionApi.binarySecurity.deleteTask(projectId, taskId);
      await load();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, taskType]);

  const hasActive = useMemo(() => items.some((item) => !TERMINAL.has(item.status)), [items]);
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [hasActive, projectId, taskType]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (name.trim()) return;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    setName(`${namePrefix}-${ts}`);
  }, [showCreateDialog, name, namePrefix]);

  const stats = useMemo(() => {
    const total = items.length;
    const running = items.filter((item) => !TERMINAL.has(item.status)).length;
    return {
      total,
      running,
      success: items.filter((item) => item.status === 'success').length,
      partial: items.filter((item) => item.status === 'partial_success').length,
      failed: items.filter((item) => item.status === 'failed').length,
      modules: items.reduce((sum, item) => sum + (item.high_risk_module_count || 0), 0),
      entries: items.reduce((sum, item) => sum + (item.entry_count || 0), 0),
      vulns: items.reduce((sum, item) => sum + (item.vuln_result_count || 0), 0),
      firmwares: items.reduce((sum, item) => sum + (item.firmware_item_count || 0), 0),
      unpacked: items.reduce((sum, item) => sum + (item.unpacked_firmware_count || 0), 0),
      unpackFailed: items.reduce((sum, item) => sum + (item.failed_firmware_count || 0), 0),
    };
  }, [items]);

  const totalUploadBytes = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);
  const activeUploadSpeed = useMemo(
    () => Object.values(uploadSpeed).reduce((max, current) => Math.max(max, current || 0), 0),
    [uploadSpeed],
  );

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setFiles([]);
    setUploadProgress({});
    setUploadSpeed({});
    setMaxRetries(2);
    setContinueOnFailure(true);
    setStageParallelism({
      system_analysis: 4,
      entry_analysis: 4,
      dataflow_analysis: 4,
      vuln_scan: 4,
      ...(isSourceTask ? {} : { firmware_unpack: 4, binary_to_source: 4 }),
    });
    setCreateError(null);
  };

  const openCreateDialog = () => {
    setCreateResult(null);
    resetCreateForm();
    setShowCreateDialog(true);
  };

  const closeCreateDialog = () => {
    if (submitting) return;
    setShowCreateDialog(false);
    resetCreateForm();
  };

  const mergeFiles = (incoming: File[]) => {
    const next = [...files];
    const names = new Set(next.map((file) => fileKey(file)));
    for (const file of incoming) {
      const nextKey = fileKey(file);
      if (names.has(nextKey)) {
        setCreateError(`存在重复${isSourceTask ? '路径' : '文件名'}: ${nextKey}`);
        continue;
      }
      names.add(nextKey);
      next.push(file);
    }
    setFiles(next);
  };

  const removeFile = (nameToRemove: string) => {
    setFiles((current) => current.filter((file) => fileKey(file) !== nameToRemove));
    setUploadProgress((current) => {
      const next = { ...current };
      delete next[nameToRemove];
      return next;
    });
    setUploadSpeed((current) => {
      const next = { ...current };
      delete next[nameToRemove];
      return next;
    });
  };

  const submitTask = async () => {
    if (!projectId) return;
    setCreateError(null);
    setCreateResult(null);
    if (!name.trim()) {
      setCreateError('请输入任务名称');
      return;
    }
    if (files.length === 0) {
      setCreateError('请选择至少一个输入文件');
      return;
    }
    const duplicateNames = files.map((file) => fileKey(file)).filter((name, index, arr) => arr.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      setCreateError(`存在重复${isSourceTask ? '路径' : '文件名'}: ${duplicateNames[0]}`);
      return;
    }
    setSubmitting(true);
    try {
      const inputFiles: BinarySecurityInputFile[] = files.map((file) => ({
        filename: file.name,
        size: file.size,
        content_type: file.type || undefined,
        relative_path: isSourceTask ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) : undefined,
      }));
      const prepared = await executionApi.binarySecurity.prepareTask(projectId);
      const created = await executionApi.binarySecurity.createTask(projectId, {
        task_id: prepared.task_id,
        task_type: taskType,
        name: name.trim(),
        description: description.trim() || undefined,
        input_files: inputFiles,
        policy_overrides: {
          max_retries_per_item: maxRetries,
          continue_on_item_failure: continueOnFailure,
          stage_parallelism: stageParallelism,
        },
      });
      const inputDir = created.summary?.input_dir || `/app/secflow-app-binary-security/${prepared.task_id}/input`;
      const ensuredDirs = new Set<string>();
      const ensureProjectPath = async (path: string) => {
        if (!path || ensuredDirs.has(path)) return;
        const parts = path.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          if (ensuredDirs.has(current)) continue;
          try {
            await fileserverApi.createProjectFilesystemDirectory({ project_id: projectId, path: current });
          } catch (error: any) {
            if (!String(error?.message || '').includes('已存在')) {
              throw error;
            }
          }
          ensuredDirs.add(current);
        }
      };
      for (const file of files) {
        const rel = isSourceTask ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) : file.name;
        const normalizedRel = rel.replace(/\\/g, '/');
        const relDir = normalizedRel.includes('/') ? normalizedRel.split('/').slice(0, -1).join('/') : '';
        const uploadPath = relDir ? `${inputDir}/${relDir}` : inputDir;
        if (relDir) {
          await ensureProjectPath(`app/secflow-app-binary-security/${prepared.task_id}/input/${relDir}`);
        }
        await fileserverApi.uploadProjectFilesystemFile(
          {
            project_id: projectId,
            path: uploadPath,
            file,
            overwrite: false,
          },
          {
            onProgress: (progress) => {
              const percent = progress.total_bytes > 0 ? Math.min(100, Math.round((progress.loaded_bytes / progress.total_bytes) * 100)) : 0;
              setUploadProgress((current) => ({ ...current, [fileKey(file)]: percent }));
              setUploadSpeed((current) => ({ ...current, [fileKey(file)]: progress.speed_bytes_per_sec || 0 }));
            },
            trackGlobal: false,
            sourceLabel: isSourceTask ? '源码扫描输入上传' : '二进制安全输入上传',
          },
        );
        setUploadProgress((current) => ({ ...current, [fileKey(file)]: 100 }));
        setUploadSpeed((current) => ({ ...current, [fileKey(file)]: 0 }));
      }
      await executionApi.binarySecurity.completeUploads(projectId, prepared.task_id, inputFiles);
      setShowCreateDialog(false);
      resetCreateForm();
      setCreateResult(`创建成功: ${prepared.task_id}`);
      await load();
      onOpenTask(prepared.task_id);
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {isSourceTask
                ? '为当前项目统一编排系统分析、入口分析、数据流分析和漏洞扫描，聚合查看源码工程任务的阶段状态与结果。'
                : '为当前项目统一编排固件解包、系统分析、反编译、入口分析、数据流分析和漏洞扫描，聚合查看多固件任务的阶段状态与结果。'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              创建任务
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>
      </section>

      {createResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {createResult}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-600" />
            <h2 className="text-xl font-black text-slate-900">当前项目统计</h2>
        </div>
        <div className="mt-2 text-sm text-slate-500">任务、固件和结果统计基于当前项目；运行中、排队中和最大并发为服务全局队列指标。</div>
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-2xl bg-white px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">任务总数</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{stats.total}</div>
            <div className="mt-1 text-sm text-slate-500">运行中 {runningCount} · 排队中 {queuedCount}</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{isSourceTask ? '源码输入' : '固件解包'}</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{isSourceTask ? stats.firmwares : stats.unpacked}</div>
            <div className="mt-1 text-sm text-slate-500">{isSourceTask ? `源码文件 ${stats.firmwares}` : `总固件 ${stats.firmwares} · 失败 ${stats.unpackFailed}`}</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">分析结果</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{stats.modules}</div>
            <div className="mt-1 text-sm text-slate-500">高危模块 · 入口 {stats.entries}</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">队列配置</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{maxConcurrentTasks}</div>
            <div className="mt-1 text-sm text-slate-500">最大并发任务数 · 已完成 {stats.success} · 失败 {stats.failed}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-black text-slate-900">任务列表</h2>
          <div className="text-sm text-slate-500">共 {items.length} 条</div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {loading && items.length === 0 ? (
          <div className="mt-6 text-sm text-slate-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">{emptyLabel}</div>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                      {item.status === 'pending' && item.queue_position ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                          排队中，第 {item.queue_position} 位
                        </span>
                      ) : null}
                      {item.status === 'dispatching' ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                          调度中
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-500">{item.firmware_path}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 xl:grid-cols-6">
                      <div>当前阶段：<span className="font-bold text-slate-900">{formatStageLabel(item.current_stage)}</span></div>
                      <div>{isSourceTask ? '源码文件' : '固件数'}：<span className="font-bold text-slate-900">{item.firmware_item_count}</span></div>
                      <div>{isSourceTask ? '高危模块' : '已解包'}：<span className="font-bold text-slate-900">{isSourceTask ? item.high_risk_module_count : item.unpacked_firmware_count}</span></div>
                      <div>{isSourceTask ? '入口数量' : '解包失败'}：<span className="font-bold text-slate-900">{isSourceTask ? item.entry_count : item.failed_firmware_count}</span></div>
                      <div>漏洞结果：<span className="font-bold text-slate-900">{item.vuln_result_count}</span></div>
                      <div>开始时间：<span className="font-bold text-slate-900">{fmt(item.started_at)}</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(item.stage_sequence?.length ? item.stage_sequence : stages).map((stage) => {
                        const summary = item.stage_summaries.find((current) => current.stage_name === stage);
                        return (
                          <span key={stage} className={`rounded-xl px-3 py-1 text-xs font-bold ${summary ? statusTone(summary.status) : 'bg-slate-100 text-slate-400'}`}>
                            {formatStageLabel(stage)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
                    >
                      查看详情
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(item.id)}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{createTitle}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {isSourceTask ? '同一批上传文件共同组成一个源码工程，进入源码扫描流程。' : '每个上传文件都会作为独立固件进入完整的安全分析编排流程。'}
                </p>
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={submitting} className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                关闭
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="任务描述（可选）" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">输入文件</div>
                    <div className="mt-1 text-sm text-slate-500">{isSourceTask ? '支持选择多个源码文件，或直接选择源码目录；会尽量保留目录结构。' : '支持一次选择多个文件；文件名不能重复。'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <Upload size={16} />
                      选择文件
                    </button>
                    {isSourceTask && (
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Upload size={16} />
                        选择目录
                      </button>
                    )}
                    <div className="text-sm text-slate-500">{files.length} 个文件 · {fmtSize(totalUploadBytes)}</div>
                    {submitting && activeUploadSpeed > 0 && (
                      <div className="text-sm font-semibold text-sky-600">上传速度 {fmtSpeed(activeUploadSpeed)}</div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files || []);
                    if (incoming.length > 0) {
                      setCreateError(null);
                      mergeFiles(incoming);
                    }
                    e.currentTarget.value = '';
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  {...({ webkitdirectory: 'true', directory: 'true' } as any)}
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files || []);
                    if (incoming.length > 0) {
                      setCreateError(null);
                      mergeFiles(incoming);
                    }
                    e.currentTarget.value = '';
                  }}
                />
                <div className="mt-4 space-y-3">
                  {files.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">尚未选择输入文件。</div>
                  ) : files.map((file) => {
                    const key = fileKey(file);
                    const displayPath = isSourceTask ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) : file.name;
                    return (
                      <div key={key} className="rounded-2xl bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">{displayPath}</div>
                            <div className="mt-1 text-xs text-slate-500">{fmtSize(file.size || 0)}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {submitting && (
                              <div className="min-w-[160px] text-right text-xs font-semibold text-slate-500">
                                {uploadProgress[key] ? `${uploadProgress[key]}%` : '等待上传'}
                                {uploadSpeed[key] > 0 ? ` · ${fmtSpeed(uploadSpeed[key])}` : ''}
                              </div>
                            )}
                            <button type="button" onClick={() => removeFile(key)} disabled={submitting} className="text-sm font-semibold text-rose-600 disabled:opacity-40">
                              移除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-black text-slate-900">阶段并发配置</div>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {STAGE_PARALLELISM_FIELDS.filter((field) => !isSourceTask || !['firmware_unpack', 'binary_to_source'].includes(field.key)).map((field) => (
                    <div key={field.key}>
                      <div className="mb-2 text-sm font-bold text-slate-700">{field.label}</div>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={stageParallelism[field.key] ?? 1}
                        onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 1) }))}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>
                  ))}
                  <div>
                    <div className="mb-2 text-sm font-bold text-slate-700">子任务重试次数</div>
                    <input type="number" min={0} max={10} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value || 0))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={continueOnFailure} onChange={(e) => setContinueOnFailure(e.target.checked)} />
                  子任务失败时继续推进其他子任务
                </label>
              </div>

              {createError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{createError}</div>}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={closeCreateDialog} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitTask()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? '创建并上传中...' : '创建并启动'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
