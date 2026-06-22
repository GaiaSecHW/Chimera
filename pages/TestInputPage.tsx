import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Code2,
  Eye,
  FileBox,
  FileText,
  HardDrive,
  Loader2,
  Network,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../clients/api';
import { PageHeader } from '../design-system';
import {
  IN_PROGRESS_STATUSES,
  STATUS_LABELS_SHORT,
  USABLE_UPLOAD_STATUSES,
  buildCodemapTaskId,
  buildManagerTargetDir,
} from '../clients/codemapManager';
import type { CodemapTaskStatus } from '../clients/codemapManager';
import { StatusBadge } from '../components/StatusBadge';
import type { ProjectInputOverview, ProjectInputUploadDetail, ProjectInputUploadRecord, ProjectInputUploadStats, SecurityProject, UserInfo } from '../types/types';
import { formatUploadBytes, getLatestBatchSummary, getUploadModeLabel, getUploadRecordDisplayName, isAllowedArchiveFileName } from './assets/baseResourcePageModel';
import { CreateTaskDialog } from './task/CreateTaskDialog';
import { TestInputUploader, TestInputUploaderHandle } from '../components/TestInputUploader';

type InputType = 'document' | 'code' | 'software' | 'other';

interface TestInputPageProps {
  currentView: string;
  selectedProjectId?: string;
  user?: UserInfo | null;
  projects?: SecurityProject[];
}

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  speedBytesPerSec?: number;
  error?: string;
}

interface UploadDetailDialogState {
  uploadId: string;
  record: ProjectInputUploadRecord;
}

