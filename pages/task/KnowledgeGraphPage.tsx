import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../design-system';
import {
  AlertCircle,
  FolderUp,
  Loader2,
  Network,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { api } from '../../clients/api';
import type { CodemapTaskStatus } from '../../clients/codemapManager';
import {
  IN_PROGRESS_STATUSES,
  STATUS_LABELS,
  USABLE_UPLOAD_STATUSES,
  buildManagerTargetDir,
} from '../../clients/codemapManager';
import type { SecurityProject } from '../../types/types';

interface Props {
  projectId: string;
  projects: SecurityProject[];
}

const POLL_INTERVAL_MS = 3000;

type Phase =
  | 'loading'        // 查上传记录中
  | 'no-upload'      // 没有 code 上传
  | 'upload-pending' // 有 code 上传但还没处理完(文件未落盘)
  | 'starting'       // 已触发构建,正在起 serve
  | 'ready'          // serve 就绪,iframe 展示(构建可能仍在后台进行)
  | 'error';         // 起 serve / 接口异常

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '请求失败';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const KnowledgeGraphPage: React.FC<Props> = ({ projectId, projects }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<CodemapTaskStatus | null>(null);
  const [serveUrl, setServeUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // failed 横幅的"重新构建"按钮:DELETE → setStatus(null) → bootstrap 重派。
  const [rebuilding, setRebuilding] = useState(false);
  // 「图谱为空」横幅:status=completed 但库里 0 函数(target_dir 错位等
  // silent-success 情形)。轮询 serve 的 /api/v1/stats 探测,零节点才显示
  // 「更正代码目录」按钮(走 purge → 重派,用最新有效上传的真实路径)。
  const [emptyGraph, setEmptyGraph] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  // 防止 serve 重复启动。
  const startingServeRef = useRef(false);

  const projectName = useMemo(
    () => projects.find((item) => item.id === projectId)?.name || projectId,
    [projectId, projects],
  );
  // 多图谱:真 product_id(空回退 projectId),manager 据此在该 product 的 active
  // 图里给本次上传找 fork 源。
  const productId = useMemo(
    () => projects.find((item) => item.id === projectId)?.product_id || projectId,
    [projectId, projects],
  );
  // SS5: 身份下沉到「每条上传一图」,前端只持 upload_id(kg- 合成在 client 内部)。
  // 由 bootstrap 选中的最新 code 上传的 upload_id 决定。null = 尚未确定。
  const [uploadId, setUploadId] = useState<string | null>(null);

  // 起 serve → iframe。serve 子进程端口立即绑定,即使库还空着也能起,
  // 图谱随后台 analyze/repair 进度渐进填充。幂等:已在起则跳过。
  const startServe = useCallback(async (dbName: string) => {
    if (startingServeRef.current || !dbName) return;
    startingServeRef.current = true;
    setPhase('starting');
    try {
      const serve = await api.codemapManager.startServe(dbName);
      setServeUrl(`http://${serve.ip}:${serve.port}/static/index.html`);
      setPhase('ready');
    } catch (error) {
      setMessage(errorMessage(error));
      setPhase('error');
    } finally {
      startingServeRef.current = false;
    }
  }, []);

  // 进入页面:查最新 code 上传 → 确保构建已触发(幂等)→ 立即起 serve。
  // 不等 analyze/repair 完成;构建在后台跑,iframe 先展示。
  const bootstrap = useCallback(async () => {
    if (!projectId) return;
    setPhase('loading');
    setMessage(null);
    setServeUrl(null);
    setEmptyGraph(false);
    try {
      const uploads = await api.fileserver.listProjectInputUploads(projectId, {
        inputType: 'code',
        pageSize: 50,
      });
      const items = uploads.items || [];
      if (items.length === 0) {
        setPhase('no-upload');
        return;
      }
      // 取最新一条 code 上传(按创建时间倒序)。该上传的 upload_id 决定本图身份。
      const latest = [...items].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
      setUploadId(latest.upload_id);

      // 查构建状态;404 表示这条上传还没构建过。
      let current: CodemapTaskStatus | null = null;
      try {
        current = await api.codemapManager.getTaskStatus(latest.upload_id);
      } catch (error) {
        if ((error as any)?.status !== 404) throw error;
      }

      // 没构建过 → 触发(幂等)。上传须已落盘,否则 analyze 扫到空目录。
      if (current === null) {
        if (!USABLE_UPLOAD_STATUSES.has(latest.status)) {
          setPhase('upload-pending');
          return;
        }
        const triggered = await api.codemapManager.triggerBuild({
          product_id: productId,
          product_name: projectName,
          target_dir: buildManagerTargetDir(projectId, latest.target_path),
          project_id: projectId,
          upload_id: latest.upload_id,
        });
        current = {
          task_id: triggered.task_id,
          status: triggered.status,
          overall: triggered.overall ?? triggered.status,
          mode: 'full',
          db_name: triggered.db_name,
          error: null,
        };
      }

      setStatus(current);
      if (!current.db_name) {
        setMessage('构建未返回数据库名,无法启动图谱服务。');
        setPhase('error');
        return;
      }
      // 立即起 serve(无论构建是否完成)。
      await startServe(current.db_name);
    } catch (error) {
      setMessage(errorMessage(error));
      setPhase('error');
    }
  }, [projectId, projectName, productId, startServe]);

  // failed 红色横幅旁的"重新构建"按钮:bootstrap 里只在 status===null 时 trigger,
  // 老 failed task 一直存在 → 永远不会重派。先 DELETE 清掉再 bootstrap。
  const handleRebuild = useCallback(async () => {
    if (rebuilding || !uploadId) return;
    setRebuilding(true);
    try {
      await api.codemapManager.deleteBuild(uploadId);
      setStatus(null);
      await bootstrap();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setRebuilding(false);
    }
  }, [uploadId, bootstrap, rebuilding]);

  // 「图谱为空」横幅旁的「更正代码目录」按钮:status=completed 但 0 函数
  // (target_dir 写错时 analyze 静默成功的失败模式)。purge 销毁旧空项目
  // (停 serve、DROP 库、删 manager 工作区目录),然后 bootstrap 重派 ——
  // bootstrap 会重新拉 fileserver 的最新有效上传,用对的 target_dir 重建。
  const handleCorrectPath = useCallback(async () => {
    if (correcting) return;
    setCorrecting(true);
    try {
      const dbName = status?.db_name;
      if (dbName) {
        await api.codemapManager.purgeProject(dbName);
      } else if (uploadId) {
        // 兜底:没有 db_name 也尝试软删,后续 bootstrap 仍能重派。
        await api.codemapManager.deleteBuild(uploadId).catch(() => {});
      }
      setStatus(null);
      setEmptyGraph(false);
      await bootstrap();
    } catch (error) {
      setMessage(errorMessage(error));
      setPhase('error');
    } finally {
      setCorrecting(false);
    }
  }, [status, uploadId, bootstrap, correcting]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // serve 就绪后,只要构建仍在进行就继续轮询状态(驱动顶部进度横幅);
  // 到达终态(completed/failed)即停止。
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    if (!uploadId) return undefined;
    if (status && !IN_PROGRESS_STATUSES.has(status.overall ?? status.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await api.codemapManager.getTaskStatus(uploadId);
        setStatus(next);
        if (!IN_PROGRESS_STATUSES.has(next.overall ?? next.status)) {
          window.clearInterval(timer);
        }
      } catch (error) {
        if ((error as any)?.status === 404) return; // 瞬时,下一拍重试
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase, status, uploadId]);

  // 零节点探测:任务到达终态后拉一次 serve 的 /api/v1/stats,
  // total_functions===0 视为「图谱为空」(target_dir 错位的 silent-success
  // 失败模式)。仅在 ready + 终态时触发,且只跑一次(emptyGraph 已 true 则跳过)。
  useEffect(() => {
    if (phase !== 'ready' || !serveUrl || !status) return;
    if (IN_PROGRESS_STATUSES.has(status.overall ?? status.status)) return;
    if (emptyGraph) return;
    let cancelled = false;
    (async () => {
      try {
        const origin = new URL(serveUrl).origin;
        const resp = await fetch(`${origin}/api/v1/stats`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && data?.total_functions === 0) {
          setEmptyGraph(true);
        }
      } catch {
        // 网络/解析失败不暴露给用户;横幅按现状显示即可。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, serveUrl, status, emptyGraph]);

  if (!projectId) {
    return (
      <CenteredState
        icon={<AlertCircle size={22} />}
        title="未选择项目"
        description="请选择项目后再查看知识图谱。"
      />
    );
  }

  // serve 就绪:全屏 iframe 展示图谱。构建未完时顶部显示非阻塞进度横幅。
  if (phase === 'ready' && serveUrl) {
    // SS4: 整体态读 overall(aggregate_overall);回退 status 兼容旧后端。
    const overall = status?.overall ?? status?.status ?? '';
    const building = overall ? IN_PROGRESS_STATUSES.has(overall) : false;
    const failed = overall === 'failed';
    const progress = status?.progress;
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.completed / progress.total) * 100)
        : null;
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: LK.canvas }}>
        <PageHeader
          title="知识图谱"
          description={projectName}
          actions={
            <button
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              onClick={() => void bootstrap()}
              onMouseEnter={(e) => { e.currentTarget.style.color = LK.primarySoft; e.currentTarget.style.borderColor = LK.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
            >
              <RefreshCw size={14} />刷新
            </button>
          }
        />
        {building ? (
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: `${LK.info}14`, color: LK.info }}>
            <Loader2 size={14} className="animate-spin" />
            <span>
              图谱构建中 · {STATUS_LABELS[overall] || '处理中'}
              {overall === 'building_attack_surface' && (status?.attack?.entries ?? 0) > 0
                ? ` · 已识别 ${status?.attack?.entries} 入口`
                : ''}
              {pct !== null ?` · ${progress?.completed}/${progress?.total}（${pct}%）` : ''}
              ，结果会持续补全，可刷新查看最新。
            </span>
          </div>
        ) : failed ? (
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: `${LK.error}14`, color: LK.error }}>
            <XCircle size={14} />
            <span className="flex-1">{status?.error || '构建部分失败'}，图谱可能不完整。</span>
            <button
              type="button"
              onClick={() => void handleRebuild()}
              disabled={rebuilding}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: LK.error, color: LK.error, backgroundColor: 'transparent' }}
            >
              <RefreshCw size={12} />
              {rebuilding ? '重派中…' : '重新构建'}
            </button>
          </div>
        ) : emptyGraph ? (
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: `${LK.warning}14`, color: LK.warning }}>
            <AlertCircle size={14} />
            <span className="flex-1">
              图谱为空 —— 代码目录可能未对齐已上传文件，点击「更正代码目录」用最新有效上传重新构建。
            </span>
            <button
              type="button"
              onClick={() => void handleCorrectPath()}
              disabled={correcting}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: LK.warning, color: LK.warning, backgroundColor: 'transparent' }}
            >
              <RefreshCw size={12} />
              {correcting ? '更正中…' : '更正代码目录'}
            </button>
          </div>
        ) : null}
        <iframe
          title="codemap-knowledge-graph"
          src={serveUrl}
          className="min-h-0 flex-1 border-0"
          style={{ backgroundColor: LK.canvas }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full px-5 py-5" style={{ backgroundColor: LK.canvas }}>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="知识图谱" description={projectName} />
        <PhaseCard
          phase={phase}
          message={message}
          onRetry={() => void bootstrap()}
        />
      </div>
    </div>
  );
};

