import { type LucideIcon, Boxes, Bug, Cpu, FileArchive, GitBranchPlus, Radar, ShieldCheck } from 'lucide-react';
import type { ViewType } from '../../types/types';

export interface AtomicCapabilityEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  purpose: string;
  requestSummary: string;
  responseSummary: string;
  notes?: string;
}

export interface AtomicCapabilityApiGroup {
  groupName: string;
  description: string;
  endpoints: AtomicCapabilityEndpoint[];
}

export interface AtomicCapabilityDescriptor {
  id: string;
  name: string;
  summary: string;
  inputDescription: string;
  outputDescription: string;
  tags: string[];
  viewId: ViewType;
  icon: LucideIcon;
  serviceName: string;
  k8sServiceHost: string;
  port: number;
  apiPrefix: string;
  docsPath: string;
  openapiPath: string;
  redocPath?: string;
  platformDocsCandidates: string[];
  platformOpenapiCandidates: string[];
  platformRedocCandidates: string[];
  apiGroups: AtomicCapabilityApiGroup[];
}

export const atomicCapabilityCatalog: AtomicCapabilityDescriptor[] = [
  {
    id: 'firmware-unpacker',
    name: '固件解包',
    summary: '接收固件镜像并完成解包、结果归档、事件追踪与 Worker/Cleanup 观测。',
    inputDescription: '固件镜像路径、项目上下文、解包任务参数。',
    outputDescription: '解包目录、结果摘要、运行日志、cleanup 扫描记录。',
    tags: ['任务编排', '固件资产', 'Cleanup', 'Worker 集群'],
    viewId: 'pentest-exec-firmware-unpacker',
    icon: FileArchive,
    serviceName: 'secflow-app-firmware-unpacker',
    k8sServiceHost: 'secflow-app-firmware-unpacker',
    port: 80,
    apiPrefix: '/api/app/firmware-unpacker',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/firmware-unpacker/docs'],
    platformOpenapiCandidates: ['/api/app/firmware-unpacker/openapi.json'],
    platformRedocCandidates: ['/api/app/firmware-unpacker/redoc'],
    apiGroups: [
      {
        groupName: '健康与服务状态',
        description: '用于探测服务可用性、运行角色以及基础指标。',
        endpoints: [
          {
            method: 'GET',
            path: '/health',
            purpose: '获取服务健康状态与运行角色摘要。',
            requestSummary: '无请求体。',
            responseSummary: '返回 service、role、readiness、startup_error 等字段。',
            notes: 'K8S 常用于存活探针与故障排查。',
          },
          {
            method: 'GET',
            path: '/ready',
            purpose: '检查当前实例是否已准备好接收请求。',
            requestSummary: '无请求体。',
            responseSummary: '返回 readiness_ok、startup_phase 等就绪信息。',
          },
          {
            method: 'GET',
            path: '/metrics/summary',
            purpose: '查看固件解包服务的聚合指标摘要。',
            requestSummary: '无请求体。',
            responseSummary: '返回 API、队列、运行时指标摘要。',
          },
        ],
      },
      {
        groupName: '任务编排',
        description: '完成固件解包任务的提交、列表查询、详情查看与控制。',
        endpoints: [
          {
            method: 'POST',
            path: '/tasks',
            purpose: '创建新的固件解包任务。',
            requestSummary: '提交 firmware_path、project_id 等任务输入。',
            responseSummary: '返回 task_id、status、input_path、output_path 等任务基础信息。',
          },
          {
            method: 'GET',
            path: '/tasks',
            purpose: '分页查询固件解包任务。',
            requestSummary: '支持 project_id、status、page、per_page 等筛选参数。',
            responseSummary: '返回任务列表、分页信息与任务状态概览。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}',
            purpose: '获取单个解包任务详情。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 assigned_worker_id、lease、cleanup scan 关联等详情。',
          },
          {
            method: 'POST',
            path: '/tasks/{task_id}/cancel',
            purpose: '取消运行中或待执行的解包任务。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回任务取消后的最新状态。',
          },
        ],
      },
      {
        groupName: '结果与运行观测',
        description: '用于查看日志、结果、时间线和运行会话数据。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/timeline',
            purpose: '查看任务事件时间线。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回事件列表，包括调度、cleanup、运行阶段事件。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/result',
            purpose: '获取解包输出结果摘要。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 output_root、文件统计、最大文件、token 统计等信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/logs',
            purpose: '查看任务日志输出。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回任务日志文本、可用文件列表与阶段信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/sessions/index',
            purpose: '查看任务 session 文件索引。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回会话文件树与 session 元数据。',
          },
        ],
      },
      {
        groupName: 'Worker 与 Cleanup 集群',
        description: '查看单槽位 dispatcher 集群容量、槽位与 cleanup 扫描结果。',
        endpoints: [
          {
            method: 'GET',
            path: '/workers/cluster-capacity',
            purpose: '查看 Worker 集群容量与当前任务占用。',
            requestSummary: '无请求体。',
            responseSummary: '返回 workers、alive_workers、available_capacity 等字段。',
          },
          {
            method: 'GET',
            path: '/workers/slot-cluster',
            purpose: '查看 dispatcher 槽位集群视图。',
            requestSummary: '无请求体。',
            responseSummary: '返回 this_worker、workers、queued_tasks 等槽位信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/cleanup-scans',
            purpose: '查看任务前后智能体清场扫描记录。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 pre/post cleanup 扫描列表、进程统计与残留信息。',
          },
        ],
      },
    ],
  },
  {
    id: 'system-analysis',
    name: '系统分析',
    summary: '围绕解包目录或工程目录执行系统级安全分析、结果聚合与 Worker 集群调度。',
    inputDescription: '工程目录、分析任务描述、模型与并发配置。',
    outputDescription: '风险结论、模块分析结果、日志会话、Worker 容量观测。',
    tags: ['系统风险', 'AI 分析', '集群调度', 'Prompt 配置'],
    viewId: 'pentest-system',
    icon: Cpu,
    serviceName: 'secflow-app-system-analyse',
    k8sServiceHost: 'secflow-app-system-analyse',
    port: 80,
    apiPrefix: '/api/app/system-analyse',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/system-analyse/docs'],
    platformOpenapiCandidates: ['/api/app/system-analyse/openapi.json'],
    platformRedocCandidates: ['/api/app/system-analyse/redoc'],
    apiGroups: [
      {
        groupName: '健康与集群能力',
        description: '查看系统分析服务健康状态与 Worker 集群容量。',
        endpoints: [
          {
            method: 'GET',
            path: '/health',
            purpose: '获取服务角色、数据库与 Worker 运行状态。',
            requestSummary: '无请求体。',
            responseSummary: '返回 role、db_ok、worker_ok、bootstrap_phase 等字段。',
          },
          {
            method: 'GET',
            path: '/workers/cluster-capacity/summary',
            purpose: '查看系统分析 Worker 集群容量摘要。',
            requestSummary: '无请求体。',
            responseSummary: '返回总容量、可用容量、存活 Worker 等摘要信息。',
          },
          {
            method: 'GET',
            path: '/workers/cluster-capacity',
            purpose: '查看完整 Worker 集群明细。',
            requestSummary: '无请求体。',
            responseSummary: '返回 Worker 明细、当前任务占用与队列信息。',
          },
        ],
      },
      {
        groupName: '任务主流程',
        description: '创建系统分析任务并控制执行生命周期。',
        endpoints: [
          {
            method: 'POST',
            path: '/tasks',
            purpose: '创建系统分析任务。',
            requestSummary: '提交 project_id、task、target_dir、runtime 配置等。',
            responseSummary: '返回新建任务详情与初始状态。',
          },
          {
            method: 'GET',
            path: '/tasks',
            purpose: '分页查询系统分析任务。',
            requestSummary: '支持 project_id、status、analysis_mode 等查询条件。',
            responseSummary: '返回任务列表及分页信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}',
            purpose: '查看任务详情。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回阶段、来源、目录、配置摘要与状态详情。',
          },
          {
            method: 'POST',
            path: '/tasks/{task_id}/restart',
            purpose: '重新启动任务。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回新一轮任务状态。',
          },
        ],
      },
      {
        groupName: '结果与排障',
        description: '查看时间线、结果、评估与日志数据。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/timeline',
            purpose: '查看任务时间线与调度事件。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回事件流与事件明细。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/result',
            purpose: '查看分析结果产物。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回模块分析结果、输出目录和摘要信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/evaluation',
            purpose: '获取任务评估结果。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 AI 评审、质量评估与结论摘要。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/logs',
            purpose: '获取阶段日志。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 stages_json 与状态信息。',
          },
        ],
      },
      {
        groupName: 'Prompt 与配置',
        description: '维护任务配置、Prompt 模板与模型参数。',
        endpoints: [
          {
            method: 'GET',
            path: '/config',
            purpose: '读取项目级系统分析配置。',
            requestSummary: '查询参数 project_id。',
            responseSummary: '返回当前项目的服务配置。',
          },
          {
            method: 'PUT',
            path: '/config',
            purpose: '保存项目级系统分析配置。',
            requestSummary: '提交 project_id 与 config 对象。',
            responseSummary: '返回保存后的有效配置。',
          },
          {
            method: 'GET',
            path: '/prompts',
            purpose: '分页查询 Prompt 模板。',
            requestSummary: '支持 category、keyword、is_enabled 等筛选参数。',
            responseSummary: '返回 Prompt 模板列表。',
          },
        ],
      },
    ],
  },
  {
    id: 'binary-to-source',
    name: '二进制逆向',
    summary: '针对 ELF/二进制输入执行源码还原任务、缓存复用、项目隔离调度与可观测性分析。',
    inputDescription: 'ELF 文件、逆向模式、缓存策略、项目级运行配置。',
    outputDescription: '源码还原产物、任务时间线、工件明细、Pi 集群观测。',
    tags: ['ELF 逆向', '源码还原', '缓存复用', 'Pi 集群'],
    viewId: 'pentest-exec-b2s',
    icon: Boxes,
    serviceName: 'secflow-app-binary-to-source-manager',
    k8sServiceHost: 'secflow-app-binary-to-source-manager',
    port: 80,
    apiPrefix: '/api/app/binary-to-source',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/binary-to-source/docs'],
    platformOpenapiCandidates: ['/api/app/binary-to-source/openapi.json'],
    platformRedocCandidates: ['/api/app/binary-to-source/redoc'],
    apiGroups: [
      {
        groupName: '健康与集群可观测',
        description: '查看 B2S 服务健康、Pi 集群槽位和总体运行状态。',
        endpoints: [
          {
            method: 'GET',
            path: '/health',
            purpose: '查看 B2S 服务运行状态。',
            requestSummary: '无请求体。',
            responseSummary: '返回 status、service、role 等健康信息。',
          },
          {
            method: 'GET',
            path: '/pi-cluster',
            purpose: '查看 Pi/执行器集群状态。',
            requestSummary: '查询参数 project_id。',
            responseSummary: '返回 slot、worker、队列与活跃任务状态。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/stats',
            purpose: '查看项目内逆向任务统计。',
            requestSummary: '路径参数 projectId。',
            responseSummary: '返回任务状态分布、item 聚合信息。',
          },
        ],
      },
      {
        groupName: '任务编排',
        description: '为项目提交逆向任务并管理任务生命周期。',
        endpoints: [
          {
            method: 'POST',
            path: '/projects/{projectId}/tasks',
            purpose: '创建新的二进制逆向任务。',
            requestSummary: '提交 mode、concurrency、elf_tasks、reuse_cache 等配置。',
            responseSummary: '返回 task_id、status 与输入项摘要。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks',
            purpose: '查询项目逆向任务列表。',
            requestSummary: '支持 status、mode、page、per_page 等参数。',
            responseSummary: '返回任务列表与分页信息。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/{taskId}',
            purpose: '查看任务详情。',
            requestSummary: '路径参数 projectId、taskId。',
            responseSummary: '返回任务总体状态、item 分布和时序信息。',
          },
          {
            method: 'POST',
            path: '/projects/{projectId}/tasks/{taskId}/retry',
            purpose: '重试失败或异常任务。',
            requestSummary: '路径参数 projectId、taskId。',
            responseSummary: '返回新的任务状态与重试结果。',
          },
        ],
      },
      {
        groupName: '任务结果与会话',
        description: '查看 item 高级详情、工件、时序与会话文件。',
        endpoints: [
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/{taskId}/timeline',
            purpose: '查看任务时间线。',
            requestSummary: '路径参数 projectId、taskId。',
            responseSummary: '返回任务事件流与调度事件。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/{taskId}/result',
            purpose: '查看最终逆向结果。',
            requestSummary: '路径参数 projectId、taskId。',
            responseSummary: '返回源码还原结果、工件路径与汇总状态。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/{taskId}/items/{itemId}/advanced',
            purpose: '查看单个 item 的高级明细。',
            requestSummary: '路径参数 projectId、taskId、itemId；支持 include_content。',
            responseSummary: '返回 item 级产物、内容摘要与调试信息。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/tasks/{taskId}/sessions',
            purpose: '查看任务关联会话。',
            requestSummary: '路径参数 projectId、taskId。',
            responseSummary: '返回 agent sessions 与运行时 session 明细。',
          },
        ],
      },
      {
        groupName: '缓存与配置',
        description: '管理缓存条目、逆向配置与 LLM Provider。',
        endpoints: [
          {
            method: 'GET',
            path: '/projects/{projectId}/cache',
            purpose: '查看项目缓存列表。',
            requestSummary: '路径参数 projectId；支持分页与筛选参数。',
            responseSummary: '返回缓存条目、命中统计和缓存摘要。',
          },
          {
            method: 'DELETE',
            path: '/projects/{projectId}/cache/{cacheKey}',
            purpose: '删除指定缓存条目。',
            requestSummary: '路径参数 projectId、cacheKey。',
            responseSummary: '返回删除结果与状态消息。',
          },
          {
            method: 'GET',
            path: '/projects/{projectId}/config',
            purpose: '查看项目级逆向服务配置。',
            requestSummary: '路径参数 projectId。',
            responseSummary: '返回 concurrency、default_mode、llm_provider_key 等配置。',
          },
        ],
      },
    ],
  },
  {
    id: 'entry-analysis',
    name: '入口分析',
    summary: '围绕函数入口与模块入口执行发现、追踪、函数目录浏览与槽位调度观测。',
    inputDescription: '目标目录、任务描述、入口分析模型与调度配置。',
    outputDescription: '入口函数目录、函数详情、时间线、slot-cluster 观测。',
    tags: ['入口发现', '函数目录', '槽位调度', '运行时观测'],
    viewId: 'pentest-threat',
    icon: Radar,
    serviceName: 'secflow-app-entry-analyse',
    k8sServiceHost: 'secflow-app-entry-analyse',
    port: 80,
    apiPrefix: '/api/app/entry-analyse',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/entry-analyse/docs'],
    platformOpenapiCandidates: ['/api/app/entry-analyse/openapi.json'],
    platformRedocCandidates: ['/api/app/entry-analyse/redoc'],
    apiGroups: [
      {
        groupName: '健康与槽位集群',
        description: '查看入口分析管理面健康状态与 slot-cluster 视图。',
        endpoints: [
          {
            method: 'GET',
            path: '/health',
            purpose: '获取入口分析服务健康、调度器和 Worker 状态。',
            requestSummary: '无请求体。',
            responseSummary: '返回 role、db_ready、scheduler_running、worker_running 等状态。',
          },
          {
            method: 'GET',
            path: '/workers/slot-cluster',
            purpose: '查看 slot-cluster 容量与当前槽位占用。',
            requestSummary: '无请求体。',
            responseSummary: '返回 worker 数、capacity、queued_tasks、当前任务等信息。',
          },
          {
            method: 'GET',
            path: '/metrics/summary',
            purpose: '查看入口分析指标摘要。',
            requestSummary: '无请求体。',
            responseSummary: '返回 REST API、AI、运行态聚合摘要。',
          },
        ],
      },
      {
        groupName: '入口任务主流程',
        description: '创建入口分析任务并查看运行时详情。',
        endpoints: [
          {
            method: 'POST',
            path: '/tasks',
            purpose: '创建新的入口分析任务。',
            requestSummary: '提交 prompt、cwd、callback_url 等字段。',
            responseSummary: '返回 task_id、status 与任务初始化信息。',
          },
          {
            method: 'GET',
            path: '/tasks',
            purpose: '分页查询入口分析任务。',
            requestSummary: '支持 project_id、status、mode、parent_task_id 等参数。',
            responseSummary: '返回任务列表、分页信息与来源信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}',
            purpose: '查看任务详情。',
            requestSummary: '路径参数 task_id；支持 include_function_catalog。',
            responseSummary: '返回任务详情与可选函数目录。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/runtime-summary',
            purpose: '查看任务运行时汇总。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回当前运行槽位、调度信息与资源汇总。',
          },
        ],
      },
      {
        groupName: '函数目录与结果浏览',
        description: '浏览函数目录、函数详情、时间线和会话文件。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/function-catalog',
            purpose: '获取任务的函数目录清单。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回函数列表、分类信息和筛选字段。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/functions/{func_hash}',
            purpose: '查看单个函数详情。',
            requestSummary: '路径参数 task_id、func_hash；可附带 file_hash。',
            responseSummary: '返回函数代码、定位信息和上下游关系。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/timeline',
            purpose: '查看任务时间线。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回入口发现、调度、重试和完成事件。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/result',
            purpose: '获取任务结果摘要。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回入口分析结果、函数/模块摘要与输出产物。',
          },
        ],
      },
      {
        groupName: '会话与配置',
        description: '排查会话文件、Prompt 模板与模型配置。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/sessions/index',
            purpose: '查看 session 索引。',
            requestSummary: '路径参数 task_id；可选 refresh。',
            responseSummary: '返回 session 文件结构和索引信息。',
          },
          {
            method: 'GET',
            path: '/prompts',
            purpose: '查看入口分析 Prompt 模板。',
            requestSummary: '支持 category、keyword、is_enabled 等查询参数。',
            responseSummary: '返回 Prompt 模板列表。',
          },
          {
            method: 'GET',
            path: '/config',
            purpose: '读取项目级入口分析配置。',
            requestSummary: '查询参数 project_id。',
            responseSummary: '返回模型、并发与运行控制配置。',
          },
        ],
      },
    ],
  },
  {
    id: 'vuln-verify',
    name: '漏洞验证',
    summary: '接收扫描报告、源码、二进制与威胁模型，执行自动化漏洞验证与结果产物归档。',
    inputDescription: '报告目录、源码根目录、二进制根目录、威胁模型文件、模型与并发参数。',
    outputDescription: 'verify.log、分组上下文、verifier_output 结果 JSON、stdout/stderr 与任务事件。',
    tags: ['漏洞验证', 'Verifier', 'LLM', '报告审定'],
    viewId: 'pentest-vuln-verify',
    icon: ShieldCheck,
    serviceName: 'secflow-app-vuln-verify',
    k8sServiceHost: 'secflow-app-vuln-verify',
    port: 80,
    apiPrefix: '/api/app/vuln-verify',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/vuln-verify/docs'],
    platformOpenapiCandidates: ['/api/app/vuln-verify/openapi.json'],
    platformRedocCandidates: ['/api/app/vuln-verify/redoc'],
    apiGroups: [
      {
        groupName: '健康与任务',
        description: '服务健康、任务创建、任务列表与状态查询。',
        endpoints: [
          { method: 'GET', path: '/health', purpose: '获取服务健康状态。', requestSummary: '无请求体。', responseSummary: '返回 status 与 service。' },
          { method: 'POST', path: '/projects/{project_id}/tasks', purpose: '创建漏洞验证任务。', requestSummary: '提交 reports_dir、source_root、binary_root、threat_path、model、concurrency。', responseSummary: '返回任务状态、输出目录和进度。' },
          { method: 'GET', path: '/projects/{project_id}/tasks', purpose: '查询任务列表。', requestSummary: '支持 status、search、limit、offset。', responseSummary: '返回任务列表和总数。' },
          { method: 'GET', path: '/projects/{project_id}/tasks/{task_id}', purpose: '查看任务详情和事件。', requestSummary: '路径参数 project_id/task_id。', responseSummary: '返回任务详情、进度和事件列表。' },
        ],
      },
      {
        groupName: '结果与产物',
        description: '查看 verifier 输出、产物文件与任务控制。',
        endpoints: [
          { method: 'GET', path: '/projects/{project_id}/tasks/{task_id}/result', purpose: '获取结果摘要与 result_*.json。', requestSummary: '路径参数 project_id/task_id。', responseSummary: '返回 result_count、summary 和结果数组。' },
          { method: 'GET', path: '/projects/{project_id}/tasks/{task_id}/artifacts', purpose: '列出任务产物。', requestSummary: '路径参数 project_id/task_id。', responseSummary: '返回 output_dir 和产物文件列表。' },
          { method: 'POST', path: '/projects/{project_id}/tasks/{task_id}/terminate', purpose: '取消运行中任务。', requestSummary: '路径参数 project_id/task_id。', responseSummary: '返回操作结果。' },
          { method: 'POST', path: '/projects/{project_id}/tasks/{task_id}/rerun', purpose: '清空输出并重跑终态任务。', requestSummary: '路径参数 project_id/task_id。', responseSummary: '返回操作结果。' },
        ],
      },
    ],
  },
  {
    id: 'dataflow-vuln-scan',
    name: '数据流漏洞挖掘',
    summary: '以函数或模块为中心执行污点追踪、漏洞结果汇总、图谱产出与 Worker 集群调度。',
    inputDescription: '函数/目录、污点分析上下文、项目配置与运行参数。',
    outputDescription: '漏洞图谱、漏洞发现清单、执行日志、Worker 集群状态。',
    tags: ['污点分析', '漏洞图谱', '结果上报', 'Worker 集群'],
    viewId: 'pentest-dataflow-vuln-scan',
    icon: Bug,
    serviceName: 'secflow-app-dataflow-vuln-scan',
    k8sServiceHost: 'secflow-app-dataflow-vuln-scan',
    port: 80,
    apiPrefix: '/api/app/dataflow-vuln-scan',
    docsPath: '/docs',
    openapiPath: '/openapi.json',
    redocPath: '/redoc',
    platformDocsCandidates: ['/api/app/dataflow-vuln-scan/docs'],
    platformOpenapiCandidates: ['/api/app/dataflow-vuln-scan/openapi.json'],
    platformRedocCandidates: ['/api/app/dataflow-vuln-scan/redoc'],
    apiGroups: [
      {
        groupName: '健康与容量',
        description: '查看数据流漏洞挖掘服务健康、Worker 容量与总体调度状态。',
        endpoints: [
          {
            method: 'GET',
            path: '/health',
            purpose: '获取服务健康与运行角色信息。',
            requestSummary: '无请求体。',
            responseSummary: '返回 status、role、dispatcher_enabled、executor_enabled 等字段。',
          },
          {
            method: 'GET',
            path: '/workers/cluster-capacity',
            purpose: '查看 Worker 集群容量。',
            requestSummary: '无请求体。',
            responseSummary: '返回 worker 数、可用容量、任务队列等信息。',
          },
          {
            method: 'GET',
            path: '/metrics/summary',
            purpose: '查看漏洞挖掘聚合指标摘要。',
            requestSummary: '无请求体。',
            responseSummary: '返回 AI、运行态和 REST API 指标摘要。',
          },
        ],
      },
      {
        groupName: '任务主流程',
        description: '创建污点分析任务并控制任务生命周期。',
        endpoints: [
          {
            method: 'POST',
            path: '/tasks',
            purpose: '创建数据流漏洞挖掘任务。',
            requestSummary: '提交 project_id、task、function_name、funcdb_path 等分析输入。',
            responseSummary: '返回任务详情、状态与输出路径摘要。',
          },
          {
            method: 'GET',
            path: '/tasks',
            purpose: '分页查询任务列表。',
            requestSummary: '支持 project_id、status、mode、parent_task_id 等筛选参数。',
            responseSummary: '返回任务列表及分页信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}',
            purpose: '查看任务详情。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回任务状态、trace root、attempts 和配置摘要。',
          },
          {
            method: 'POST',
            path: '/tasks/{task_id}/resume',
            purpose: '恢复可继续执行的任务。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回恢复后的任务状态。',
          },
        ],
      },
      {
        groupName: '漏洞结果与图谱',
        description: '查看漏洞图谱、发现结果和执行时间线。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/vuln-graph',
            purpose: '获取漏洞调用图谱。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 trace_tree、graph 和统计摘要。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/vuln-findings',
            purpose: '查看漏洞发现列表。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回漏洞记录、证据和结论信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/result',
            purpose: '获取任务结果产物摘要。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回输出目录、结果摘要与运行信息。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/timeline',
            purpose: '查看任务时间线。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回创建、调度、追踪、评审和完成事件。',
          },
        ],
      },
      {
        groupName: '日志、会话与配置',
        description: '用于排障、会话浏览和项目配置维护。',
        endpoints: [
          {
            method: 'GET',
            path: '/tasks/{task_id}/logs',
            purpose: '查看任务日志阶段输出。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 stages_json 与状态摘要。',
          },
          {
            method: 'GET',
            path: '/tasks/{task_id}/sessions/index',
            purpose: '查看任务会话索引。',
            requestSummary: '路径参数 task_id。',
            responseSummary: '返回 session 文件与索引元数据。',
          },
          {
            method: 'GET',
            path: '/config',
            purpose: '读取项目级漏洞挖掘配置。',
            requestSummary: '查询参数 project_id。',
            responseSummary: '返回 profile、超时、并发和运行时配置。',
          },
        ],
      },
    ],
  },
];
