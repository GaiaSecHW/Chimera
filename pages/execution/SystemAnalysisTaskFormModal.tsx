import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Loader2, X } from 'lucide-react';

import { api } from '../../clients/api';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { AppSaTaskDetail } from '../../types/types';

export interface SystemAnalysisTaskFormState {
  task_name: string;
  input_path: string;
  output_path: string;
  task_description: string;
  prompt_content: string;
  analysis_mode: 'binary' | 'source';
  analyse_targets: string[];
  binary_arch: string[];
  security_focus_categories: string[];
  module_granularity: string;
  filter_engine: 'script' | 'agent';
  enable_final_check_mode: 'inherit' | 'enabled' | 'disabled';
  continue_on_module_failure_mode: 'inherit' | 'enabled' | 'disabled';
}

const SOURCE_MODE_DEFAULT_TARGETS = ['source', 'script', 'config'];
const ANALYSE_TARGET_OPTIONS = ['all', 'binary', 'script', 'source', 'config', 'firmware', 'crypto', 'database', 'web', 'network_model', 'document', 'archive'];
const BINARY_ARCH_OPTIONS = ['all', 'x86', 'x86_64', 'arm', 'aarch64', 'mips', 'mips64', 'ppc', 'ppc64', 'riscv', 's390'];
const SECURITY_CATEGORY_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'network_protocol', label: '网络协议' },
  { key: 'file_parsing', label: '文件处理' },
  { key: 'auth_access', label: '认证访问控制' },
  { key: 'crypto', label: '密码学' },
  { key: 'ipc', label: '进程间通信' },
  { key: 'config_parsing', label: '配置解析' },
  { key: 'input_handling', label: '输入处理' },
  { key: 'privilege_process', label: '权限进程' },
  { key: 'web_api', label: 'Web/API' },
  { key: 'memory_manage', label: '内存管理' },
];

function normalizeNonEmptyArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => String(item || '').trim()).filter(Boolean);
  return next.length > 0 ? next : fallback;
}

function normalizeGranularity(value: unknown): string {
  const normalized = String(value || '').trim();
  return normalized || 'fine';
}

export function buildDefaultSystemAnalysisTaskForm(projectId: string): SystemAnalysisTaskFormState {
  return {
    task_name: '',
    input_path: '',
    output_path:`/data/files/${projectId}/app/chimera-app-system-analyse`,
    task_description: '',
    prompt_content: '',
    analysis_mode: 'binary',
    analyse_targets: ['all'],
    binary_arch: ['all'],
    security_focus_categories: ['all'],
    module_granularity: 'fine',
    filter_engine: 'script',
    enable_final_check_mode: 'inherit',
    continue_on_module_failure_mode: 'inherit',
  };
}

export function buildCloneFormFromTask(detail: AppSaTaskDetail, projectId: string): SystemAnalysisTaskFormState {
  const config = detail.task_config_json || {};
  const analysisMode = detail.analysis_mode === 'source' ? 'source' : 'binary';
  return {
    task_name:`${detail.task_name}-copy`,
    input_path: detail.input_path || '',
    output_path:`/data/files/${projectId}/app/chimera-app-system-analyse`,
    task_description: detail.task_description || '',
    prompt_content: detail.prompt_content || '',
    analysis_mode: analysisMode,
    analyse_targets: normalizeNonEmptyArray(config.analyse_targets, analysisMode === 'source' ? SOURCE_MODE_DEFAULT_TARGETS : ['all']),
    binary_arch: normalizeNonEmptyArray(config.binary_arch, ['all']),
    security_focus_categories: normalizeNonEmptyArray(config.security_focus_categories, ['all']),
    module_granularity: normalizeGranularity(config.module_granularity),
    filter_engine: config.filter_engine === 'agent' ? 'agent' : 'script',
    enable_final_check_mode: typeof config.enable_final_check === 'boolean'
      ? (config.enable_final_check ? 'enabled' : 'disabled')
      : 'inherit',
    continue_on_module_failure_mode: typeof config.continue_on_module_failure === 'boolean'
      ? (config.continue_on_module_failure ? 'enabled' : 'disabled')
      : 'inherit',
  };
}

interface SystemAnalysisTaskFormModalProps {
  projectId: string;
  isOpen: boolean;
  title: string;
  submitLabel: string;
  initialForm: SystemAnalysisTaskFormState;
  loadProjectDefaultsOnOpen?: boolean;
  onClose: () => void;
  onCreated: (task: AppSaTaskDetail) => void | Promise<void>;
  onError?: (message: string) => void;
}

