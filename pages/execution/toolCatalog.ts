import { type LucideIcon, Boxes, FileCode2, Shield } from 'lucide-react';
import type { ViewType } from '../../types/types';

export interface ToolUsageSection {
  title: string;
  description: string;
}

export interface ToolDescriptor {
  id: string;
  name: string;
  summary: string;
  thumbnailDescription: string;
  inputDescription: string;
  resultDescription: string;
  tags: string[];
  viewId: ViewType;
  icon: LucideIcon;
  usageSections: ToolUsageSection[];
}

export const toolCatalog: ToolDescriptor[] = [
  {
    id: 'binary-security',
    name: '盖亚-二进制固件',
    summary: '面向整包固件执行端到端编排，从解包、系统分析到漏洞挖掘统一串联。',
    thumbnailDescription: '适合对固件包做全流程自动化安全扫描与结果收敛。',
    inputDescription: '输入固件镜像、项目上下文、扫描策略、执行参数与可选编排配置。',
    resultDescription: '输出父任务状态、各阶段子任务结果、漏洞结论、运行时间线与编排观测信息。',
    tags: ['固件全流程', '任务编排', '多阶段联动'],
    viewId: 'binary-security',
    icon: Shield,
    usageSections: [
      {
        title: '适用场景',
        description: '用于对单个固件包发起完整的端到端安全扫描，适合需要统一查看各阶段收敛结果、漏洞产出和编排状态的场景。',
      },
      {
        title: '输入重点',
        description: '重点关注固件路径、任务名称、扫描优先级、阶段配置以及是否启用下游自动编排。输入决定后续会创建哪些子任务与阶段项。',
      },
      {
        title: '结果重点',
        description: '重点查看父任务终态、各 stage/item 状态、下游同步结果、漏洞产出和异常阻塞原因，便于快速判断是编排卡住还是下游任务失败。',
      },
    ],
  },
  {
    id: 'source-security',
    name: '盖亚-源码',
    summary: '针对源码工程执行端到端安全扫描，聚焦源码输入下的分析、漏洞发现和结果归并。',
    thumbnailDescription: '适合对源码目录做一体化安全分析和漏洞结果汇总。',
    inputDescription: '输入源码目录、项目上下文、扫描策略、阶段参数以及源码侧分析配置。',
    resultDescription: '输出源码任务状态、下游阶段结果、漏洞结论、问题明细与整体编排视图。',
    tags: ['源码扫描', '结果汇总', '阶段编排'],
    viewId: 'source-security',
    icon: FileCode2,
    usageSections: [
      {
        title: '适用场景',
        description: '用于对源码工程进行端到端安全扫描，适合需要从源码输入直接串联入口分析、漏洞挖掘和汇总判断的场景。',
      },
      {
        title: '输入重点',
        description: '重点关注源码路径、扫描范围、项目关联信息和阶段开关。输入范围越清晰，后续子任务分配与结果聚合越稳定。',
      },
      {
        title: '结果重点',
        description: '重点查看源码任务的总体状态、各子任务终态、发现的问题类型和最终漏洞收敛结果，判断是否需要补跑或人工复核。',
      },
    ],
  },
  {
    id: 'binary-module-security',
    name: '盖亚-二进制模块',
    summary: '面向单个二进制模块执行端到端扫描，更适合对指定模块进行聚焦式编排和结果分析。',
    thumbnailDescription: '适合对某个二进制模块做精细化安全扫描与结果核查。',
    inputDescription: '输入模块文件、模块上下文、项目信息、任务配置和模块级执行参数。',
    resultDescription: '输出模块任务状态、模块级子任务结果、漏洞产出、收敛阻塞原因和运行日志。',
    tags: ['模块级扫描', '聚焦分析', '端到端编排'],
    viewId: 'binary-module-security',
    icon: Boxes,
    usageSections: [
      {
        title: '适用场景',
        description: '用于针对单个二进制模块开展更聚焦的端到端扫描，适合验证高风险模块、复现特定问题或做小范围精细扫描。',
      },
      {
        title: '输入重点',
        description: '重点关注模块路径、模块所属父任务上下文、优先级与执行策略。输入需要准确绑定到目标模块，避免结果混入其他模块数据。',
      },
      {
        title: '结果重点',
        description: '重点查看模块级父任务状态、阶段子项是否全部收敛、漏洞产出是否完成映射，以及是否存在下游状态正常但父项未收敛的异常。',
      },
    ],
  },
];
