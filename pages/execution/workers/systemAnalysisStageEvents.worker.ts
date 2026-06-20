import type { AppSaStageEvent } from '../../../types/types';

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

const STAGE_STEPS = [
  { key: 'preprocess', triggers: ['filter', 'explore', 'prescan'] },
  { key: 'classify', triggers: ['classify', 1, '1'] },
  { key: 'refine', triggers: [2, '2', '2-reclassify', '2-redo', '2-sub'] },
  { key: 'analyse', triggers: [3, '3', '3-redo'] },
  { key: 'report', triggers: [4, '4', '4a', '4b', '4b-check'] },
] as const;

function computeStageTimes(events: AppSaStageEvent[]): Array<{ startTs: number | null; endTs: number | null }> {
  const result = STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  let taskEndTs: number | null = null;
  for (const evt of events) {
    if (evt.type === 'task_end') taskEndTs = evt.ts;
  }
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i += 1) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (result[i].startTs === null) result[i].startTs = evt.ts;
        break;
      }
    }
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (result[i].startTs === null) continue;
    let endTs = taskEndTs;
    for (let j = i + 1; j < STAGE_STEPS.length; j += 1) {
      if (result[j].startTs !== null) {
        endTs = result[j].startTs;
        break;
      }
    }
    result[i].endTs = endTs;
  }
  return result;
}

function deriveStepStatuses(taskStatus: string, events: AppSaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');
  let lastSeenStep = -1;
  for (const evt of events) {
    if (evt.type !== 'stage') continue;
    const s = evt.data?.stage;
    for (let i = 0; i < STAGE_STEPS.length; i += 1) {
      if (STAGE_STEPS[i].triggers.some((t) => t === s || String(t) === String(s))) {
        if (i > lastSeenStep) lastSeenStep = i;
      }
    }
  }
  if (lastSeenStep === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled') statuses[0] = 'failed';
    return statuses;
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (i < lastSeenStep) statuses[i] = 'completed';
    else if (i === lastSeenStep) {
      statuses[i] = taskStatus === 'error' || taskStatus === 'failed' || taskStatus === 'cancelled' ? 'failed' : 'running';
    }
  }
  if ((taskStatus === 'error' || taskStatus === 'failed') && lastSeenStep >= 0) statuses[lastSeenStep] = 'failed';
  return statuses;
}

function formatEventLog(evt: AppSaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start': return `[${ts}] 任务开始`;
    case 'stage': {
      if (d.heartbeat) return '';
      const s = d.stage;
      const mod = d.module ? ` · ${d.module}` : (d.modules?.length ? ` · [${(d.modules as string[]).join(', ')}]` : '');
      const att = d.attempt ? ` 第 ${d.attempt} 轮` : '';
      if (s === 'filter') return `[${ts}] ▶ S0 文件类型过滤  types=${d.types ?? ''} arch=${d.arch ?? ''}`;
      if (s === 'type_classify') return `[${ts}] ▶ S0 ELF/文本分类`;
      if (s === 'sub_reader') return `[${ts}] ▶ S0 子文件读取`;
      if (s === 'unknown_checker') return `[${ts}] ▶ S0 未知文件检查`;
      if (s === 'validate_details') return `[${ts}] ▶ S0 details 校验`;
      if (s === 'path_group') return `[${ts}] ▶ S0 路径分组`;
      if (s === 'explore') return `[${ts}] ▶ S0 目录探索`;
      if (s === 'prescan') return `[${ts}] ▶ S0 关键词预扫描`;
      if (s === 'classify' || String(s) === '1') return `[${ts}] ▶ S1 全局分类${att}`;
      if (s === '1.5-security-filter') return `[${ts}] ▶ S1.5 安全过滤`;
      if (String(s) === '2') return `[${ts}] ▶ S2 模块细分${mod}`;
      if (s === '2-reclassify') return `[${ts}] ▶ S2 补分类`;
      if (s === '2-redo') return `[${ts}] ▶ S2-redo 重新细分${mod}${att}`;
      if (s === '2-sub') return `[${ts}] ▶ S2 子文件读取${mod}`;
      if (String(s) === '3') return `[${ts}] ▶ S3 安全分析${mod}`;
      if (s === '3-redo') return `[${ts}] ▶ S3-redo 重新分析${mod}`;
      if (String(s) === '4') return `[${ts}] ▶ S4 报告生成`;
      if (s === '4a') return `[${ts}] ▶ S4a 最终报告生成`;
      if (s === '4b') return `[${ts}] ▶ S4b 报告完整性检查${att}`;
      if (s === '4b-check') return `[${ts}] ▶ S4b 模块完整性验收`;
      return `[${ts}] ▶ 阶段 ${s}${mod}${att}`;
    }
    case 'stage_result': {
      const s = d.stage;
      if (s === 'filter') return `[${ts}] ✓ S0 过滤完成，发现 ${d.file_count ?? 0} 个文件`;
      if (s === 'prescan') return `[${ts}] ✓ S0 预扫描完成，${d.summary_lines ?? 0} 行摘要`;
      return `[${ts}] ✓ ${s} 阶段完成`;
    }
    case 'judge_eval': {
      const passed = d.passed;
      const icon = passed ? '✓' : '✗';
      const mod = d.module ? ` [${d.module}]` : '';
      const stage = d.stage ? ` S${d.stage}` : '';
      return `[${ts}] ${icon} Judge${stage}${mod}  分=${d.score ?? '-'}  ${passed ? '通过' : '不通过'}`;
    }
    case 'log': {
      const lvl = d.level ?? 'info';
      const msg = (d.msg ?? '').slice(0, 200);
      if (lvl === 'warn') return `[${ts}] ⚠ ${msg}`;
      if (lvl === 'error') return `[${ts}] ✗ ${msg}`;
      return `[${ts}]   ${msg}`;
    }
    case 'model':
      return '';
    case 'cli_output': {
      const text = (d.text ?? '').trim();
      const lines = text.split('\n');
      const preview = lines[0].slice(0, 120);
      const extra = lines.length > 1 ? ` (+${lines.length - 1} 行)` : '';
      return `[${ts}] │ ${d.stage ?? ''} 脚本: ${preview}${extra}`;
    }
    case 'agent_stream': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return '';
      return `[${ts}] │ ${d.stage ?? ''}: ${text}`;
    }
    case 'agent_output': {
      const text = (d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
      if (!text) return `[${ts}] ✓ ${d.stage ?? ''} Agent 完成`;
      return `[${ts}] ✓ ${d.stage ?? ''} Agent: ${text}`;
    }
    case 'error': return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end': return `[${ts}] 任务结束  status=${d.status ?? ''}`;
    default: return '';
  }
}

self.onmessage = (event: MessageEvent<{ taskStatus: string; events: AppSaStageEvent[] }>) => {
  const { taskStatus, events } = event.data;
  const logLines = events.map(formatEventLog).filter((line) => line.length > 0);
  const stageStatuses = deriveStepStatuses(taskStatus, events);
  const stageTimes = computeStageTimes(events);
  self.postMessage({ logLines, stageStatuses, stageTimes });
};
