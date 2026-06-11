import React from 'react';
import { ExternalLink } from 'lucide-react';

import {
  AppDfaTaskDetail,
  AppEaTaskDetail,
  AppSaTaskDetail,
} from '../../types/types';
import {
  BinarySecurityEntryContract,
  BinarySecurityModuleContract,
} from '../../clients/binarySecurity';
import { FirmwareTaskConfigSnapshot, FirmwareUnpackTask } from '../../clients/firmwareUnpacker';
import {
  asBinarySecurityContract,
  contractText,
  dfaContractSourceFile,
  dfaInputContractRows,
  dfaOutputContractRows,
  dfaContractModuleInputPath,
  dfaContractSourceRootPath,
  entryContractDescriptorRoot,
  entryContractFilesListPath,
  entryContractModuleDir,
  entryContractSourceRoot,
  legacyContractValue,
} from '../../utils/binarySecurityContracts';

const ANALYSE_TARGET_LABELS: Record<string, string> = {
  all: '全部文件',
  binary: '二进制',
  script: '脚本',
  source: '源码',
  config: '配置',
  firmware: '固件',
  crypto: '密码学',
  database: '数据库',
  web: 'Web',
  network_model: '网络模型',
  document: '文档',
  archive: '压缩包',
};

const BINARY_ARCH_LABELS: Record<string, string> = {
  all: '全部架构',
  x86: 'x86',
  x86_64: 'x86_64',
  arm: 'ARM',
  aarch64: 'AArch64',
  mips: 'MIPS',
  mips64: 'MIPS64',
  ppc: 'PowerPC',
  ppc64: 'PowerPC64',
  riscv: 'RISC-V',
  s390: 's390',
};

const SECURITY_CATEGORY_LABELS: Record<string, { name: string; desc: string }> = {
  network_protocol: { name: '网络协议解析', desc: 'socket、报文解析、协议状态机' },
  file_parsing: { name: '文件格式处理', desc: '压缩包、图片、媒体、固件格式' },
  auth_access: { name: '认证与访问控制', desc: '登录、会话、权限校验、ACL' },
  crypto: { name: '密码学操作', desc: '加解密、密钥管理、随机数、证书' },
  ipc: { name: '进程间通信', desc: '共享内存、消息队列、RPC、信号' },
  config_parsing: { name: '配置与脚本解析', desc: '配置文件、脚本引擎、模板' },
  input_handling: { name: '输入处理与验证', desc: '命令行、环境变量、表单、参数解析' },
  privilege_process: { name: '权限与进程管理', desc: 'setuid/setgid、特权提升、进程控制' },
  web_api: { name: 'Web 与 API 接口', desc: 'HTTP 处理、REST/SOAP 接口、CGI' },
  memory_manage: { name: '内存管理', desc: 'malloc/free、内存映射、与溢出相关操作' },
  all: { name: '全部维度', desc: '不过滤，对所有安全维度进行分析' },
};

const FILTER_ENGINE_LABELS: Record<string, string> = {
  script: '脚本驱动（兼容现有）',
  agent: '智能体驱动',
};

const SectionCard: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h2>
    {children}
  </section>
);

const ConfigRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-4">
    <span className="w-40 shrink-0 text-xs font-semibold text-slate-500">{label}</span>
    <div className="min-w-0 flex-1 text-sm text-slate-800">{children}</div>
  </div>
);

const Divider: React.FC = () => <hr className="border-slate-100" />;

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">{text}</div>
);

const TagList: React.FC<{ items: string[]; labelMap?: Record<string, string>; emptyText?: string }> = ({
  items,
  labelMap,
  emptyText = '未配置',
}) => {
  if (!items || items.length === 0) return <span className="text-xs text-slate-400">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {labelMap?.[item] ? `${labelMap[item]}（${item}）` : item}
        </span>
      ))}
    </div>
  );
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function recordText(value: unknown, ...fields: string[]): string | null {
  return legacyContractValue(value, ...fields);
}

function recordStringArray(value: unknown, field: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>)[field];
  if (!Array.isArray(candidate)) return [];
  return candidate.map((item) => String(item || '').trim()).filter(Boolean);
}

