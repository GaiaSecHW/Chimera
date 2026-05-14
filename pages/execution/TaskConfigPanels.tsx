import React from 'react';

import {
  AppDfaTaskDetail,
  AppEaTaskDetail,
  AppSaTaskDetail,
} from '../../types/types';

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

function formatBool(value: unknown, trueLabel = '开启', falseLabel = '关闭'): string {
  return value ? trueLabel : falseLabel;
}

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

export const SystemAnalysisTaskConfigPanel: React.FC<{ detail: AppSaTaskDetail }> = ({ detail }) => {
  const taskConfig = asRecord(detail.task_config_json);
  const resolved = asRecord(taskConfig.resolved_config_snapshot);
  const hasResolved = Object.keys(resolved).length > 0;
  const overrideKeys = ['analyse_targets', 'binary_arch', 'security_focus_categories', 'module_granularity', 'filter_engine', 'enable_final_check']
    .filter((key) => taskConfig[key] !== undefined);

  return (
    <div className="space-y-4">
      <SectionCard title="任务输入">
        <div className="divide-y divide-slate-100">
          <ConfigRow label="任务 ID"><span className="break-all font-mono text-xs">{detail.task_id}</span></ConfigRow>
          <Divider />
          <ConfigRow label="分析模式">{detail.analysis_mode_label || detail.analysis_mode || '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="输入路径"><span className="break-all font-mono text-xs">{detail.input_path}</span></ConfigRow>
          <Divider />
          <ConfigRow label="输出路径">{detail.output_path ? <span className="break-all font-mono text-xs">{detail.output_path}</span> : '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="Prompt 模板">{detail.prompt_template_id || '-'}</ConfigRow>
        </div>
      </SectionCard>

      <SectionCard title="任务级覆盖">
        {overrideKeys.length === 0 ? (
          <EmptyState text="当前任务没有显式任务级覆盖项，运行时使用项目默认配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {taskConfig.analyse_targets !== undefined ? (
              <>
                <ConfigRow label="文件类型过滤"><TagList items={taskConfig.analyse_targets || []} labelMap={ANALYSE_TARGET_LABELS} /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.binary_arch !== undefined ? (
              <>
                <ConfigRow label="ELF 架构过滤"><TagList items={taskConfig.binary_arch || []} labelMap={BINARY_ARCH_LABELS} /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.security_focus_categories !== undefined ? (
              <>
                <ConfigRow label="安全分析维度">
                  {Array.isArray(taskConfig.security_focus_categories) && taskConfig.security_focus_categories.includes('all')
                    ? '全部维度'
                    : <TagList items={taskConfig.security_focus_categories || []} labelMap={Object.fromEntries(Object.entries(SECURITY_CATEGORY_LABELS).map(([key, value]) => [key, value.name]))} />}
                </ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.module_granularity !== undefined ? (
              <>
                <ConfigRow label="模块划分粒度">{taskConfig.module_granularity === 'coarse' ? '粗粒度（协议/服务/功能级）' : '细粒度（子组件级）'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.filter_engine !== undefined ? (
              <>
                <ConfigRow label="过滤引擎">{FILTER_ENGINE_LABELS[String(taskConfig.filter_engine)] || String(taskConfig.filter_engine)}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.enable_final_check !== undefined ? (
              <ConfigRow label="完整性检查">{formatBool(taskConfig.enable_final_check, '开启 Stage 4a', '关闭 Stage 4a')}</ConfigRow>
            ) : null}
          </div>
        )}
      </SectionCard>

      {(taskConfig.start_stage || taskConfig.resume_workspace) ? (
        <SectionCard title="续跑配置">
          <div className="divide-y divide-slate-100">
            {taskConfig.start_stage ? (
              <>
                <ConfigRow label="起始阶段">{`Stage ${taskConfig.start_stage}`}</ConfigRow>
                {taskConfig.resume_workspace ? <Divider /> : null}
              </>
            ) : null}
            {taskConfig.resume_workspace ? (
              <ConfigRow label="复用工作区"><span className="break-all font-mono text-xs">{taskConfig.resume_workspace}</span></ConfigRow>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasResolved ? (
        <SectionCard title="实际运行快照">
          <div className="divide-y divide-slate-100">
            <ConfigRow label="文件类型过滤"><TagList items={resolved.analyse_targets || []} labelMap={ANALYSE_TARGET_LABELS} emptyText="-" /></ConfigRow>
            <Divider />
            <ConfigRow label="ELF 架构过滤"><TagList items={resolved.binary_arch || []} labelMap={BINARY_ARCH_LABELS} emptyText="-" /></ConfigRow>
            <Divider />
            <ConfigRow label="安全分析维度">
              {Array.isArray(resolved.security_focus_categories) && resolved.security_focus_categories.includes('all')
                ? '全部维度'
                : <TagList items={resolved.security_focus_categories || []} labelMap={Object.fromEntries(Object.entries(SECURITY_CATEGORY_LABELS).map(([key, value]) => [key, value.name]))} emptyText="-" />}
            </ConfigRow>
            <Divider />
            <ConfigRow label="模块划分粒度">{resolved.module_granularity === 'coarse' ? '粗粒度（协议/服务/功能级）' : '细粒度（子组件级）'}</ConfigRow>
            <Divider />
            <ConfigRow label="过滤引擎">{FILTER_ENGINE_LABELS[String(resolved.filter_engine || 'script')] || String(resolved.filter_engine || 'script')}</ConfigRow>
            <Divider />
            <ConfigRow label="完整性检查">{formatBool(resolved.enable_final_check, '开启 Stage 4a', '关闭 Stage 4a')}</ConfigRow>
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
  return (
    <div className="space-y-4">
      <SectionCard title="任务输入">
        <div className="divide-y divide-slate-100">
          <ConfigRow label="任务 ID"><span className="break-all font-mono text-xs">{detail.task_id}</span></ConfigRow>
          <Divider />
          <ConfigRow label="模块目录"><span className="break-all font-mono text-xs">{detail.input_path}</span></ConfigRow>
          <Divider />
          <ConfigRow label="分析模块">{detail.module_name || '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="源码目录">{detail.source_path ? <span className="break-all font-mono text-xs">{detail.source_path}</span> : '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="输出路径">{detail.output_path ? <span className="break-all font-mono text-xs">{detail.output_path}</span> : '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="Prompt 模板">{detail.prompt_template_id || '-'}</ConfigRow>
        </div>
      </SectionCard>

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {taskConfig.resume_task_id !== undefined ? (
              <ConfigRow label="断点续跑来源任务"><span className="break-all font-mono text-xs">{taskConfig.resume_task_id || '-'}</span></ConfigRow>
            ) : (
              <EmptyState text="当前任务的 task_config_json 中没有可识别的显式字段。" />
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
  return (
    <div className="space-y-4">
      <SectionCard title="任务输入">
        <div className="divide-y divide-slate-100">
          <ConfigRow label="任务 ID"><span className="break-all font-mono text-xs">{detail.task_id}</span></ConfigRow>
          <Divider />
          <ConfigRow label="输入路径"><span className="break-all font-mono text-xs">{detail.input_path}</span></ConfigRow>
          <Divider />
          <ConfigRow label="输出路径">{detail.output_path ? <span className="break-all font-mono text-xs">{detail.output_path}</span> : '-'}</ConfigRow>
          <Divider />
          <ConfigRow label="Prompt 模板">{detail.prompt_template_id || '-'}</ConfigRow>
        </div>
      </SectionCard>

      <SectionCard title="任务级配置">
        {Object.keys(taskConfig).length === 0 ? (
          <EmptyState text="当前任务没有额外 task_config_json 配置。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {taskConfig.source_file !== undefined ? (
              <>
                <ConfigRow label="源码文件"><span className="break-all font-mono text-xs">{taskConfig.source_file || '-'}</span></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.function_name !== undefined ? (
              <>
                <ConfigRow label="函数名">{taskConfig.function_name || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.line_hint !== undefined ? (
              <>
                <ConfigRow label="行号提示">{taskConfig.line_hint || '-'}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.taint_params !== undefined ? (
              <>
                <ConfigRow label="污点参数"><TagList items={Array.isArray(taskConfig.taint_params) ? taskConfig.taint_params : []} emptyText="未指定" /></ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.start_stage !== undefined ? (
              <>
                <ConfigRow label="起始阶段">{`Stage ${taskConfig.start_stage}`}</ConfigRow>
                <Divider />
              </>
            ) : null}
            {taskConfig.resume_workspace !== undefined ? (
              <>
                <ConfigRow label="复用工作区"><span className="break-all font-mono text-xs">{taskConfig.resume_workspace || '-'}</span></ConfigRow>
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
    </div>
  );
};