const INPUT_TYPE_META: Record<InputType, { label: string; icon: React.ReactNode; tone: string }> = {
  document: { label: '文档', icon: <FileText size={18} />, tone: 'text-sky-400 bg-sky-500/15 border-sky-500/20' },
  code: { label: '代码', icon: <Code2 size={18} />, tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
  software: { label: '软件包', icon: <Package size={18} />, tone: 'text-amber-400 bg-amber-500/15 border-amber-500/20' },
  other: { label: '其他', icon: <FileBox size={18} />, tone: 'text-theme-text-secondary bg-theme-elevated border-theme-border' },
};

const INPUT_TYPE_ORDER: InputType[] = ['document', 'code', 'software', 'other'];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatSpeed = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let next = bytes;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return`${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const normalizeType = (value: string): InputType => {
  if (value === 'document' || value === 'code' || value === 'software' || value === 'other') return value;
  return 'other';
};

// codemap_lite 进度 chip。仅 input_type === 'code' 的行会调用本组件。
// 文案分档对应 manager FSM:queued/accepted/building_analyze 灰色,building_repair
// 可带百分比(progress 仅在 repair 阶段非 null,见 manager/app.py:189-193),
// completed 绿色,failed 红色 + hover tooltip(title 属性)。
const truncateError = (msg: string | null | undefined): string => {
  if (!msg) return '构建失败';
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
};

const CodemapProgressChip: React.FC<{
  status: CodemapTaskStatus | null;
  onRebuild?: () => void;
  rebuilding?: boolean;
  onCorrect?: () => void;
  correcting?: boolean;
  usable?: boolean;
  dispatchError?: string;
  onRetryDispatch?: () => void;
  retrying?: boolean;
}> = ({ status, onRebuild, rebuilding, onCorrect, correcting, usable, dispatchError, onRetryDispatch, retrying }) => {
  // status===null:任务尚未派发。三种子态:
  //  ① triggerBuild 失败过(dispatchError)→ 红色「派发失败 · 重试」+ 手动重试按钮。
  //  ② 上传还没到 USABLE 终态(!usable)→ 灰色「等上传完成」,本就不该派,不给重试。
  //  ③ 已 USABLE、无错误 → 灰色「待派发」(瞬时态,派发 effect 马上会触发)。
  if (!status) {
    const pillBase = 'inline-flex items-center rounded-xl border px-3 py-2 text-xs font-medium';
    if (dispatchError) {
      return (
        <span className="inline-flex items-center gap-2">
          <span title={dispatchError} className={`${pillBase} border-rose-500/20 bg-rose-500/15 text-rose-400`}>
            知识图谱 · 派发失败
          </span>
          {onRetryDispatch ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetryDispatch(); }}
              disabled={retrying}
              className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying ? '重试中…' : '重试'}
            </button>
          ) : null}
        </span>
      );
    }
    const label = usable === false ? '知识图谱 · 等上传完成' : '知识图谱 · 待派发';
    return (
      <span title={usable === false ? '上传尚未完成(未达可分析状态),完成后将自动派发' : undefined}
        className={`${pillBase} border-theme-border bg-theme-elevated text-theme-text-muted`}>
        {label}
      </span>
    );
  }
  const s = status.status;
  const progress = status.progress;
  // 与同行「详情/打开目录」按钮统一外形:rounded-xl + px-3 py-2 + text-xs +
  // font-semibold;配色走主题暗色语义色(StatusBadge 同款 -500/15 底 / -500/20 边)。
  const pillBase = 'inline-flex items-center rounded-xl border px-3 py-2 text-xs font-medium';
  const toneSuccess = 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  const toneProgress = 'border-sky-500/20 bg-sky-500/15 text-sky-400';
  const toneWarn = 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  const toneFail = 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  const toneNeutral = 'border-theme-border bg-theme-elevated text-theme-text-muted';
  // 进入过 repair 阶段就有 progress.sources(building_repair/completed/failed 都算)。
  // 显示"静态分析成功 · 调用链修复 X/Y"——静态分析必然已经成功了才会到这里。
  const hasRepairProgress = progress && progress.total > 0;
  // 终态失败可重派的提示按钮。仅在 status 终态 failed 时显示;部分成功(repair
  // 失败但有进度)和构建中不显示——前者图已经有数据,后者还没结果。
  const showRebuild = s === 'failed' && !hasRepairProgress && !!onRebuild;
  const rebuildButton = showRebuild ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRebuild?.(); }}
      disabled={rebuilding}
      className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
    >
      {rebuilding ? '重派中…' : '重新构建'}
    </button>
  ) : null;
  // 「图谱为空」更正按钮:status=completed 但 progress.total===0(silent-success
  // 失败模式 — analyze 扫了空目录/错路径,exit 0 但 0 函数,任务标 completed。
  // failed 走 rebuildButton,这里只覆盖 completed+空进度。
  const showCorrect = s === 'completed' && !hasRepairProgress && !!onCorrect;
  const correctButton = showCorrect ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCorrect?.(); }}
      disabled={correcting}
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {correcting ? '更正中…' : '更正代码目录'}
    </button>
  ) : null;
  // 攻击入口识别(基础版)非阻塞:即便失败主构建仍继续 repair。失败时给一个
  // 小字附注,在后续 building_repair/completed 的 chip 旁提示「入口分析失败」,
  // 不影响主流程展示。attack?.status==='failed' 才出现。
  const attackFailedNote = status.attack?.status === 'failed' ? (
    <span className="text-[11px] font-semibold text-amber-400/80" title="攻击入口识别阶段失败,不影响调用链修复">
      入口分析失败
    </span>
  ) : null;
  if (hasRepairProgress) {
    const total = progress.total;
    const completed = progress.completed;
    if (s === 'completed') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className={`${pillBase} ${toneSuccess}`}>
            静态分析成功 · 调用链修复 {completed}/{total}
          </span>
          {attackFailedNote}
        </span>
      );
    }
    // building_repair / failed(部分成功)都用"修复中"语义,色调按状态区分。
    const allDone = completed === total;
    const tone = s === 'failed' ? toneWarn : toneProgress;
    const label = s === 'building_repair' ? '调用链修复中' : (allDone ? '调用链修复完成' : '调用链修复');
    return (
      <span className="inline-flex items-center gap-2">
        <span
          title={s === 'failed' ? `${truncateError(status.error)} (${completed}/${total} 源点已修复)` : undefined}
          className={`${pillBase} ${tone}`}
        >
          静态分析成功 · {label} {completed}/{total}
        </span>
        {attackFailedNote}
      </span>
    );
  }
  // 攻击入口识别阶段(在 analyze 与 repair 之间)。实时展示已识别入口数。
  if (s === 'building_attack_surface') {
    const entries = status.attack?.entries ?? 0;
    return (
      <span className={`${pillBase} ${toneProgress}`}>
        攻击入口识别中{entries > 0 ? ` · 已识别 ${entries} 入口` : ''}
      </span>
    );
  }
  // 没有 repair progress 才回到原始状态文案。
  if (s === 'failed') {
    return (
      <span className="inline-flex items-center gap-2">
        <span title={truncateError(status.error)} className={`${pillBase} ${toneFail}`}>
          静态分析失败
        </span>
        {rebuildButton}
      </span>
    );
  }
  if (s === 'completed') {
    // completed 但无 repair progress = silent-success 0 函数失败模式
    // (target_dir 错位、analyze 扫空目录但 exit 0)。语义就是异常,展示
    // 红色,后台自动触发一次更正(封顶 1 次)兜底,用户无需手动点。
    return (
      <span className="inline-flex items-center gap-2">
        <span className={`${pillBase} ${toneFail}`}>异常 · 0 函数</span>
        {correctButton}
      </span>
    );
  }
  const label = STATUS_LABELS_SHORT[s] || s;
  return <span className={`${pillBase} ${toneNeutral}`}>{label}</span>;
};

const emptyStats = (projectId: string, inputType: InputType): ProjectInputUploadStats => ({
  project_id: projectId,
  input_type: inputType,
  total_uploads: 0,
  processing_uploads: 0,
  succeeded_uploads: 0,
  partial_failed_uploads: 0,
  failed_uploads: 0,
  stored_file_count: 0,
  stored_total_size_bytes: 0,
});

export const TestInputPage: React.FC<TestInputPageProps> = ({ selectedProjectId, user = null, projects = [] }) => {
  const navigate = useNavigate();
  const fileserverApi = api.domains.assets.fileserver;
  const projectId = selectedProjectId || localStorage.getItem('last_project_id') || localStorage.getItem('selectedProjectId') || '';
  const [overview, setOverview] = useState<ProjectInputOverview | null>(null);
  const [records, setRecords] = useState<ProjectInputUploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<InputType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | string>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAppendMode, setIsAppendMode] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeInputType, setActiveInputType] = useState<InputType>('document');
  const [uploadDisplayName, setUploadDisplayName] = useState('');
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectInputUploadRecord | null>(null);
  const [expandedUploadIds, setExpandedUploadIds] = useState<string[]>([]);
  const [uploadDetailCache, setUploadDetailCache] = useState<Record<string, ProjectInputUploadDetail | undefined>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<string[]>([]);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailDialogTarget, setDetailDialogTarget] = useState<UploadDetailDialogState | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedRecordForTask, setSelectedRecordForTask] = useState<string | undefined>(undefined);
  // codemap_lite 任务状态:下沉到「每条 code 上传一图」。key = upload_id,
  // value=null 表示该上传尚未派发(getTaskStatus 404)。每条上传各自独立的
  // task_id(kg-<uploadId>)、状态与图。
  const [codemapStatusByUpload, setCodemapStatusByUpload] = useState<Record<string, CodemapTaskStatus | null>>({});
  // 派发(triggerBuild)失败的 upload。status 仍为 null,靠这张表区分「等上传完成」
  // (上传未到 USABLE,本就不该派)与「派发失败」(已 USABLE 但 triggerBuild 报错),
  // 后者给重试按钮;否则两种 null 在 UI 上无法区分,会一直显示「待派发」。
  const [codemapDispatchErrorByUpload, setCodemapDispatchErrorByUpload] = useState<Record<string, string>>({});
  // 重派 / 更正按钮的本地态(按 upload_id 记录哪几条正在处理)。
  const [codemapRebuildingIds, setCodemapRebuildingIds] = useState<string[]>([]);
  const [codemapCorrectingIds, setCodemapCorrectingIds] = useState<string[]>([]);
  // 自动更正封顶:每个 task_id 只自动 purge 一次,避免「上传本身没源码」之类
  // 永远 0 函数的场景陷入死循环。手动点按钮不受此 ref 限制。
  const autoCorrectedRef = useRef<Set<string>>(new Set());
  // 详情对话框里"打开知识图谱"按钮的本地态(启动 serve 时禁用 + 错误回显)。
  const [openServeLoading, setOpenServeLoading] = useState(false);
  const [openServeError, setOpenServeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<TestInputUploaderHandle>(null);

  useEffect(() => {
    if (!projectId) return;
    setPage(1);
    void loadOverview();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadRecords();
  }, [projectId, selectedType, selectedStatus, page, pageSize]);

  // 多图谱:真 product_id(空回退 projectId),所有 code 上传同属一个 product,
  // manager 据 upload_id 在该 product 的 active 图里找 fork 源。
  const codemapProductId = useMemo(
    () => projects.find((p) => p.id === projectId)?.product_id || projectId,
    [projectId, projects],
  );

  // 当前可见的 code 上传记录(派发/查询/轮询都按它逐条处理)。
  const codeRecords = useMemo(
    () => records.filter((r) => normalizeType(r.input_type) === 'code'),
    [records],
  );

  // 切项目 / 刷新记录时,为每条尚未知状态的 code 上传查一次 codemap 任务状态。
  // 404 → null(进入下方派发判断);5xx/网络错误 → 留空(下拍重试)。
  useEffect(() => {
    if (!projectId || codeRecords.length === 0) return;
    let aborted = false;
    void (async () => {
      await Promise.all(codeRecords.map(async (record) => {
        const uid = record.upload_id;
        if (uid in codemapStatusByUpload) return;   // 已知(含 null),不重复查
        try {
          const s = await api.codemapManager.getTaskStatus(buildCodemapTaskId(uid));
          if (!aborted) setCodemapStatusByUpload((cur) => ({ ...cur, [uid]: s }));
        } catch (error) {
          if ((error as any)?.status === 404) {
            if (!aborted) setCodemapStatusByUpload((cur) => ({ ...cur, [uid]: null }));
            return;
          }
          // eslint-disable-next-line no-console
          console.warn('[codemap] getTaskStatus failed', uid, error);
        }
      }));
    })();
    return () => { aborted = true; };
  }, [projectId, codeRecords]);

  // 派发 effect:对每条「状态已知为 null 且上传已落盘(USABLE)」的 code 上传各
  // 触发一次构建。task_id=kg-<uploadId> 幂等,与知识图谱 tab 并发触发也只起一份。
  useEffect(() => {
    if (!projectId) return;
    let aborted = false;
    const productName = projects.find((p) => p.id === projectId)?.name || projectId;
    void (async () => {
      await Promise.all(codeRecords.map(async (record) => {
        const uid = record.upload_id;
        if (codemapStatusByUpload[uid] !== null) return;   // 未知 or 已有状态
        if (!USABLE_UPLOAD_STATUSES.has(record.status)) return;
        try {
          const triggered = await api.codemapManager.triggerBuild({
            task_id: buildCodemapTaskId(uid),
            product_id: codemapProductId,
            product_name: productName,
            target_dir: buildManagerTargetDir(projectId, record.target_path),
            project_id: projectId,
            upload_id: uid,
          });
          if (aborted) return;
          setCodemapStatusByUpload((cur) => ({
            ...cur,
            [uid]: {
              task_id: triggered.task_id,
              status: triggered.status,
              mode: 'full',
              db_name: triggered.db_name,
              error: null,
            },
          }));
          setCodemapDispatchErrorByUpload((cur) => {
            if (!(uid in cur)) return cur;
            const next = { ...cur };
            delete next[uid];
            return next;
          });
        } catch (error) {
          if (aborted) return;
          // eslint-disable-next-line no-console
          console.warn('[codemap] triggerBuild failed', uid, error);
          // 记下派发失败,chip 转「派发失败 · 重试」。status 保持 null。
          setCodemapDispatchErrorByUpload((cur) => ({
            ...cur,
            [uid]: (error as any)?.message || '触发知识图谱构建失败',
          }));
        }
      }));
    })();
    return () => { aborted = true; };
  }, [projectId, codeRecords, codemapStatusByUpload, codemapProductId, projects]);

  // 3s 轮询:对每条处于进行中状态的上传各拉一次状态;全部到终态即停。
  useEffect(() => {
    const inProgress = Object.entries(codemapStatusByUpload)
      .filter(([, s]) => s && IN_PROGRESS_STATUSES.has(s.status))
      .map(([uid]) => uid);
    if (inProgress.length === 0) return undefined;
    const timer = window.setInterval(async () => {
      await Promise.all(inProgress.map(async (uid) => {
        try {
          const next = await api.codemapManager.getTaskStatus(buildCodemapTaskId(uid));
          setCodemapStatusByUpload((cur) => ({ ...cur, [uid]: next }));
        } catch (error) {
          if ((error as any)?.status === 404) return; // 瞬时,下一拍重试
        }
      }));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [codemapStatusByUpload]);

  // 「派发失败 · 重试」按钮:直接对该上传重发一次 triggerBuild(派发 effect 不依赖
  // dispatchError，清错误标记不会让它自跑,故这里直接重试)。成功落 status 并清错误。
  const handleCodemapRetryDispatch = async (uploadId: string) => {
    if (codemapRebuildingIds.includes(uploadId)) return;
    const record = codeRecords.find((r) => r.upload_id === uploadId);
    if (!projectId || !record) return;
    const productName = projects.find((p) => p.id === projectId)?.name || projectId;
    setCodemapRebuildingIds((cur) => [...cur, uploadId]);
    try {
      const triggered = await api.codemapManager.triggerBuild({
        task_id: buildCodemapTaskId(uploadId),
        product_id: codemapProductId,
        product_name: productName,
        target_dir: buildManagerTargetDir(projectId, record.target_path),
        project_id: projectId,
        upload_id: uploadId,
      });
      setCodemapStatusByUpload((cur) => ({
        ...cur,
        [uploadId]: {
          task_id: triggered.task_id,
          status: triggered.status,
          mode: 'full',
          db_name: triggered.db_name,
          error: null,
        },
      }));
      setCodemapDispatchErrorByUpload((cur) => {
        const next = { ...cur };
        delete next[uploadId];
        return next;
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[codemap] retry triggerBuild failed', uploadId, error);
      setCodemapDispatchErrorByUpload((cur) => ({
        ...cur,
        [uploadId]: (error as any)?.message || '触发知识图谱构建失败',
      }));
    } finally {
      setCodemapRebuildingIds((cur) => cur.filter((id) => id !== uploadId));
    }
  };

  // failed chip 旁的"重新构建"按钮:DELETE 旧 task → 置 null → 派发 effect 用
  // 该上传记录重派(自动修正上次因目录错位等 422 / 0 函数失败的 task)。
  const handleCodemapRebuild = async (uploadId: string) => {
    if (codemapRebuildingIds.includes(uploadId)) return;
    setCodemapRebuildingIds((cur) => [...cur, uploadId]);
    try {
      await api.codemapManager.deleteTask(buildCodemapTaskId(uploadId));
      setCodemapStatusByUpload((cur) => ({ ...cur, [uploadId]: null }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[codemap] deleteTask failed', error);
    } finally {
      setCodemapRebuildingIds((cur) => cur.filter((id) => id !== uploadId));
    }
  };

  // completed+0 函数 chip 旁的「更正代码目录」按钮:silent-success 失败恢复出口。
  // purge 销毁式清掉旧空图(停 serve、DROP 库、删工作区目录),再置 null 让派发
  // effect 用该上传记录的真实路径重建。
  const handleCodemapCorrect = async (uploadId: string) => {
    if (codemapCorrectingIds.includes(uploadId)) return;
    const status = codemapStatusByUpload[uploadId];
    setCodemapCorrectingIds((cur) => [...cur, uploadId]);
    try {
      if (status?.db_name) {
        await api.codemapManager.purgeProject(status.db_name);
      } else {
        await api.codemapManager.deleteTask(buildCodemapTaskId(uploadId)).catch(() => {});
      }
      setCodemapStatusByUpload((cur) => ({ ...cur, [uploadId]: null }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[codemap] purgeProject failed', error);
    } finally {
      setCodemapCorrectingIds((cur) => cur.filter((id) => id !== uploadId));
    }
  };

  // 自动更正 effect:对每条 status=completed 但 progress.total===0(silent-success
  // 失败模式)的上传,后台自动触发一次 purge+重派,无需用户手动。封顶 1 次/task,
  // 防止"上传压缩包本身没源码"之类永远 0 函数的场景陷入死循环;循环回来还是 0
  // 函数就由用户手动点按钮决定下一步(或检查上传)。
  useEffect(() => {
    Object.entries(codemapStatusByUpload).forEach(([uid, status]) => {
      if (!status || status.status !== 'completed') return;
      if (status.progress && status.progress.total > 0) return;  // 有结果,不动
      const taskId = status.task_id;
      if (autoCorrectedRef.current.has(taskId)) return;  // 已自动试过,不再循环
      if (codemapCorrectingIds.includes(uid)) return;
      autoCorrectedRef.current.add(taskId);
      void handleCodemapCorrect(uid);
    });
    // 故意只依赖状态 map;handleCodemapCorrect 闭包读最新 correcting 列表。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codemapStatusByUpload]);

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      setOverview(await fileserverApi.getProjectInputOverview(projectId));
    } catch (error: any) {
      setOverview(null);
      setErrorMessage(error?.message || '加载统计失败');
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await fileserverApi.listProjectInputUploads(projectId, {
        inputType: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        page,
        pageSize,
      });
      setRecords(Array.isArray(response.items) ? response.items : []);
      setTotal(Number(response.total || 0));
      setPage(Number(response.page || page));
    } catch (error: any) {
      setRecords([]);
      setTotal(0);
      setErrorMessage(error?.message || '加载记录失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUploadDetail = async (uploadId: string, force = false) => {
    if (!force && uploadDetailCache[uploadId]) return uploadDetailCache[uploadId];
    setDetailLoadingIds((current) => (current.includes(uploadId) ? current : [...current, uploadId]));
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[uploadId];
      return next;
    });
    try {
      const detail = await fileserverApi.getProjectInputUploadDetail(uploadId);
      setUploadDetailCache((current) => ({ ...current, [uploadId]: detail }));
      return detail;
    } catch (error: any) {
      const message = error?.message || '加载批次历史失败';
      setDetailErrors((current) => ({ ...current, [uploadId]: message }));
      return undefined;
    } finally {
      setDetailLoadingIds((current) => current.filter((item) => item !== uploadId));
    }
  };

  const toggleUploadDetail = async (uploadId: string) => {
    const isExpanded = expandedUploadIds.includes(uploadId);
    if (isExpanded) {
      setExpandedUploadIds((current) => current.filter((item) => item !== uploadId));
      return;
    }
    setExpandedUploadIds((current) => [...current, uploadId]);
    if (!uploadDetailCache[uploadId]) {
      await loadUploadDetail(uploadId);
    }
  };

  const openUploadDetailDialog = async (record: ProjectInputUploadRecord) => {
    setDetailDialogTarget({ uploadId: record.upload_id, record });
    setOpenServeError(null);
    await loadUploadDetail(record.upload_id);
  };

  // 详情对话框里点击"打开知识图谱"——拿当前项目级 task 的 db_name 起(或复用)
  // per-project serve 子进程,新 tab 打开 codemap_lite serve 静态页。
  // 与知识图谱 tab 走��是同一份 db,POST /projects/{db}/serve 幂等。
  const handleOpenServe = async (uploadId: string) => {
    const status = codemapStatusByUpload[uploadId];
    if (!status?.db_name) return;
    setOpenServeLoading(true);
    setOpenServeError(null);
    try {
      const serve = await api.codemapManager.startServe(status.db_name);
      const url = `http://${serve.ip}:${serve.port}/static/index.html`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      setOpenServeError(error?.message || '启动 codemap-lite serve 失败');
    } finally {
      setOpenServeLoading(false);
    }
  };

  const statsMap = useMemo(() => {
    const map = new Map<InputType, ProjectInputUploadStats>();
    INPUT_TYPE_ORDER.forEach((type) => map.set(type, emptyStats(projectId, type)));
    (overview?.categories || []).forEach((item) => {
      map.set(normalizeType(item.input_type), item);
    });
    return map;
  }, [overview, projectId]);

  const filteredRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record) => {
      const typeLabel = INPUT_TYPE_META[normalizeType(record.input_type)].label.toLowerCase();
      return (
        getUploadRecordDisplayName(record).toLowerCase().includes(keyword) ||
        record.upload_id.toLowerCase().includes(keyword) ||
        record.target_path.toLowerCase().includes(keyword) ||
        typeLabel.includes(keyword) ||
        String(record.created_by || '').toLowerCase().includes(keyword) ||
        String(record.last_error || record.latest_batch?.error_summary || '').toLowerCase().includes(keyword)
      );
    });
  }, [records, searchTerm]);

  const addFilesToQueue = (files: FileList | null) => {
    if (!files) return;
    const next: UploadQueueItem[] = Array.from(files).map((file) => {
      const allowed = keepOriginal || isAllowedArchiveFileName(file.name || '');
      return {
        id:`${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: allowed ? 'pending' : 'failed',
        progress: 0,
        speedBytesPerSec: 0,
        error: allowed ? undefined : '仅支持压缩包上传',
      };
    });
    setUploadQueue((current) => [...current, ...next]);
  };

  const uploadDialogError = errorMessage;

  const openCreateModal = (type: InputType) => {
    setIsAppendMode(false);
    setActiveUploadId(null);
    setActiveInputType(type);
    setUploadDisplayName('');
    setKeepOriginal(false);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
    setErrorMessage(null);
  };

  const openAppendModal = (record: ProjectInputUploadRecord) => {
    setIsAppendMode(true);
    setActiveUploadId(record.upload_id);
    setActiveInputType(normalizeType(record.input_type));
    setUploadDisplayName('');
    setKeepOriginal(record.keep_original);
    setUploadQueue([]);
    setIsUploadModalOpen(true);
    setErrorMessage(null);
  };

  const submitUpload = async (options?: { runInBackground?: boolean }) => {
    if (isAppendMode) {
      const readyFiles = uploadQueue.filter((item) => item.status !== 'failed').map((item) => item.file);
      if (!projectId || readyFiles.length === 0 || !activeUploadId) return;
      setIsUploading(true);
      if (options?.runInBackground) {
        setIsUploadModalOpen(false);
      }
      setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'uploading', progress: 40, speedBytesPerSec: 0 }));
      try {
        const result = await fileserverApi.appendProjectInputUpload({
          upload_id: activeUploadId,
          keep_original: keepOriginal,
          upload_mode: keepOriginal ? 'raw' : 'archive',
          files: readyFiles,
        }, {
          onProgress: (progress) => {
            setUploadQueue((current) => current.map((item) => (
              item.status === 'failed'
                ? item
                : {
                    ...item,
                    progress: Math.max(item.progress, progress.total_bytes > 0 ? Math.round((progress.loaded_bytes / progress.total_bytes) * 100) : item.progress),
                    speedBytesPerSec: progress.speed_bytes_per_sec || 0,
                  }
            )));
          },
        });
        setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'completed', progress: 100, speedBytesPerSec: 0 }));
        setIsUploadModalOpen(false);
        setUploadQueue([]);
        if (result?.upload_id) {
          setUploadDetailCache((current) => {
            const next = { ...current };
            delete next[result.upload_id];
            return next;
          });
        }
        await Promise.all([loadOverview(), loadRecords()]);
      } catch (error: any) {
        const message = error?.message || '上传失败';
        setUploadQueue((current) => current.map((item) => item.status === 'failed' ? item : { ...item, status: 'failed', progress: 0, speedBytesPerSec: 0, error: message }));
        setErrorMessage(message);
      } finally {
        setIsUploading(false);
      }
    } else {
      if (!uploaderRef.current?.hasFiles()) {
        setErrorMessage('请先选择上传文件');
        return;
      }
      if (!uploadDisplayName.trim()) {
        setErrorMessage('请填写上传记录名称');
        return;
      }
      setIsUploading(true);
      if (options?.runInBackground) {
        setIsUploadModalOpen(false);
      }
      try {
        await uploaderRef.current.triggerUpload();
        setIsUploadModalOpen(false);
        uploaderRef.current.reset();
        setUploadDisplayName('');
        await Promise.all([loadOverview(), loadRecords()]);
      } catch (error: any) {
        setErrorMessage(error?.message || '上传失败');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget || !projectId) return;
    try {
      await fileserverApi.deleteProjectInputUploads({
        project_id: projectId,
        input_type: deleteTarget.input_type,
        upload_ids: [deleteTarget.upload_id],
      });
      setExpandedUploadIds((current) => current.filter((item) => item !== deleteTarget.upload_id));
      setUploadDetailCache((current) => {
        const next = { ...current };
        delete next[deleteTarget.upload_id];
        return next;
      });
      setDetailErrors((current) => {
        const next = { ...current };
        delete next[deleteTarget.upload_id];
        return next;
      });
      setDeleteTarget(null);
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error: any) {
      setErrorMessage(error?.message || '删除失败');
    }
  };

  const canOpenDirectory = useMemo(() => {
    const platformRole = String(user?.platform_role || '').trim().toLowerCase();
    return platformRole === 'developer' || platformRole === 'ordinary_admin' || platformRole === 'super_admin';
  }, [user]);

  const openProjectPath = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path :`/${path}`;
    const targetHash =`#/project-file-explorer?path=${encodeURIComponent(normalizedPath)}`;
    window.open(targetHash, '_blank', 'noopener,noreferrer');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!projectId) {
    return (
      <div className="flex h-full min-h-[calc(100vh-5rem)] items-center justify-center px-5 py-5 md:px-6 2xl:px-8">
        <section className="w-full max-w-3xl rounded-xl border border-theme-border bg-theme-surface px-10 py-14 text-center shadow-brand">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-theme-elevated text-theme-text-primary">
            <FileBox size={28} />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-theme-text-primary">测试对象</h1>
          <p className="mt-3 text-base font-medium text-theme-text-faint">请先选择项目，再查看测试对象统计和上传记录。</p>
        </section>
      </div>
    );
  }

  return (
 <div className="min-h-[calc(100vh-5rem)] bg-theme-elevated p-4 md:p-6 xl:p-8">
      <div className="flex min-h-[calc(100vh-7rem)] w-full flex-col gap-5">
        <PageHeader title="测试对象" description="统一管理与查看当前项目的测试输入对象，包括文档、代码、软件和其他资料的上传与状态追踪" />
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {INPUT_TYPE_ORDER.map((inputType) => {
            const stats = statsMap.get(inputType) || emptyStats(projectId, inputType);
            const meta = INPUT_TYPE_META[inputType];
            return (
              <button
                key={inputType}
                type="button"
                onClick={() => {
                  setSelectedType(inputType);
                  setPage(1);
                }}
 className={`rounded-xl border p-5 text-left transition ${selectedType === inputType ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-elevated text-theme-text-primary hover:border-theme-border'}`}
              >
 <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] ${selectedType === inputType ? 'border-theme-border bg-theme-elevated text-white' : meta.tone}`}>
                  {meta.icon}
                  {meta.label}
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">上传记录</div>
                  <div className="flex items-baseline gap-3 text-right">
                    <div className="text-3xl font-bold">{stats.total_uploads}</div>
                    <div className="text-xs font-semibold opacity-80">{formatUploadBytes(stats.stored_total_size_bytes)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

 <section className="flex min-h-[calc(100vh-22rem)] flex-1 flex-col rounded-xl border border-theme-border bg-theme-surface p-5">
          <div className="flex flex-col gap-4 border-b border-theme-border pb-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-theme-text-primary">上传记录</h2>
                <p className="mt-1 text-sm font-medium text-theme-text-muted">查看各类测试对象上传批次、容量、状态和落盘路径。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    void Promise.all([loadOverview(), loadRecords()]);
                  }}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary transition hover:border-theme-border hover:text-theme-text-primary"
                >
                  <RefreshCw size={16} className={(loading || overviewLoading) ? 'animate-spin' : ''} />
                  刷新
                </button>
                <button
                  onClick={() => openCreateModal(selectedType === 'all' ? 'document' : selectedType)}
 className="inline-flex items-center gap-2 rounded-lg bg-theme-elevated px-4 py-3 text-sm font-semibold text-white transition hover:bg-theme-elevated"
                >
                  <Plus size={16} />
                  新建上传
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:max-w-sm lg:flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索记录、路径或错误信息"
                  className="form-input w-full pl-11 pr-4"
                />
              </div>
              <select
                value={selectedType}
                onChange={(event) => {
                  setSelectedType(event.target.value as InputType | 'all');
                  setPage(1);
                }}
                className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary outline-none sm:w-auto"
              >
                <option value="all">全部类型</option>
                {INPUT_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>{INPUT_TYPE_META[type].label}</option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => {
                  setSelectedStatus(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary outline-none sm:w-auto"
              >
                <option value="all">全部状态</option>
                <option value="pending">pending</option>
                <option value="processing">processing</option>
                <option value="succeeded">succeeded</option>
                <option value="partial_failed">partial_failed</option>
                <option value="failed">failed</option>
              </select>
            </div>
          </div>

          {!isUploadModalOpen && errorMessage ? (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 flex-1 overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
            <div className="h-full overflow-auto">
              <table className="min-w-full divide-y divide-theme-border">
                <thead className="bg-theme-elevated text-left text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">
                  <tr>
                    <th className="px-4 py-4">类型</th>
                    <th className="px-4 py-4">上传记录</th>
                    <th className="px-4 py-4">批次 / 模式</th>
                    <th className="px-4 py-4">文件 / 容量</th>
                    <th className="px-4 py-4">创建信息</th>
                    <th className="px-4 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border bg-theme-elevated text-sm">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-20 text-center"><Loader2 className="mx-auto animate-spin text-theme-text-muted" size={32} /></td></tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-20 text-center text-theme-text-muted">暂无上传记录</td></tr>
                  ) : filteredRecords.map((record) => {
                    const inputType = normalizeType(record.input_type);
                    const isExpanded = expandedUploadIds.includes(record.upload_id);
                    const detail = uploadDetailCache[record.upload_id];
                    const isDetailLoading = detailLoadingIds.includes(record.upload_id);
                    const detailError = detailErrors[record.upload_id];
                    const batches = detail?.batches || [];
                    return (
                      <React.Fragment key={record.upload_id}>
                        <tr className="cursor-pointer align-top hover:bg-slate-100/80" onClick={() => { void openUploadDetailDialog(record); }}>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${INPUT_TYPE_META[inputType].tone}`}>
                              {INPUT_TYPE_META[inputType].icon}
                              {INPUT_TYPE_META[inputType].label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); void toggleUploadDetail(record.upload_id); }}
                                className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-secondary transition hover:border-theme-border hover:bg-theme-elevated"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? '收起批次历史' : '展开批次历史'}
                              >
                                <ChevronDown size={16} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                              </button>
                              <div className="min-w-0">
                                <div className="font-semibold text-theme-text-primary">{getUploadRecordDisplayName(record)}</div>
                                <div className="mt-1 text-xs font-mono text-theme-text-muted">{record.upload_id}</div>
                                <div className="mt-1 text-xs text-theme-text-muted">{record.source_archive_count} 个源压缩包</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-theme-text-primary">{record.batch_count || (record.latest_batch ? 1 : 0)} 批次</div>
                            <div className="mt-1 text-xs text-theme-text-muted">{getUploadModeLabel(record.keep_original)}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">{getLatestBatchSummary(record)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-theme-text-primary">{record.stored_file_count} 个文件</div>
                            <div className="mt-1 text-xs text-theme-text-muted">{formatUploadBytes(record.stored_total_size_bytes)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-theme-text-primary">{record.created_by || '-'}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">创建 {formatDateTime(record.created_at)}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">完成 {formatDateTime(record.finished_at)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                              {inputType === 'code' ? (
                                <CodemapProgressChip
                                  status={codemapStatusByUpload[record.upload_id] ?? null}
                                  onRebuild={() => { void handleCodemapRebuild(record.upload_id); }}
                                  rebuilding={codemapRebuildingIds.includes(record.upload_id)}
                                  onCorrect={() => { void handleCodemapCorrect(record.upload_id); }}
                                  correcting={codemapCorrectingIds.includes(record.upload_id)}
                                  usable={USABLE_UPLOAD_STATUSES.has(record.status)}
                                  dispatchError={codemapDispatchErrorByUpload[record.upload_id]}
                                  onRetryDispatch={() => { void handleCodemapRetryDispatch(record.upload_id); }}
                                  retrying={codemapRebuildingIds.includes(record.upload_id)}
                                />
                              ) : null}
                              <button onClick={() => { void openUploadDetailDialog(record); }} className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                                <Eye size={14} className="mr-1 inline-block" />
                                详情
                              </button>
                              {canOpenDirectory ? (
                                <button onClick={() => openProjectPath(record.target_path)} className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                                  <HardDrive size={14} className="mr-1 inline-block" />
                                  打开目录
                                </button>
                              ) : null}
                              <button onClick={() => openAppendModal(record)} className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                                <Plus size={14} className="mr-1 inline-block" />
                                追加
                              </button>
                              <button onClick={() => {
                                setSelectedRecordForTask(record.upload_id);
                                setCreateTaskOpen(true);
                              }} className="rounded-xl border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                                <Plus size={14} className="mr-1 inline-block" />
                                创建任务
                              </button>
                              <button onClick={() => setDeleteTarget(record)} className="rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/15">
                                <Trash2 size={14} className="mr-1 inline-block" />
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="bg-slate-50/70">
                            <td colSpan={6} className="px-6 py-5">
                              <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-theme-text-primary">批次历史</div>
                                    <div className="mt-1 text-xs text-theme-text-muted">{record.upload_id} · {batches.length > 0 ?`${batches.length} 个批次` : '暂无批次明细'}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-theme-text-muted">
                                    <span className="rounded-full bg-theme-elevated px-3 py-1">模式：{getUploadModeLabel(record.keep_original)}</span>
                                  </div>
                                </div>

                                {isDetailLoading ? (
                                  <div className="mt-5 rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-sm text-theme-text-muted">
                                    <Loader2 className="mx-auto mb-3 animate-spin text-theme-text-muted" size={24} />
                                    正在加载批次历史...
                                  </div>
                                ) : detailError ? (
                                  <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                                    {detailError}
                                  </div>
                                ) : batches.length === 0 ? (
                                  <div className="mt-5 rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-sm text-theme-text-muted">
                                    该上传记录暂无批次历史。
                                  </div>
                                ) : (
                                  <div className="mt-5 space-y-3">
                                    {batches.map((batch, index) => (
                                      <div key={batch.batch_id} className="rounded-[1.25rem] border border-theme-border bg-theme-surface p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-semibold text-theme-text-primary">批次 #{index + 1}</span>
                                              <StatusBadge status={batch.status} />
                                              <span className="rounded-full bg-theme-elevated px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">{batch.mode}</span>
                                            </div>
                                            <div className="mt-2 text-xs text-theme-text-muted">batch_id: <span className="font-mono text-theme-text-secondary">{batch.batch_id}</span></div>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs font-semibold text-theme-text-muted">
                                            <span className="rounded-full bg-theme-elevated px-3 py-1">提交 {batch.submitted_file_count} 个</span>
                                            <span className="rounded-full bg-theme-elevated px-3 py-1">处理 {batch.processed_file_count} 个</span>
                                            <span className="rounded-full bg-theme-elevated px-3 py-1">{formatUploadBytes(batch.processed_size_bytes)}</span>
                                            <span className="rounded-full bg-theme-elevated px-3 py-1">保留原包：{batch.keep_original ? '是' : '否'}</span>
                                          </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                          <div>
                                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">创建时间</div>
                                            <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(batch.created_at)}</div>
                                          </div>
                                          <div>
                                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">完成时间</div>
                                            <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(batch.finished_at)}</div>
                                          </div>
                                          <div className="md:col-span-2">
                                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">错误摘要</div>
                                            <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{batch.error_summary || '-'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-theme-text-muted">
            <div>共 {total} 条记录</div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-xl border border-theme-border px-3 py-2 disabled:opacity-40"
              >
                上一页
              </button>
              <span>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-xl border border-theme-border px-3 py-2 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </div>

      {detailDialogTarget ? (() => {
        const { uploadId, record } = detailDialogTarget;
        const detail = uploadDetailCache[uploadId];
        const isDetailLoading = detailLoadingIds.includes(uploadId);
        const detailError = detailErrors[uploadId];
        const batches = detail?.batches || [];
        const latestBatch = detail?.latest_batch || record.latest_batch || null;
        return (
          <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-theme-elevated">
              <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
                <div>
                  <div className="text-sm font-medium uppercase tracking-[0.18em] text-theme-text-muted">上传记录详情</div>
                  <div className="mt-2 text-2xl font-bold text-theme-text-primary">{getUploadRecordDisplayName(record)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-theme-elevated px-3 py-1 font-mono text-theme-text-secondary">{record.upload_id}</span>
                    <StatusBadge status={record.status} />
                    {latestBatch ? <span className="rounded-full bg-theme-elevated px-3 py-1 font-semibold text-theme-text-secondary">最新批次：{latestBatch.status}</span> : null}
                    <span className="rounded-full bg-theme-elevated px-3 py-1 font-semibold text-theme-text-secondary">类型：{INPUT_TYPE_META[normalizeType(record.input_type)].label}</span>
                  </div>
                  {/* 仅 code 类型记录:点击启动 codemap_lite serve 并跳转。该上传
                      记录有自己的图;db_name 由 manager 在 task accepted 时生成;
                      queued 阶段还没,按钮置灰。 */}
                  {normalizeType(record.input_type) === 'code' ? (() => {
                    const uploadStatus = codemapStatusByUpload[uploadId] ?? null;
                    return (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!uploadStatus?.db_name || openServeLoading}
                        onClick={() => { void handleOpenServe(uploadId); }}
                        title={!uploadStatus
                          ? '知识图谱任务尚未派发'
                          : !uploadStatus.db_name
                            ? '任务排队中,db_name 未分配'
                            : '在新标签页打开 codemap_lite 知识图谱'}
                        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {openServeLoading
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Network size={14} />}
                        {openServeLoading ? '启动中…' : '打开知识图谱'}
                      </button>
                      {/* 任务尚未派发时,灰按钮旁复用同一 chip 区分「等上传完成 /
                          待派发 / 派发失败·重试」,与行内 chip 一致。 */}
                      {!uploadStatus ? (
                        <CodemapProgressChip
                          status={null}
                          usable={USABLE_UPLOAD_STATUSES.has(record.status)}
                          dispatchError={codemapDispatchErrorByUpload[uploadId]}
                          onRetryDispatch={() => { void handleCodemapRetryDispatch(uploadId); }}
                          retrying={codemapRebuildingIds.includes(uploadId)}
                        />
                      ) : null}
                      {openServeError ? (
                        <span className="text-xs font-semibold text-rose-600">{openServeError}</span>
                      ) : null}
                    </div>
                    );
                  })() : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailDialogTarget(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-theme-border text-theme-text-muted hover:bg-theme-elevated"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto px-6 py-6">
                <div className="space-y-5">
                  <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                    <div className="text-sm font-semibold text-theme-text-primary">基础信息</div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">目标路径</div>
                        <div className="mt-1 break-all text-sm font-mono text-theme-text-secondary">{record.target_path}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">上传模式</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{getUploadModeLabel(record.keep_original)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">创建人</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{record.created_by || '-'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">创建时间</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(record.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">完成时间</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(record.finished_at)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">源压缩包</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{record.source_archive_count}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">落盘文件</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{record.stored_file_count}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">落盘容量</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatUploadBytes(record.stored_total_size_bytes)}</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                    <div className="text-sm font-semibold text-theme-text-primary">批次历史</div>
                    {isDetailLoading ? (
                      <div className="mt-5 rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-sm text-theme-text-muted">
                        <Loader2 className="mx-auto mb-3 animate-spin text-theme-text-muted" size={24} />
                        正在加载批次历史...
                      </div>
                    ) : detailError ? (
                      <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                        {detailError}
                      </div>
                    ) : batches.length === 0 ? (
                      <div className="mt-5 rounded-xl border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-sm text-theme-text-muted">
                        该上传记录暂无批次历史。
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {batches.map((batch, index) => (
                          <div key={batch.batch_id} className="rounded-[1.25rem] border border-theme-border bg-theme-surface p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-theme-text-primary">批次 #{index + 1}</span>
                              <StatusBadge status={batch.status} />
                              <span className="rounded-full bg-theme-elevated px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">{batch.mode}</span>
                            </div>
                            <div className="mt-2 text-xs text-theme-text-muted">batch_id: <span className="font-mono text-theme-text-secondary">{batch.batch_id}</span></div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">提交 / 处理</div>
                                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{batch.submitted_file_count} / {batch.processed_file_count}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">容量</div>
                                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatUploadBytes(batch.processed_size_bytes)}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">创建时间</div>
                                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(batch.created_at)}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">完成时间</div>
                                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(batch.finished_at)}</div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">错误摘要</div>
                                <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{batch.error_summary || '-'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-theme-border px-6 py-5">
                <button type="button" onClick={() => setDetailDialogTarget(null)} className="rounded-lg border border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                  关闭
                </button>
                {canOpenDirectory ? (
                  <button type="button" onClick={() => openProjectPath(record.target_path)} className="rounded-lg bg-theme-elevated px-4 py-3 text-sm font-semibold text-white">
                    打开目录
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <form onSubmit={(event) => {
            event.preventDefault();
            void submitUpload();
 }} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-theme-elevated">
            <div className="border-b border-theme-border px-6 py-5">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-theme-text-muted">{isAppendMode ? '追加上传' : '新建上传'}</div>
              <div className="mt-2 text-2xl font-bold text-theme-text-primary">{INPUT_TYPE_META[activeInputType].label}测试对象</div>
            </div>
            <div className="space-y-5 px-6 py-6">
              {uploadDialogError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400">
                  {uploadDialogError}
                </div>
              ) : null}
              {isAppendMode ? (
                <>
                  <label className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-4 text-sm font-semibold text-theme-text-secondary">
                    <input
                      type="checkbox"
                      checked={keepOriginal}
                      onChange={(event) => setKeepOriginal(event.target.checked)}
                      className="h-4 w-4 rounded border-theme-border"
                    />
                    保留原始文件，不自动解压
                  </label>

                  <div className="rounded-[1.25rem] border border-dashed border-theme-border bg-theme-elevated px-4 py-5 text-center">
 <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-theme-elevated text-theme-text-secondary">
                      <Upload size={22} />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-theme-text-primary">{keepOriginal ? '上传原始文件' : '上传压缩包'}</div>
                    <div className="mt-1 text-xs leading-5 text-theme-text-muted">
                      {keepOriginal
                        ? '当前保留原始文件模式下，支持上传任意文件，一次可选择多个文件。'
                        : '支持`zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz`，一次可选择多个文件。'}
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg bg-theme-elevated px-4 py-3 text-sm font-semibold text-white hover:bg-theme-elevated"
                      >
                        选择文件
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
                        className="hidden"
                        onChange={(event) => addFilesToQueue(event.target.files)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {uploadQueue.length === 0 ? (
                      <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">还没有选择上传文件。</div>
                    ) : uploadQueue.map((item) => (
                      <div key={item.id} className="rounded-xl border border-theme-border px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-theme-text-primary">{item.file.name}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">{formatUploadBytes(item.file.size)} · {formatSpeed(item.speedBytesPerSec)}</div>
                          </div>
                          <div className="text-xs font-semibold text-theme-text-muted">{item.error || item.status}</div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-theme-elevated">
                          <div className={`h-2 rounded-full ${item.status === 'failed' ? 'bg-rose-400' : 'bg-theme-surface'}`} style={{ width: `${item.progress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-theme-text-secondary">上传记录名称</label>
                    <input
                      value={uploadDisplayName}
                      onChange={(event) => setUploadDisplayName(event.target.value)}
                      className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-primary"
                      placeholder="请输入上传记录名称"
                    />
                  </div>

                  <TestInputUploader
                    ref={uploaderRef}
                    projectId={projectId}
                    displayName={uploadDisplayName}
                    compact={false}
                    onUploadStateChange={setIsUploading}
                  />
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-theme-border px-6 py-5">
              <button type="button" onClick={() => setIsUploadModalOpen(false)} className="rounded-lg border border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                取消
              </button>
              <button
                type="button"
                onClick={() => { void submitUpload({ runInBackground: true }); }}
                disabled={isUploading || (isAppendMode ? uploadQueue.length === 0 : !uploadDisplayName.trim())}
                className="rounded-xl border border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-secondary disabled:opacity-50"
              >
                后台运行
              </button>
              <button type="submit" disabled={isUploading || (isAppendMode ? uploadQueue.length === 0 : !uploadDisplayName.trim())} className="rounded-lg bg-theme-elevated px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {isUploading ? <Loader2 size={16} className="mr-2 inline-block animate-spin" /> : null}
                {isAppendMode ? '提交追加上传' : '创建上传记录'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
 <div className="w-full max-w-md rounded-2xl bg-theme-elevated p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                <AlertCircle size={22} />
              </div>
              <div>
                <div className="text-xl font-semibold text-theme-text-primary">删除上传记录</div>
                <div className="mt-2 text-sm leading-6 text-theme-text-muted">将删除记录`{deleteTarget.upload_id}` 以及`{deleteTarget.target_path}` 下的内容，此操作不可恢复。</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-secondary">取消</button>
              <button onClick={() => { void executeDelete(); }} className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white">确认删除</button>
            </div>
          </div>
        </div>
      ) : null}
      <CreateTaskDialog
        open={createTaskOpen}
        onClose={() => { setCreateTaskOpen(false); setSelectedRecordForTask(undefined); }}
        projectId={projectId}
        projectName={projects.find(p => p.id === projectId)?.name || ''}
        preSelectedInputId={selectedRecordForTask}
        onCreated={() => { setCreateTaskOpen(false); setSelectedRecordForTask(undefined); }}
      />
    </div>
  );
};