function recordBool(value: unknown, field: string): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function formatBool(value: unknown, trueLabel = '开启', falseLabel = '关闭'): string {
  return value ? trueLabel : falseLabel;
}

function normalizeProjectFileExplorerPath(path: string, projectId?: string | null): string {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return '';
  const normalizedProjectId = String(projectId || '').trim();
  const projectRoot = normalizedProjectId ? `/data/files/${normalizedProjectId}` : '';
  if (projectRoot && normalizedPath.startsWith(projectRoot)) {
    const relativePath = normalizedPath.slice(projectRoot.length).replace(/\/+$/, '');
    if (!relativePath) return '/';
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }
  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}

function buildProjectFileExplorerUrl(fsPath: string, projectId?: string | null): string {
  return `#/project-file-explorer?path=${encodeURIComponent(normalizeProjectFileExplorerPath(fsPath, projectId))}`;
}

const ProjectDirectoryValue: React.FC<{ path?: string | null; projectId?: string | null }> = ({ path, projectId }) => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return <>-</>;
  const explorerPath = normalizeProjectFileExplorerPath(normalizedPath, projectId);
  const showRawPath = explorerPath !== normalizedPath;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0">
        <div className="break-all font-mono text-xs">{explorerPath}</div>
        {showRawPath ? <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{normalizedPath}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => window.open(buildProjectFileExplorerUrl(normalizedPath, projectId), '_blank', 'noopener,noreferrer')}
        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"
      >
        <ExternalLink size={11} />
        项目文件
      </button>
    </div>
  );
};

const JsonPreview: React.FC<{ value: unknown; emptyText?: string }> = ({ value, emptyText = '无 task_config_json 内容' }) => {
  const hasValue = value != null
    && ((Array.isArray(value) && value.length > 0)
      || (typeof value === 'object' && Object.keys(asRecord(value)).length > 0)
      || (!Array.isArray(value) && typeof value !== 'object'));
  if (!hasValue) return <EmptyState text={emptyText} />;
  return (
    <details>
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">展开查看原始 JSON</summary>
      <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
};

const taskOriginLabel = (detail: { origin_label?: string | null; task_origin_type?: string | null }) =>
  detail.origin_label || detail.task_origin_type || '-';

const TaskIdentitySection: React.FC<{
  taskId: string;
  projectId?: string | null;
  taskOriginType?: string | null;
  originLabel?: string | null;
  parentTaskId?: string | null;
  parentTaskType?: string | null;
  parentStageName?: string | null;
  extraRows?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ taskId, projectId, taskOriginType, originLabel, parentTaskId, parentTaskType, parentStageName, extraRows = [] }) => (
  <SectionCard title="任务标识">
    <div className="divide-y divide-slate-100">
      <ConfigRow label="任务 ID"><span className="break-all font-mono text-xs">{taskId}</span></ConfigRow>
      <Divider />
      <ConfigRow label="项目 ID"><span className="break-all font-mono text-xs">{projectId || '-'}</span></ConfigRow>
      <Divider />
      <ConfigRow label="来源">{originLabel || taskOriginType || '-'}</ConfigRow>
      <Divider />
      <ConfigRow label="父任务"><span className="break-all font-mono text-xs">{parentTaskId || '-'}</span></ConfigRow>
      <Divider />
      <ConfigRow label="父任务类型">{parentTaskType || '-'}</ConfigRow>
      <Divider />
      <ConfigRow label="父阶段">{parentStageName || '-'}</ConfigRow>
      {extraRows.map((row, index) => (
        <React.Fragment key={`${row.label}-${index}`}>
          <Divider />
          <ConfigRow label={row.label}>{row.value}</ConfigRow>
        </React.Fragment>
      ))}
    </div>
  </SectionCard>
);

const PathSummarySection: React.FC<{
  title: string;
  projectId?: string | null;
  rows: Array<{ label: string; path?: string | null; value?: React.ReactNode }>;
}> = ({ title, projectId, rows }) => (
  <SectionCard title={title}>
    <div className="divide-y divide-slate-100">
      {rows.map((row, index) => (
        <React.Fragment key={`${row.label}-${index}`}>
          <ConfigRow label={row.label}>
            {row.value !== undefined ? row.value : <ProjectDirectoryValue path={row.path} projectId={projectId} />}
          </ConfigRow>
          {index < rows.length - 1 ? <Divider /> : null}
        </React.Fragment>
      ))}
    </div>
  </SectionCard>
);

