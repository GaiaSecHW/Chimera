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

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: '#1b2438',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-primary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
  <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
    <h2 style={{ marginBottom: '16px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{title}</h2>
    {children}
  </section>
);

const ConfigRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
    <span style={{ width: '160px', flexShrink: 0, fontSize: '12px', fontWeight: 600, color: LK.muted }}>{label}</span>
    <div style={{ minWidth: 0, flex: 1, fontSize: '14px', color: LK.ink }}>{children}</div>
  </div>
);

const Divider: React.FC = () => <hr style={{ border: 'none', borderTop:`1px solid ${LK.borderSoft}` }} />;

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ borderRadius: '8px', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '16px', fontSize: '14px', color: LK.muted }}>{text}</div>
);

const TagList: React.FC<{ items: string[]; labelMap?: Record<string, string>; emptyText?: string }> = ({
  items,
  labelMap,
  emptyText = '未配置',
}) => {
  if (!items || items.length === 0) return <span style={{ fontSize: '12px', color: LK.body }}>{emptyText}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {items.map((item) => (
        <span key={item} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 10px', fontSize: '12px', fontWeight: 500, color: LK.inkSoft }}>
          {labelMap?.[item] ?`${labelMap[item]}（${item}）` : item}
        </span>
      ))}
    </div>
  );
};

const FIRMWARE_ROLE_LABELS: Record<string, string> = {
  executor: '执行器',
  reviewer: '评审器',
  cleaner: '清理器',
  skill_author: '技能生成器',
  skill_executor: '技能执行器',
  evolution_improver: '进化改进器',
};

const SYSTEM_ANALYSIS_ROLE_LABELS: Record<string, string> = {
  workers: '分析 Worker',
  judges: '评审 Judge',
};

const ENTRY_ANALYSIS_ROLE_LABELS: Record<string, string> = {
  workers: '入口分析 Worker',
  judges: '入口分析 Judge',
};

const DATAFLOW_ROLE_LABELS: Record<string, string> = {
  workers: 'DFA Worker',
  judges: 'DFA Judge',
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
  const projectRoot = normalizedProjectId ?`/data/files/${normalizedProjectId}` : '';
  if (projectRoot && normalizedPath.startsWith(projectRoot)) {
    const relativePath = normalizedPath.slice(projectRoot.length).replace(/\/+$/, '');
    if (!relativePath) return '/';
    return relativePath.startsWith('/') ? relativePath :`/${relativePath}`;
  }
  return normalizedPath.startsWith('/') ? normalizedPath :`/${normalizedPath}`;
}

function buildProjectFileExplorerUrl(fsPath: string, projectId?: string | null): string {
  return`#/project-file-explorer?path=${encodeURIComponent(normalizeProjectFileExplorerPath(fsPath, projectId))}`;
}