export const SystemAnalysisTaskFormModal: React.FC<SystemAnalysisTaskFormModalProps> = ({
  projectId,
  isOpen,
  title,
  submitLabel,
  initialForm,
  loadProjectDefaultsOnOpen = true,
  onClose,
  onCreated,
  onError,
}) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const [form, setForm] = useState<SystemAnalysisTaskFormState>(initialForm);
  const [creating, setCreating] = useState(false);
  const [analysisScopeTouched, setAnalysisScopeTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'output'>('input');
  const [projectFinalCheckDefault, setProjectFinalCheckDefault] = useState(false);
  const [projectContinueOnModuleFailureDefault, setProjectContinueOnModuleFailureDefault] = useState(true);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setForm(initialForm);
      setAnalysisScopeTouched(false);
    }
    wasOpenRef.current = isOpen;
  }, [initialForm, isOpen]);

  useEffect(() => {
    if (!isOpen || !projectId || !loadProjectDefaultsOnOpen) return;
    let cancelled = false;
    void appApi.getConfig(projectId)
      .then((cfg) => {
        if (cancelled) return;
        setProjectFinalCheckDefault(Boolean(cfg.enable_final_check));
        setProjectContinueOnModuleFailureDefault(cfg.continue_on_module_failure !== false);
        setForm((prev) => ({
          ...prev,
          analyse_targets: Array.isArray(cfg.analyse_targets) ? cfg.analyse_targets : prev.analyse_targets,
          binary_arch: Array.isArray(cfg.binary_arch) ? cfg.binary_arch : prev.binary_arch,
          security_focus_categories: Array.isArray(cfg.security_focus_categories) ? cfg.security_focus_categories : prev.security_focus_categories,
          module_granularity: typeof cfg.module_granularity === 'string' ? cfg.module_granularity : prev.module_granularity,
          filter_engine: cfg.filter_engine === 'agent' ? 'agent' : prev.filter_engine,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [appApi, isOpen, loadProjectDefaultsOnOpen, projectId]);

  const canSubmit = useMemo(
    () => Boolean(form.task_name.trim() && form.input_path.trim() && form.output_path.trim()),
    [form.input_path, form.output_path, form.task_name],
  );

  const handleCreate = async () => {
    if (!form.task_name.trim()) {
      onError?.('任务名称不能为空');
      return;
    }
    if (!form.input_path.trim()) {
      onError?.('输入路径不能为空');
      return;
    }
    if (!form.output_path.trim()) {
      onError?.('输出路径不能为空');
      return;
    }
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
        prompt_content: form.prompt_content.trim() || undefined,
        analysis_mode: form.analysis_mode,
        analyse_targets: form.analyse_targets.length > 0 ? form.analyse_targets : undefined,
        binary_arch: form.binary_arch.length > 0 ? form.binary_arch : undefined,
        security_focus_categories: form.security_focus_categories.length > 0 ? form.security_focus_categories : undefined,
        module_granularity: form.module_granularity || undefined,
        filter_engine: form.filter_engine,
        enable_final_check: form.enable_final_check_mode === 'inherit'
          ? undefined
          : form.enable_final_check_mode === 'enabled',
        continue_on_module_failure: form.continue_on_module_failure_mode === 'inherit'
          ? undefined
          : form.continue_on_module_failure_mode === 'enabled',
      });
      await onCreated(resp);
    } catch (err: any) {
      onError?.(`任务创建失败: ${err?.message || err}`);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          setForm((prev) => ({
            ...prev,
            [pickerTarget === 'output' ? 'output_path' : 'input_path']: containerPath,
          }));
        }}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={creating ? undefined : onClose} />
 <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-theme-border bg-theme-bg-app">
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-theme-text-primary">{title}</h2>
              <button onClick={onClose} disabled={creating} className="rounded-lg p-1 text-theme-text-muted hover:text-theme-text-secondary disabled:opacity-50">
                <X size={16} />
              </button>
            </div>

            <label className="block text-sm text-theme-text-secondary">
              任务名称 <span className="text-red-500">*</span>
              <input
                className="mt-1 w-full rounded-lg border border-theme-border px-3 py-2 text-sm"
                value={form.task_name}
                onChange={(e) => setForm((prev) => ({ ...prev, task_name: e.target.value }))}
                placeholder="例：固件安全分析-2025"
              />
            </label>

            <label className="block text-sm text-theme-text-secondary">
              输入路径 <span className="text-red-500">*</span>
              <div className="mt-1 flex gap-1">
                <input
                  className="flex-1 rounded-lg border border-theme-border px-3 py-2 text-sm font-mono"
                  value={form.input_path}
                  onChange={(e) => setForm((prev) => ({ ...prev, input_path: e.target.value }))}
                  placeholder="/data/files/<project>/<subproject>"
                />
                <button
                  type="button"
                  title="从文件资源中选择目录"
                  onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-theme-border px-3 py-2 text-xs text-theme-text-secondary hover:bg-theme-elevated"
                >
                  <FolderOpen size={13} />浏览
                </button>
              </div>
            </label>

            <label className="block text-sm text-theme-text-secondary">
              输出路径 <span className="text-red-500">*</span>
              <div className="mt-1 flex gap-1">
                <input
                  className="flex-1 rounded-lg border border-theme-border px-3 py-2 text-sm font-mono"
                  value={form.output_path}
                  onChange={(e) => setForm((prev) => ({ ...prev, output_path: e.target.value }))}
                  placeholder="/data/files/<project>/<subproject>"
                />
                <button
                  type="button"
                  title="从文件资源中选择目录"
                  onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-theme-border px-3 py-2 text-xs text-theme-text-secondary hover:bg-theme-elevated"
                >
                  <FolderOpen size={13} />浏览
                </button>
              </div>
            </label>

            <label className="block text-sm text-theme-text-secondary">
              任务描述 <span className="text-theme-text-muted text-xs">(可选)</span>
              <input
                className="mt-1 w-full rounded-lg border border-theme-border px-3 py-2 text-sm"
                value={form.task_description}
                onChange={(e) => setForm((prev) => ({ ...prev, task_description: e.target.value }))}
                placeholder="简要说明分析目标或背景"
              />
            </label>

            <label className="block text-sm text-theme-text-secondary">
              分析 Prompt <span className="text-theme-text-muted text-xs">(可选，不填则使用服务默认生成逻辑)</span>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-lg border border-theme-border px-3 py-2 text-sm leading-6"
                value={form.prompt_content}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt_content: e.target.value }))}
                placeholder="可复用原任务的 Prompt，或在此调整新的分析指令"
              />
            </label>

            <div className="rounded-xl border border-theme-border bg-theme-bg-app p-4">
              <p className="text-xs font-semibold text-theme-text-secondary">分析模式</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'binary' as const, label: '二进制模式', desc: '面向固件、解包目录、二进制与系统组件分析' },
                  { value: 'source' as const, label: '源码模式', desc: '面向源码项目、代码模块、脚本与配置分析' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${
                      form.analysis_mode === option.value ? 'border-cyan-300 bg-cyan-500/15 text-cyan-400' : 'border-theme-border bg-theme-bg-app text-theme-text-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="analysis_mode"
                      className="mr-2"
                      checked={form.analysis_mode === option.value}
                      onChange={() => {
                        setForm((prev) => ({
                          ...prev,
                          analysis_mode: option.value,
                          analyse_targets: !analysisScopeTouched
                            ? (option.value === 'source' ? SOURCE_MODE_DEFAULT_TARGETS : ['all'])
                            : prev.analyse_targets,
                        }));
                      }}
                    />
                    <span className="font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs opacity-75">{option.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-theme-border bg-theme-bg-app p-4">
              <p className="text-xs font-semibold text-theme-text-secondary">分析范围 <span className="font-normal text-theme-text-muted">(覆盖服务默认配置，默认 all)</span></p>
              <div>
                <p className="mb-1.5 text-xs text-theme-text-muted">文件类型</p>
                <div className="flex flex-wrap gap-2">
                  {ANALYSE_TARGET_OPTIONS.map((target) => (
                    <label key={target} className="flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={form.analyse_targets.includes(target)}
                        onChange={(e) => {
                          setAnalysisScopeTouched(true);
                          setForm((prev) => {
                            let next = e.target.checked
                              ? (target === 'all' ? ['all'] : prev.analyse_targets.filter((item) => item !== 'all').concat(target))
                              : prev.analyse_targets.filter((item) => item !== target);
                            if (next.length === 0) next = ['all'];
                            return { ...prev, analyse_targets: next };
                          });
                        }}
                      />
                      {target}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-theme-text-muted">二进制架构</p>
                <div className="flex flex-wrap gap-2">
                  {BINARY_ARCH_OPTIONS.map((arch) => (
                    <label key={arch} className="flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={form.binary_arch.includes(arch)}
                        onChange={(e) => {
                          setForm((prev) => {
                            let next = e.target.checked
                              ? (arch === 'all' ? ['all'] : prev.binary_arch.filter((item) => item !== 'all').concat(arch))
                              : prev.binary_arch.filter((item) => item !== arch);
                            if (next.length === 0) next = ['all'];
                            return { ...prev, binary_arch: next };
                          });
                        }}
                      />
                      {arch}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-theme-text-muted">安全维度过滤 <span className="text-theme-text-muted">(覆盖服务默认，all=不过滤)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {SECURITY_CATEGORY_OPTIONS.map(({ key, label }) => {
                  const selected = form.security_focus_categories.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        const categories = form.security_focus_categories;
                        let next: string[];
                        if (key === 'all') next = ['all'];
                        else if (selected) {
                          next = categories.filter((item) => item !== key);
                          if (next.length === 0) next = ['all'];
                        } else {
                          next = categories.filter((item) => item !== 'all').concat(key);
                        }
                        setForm((prev) => ({ ...prev, security_focus_categories: next }));
                      }}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${selected ? 'border-rose-400 bg-rose-500/15 text-rose-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted hover:border-theme-border'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-theme-text-muted">模块划分粒度 <span className="text-theme-text-muted">(覆盖服务默认)</span></p>
              <div className="flex gap-2">
                {[{ value: 'fine', label: '细粒度（默认）' }, { value: 'coarse', label: '粗粒度（协议/服务/功能级）' }].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, module_granularity: value }))}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${form.module_granularity === value ? 'border-rose-400 bg-rose-500/15 text-rose-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted hover:border-theme-border'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-theme-text-muted">过滤引擎 <span className="text-theme-text-muted">(覆盖服务默认)</span></p>
              <div className="flex gap-2">
                {[{ value: 'script', label: '脚本驱动' }, { value: 'agent', label: '智能体驱动' }].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, filter_engine: value as 'script' | 'agent' }))}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${form.filter_engine === value ? 'border-rose-400 bg-rose-500/15 text-rose-400' : 'border-theme-border bg-theme-bg-app text-theme-text-muted hover:border-theme-border'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-theme-text-muted">
                智能体驱动会直接替代脚本过滤与 S1 粗分类，复用 classify 模型，失败后自动回退脚本路径。
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-theme-text-muted">final_check — 完整性检查 <span className="text-theme-text-muted">(任务级可选；未指定时继承全局配置)</span></p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    value: 'inherit' as const,
                    label: '使用全局配置',
                    desc:`当前全局默认：${projectFinalCheckDefault ? '开启' : '关闭'}`,
                  },
                  {
                    value: 'enabled' as const,
                    label: '任务级开启',
                    desc: '本任务强制执行 Stage 4a',
                  },
                  {
                    value: 'disabled' as const,
                    label: '任务级关闭',
                    desc: '本任务跳过 Stage 4a',
                  },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, enable_final_check_mode: value }))}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      form.enable_final_check_mode === value
                        ? 'border-rose-400 bg-rose-500/15 text-rose-400'
                        : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs opacity-80">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-theme-text-muted">单模块失败后继续 <span className="text-theme-text-muted">(任务级可选；未指定时继承全局配置)</span></p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    value: 'inherit' as const,
                    label: '使用全局配置',
                    desc:`当前全局默认：${projectContinueOnModuleFailureDefault ? '允许继续' : '失败即终止'}`,
                  },
                  {
                    value: 'enabled' as const,
                    label: '任务级允许',
                    desc: '单模块失败只记入结果，不阻断其他模块',
                  },
                  {
                    value: 'disabled' as const,
                    label: '任务级禁止',
                    desc: '任一模块失败会终止当前任务',
                  },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, continue_on_module_failure_mode: value }))}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      form.continue_on_module_failure_mode === value
                        ? 'border-rose-400 bg-rose-500/15 text-rose-400'
                        : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs opacity-80">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => void handleCreate()}
              disabled={creating || !canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-theme-surface px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : null}
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