export const SystemAnalysisTaskConfigPanel: React.FC<{ detail: AppSaTaskDetail }> = ({ detail }) => {
  const taskConfig = asRecord(detail.task_config_json);
  const resolved = asRecord(taskConfig.resolved_config_snapshot || detail.effective_config_json);
  const hasResolved = Object.keys(resolved).length > 0;
  const analyseTargets = recordStringArray(taskConfig, 'analyse_targets');
  const binaryArch = recordStringArray(taskConfig, 'binary_arch');
  const securityFocusCategories = recordStringArray(taskConfig, 'security_focus_categories');
  const resolvedAnalyseTargets = recordStringArray(resolved, 'analyse_targets');
  const resolvedBinaryArch = recordStringArray(resolved, 'binary_arch');
  const resolvedSecurityFocusCategories = recordStringArray(resolved, 'security_focus_categories');
  const moduleGranularity = recordText(taskConfig, 'module_granularity');
  const filterEngine = recordText(taskConfig, 'filter_engine');
  const resolvedModuleGranularity = recordText(resolved, 'module_granularity');
  const resolvedFilterEngine = recordText(resolved, 'filter_engine') || 'script';
  const enableFinalCheck = recordBool(taskConfig, 'enable_final_check');
  const continueOnModuleFailure = recordBool(taskConfig, 'continue_on_module_failure');
  const resolvedEnableFinalCheck = recordBool(resolved, 'enable_final_check');
  const resolvedContinueOnModuleFailure = recordBool(resolved, 'continue_on_module_failure');
  const startStage = recordText(taskConfig, 'start_stage');
  const resumeWorkspace = recordText(taskConfig, 'resume_workspace');
  const overrideKeys = ['analyse_targets', 'binary_arch', 'security_focus_categories', 'module_granularity', 'filter_engine', 'enable_final_check', 'continue_on_module_failure']
    .filter((key) => taskConfig[key] !== undefined);

  return (
    <div className="space-y-4">
      <TaskIdentitySection
        taskId={detail.task_id}
        projectId={detail.project_id}
        taskOriginType={detail.task_origin_type}
        originLabel={taskOriginLabel(detail)}
        parentTaskId={detail.parent_task_id}
        parentTaskType={detail.parent_task_type}
        parentStageName={detail.parent_stage_name}
        extraRows={[
          { label: '分析模式', value: detail.analysis_mode_label || detail.analysis_mode || '-' },
          { label: 'Prompt 模板', value: detail.prompt_template_id || '-' },
        ]}
      />

      <PathSummarySection
        title="输入信息"
        projectId={detail.project_id}
        rows={[
          { label: '输入路径', path: detail.input_path },
          { label: '输出路径', path: detail.output_path },
        ]}
      />

      <PathSummarySection
        title="输出信息"
        projectId={detail.project_id}
        rows={[
          { label: '任务目录', path: detail.task_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '工作目录', path: detail.workspace_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace` : null) },
          { label: '输出目录', path: detail.output_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/output` : null) },
          { label: '最终报告', path: detail.output_path ? `${detail.output_path}/${detail.task_id}/output/final_report.md` : null },
        ]}
      />

      <SectionCard title="任务级覆盖">
        {overrideKeys.length === 0 ? (
          <EmptyState text="当前任务没有显式任务级覆盖项，运行时使用项目默认配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {taskConfig.analyse_targets !== undefined ? (
              <>
                <ConfigRow label="文件类型过滤"><TagList items={analyseTargets} labelMap={ANALYSE_TARGET_LABELS} /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.binary_arch !== undefined ? (
              <>
                <ConfigRow label="ELF 架构过滤"><TagList items={binaryArch} labelMap={BINARY_ARCH_LABELS} /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.security_focus_categories !== undefined ? (
              <>
                <ConfigRow label="安全分析维度">
                  {securityFocusCategories.includes('all')
                    ? '全部维度'
                    : <TagList items={securityFocusCategories} labelMap={Object.fromEntries(Object.entries(SECURITY_CATEGORY_LABELS).map(([key, value]) => [key, value.name]))} />}
                </ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.module_granularity !== undefined ? (
              <>
                <ConfigRow label="模块划分粒度">{moduleGranularity === 'coarse' ? '粗粒度（协议/服务/功能级）' : '细粒度（子组件级）'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.filter_engine !== undefined ? (
              <>
                <ConfigRow label="过滤引擎">{FILTER_ENGINE_LABELS[String(filterEngine)] || String(filterEngine)}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.enable_final_check !== undefined ? (
              <>
                <ConfigRow label="完整性检查">{formatBool(enableFinalCheck, '开启 Stage 4a', '关闭 Stage 4a')}</ConfigRow>
                {taskConfig.continue_on_module_failure !== undefined ? <Divider /> : null}
              </>
            ) : null}
            {taskConfig.continue_on_module_failure !== undefined ? (
              <ConfigRow label="单模块失败后继续">
                {formatBool(continueOnModuleFailure, '允许继续', '失败即终止任务')}
              </ConfigRow>
            ) : null}
          </div>
        )}
      </SectionCard>

      {(startStage || resumeWorkspace) ? (
        <SectionCard title="续跑配置">
          <div className="divide-y divide-slate-100">
            {startStage ? (
              <>
                <ConfigRow label="起始阶段">{`Stage ${startStage}`}</ConfigRow>
                {resumeWorkspace ? <Divider /> : null}
              </>
            ) : null}
            {resumeWorkspace ? (
              <ConfigRow label="复用工作区"><ProjectDirectoryValue path={resumeWorkspace} projectId={detail.project_id} /></ConfigRow>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasResolved ? (
        <SectionCard title="实际运行快照">
          <div className="divide-y divide-slate-100">
            <ConfigRow label="文件类型过滤"><TagList items={resolvedAnalyseTargets} labelMap={ANALYSE_TARGET_LABELS} emptyText="-" /></ConfigRow>
            <Divider />
            <ConfigRow label="ELF 架构过滤"><TagList items={resolvedBinaryArch} labelMap={BINARY_ARCH_LABELS} emptyText="-" /></ConfigRow>
            <Divider />
            <ConfigRow label="安全分析维度">
              {resolvedSecurityFocusCategories.includes('all')
                ? '全部维度'
                : <TagList items={resolvedSecurityFocusCategories} labelMap={Object.fromEntries(Object.entries(SECURITY_CATEGORY_LABELS).map(([key, value]) => [key, value.name]))} emptyText="-" />}
            </ConfigRow>
            <Divider />
            <ConfigRow label="模块划分粒度">{resolvedModuleGranularity === 'coarse' ? '粗粒度（协议/服务/功能级）' : '细粒度（子组件级）'}</ConfigRow>
            <Divider />
            <ConfigRow label="过滤引擎">{FILTER_ENGINE_LABELS[String(resolvedFilterEngine)] || String(resolvedFilterEngine)}</ConfigRow>
            <Divider />
            <ConfigRow label="完整性检查">{formatBool(resolvedEnableFinalCheck, '开启 Stage 4a', '关闭 Stage 4a')}</ConfigRow>
            <Divider />
            <ConfigRow label="单模块失败后继续">
              {formatBool(resolvedContinueOnModuleFailure !== false, '允许继续', '失败即终止任务')}
            </ConfigRow>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="原始任务配置 JSON">
        <JsonPreview value={detail.task_config_json} />
      </SectionCard>
    </div>
  );
};

export const EntryAnalysisTaskConfigPanel: React.FC<{ detail: AppEaTaskDetail }> = ({ detail }) => {
  const taskConfig = asRecord(detail.task_config_json);
  const outputSummary = asRecord(detail.output_summary);
  const inputSummary = asRecord(detail.input_summary);
  const inputContract = asBinarySecurityContract(taskConfig.input_contract);
  const contractModuleDir = entryContractModuleDir(inputContract);
  const contractDescriptorRoot = entryContractDescriptorRoot(inputContract);
  const contractSourceRoot = entryContractSourceRoot(inputContract);
  const filesListPath = entryContractFilesListPath(inputContract)
    || recordText(inputSummary, 'files_list_path')
    || null;
  const resumeTaskId = recordText(taskConfig, 'resume_task_id');
  const resumeStage = recordText(taskConfig, 'resume_stage');
  const resumeWorkspace = recordText(taskConfig, 'resume_workspace');
  return (
    <div className="space-y-4">
      <TaskIdentitySection
        taskId={detail.task_id}
        projectId={detail.project_id}
        taskOriginType={detail.task_origin_type}
        originLabel={taskOriginLabel(detail)}
        parentTaskId={detail.parent_task_id}
        parentTaskType={detail.parent_task_type}
        parentStageName={detail.parent_stage_name}
        extraRows={[
          { label: '分析模块', value: detail.module_name || '-' },
          { label: 'Prompt 模板', value: detail.prompt_template_id || '-' },
        ]}
      />

      <PathSummarySection
        title="输入信息"
        projectId={detail.project_id}
        rows={[
          { label: '模块目录', path: contractModuleDir || detail.input_path || null },
          { label: '描述根目录', path: contractDescriptorRoot || null },
          { label: '源码目录', path: contractSourceRoot || detail.source_path || null },
          { label: '模块文件清单', path: filesListPath },
        ]}
      />

      <PathSummarySection
        title="输出信息"
        projectId={detail.project_id}
        rows={[
          { label: '任务目录', path: detail.task_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '工作目录', path: detail.workspace_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace` : null) },
          { label: 'R1-functions', path: outputSummary.r1_functions_path || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace/r1-functions` : null) },
          { label: 'R3-entries', path: outputSummary.r3_entries_path || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace/r3-entries` : null) },
          { label: 'R4-module', path: outputSummary.r4_module_path || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace/r4-module` : null) },
          { label: '报告目录', path: outputSummary.report_path || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/workspace/report` : null) },
        ]}
      />

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {taskConfig.resume_task_id !== undefined ? (
              <>
                <ConfigRow label="断点续跑来源任务"><span className="break-all font-mono text-xs">{resumeTaskId || '-'}</span></ConfigRow>
                <Divider />
              </>
            ) : null}
            {resumeStage ? (
              <>
                <ConfigRow label="续跑阶段">{resumeStage}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {resumeWorkspace ? (
              <ConfigRow label="复用工作区"><ProjectDirectoryValue path={resumeWorkspace} projectId={detail.project_id} /></ConfigRow>
            ) : (
              !resumeTaskId
                ? <EmptyState text="当前任务的 task_config_json 中没有可识别的显式字段。" />
                : null
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="原始任务配置 JSON">
        <JsonPreview value={detail.task_config_json} />
      </SectionCard>
    </div>
  );
};

export const DataflowAnalysisTaskConfigPanel: React.FC<{ detail: AppDfaTaskDetail }> = ({ detail }) => {
  const taskConfig = asRecord(detail.task_config_json);
  const inputSummary = asRecord(detail.input_summary);
  const outputSummary = asRecord(detail.output_summary);
  const inputContract = asBinarySecurityContract(taskConfig.input_contract);
  const outputContract = asBinarySecurityContract(outputSummary.output_contract || taskConfig.output_contract);
  const moduleInputPath = dfaContractModuleInputPath(inputContract, inputSummary);
  const sourceRootPath = dfaContractSourceRootPath(inputContract, inputSummary);
  const sourceFile = dfaContractSourceFile(inputContract, inputSummary) || recordText(taskConfig, 'source_file');
  const inputContractRows = dfaInputContractRows(inputContract, inputSummary);
  const outputContractRows = dfaOutputContractRows(outputContract, outputSummary);
  const functionName = recordText(taskConfig, 'function_name');
  const lineHint = recordText(taskConfig, 'line_hint');
  const functionDescription = recordText(taskConfig, 'function_description');
  const entryReason = recordText(taskConfig, 'entry_reason');
  const taintParams = Array.isArray(taskConfig.taint_params) ? taskConfig.taint_params.map((item: any) => String(item || '').trim()).filter(Boolean) : [];
  const taintDetails = Array.isArray(taskConfig.taint_details) ? taskConfig.taint_details.filter((item: any) => item && typeof item === 'object') : [];
  const resumeWorkspace = recordText(taskConfig, 'resume_workspace');
  return (
    <div className="space-y-4">
      <TaskIdentitySection
        taskId={detail.task_id}
        projectId={detail.project_id}
        taskOriginType={detail.task_origin_type}
        originLabel={taskOriginLabel(detail)}
        parentTaskId={detail.parent_task_id}
        parentTaskType={detail.parent_task_type}
        parentStageName={detail.parent_stage_name}
        extraRows={[
          { label: 'Prompt 模板', value: detail.prompt_template_id || '-' },
        ]}
      />

      <PathSummarySection
        title="输入信息"
        projectId={detail.project_id}
        rows={[
          { label: '模块输入目录', path: moduleInputPath },
          { label: '源码根目录', path: sourceRootPath },
          { label: '输入工作区', path: recordText(inputSummary, 'workspace_root', 'workspace_dir') },
          { label: '源码文件', value: sourceFile ? <span className="break-all font-mono text-xs">{sourceFile}</span> : '-' },
          { label: '函数名', value: functionName || '-' },
          { label: '行号提示', value: lineHint || '-' },
        ]}
      />

      <SectionCard title="DFA 输入 Contract">
        {inputContractRows.length === 0 ? (
          <EmptyState text="当前任务未记录结构化 DFA 输入 Contract。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {inputContractRows.map((row, index) => (
              <React.Fragment key={`${row.label}-${index}`}>
                <ConfigRow label={row.label}>
                  <div className="space-y-1">
                    {row.semantic ? <div className="text-[11px] font-semibold text-slate-500">{row.semantic}</div> : null}
                    <span className="break-all font-mono text-xs text-slate-800">{row.value}</span>
                  </div>
                </ConfigRow>
                {index < inputContractRows.length - 1 ? <Divider /> : null}
              </React.Fragment>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="DFA 输出 Contract">
        {outputContractRows.length === 0 ? (
          <EmptyState text="当前任务未记录结构化 DFA 输出 Contract。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {outputContractRows.map((row, index) => (
              <React.Fragment key={`${row.label}-${index}`}>
                <ConfigRow label={row.label}>
                  <div className="space-y-1">
                    {row.semantic ? <div className="text-[11px] font-semibold text-slate-500">{row.semantic}</div> : null}
                    <span className="break-all font-mono text-xs text-slate-800">{row.value}</span>
                  </div>
                </ConfigRow>
                {index < outputContractRows.length - 1 ? <Divider /> : null}
              </React.Fragment>
            ))}
          </div>
        )}
      </SectionCard>

      <PathSummarySection
        title="输出信息"
        projectId={detail.project_id}
        rows={[
          { label: '任务目录', path: detail.task_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '最新工作区', path: detail.workspace_root || recordText(outputSummary, 'latest_workspace_root') },
          { label: '结果文件', path: recordText(outputSummary, 'result_path') || (detail.output_path ? `${detail.output_path}/${detail.task_id}/run/result.json` : null) },
          { label: '数据流输出', path: recordText(outputSummary, 'dataflow_output_path') || (detail.output_path ? `${detail.output_path}/${detail.task_id}/output/dataflow` : null) },
        ]}
      />

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {sourceFile ? (
              <>
                <ConfigRow label="源码文件"><span className="break-all font-mono text-xs">{sourceFile || '-'}</span></ConfigRow>
                <Divider />
              </>
            ) : null}
            {functionName ? (
              <>
                <ConfigRow label="函数名">{functionName || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {lineHint ? (
              <>
                <ConfigRow label="行号提示">{lineHint || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.taint_params !== undefined ? (
              <>
                <ConfigRow label="污点参数"><TagList items={taintParams} emptyText="未指定" /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taintDetails.length > 0 ? (
              <>
                <ConfigRow label="污点详情">
                  <div className="space-y-2">
                    {taintDetails.map((item: any, index: number) => {
                      const name = String(item.name || item.taint || item.param || '').trim() || `污点${index + 1}`;
                      const description = String(item.description || item.summary || '').trim();
                      const sourceKind = String(item.source_kind || '').trim();
                      const source = String(item.description_source || '').trim();
                      return (
                        <div key={`${name}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="font-mono text-xs font-black text-slate-800">{name}</div>
                          {description ? <div className="mt-1 text-xs text-slate-600">{description}</div> : null}
                          {(sourceKind || source) ? <div className="mt-1 text-[10px] font-semibold text-slate-400">{[sourceKind ? `source_kind=${sourceKind}` : '', source ? `source=${source}` : ''].filter(Boolean).join(' · ')}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </ConfigRow>
                <Divider />
              </>
            ) : null}
            {functionDescription ? (
              <>
                <ConfigRow label="函数描述">{functionDescription || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {entryReason ? (
              <>
                <ConfigRow label="入口原因">{entryReason || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.start_stage !== undefined ? (
              <>
                <ConfigRow label="起始阶段">{`Stage ${taskConfig.start_stage}`}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {resumeWorkspace ? (
              <>
                <ConfigRow label="复用工作区"><ProjectDirectoryValue path={resumeWorkspace} projectId={detail.project_id} /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.resume !== undefined ? (
              <ConfigRow label="续跑标记">{formatBool(taskConfig.resume, '是', '否')}</ConfigRow>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="原始任务配置 JSON">
        <JsonPreview value={detail.task_config_json} />
      </SectionCard>

      <SectionCard title="原始输入输出摘要">
        <JsonPreview value={{ input_summary: detail.input_summary, output_summary: detail.output_summary }} emptyText="当前任务没有输入输出摘要。" />
      </SectionCard>
    </div>
  );
};

export const FirmwareUnpackerTaskConfigPanel: React.FC<{
  detail: FirmwareUnpackTask;
  taskConfigSnapshot?: FirmwareTaskConfigSnapshot | null;
  taskConfigLoading?: boolean;
  taskConfigError?: string;
}> = ({ detail, taskConfigSnapshot, taskConfigLoading = false, taskConfigError = '' }) => {
  const inputSummary = asRecord(detail.input_summary);
  const outputSummary = asRecord(detail.output_summary);
  const inputFirmwarePath = recordText(inputSummary, 'firmware_path');
  const workspaceRoot = recordText(outputSummary, 'workspace_root');
  return (
    <div className="space-y-4">
      <TaskIdentitySection
        taskId={detail.id}
        projectId={detail.project_id}
        taskOriginType={detail.task_origin_type}
        originLabel={taskOriginLabel(detail)}
        parentTaskId={detail.parent_task_id}
        parentTaskType={detail.parent_task_type}
        parentStageName={detail.parent_stage_name}
        extraRows={[
          { label: '当前状态', value: detail.status || '-' },
        ]}
      />

      <PathSummarySection
        title="输入信息"
        projectId={detail.project_id}
        rows={[
          { label: '固件文件', path: detail.firmware_path },
          { label: '输入目录', path: detail.input_path },
          { label: '输入摘要固件路径', path: inputFirmwarePath },
        ]}
      />

      <PathSummarySection
        title="输出信息"
        projectId={detail.project_id}
        rows={[
          { label: '任务目录', path: detail.task_root },
          { label: '输出目录', path: detail.output_path },
          { label: '运行目录', path: detail.run_path || detail.run_root },
          { label: '工作目录', path: detail.workspace_root || workspaceRoot },
          { label: '归档目录', path: detail.archive_root },
          { label: '运行时目录', path: detail.runtime_root },
        ]}
      />

      <SectionCard title="任务上下文">
        <JsonPreview value={detail.task_metadata} emptyText="当前任务没有额外 task metadata。" />
      </SectionCard>

      <SectionCard title="智能体任务配置 JSON">
        {taskConfigLoading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : taskConfigError ? (
          <div className="text-sm text-rose-600">{taskConfigError}</div>
        ) : !taskConfigSnapshot ? (
          <div className="text-sm text-slate-500">当前任务没有可展示的智能体配置快照。</div>
        ) : taskConfigSnapshot.available === false ? (
          <div className="text-sm text-slate-500">{taskConfigSnapshot.message || '当前任务没有可展示的智能体配置快照。'}</div>
        ) : (
          <JsonPreview value={taskConfigSnapshot} emptyText="当前任务没有可展示的智能体配置快照。" />
        )}
      </SectionCard>

      <SectionCard title="原始输入输出摘要">
        <JsonPreview value={{ input_summary: detail.input_summary, output_summary: detail.output_summary }} emptyText="当前任务没有输入输出摘要。" />
      </SectionCard>
    </div>
  );
};
