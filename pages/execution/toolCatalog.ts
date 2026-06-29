import { type LucideIcon, Boxes, FileCode2, GitBranch, Network, Shield, ShieldCheck, Smartphone } from 'lucide-react';
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
  /**
   * iframe 嵌入地址。不提供时按 SPA 路由动态拼装 `?tool_embed=1#/{viewId}`，
   * 使工具总览页的 iframe 以无外壳模式加载同站 SPA 页面。
   * 外部微服务（如黑板）直接写死绝对/相对路径。
   */
  embedUrl?: string;
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
  {
    id: 'app-security-scan',
    name: 'turing 扫描工具',
    summary: '针对 APK/HAP 应用包或源码压缩包执行 AI 驱动的端到端安全扫描，覆盖检测、挖掘、验证三阶段。',
    thumbnailDescription: '适合对 Android/HarmonyOS 应用包与源码工程做全流程自动化安全审计与漏洞收敛。',
    inputDescription: '上传 APK/HAP 应用包或源码压缩包，选择平台线别（APP/WEB）与扫描模式（fast/deep）后启动三阶段扫描流水线。',
    resultDescription: '输出检测、挖掘、验证三阶段进度、Token 用量统计、漏洞结论与任务生命周期管理。',
    tags: ['turing 扫描', 'APK', 'HAP', '源码', '三阶段检测'],
    viewId: 'app-security-scan',
    icon: Smartphone,
    usageSections: [
      {
        title: '适用场景',
        description: '用于对 Android APK / HarmonyOS HAP 应用包或源码压缩包发起 AI 驱动的端到端安全扫描。APP 线直接反编译，WEB 线先经预处理 Agent 拆分服务，适合需要自动化攻击面检测、漏洞挖掘和验证的完整审计场景。',
      },
      {
        title: '输入重点',
        description: '上传应用包或源码压缩包，并选择平台线别（APP/WEB）与扫描模式（fast 仅 sink / deep 跑 source 并深挖）。系统自动推断文件类型并进入检测→挖掘→验证三阶段扫描流水线。',
      },
      {
        title: '结果重点',
        description: '重点查看三阶段（检测、挖掘、验证）各阶段的任务进度与状态、Token 消耗统计、最终漏洞产出，以及任务运行时间线和异常信息。',
      },
    ],
  },
  {
    id: 'kg-source-security',
    name: '知识图谱-源码漏洞挖掘',
    summary: '基于知识图谱的源码漏洞挖掘，结合代码语义与调用关系图发现深层漏洞链路。',
    thumbnailDescription: '适合对源码工程做知识图谱驱动的深度漏洞挖掘与路径分析。',
    inputDescription: '输入源码目录、项目上下文、图谱构建参数与漏洞挖掘策略。',
    resultDescription: '输出图谱节点/边、漏洞路径、可疑 sink/source 链路与挖掘结论。',
    tags: ['知识图谱', '源码漏洞挖掘', '语义分析'],
    viewId: 'kg-source-security',
    icon: Network,
    usageSections: [
      {
        title: '适用场景',
        description: '用于基于知识图谱对源码工程进行深度漏洞挖掘，适合需要结合代码语义和调用关系图发现深层漏洞链路的场景。',
      },
      {
        title: '输入重点',
        description: '重点关注源码路径、图谱构建范围、漏洞挖掘策略以及 sink/source 配置。图谱覆盖范围越完整，漏洞链路发现越准确。',
      },
      {
        title: '结果重点',
        description: '重点查看图谱节点与边、漏洞路径、可疑调用链路和最终挖掘结论，判断是否需要扩大图谱范围或调整挖掘策略。',
      },
    ],
  },
  {
    id: 'cfg-db-vuln-tool',
    name: '知识图谱-源码（CFG+DFG）',
    summary: '结合控制流图（CFG）与数据流图（DFG）的源码漏洞分析工具，覆盖跨过程数据流追踪。',
    thumbnailDescription: '适合对源码做 CFG+DFG 双图驱动的漏洞发现与数据流追踪。',
    inputDescription: '输入源码目录、项目上下文、CFG/DFG 构建参数与漏洞分析配置。',
    resultDescription: '输出 CFG/DFG 图、数据流追踪结果、漏洞结论与跨过程调用链。',
    tags: ['CFG', 'DFG', '数据流追踪', '跨过程分析'],
    viewId: 'cfg-db-vuln-tool',
    icon: GitBranch,
    usageSections: [
      {
        title: '适用场景',
        description: '用于结合控制流图与数据流图对源码进行漏洞分析，适合需要跨过程数据流追踪和深层污点传播分析的场景。',
      },
      {
        title: '输入重点',
        description: '重点关注源码路径、CFG/DFG 构建范围、污点 source/sink 配置以及分析深度参数。双图构建范围直接决定追踪覆盖度。',
      },
      {
        title: '结果重点',
        description: '重点查看 CFG/DFG 图结构、数据流追踪路径、跨过程调用链和最终漏洞结论，判断是否需要补充 source/sink 或调整分析深度。',
      },
    ],
  },
  {
    id: 'redline-verification',
    name: '红线验证',
    summary: '针对安全红线规则做自动化验证，确认目标是否满足红线合规要求。',
    thumbnailDescription: '适合对安全红线规则做批量验证与合规核查。',
    inputDescription: '输入目标信息、红线规则集、验证参数与项目上下文。',
    resultDescription: '输出红线规则验证结果、合规状态、不合规项明细与修复建议。',
    tags: ['红线验证', '合规核查', '自动化验证'],
    viewId: 'redline-verification',
    icon: ShieldCheck,
    usageSections: [
      {
        title: '适用场景',
        description: '用于对安全红线规则做自动化验证，适合需要批量确认目标是否满足红线合规要求的场景。',
      },
      {
        title: '输入重点',
        description: '重点关注目标信息、红线规则集选择、验证参数与项目关联。规则集选择直接决定验证覆盖范围。',
      },
      {
        title: '结果重点',
        description: '重点查看红线规则验证结果、合规状态、不合规项明细和修复建议，判断是否需要补跑或人工复核。',
      },
    ],
  },
  {
    id: 'cairn-blackboard',
    name: '黑板',
    summary: 'Cairn 黑板协作工具，提供可视化画布与团队协同标注能力。',
    thumbnailDescription: '适合团队在可视化画布上做协同标注与信息整理。',
    inputDescription: '直接打开黑板服务，无需额外输入。',
    resultDescription: '提供可视化画布、协同标注、信息整理与团队协作能力。',
    tags: ['黑板', '协同标注', '可视化画布'],
    viewId: 'cairn-blackboard',
    icon: Network,
    embedUrl: '/nazhua/',
    usageSections: [
      {
        title: '适用场景',
        description: '用于团队在可视化画布上做协同标注与信息整理，适合需要实时协作和信息可视化的场景。',
      },
      {
        title: '输入重点',
        description: '直接打开黑板服务即可使用，无需额外输入参数。',
      },
      {
        title: '结果重点',
        description: '重点使用画布的协同标注、信息整理和团队协作能力。',
      },
    ],
  },
];