const CenteredState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex min-h-full items-center justify-center px-5 py-5" style={{ backgroundColor: LK.canvas }}>
    <div className="w-full max-w-md rounded-xl border border-dashed px-6 py-10 text-center" style={{ backgroundColor: LK.surface, borderColor: LK.border }}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[10px]" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold" style={{ color: LK.ink }}>{title}</div>
      <div className="mt-2 text-sm leading-6" style={{ color: LK.body }}>{description}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  </div>
);

const PhaseCard: React.FC<{
  phase: Phase;
  message: string | null;
  onRetry: () => void;
}> = ({ phase, message, onRetry }) => {
  const retryButton = (
    <button
      className="btn-primary inline-flex items-center gap-1.5 text-sm font-medium"
      onClick={onRetry}
    >
      <RefreshCw size={15} />
      重试
    </button>
  );

  if (phase === 'loading') {
    return (
      <CenteredCardInner
        icon={<Loader2 size={22} className="animate-spin" />}
        title="正在加载"
        description="正在检查代码与构建状态…"
      />
    );
  }

  if (phase === 'no-upload') {
    return (
      <CenteredCardInner
        icon={<FolderUp size={22} />}
        title="还未上传代码"
        description="请先在「任务输入」中上传代码(当前仅支持 C/C++),上传后回到本页即可查看知识图谱。"
      />
    );
  }

  if (phase === 'upload-pending') {
    return (
      <CenteredCardInner
        icon={<Loader2 size={22} className="animate-spin" />}
        title="代码处理中"
        description="上传的代码还在解压/入库,稍候片刻再点击重试即可打开图谱。"
        action={retryButton}
      />
    );
  }

  if (phase === 'starting') {
    return (
      <CenteredCardInner
        icon={<Loader2 size={22} className="animate-spin" style={{ color: LK.primary }} />}
        title="正在打开图谱"
        description="正在启动图谱服务,马上就好…"
      />
    );
  }

  // error
  return (
    <CenteredCardInner
      icon={<AlertCircle size={22} style={{ color: LK.error }} />}
      title="加载失败"
      description={message || '无法连接知识图谱服务,请稍后重试。'}
      action={retryButton}
    />
  );
};

const CenteredCardInner: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="rounded-xl px-6 py-10 text-center" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[10px]" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
      {icon}
    </div>
    <div className="mt-4 text-base font-semibold" style={{ color: LK.ink }}>{title}</div>
    <div className="mt-2 text-sm leading-6" style={{ color: LK.body }}>{description}</div>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);