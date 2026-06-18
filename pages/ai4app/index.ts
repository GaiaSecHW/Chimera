/**
 * turing 扫描工具（app-security-scan）独立模块入口。
 *
 * 该工具调用 turing-ui-service 的 M2M 接口（/api/v1/tasks）对 APK/HAP
 * 应用包或源码压缩包执行三阶段扫描（检测 → 挖掘 → 验证），按平台线别
 * （platform: APP/WEB）与扫描模式（scan_mode: fast/deep）分流。数据模型
 * 与状态机与 BinarySecurity 系列工具完全不同，因此页面、API 客户端均
 * 独立承载，不与 pages/execution 下的其它工具混用。
 */
export { appScanApi } from './appScan';
export type {
  AppScanActiveProject,
  AppScanActionResponse,
  AppScanCallChainStep,
  AppScanCreateRequest,
  AppScanCreateResponse,
  AppScanFinding,
  AppScanFindingsSummary,
  AppScanListResponse,
  AppScanOcPod,
  AppScanOcServer,
  AppScanOpencodeInstances,
  AppScanPhaseProgress,
  AppScanPlatform,
  AppScanPoolStats,
  AppScanScanMode,
  AppScanStatus,
  AppScanTask,
  AppScanTaskFindings,
  AppScanTaskProgress,
  AppScanTaskSummary,
  AppScanTaskType,
  AppScanTokenJob,
  AppScanTokenStats,
  AppScanTokenUsage,
  AppScanUploadResponse,
} from './appScan';

export { AppScanOverviewPage } from './AppScanOverviewPage';
export { AppScanTaskDetailPage } from './AppScanTaskDetailPage';
export { AppScanMonitorPage } from './AppScanMonitorPage';