const ProjectDirectoryValue: React.FC<{ path?: string | null; projectId?: string | null }> = ({ path, projectId }) => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return <>-</>;
  const explorerPath = normalizeProjectFileExplorerPath(normalizedPath, projectId);
  const showRawPath = explorerPath !== normalizedPath;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{explorerPath}</div>
        {showRawPath ? <div style={{ marginTop: '4px', wordBreak: 'break-all', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{normalizedPath}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => window.open(buildProjectFileExplorerUrl(normalizedPath, projectId), '_blank', 'noopener,noreferrer')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px', border: `1px solid ${LK.primaryMuted}`, padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: LK.primary, backgroundColor: 'transparent', cursor: 'pointer' }}
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
      <summary style={{ cursor: 'pointer', fontSize: '12px', color: LK.muted }}>展开查看原始 JSON</summary>
      <pre style={{ marginTop: '12px', maxHeight: '320px', overflow: 'auto', borderRadius: '8px', backgroundColor: LK.canvas, padding: '16px', fontSize: '12px', lineHeight: '1.6', color: LK.ink, whiteSpace: 'pre-wrap' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ConfigRow label="任务 ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{taskId}</span></ConfigRow>
      <Divider />
      <ConfigRow label="项目 ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{projectId || '-'}</span></ConfigRow>
      <Divider />
      <ConfigRow label="来源">{originLabel || taskOriginType || '-'}</ConfigRow>
      <Divider />
      <ConfigRow label="父任务"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{parentTaskId || '-'}</span></ConfigRow>
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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
  const agentAuthJson = asRecord(detail.agent_auth_json || taskConfig.agent_auth_json);
  const roleConfigSnapshot = asRecord(detail.role_config_snapshot || taskConfig.role_config_snapshot);
  const providerRuntimeSummary = asRecord(detail.provider_runtime_summary || taskConfig.provider_runtime_summary);
  const llmBindingSnapshot = asRecord(detail.llm_binding_snapshot || taskConfig.llm_binding_snapshot);
  const hasResolved = Object.keys(resolved).length > 0;
  const roleKeys = Array.from(
    new Set([
      ...Object.keys(roleConfigSnapshot),
      ...Object.keys(providerRuntimeSummary),
      ...Object.keys(asRecord(llmBindingSnapshot.roles)),
    ]),
  ).sort((left, right) => {
    const leftIndex = Object.keys(SYSTEM_ANALYSIS_ROLE_LABELS).indexOf(left);
    const rightIndex = Object.keys(SYSTEM_ANALYSIS_ROLE_LABELS).indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          { label: '任务目录', path: detail.task_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '工作目录', path: detail.workspace_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace` : null) },
          { label: '输出目录', path: detail.output_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/output` : null) },
          { label: '最终报告', path: detail.output_path ?`${detail.output_path}/${detail.task_id}/output/final_report.md` : null },
        ]}
      />

      <SectionCard title="任务级覆盖">
        {overrideKeys.length === 0 ? (
          <EmptyState text="当前任务没有显式任务级覆盖项，运行时使用项目默认配置。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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

      <SectionCard title="智能体认证">
        {Object.keys(agentAuthJson).length === 0 ? (
          <EmptyState text="当前任务没有冻结的智能体认证快照。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ConfigRow label="Task Key ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_id || '-')}</span></ConfigRow>
            <Divider />
            <ConfigRow label="名称">{String(agentAuthJson.agent_task_key_name || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="前缀">{String(agentAuthJson.agent_task_key_prefix || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="来源">{String(agentAuthJson.agent_task_key_source || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="Secret"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_secret || '-')}</span></ConfigRow>
          </div>
        )}
      </SectionCard>

      <SectionCard title="角色配置">
        {roleKeys.length === 0 ? (
          <EmptyState text="该任务未保存角色级运行快照，历史任务可继续参考下方实际运行快照与原始 JSON。" />
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {roleKeys.map((roleKey) => {
              const roleRuntime = asRecord(providerRuntimeSummary[roleKey]);
              const roleSnapshot = asRecord(roleConfigSnapshot[roleKey] || asRecord(llmBindingSnapshot.roles)[roleKey]);
              const agents = Array.isArray(roleRuntime.agents) ? roleRuntime.agents : (Array.isArray(roleSnapshot.agents) ? roleSnapshot.agents : []);
              const stageModels = asRecord(roleRuntime.stage_models || roleSnapshot.stage_models);
              return (
                <div key={roleKey} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{SYSTEM_ANALYSIS_ROLE_LABELS[roleKey] || roleKey}</div>
                    <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{roleKey}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column' }}>
                    <ConfigRow label="默认模型">{String(roleRuntime.default_model || roleRuntime.model || roleSnapshot.default_model || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="默认工具">
                      <JsonPreview value={roleRuntime.default_tools ?? roleSnapshot.default_tools ?? null} emptyText="当前角色没有默认工具配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="默认思考级别">{String(roleRuntime.default_thinking_level || roleSnapshot.default_thinking_level || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="Prompt 目录"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(roleRuntime.system_prompt_dir || roleSnapshot.system_prompt_dir || '-')}</span></ConfigRow>
                    <Divider />
                    <ConfigRow label="阶段模型覆盖">
                      <JsonPreview value={Object.keys(stageModels).length > 0 ? stageModels : null} emptyText="当前角色没有阶段模型覆盖。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 models.json">
                      <JsonPreview value={roleRuntime.models_json ?? null} emptyText="当前任务没有冻结 models.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 settings.json">
                      <JsonPreview value={roleRuntime.settings_json ?? null} emptyText="当前任务没有冻结 settings.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色实例">
                      <JsonPreview value={agents} emptyText="当前角色没有 agent 实例配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色原始 JSON">
                      <JsonPreview value={Object.keys(roleSnapshot).length > 0 ? roleSnapshot : roleRuntime} emptyText="当前角色没有原始配置快照。" />
                    </ConfigRow>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {hasResolved ? (
        <SectionCard title="实际运行快照">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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
  const resolvedConfig = asRecord(taskConfig.resolved_config_snapshot);
  const agentAuthJson = asRecord(detail.agent_auth_json || taskConfig.agent_auth_json);
  const roleConfigSnapshot = asRecord(detail.role_config_snapshot || taskConfig.role_config_snapshot);
  const providerRuntimeSummary = asRecord(detail.provider_runtime_summary || taskConfig.provider_runtime_summary);
  const llmBindingSnapshot = asRecord(detail.llm_binding_snapshot || taskConfig.llm_binding_snapshot);
  const outputSummary = asRecord(detail.output_summary);
  const inputSummary = asRecord(detail.input_summary);
  const inputContract = asBinarySecurityContract(taskConfig.input_contract);
  const contractModuleDir = entryContractModuleDir(inputContract);
  const contractDescriptorRoot = entryContractDescriptorRoot(inputContract);
  const contractSourceRoot = entryContractSourceRoot(inputContract);
  const filesListPath = entryContractFilesListPath(inputContract)
    || recordText(inputSummary, 'files_list_path')
    || null;
  const runtimeMode = String((detail as any).agent_runtime_mode || '').trim() || (Object.keys(agentAuthJson).length > 0 ? 'task_scoped' : 'global');
  const resumeTaskId = recordText(taskConfig, 'resume_task_id');
  const resumeStage = recordText(taskConfig, 'resume_stage');
  const resumeWorkspace = recordText(taskConfig, 'resume_workspace');
  const fastMode = taskConfig.fast_mode ?? resolvedConfig.fast_mode;
  const fastModeBatchSize = taskConfig.fast_mode_batch_size ?? resolvedConfig.fast_mode_batch_size;
  const superFastMode = taskConfig.super_fast_mode ?? resolvedConfig.super_fast_mode;
  const entryExecutionModeLabel = superFastMode
    ? '极速模式'
    : fastMode
      ? '快速模式'
      : '标准模式';
  const entryExecutionModeHint = superFastMode
    ? '关闭 Judge，跳过完整评审，优先追求极限速度。'
    : fastMode
      ? `启用批量快速预筛${typeof fastModeBatchSize === 'number' ? `，当前批大小 ${fastModeBatchSize}` : ''}。`
      : '使用完整标准流程。';
  const roleKeys = Array.from(
    new Set([
      ...Object.keys(roleConfigSnapshot),
      ...Object.keys(providerRuntimeSummary),
      ...Object.keys(asRecord(llmBindingSnapshot.roles)),
    ]),
  ).sort((left, right) => {
    const leftIndex = Object.keys(ENTRY_ANALYSIS_ROLE_LABELS).indexOf(left);
    const rightIndex = Object.keys(ENTRY_ANALYSIS_ROLE_LABELS).indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

      <SectionCard title="任务运行模式">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <ConfigRow label="当前模式">{entryExecutionModeLabel}</ConfigRow>
          <Divider />
          <ConfigRow label="模式说明">{entryExecutionModeHint}</ConfigRow>
          {fastMode ? (
            <>
              <Divider />
              <ConfigRow label="快速模式批大小">{typeof fastModeBatchSize === 'number' ? String(fastModeBatchSize) : '-'}</ConfigRow>
            </>
          ) : null}
        </div>
      </SectionCard>

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
          { label: '任务目录', path: detail.task_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '工作目录', path: detail.workspace_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace` : null) },
          { label: 'R1-functions', path: outputSummary.r1_functions_path || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace/r1-functions` : null) },
          { label: 'R3-entries', path: outputSummary.r3_entries_path || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace/r3-entries` : null) },
          { label: 'R4-module', path: outputSummary.r4_module_path || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace/r4-module` : null) },
          { label: '报告目录', path: outputSummary.report_path || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/workspace/report` : null) },
        ]}
      />

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {taskConfig.resume_task_id !== undefined ? (
              <>
                <ConfigRow label="断点续跑来源任务"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{resumeTaskId || '-'}</span></ConfigRow>
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

      <SectionCard title="智能体认证">
        <div style={{ marginBottom: '12px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px', fontSize: '12px', color: LK.body }}>
          {runtimeMode === 'task_scoped'
            ? '当前展示的是任务级运行时快照。'
            : Object.keys(agentAuthJson).length === 0 && roleKeys.length > 0
              ? '当前任务未配置任务级 key，以下展示的是当时全局运行时快照。'
              : '当前任务未生成任务级 runtime，以下展示的是当时全局运行时快照。'}
        </div>
        {Object.keys(agentAuthJson).length === 0 ? (
          <EmptyState text="当前任务没有冻结的智能体认证快照。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ConfigRow label="Task Key ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_id || '-')}</span></ConfigRow>
            <Divider />
            <ConfigRow label="名称">{String(agentAuthJson.agent_task_key_name || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="前缀">{String(agentAuthJson.agent_task_key_prefix || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="来源">{String(agentAuthJson.agent_task_key_source || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="Secret"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_secret || '-')}</span></ConfigRow>
          </div>
        )}
      </SectionCard>

      <SectionCard title="角色配置">
        {roleKeys.length === 0 ? (
          <EmptyState text="该任务未保存角色级运行快照，历史任务可继续参考下方原始 JSON。" />
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {roleKeys.map((roleKey) => {
              const roleRuntime = asRecord(providerRuntimeSummary[roleKey]);
              const roleSnapshot = asRecord(roleConfigSnapshot[roleKey] || asRecord(llmBindingSnapshot.roles)[roleKey]);
              const agents = Array.isArray(roleRuntime.agents) ? roleRuntime.agents : (Array.isArray(roleSnapshot.agents) ? roleSnapshot.agents : []);
              return (
                <div key={roleKey} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{ENTRY_ANALYSIS_ROLE_LABELS[roleKey] || roleKey}</div>
                    <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{roleKey}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column' }}>
                    <ConfigRow label="默认模型">{String(roleRuntime.default_model || roleSnapshot.default_model || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="默认工具">
                      <JsonPreview value={roleRuntime.default_tools ?? roleSnapshot.default_tools ?? null} emptyText="当前角色没有默认工具配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="默认思考级别">{String(roleRuntime.default_thinking_level || roleSnapshot.default_thinking_level || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="Prompt 目录"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(roleRuntime.system_prompt_dir || roleSnapshot.system_prompt_dir || '-')}</span></ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 models.json">
                      <JsonPreview value={roleRuntime.models_json ?? null} emptyText="当前任务没有冻结 models.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 settings.json">
                      <JsonPreview value={roleRuntime.settings_json ?? null} emptyText="当前任务没有冻结 settings.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色实例">
                      <JsonPreview value={agents} emptyText="当前角色没有 agent 实例配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色原始 JSON">
                      <JsonPreview value={Object.keys(roleSnapshot).length > 0 ? roleSnapshot : roleRuntime} emptyText="当前角色没有原始配置快照。" />
                    </ConfigRow>
                  </div>
                </div>
              );
            })}
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
  const agentAuthJson = asRecord((detail as any).agent_auth_json || taskConfig.agent_auth_json);
  const roleConfigSnapshot = asRecord((detail as any).role_config_snapshot || taskConfig.role_config_snapshot);
  const providerRuntimeSummary = asRecord((detail as any).provider_runtime_summary || taskConfig.provider_runtime_summary);
  const llmBindingSnapshot = asRecord((detail as any).llm_binding_snapshot || taskConfig.llm_binding_snapshot);
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
  const runtimeMode = String((detail as any).agent_runtime_mode || '').trim() || (Object.keys(agentAuthJson).length > 0 ? 'task_scoped' : 'global');
  const roleKeys = Array.from(
    new Set([
      ...Object.keys(roleConfigSnapshot),
      ...Object.keys(providerRuntimeSummary),
      ...Object.keys(asRecord(llmBindingSnapshot.roles)),
    ]),
  ).sort((left, right) => {
    const leftIndex = Object.keys(DATAFLOW_ROLE_LABELS).indexOf(left);
    const rightIndex = Object.keys(DATAFLOW_ROLE_LABELS).indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {inputContractRows.map((row, index) => (
              <React.Fragment key={`${row.label}-${index}`}>
                <ConfigRow label={row.label}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {row.semantic ? <div style={{ fontSize: '11px', fontWeight: 600, color: LK.muted }}>{row.semantic}</div> : null}
                    <span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px', color: LK.ink }}>{row.value}</span>
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {outputContractRows.map((row, index) => (
              <React.Fragment key={`${row.label}-${index}`}>
                <ConfigRow label={row.label}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {row.semantic ? <div style={{ fontSize: '11px', fontWeight: 600, color: LK.muted }}>{row.semantic}</div> : null}
                    <span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px', color: LK.ink }}>{row.value}</span>
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
          { label: '任务目录', path: detail.task_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}` : null) },
          { label: '运行目录', path: detail.run_root || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run` : null) },
          { label: '最新工作区', path: detail.workspace_root || recordText(outputSummary, 'latest_workspace_root') },
          { label: '结果文件', path: recordText(outputSummary, 'result_path') || (detail.output_path ?`${detail.output_path}/${detail.task_id}/run/result.json` : null) },
          { label: '数据流输出', path: recordText(outputSummary, 'dataflow_output_path') || (detail.output_path ?`${detail.output_path}/${detail.task_id}/output/dataflow` : null) },
        ]}
      />

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sourceFile ? (
              <>
                <ConfigRow label="源码文件"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{sourceFile || '-'}</span></ConfigRow>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {taintDetails.map((item: any, index: number) => {
                      const name = String(item.name || item.taint || item.param || '').trim() ||`污点${index + 1}`;
                      const description = String(item.description || item.summary || '').trim();
                      const sourceKind = String(item.source_kind || '').trim();
                      const source = String(item.description_source || '').trim();
                      return (
                        <div key={`${name}-${index}`} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                          <div style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, color: LK.ink }}>{name}</div>
                          {description ? <div style={{ marginTop: '4px', fontSize: '12px', color: LK.body }}>{description}</div> : null}
                          {(sourceKind || source) ? <div style={{ marginTop: '4px', fontSize: '10px', fontWeight: 600, color: LK.muted }}>{[sourceKind ?`source_kind=${sourceKind}` : '', source ?`source=${source}` : ''].filter(Boolean).join(' · ')}</div> : null}
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

      <SectionCard title="智能体认证">
        <div style={{ marginBottom: '12px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px', fontSize: '12px', color: LK.body }}>
          {runtimeMode === 'task_scoped'
            ? '当前展示的是任务级运行时快照。'
            : Object.keys(agentAuthJson).length === 0 && roleKeys.length > 0
              ? '当前任务未配置任务级 key，以下展示的是当时全局运行时快照。'
              : '当前任务未生成任务级 runtime，以下展示的是当时全局运行时快照。'}
        </div>
        {Object.keys(agentAuthJson).length === 0 ? (
          <EmptyState text="当前任务没有冻结的智能体认证快照。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ConfigRow label="Task Key ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_id || '-')}</span></ConfigRow>
            <Divider />
            <ConfigRow label="名称">{String(agentAuthJson.agent_task_key_name || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="前缀">{String(agentAuthJson.agent_task_key_prefix || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="来源">{String(agentAuthJson.agent_task_key_source || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="Secret"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(agentAuthJson.agent_task_key_secret || '-')}</span></ConfigRow>
          </div>
        )}
      </SectionCard>

      <SectionCard title="角色配置">
        {roleKeys.length === 0 ? (
          <EmptyState text="该任务未保存角色级运行快照，历史任务可继续参考下方原始 JSON。" />
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {roleKeys.map((roleKey) => {
              const roleRuntime = asRecord(providerRuntimeSummary[roleKey]);
              const roleSnapshot = asRecord(roleConfigSnapshot[roleKey] || asRecord(llmBindingSnapshot.roles)[roleKey]);
              const agents = Array.isArray(roleRuntime.agents) ? roleRuntime.agents : (Array.isArray(roleSnapshot.agents) ? roleSnapshot.agents : []);
              const stageModels = asRecord(roleRuntime.stage_models || roleSnapshot.stage_models);
              return (
                <div key={roleKey} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{DATAFLOW_ROLE_LABELS[roleKey] || roleKey}</div>
                    <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{roleKey}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column' }}>
                    <ConfigRow label="默认模型">{String(roleRuntime.default_model || roleSnapshot.default_model || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="默认工具">
                      <JsonPreview value={roleRuntime.default_tools ?? roleSnapshot.default_tools ?? null} emptyText="当前角色没有默认工具配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="默认思考级别">{String(roleRuntime.default_thinking_level || roleSnapshot.default_thinking_level || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="Prompt 目录"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(roleRuntime.system_prompt_dir || roleSnapshot.system_prompt_dir || '-')}</span></ConfigRow>
                    <Divider />
                    <ConfigRow label="阶段模型覆盖">
                      <JsonPreview value={Object.keys(stageModels).length > 0 ? stageModels : null} emptyText="当前角色没有阶段模型覆盖。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 models.json">
                      <JsonPreview value={roleRuntime.models_json ?? null} emptyText="当前任务没有冻结 models.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="运行时 settings.json">
                      <JsonPreview value={roleRuntime.settings_json ?? null} emptyText="当前任务没有冻结 settings.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色实例">
                      <JsonPreview value={agents} emptyText="当前角色没有 agent 实例配置。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色原始 JSON">
                      <JsonPreview value={Object.keys(roleSnapshot).length > 0 ? roleSnapshot : roleRuntime} emptyText="当前角色没有原始配置快照。" />
                    </ConfigRow>
                  </div>
                </div>
              );
            })}
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
  const providerRuntimeSummary = asRecord(taskConfigSnapshot?.provider_runtime_summary);
  const llmBindingSnapshot = asRecord(taskConfigSnapshot?.llm_binding_snapshot);
  const roleSnapshots = asRecord(llmBindingSnapshot.roles);
  const roleKeys = Array.from(
    new Set([
      ...Object.keys(providerRuntimeSummary),
      ...Object.keys(roleSnapshots),
    ]),
  ).sort((left, right) => {
    const leftIndex = Object.keys(FIRMWARE_ROLE_LABELS).indexOf(left);
    const rightIndex = Object.keys(FIRMWARE_ROLE_LABELS).indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

      <SectionCard title="智能体认证">
        {taskConfigLoading ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>加载中...</div>
        ) : taskConfigError ? (
          <div style={{ fontSize: '14px', color: LK.error }}>{taskConfigError}</div>
        ) : !taskConfigSnapshot || taskConfigSnapshot.available === false ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>{taskConfigSnapshot?.message || '当前任务没有可展示的智能体认证快照。'}</div>
        ) : !taskConfigSnapshot.agent_auth_json ? (
          <EmptyState text="当前任务没有冻结的智能体认证信息。" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ConfigRow label="Task Key ID"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(taskConfigSnapshot.agent_auth_json.agent_task_key_id || '-')}</span></ConfigRow>
            <Divider />
            <ConfigRow label="名称">{String(taskConfigSnapshot.agent_auth_json.agent_task_key_name || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="前缀">{String(taskConfigSnapshot.agent_auth_json.agent_task_key_prefix || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="来源">{String(taskConfigSnapshot.agent_auth_json.agent_task_key_source || '-')}</ConfigRow>
            <Divider />
            <ConfigRow label="Secret"><span style={{ wordBreak: 'break-all', fontFamily: MONO, fontSize: '12px' }}>{String(taskConfigSnapshot.agent_auth_json.agent_task_key_secret || '-')}</span></ConfigRow>
          </div>
        )}
      </SectionCard>

      <SectionCard title="角色配置">
        {taskConfigLoading ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>加载中...</div>
        ) : taskConfigError ? (
          <div style={{ fontSize: '14px', color: LK.error }}>{taskConfigError}</div>
        ) : !taskConfigSnapshot || taskConfigSnapshot.available === false ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>{taskConfigSnapshot?.message || '当前任务没有可展示的角色配置快照。'}</div>
        ) : roleKeys.length === 0 ? (
          <EmptyState text="当前任务没有冻结的角色级配置。" />
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {roleKeys.map((roleKey) => {
              const runtimeSummary = asRecord(providerRuntimeSummary[roleKey]);
              const roleSnapshot = asRecord(roleSnapshots[roleKey]);
              return (
                <div key={roleKey} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{FIRMWARE_ROLE_LABELS[roleKey] || roleKey}</div>
                      <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '11px', color: LK.body }}>{roleKey}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column' }}>
                    <ConfigRow label="配置文件 Key">{String(runtimeSummary.config_file_key || roleSnapshot.config_file_key || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="Provider Key">{String(runtimeSummary.provider_key || roleSnapshot.provider_key || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="模型">{String(runtimeSummary.model || roleSnapshot.model || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="模型选择器">{String(runtimeSummary.model_selector || roleSnapshot.model_selector || '-')}</ConfigRow>
                    <Divider />
                    <ConfigRow label="models.json">
                      <JsonPreview value={runtimeSummary.models_json ?? roleSnapshot.models_json ?? null} emptyText="当前角色没有 models.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="settings.json">
                      <JsonPreview value={runtimeSummary.settings_json ?? roleSnapshot.settings_json ?? null} emptyText="当前角色没有 settings.json 快照。" />
                    </ConfigRow>
                    <Divider />
                    <ConfigRow label="角色原始 JSON">
                      <JsonPreview value={Object.keys(roleSnapshot).length > 0 ? roleSnapshot : runtimeSummary} emptyText="当前角色没有原始配置快照。" />
                    </ConfigRow>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="智能体任务配置 JSON">
        {taskConfigLoading ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>加载中...</div>
        ) : taskConfigError ? (
          <div style={{ fontSize: '14px', color: LK.error }}>{taskConfigError}</div>
        ) : !taskConfigSnapshot ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>当前任务没有可展示的智能体配置快照。</div>
        ) : taskConfigSnapshot.available === false ? (
          <div style={{ fontSize: '14px', color: LK.muted }}>{taskConfigSnapshot.message || '当前任务没有可展示的智能体配置快照。'}</div>
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
