import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { SecurityProject } from '../../types/types';

interface Props {
  projectId: string;
  projects: SecurityProject[];
}

// 知识图谱构建是项目维度、幂等的:固定 task_id = kg-<projectId>,product_id=projectId
// → manager 算出的 db_name 不变 → 一个项目始终一张图(重新上传更新图依赖后续的增量分析)。
const buildTaskId = (projectId: string) =>`kg-${projectId}`;

// manager 读取代码的文件系统根。manager 挂载了平台 fileserver 的共享卷到 /data,
// 上传代码物理路径是 /data/files/<projectId>/<target_path>;而 fileserver API 返回的
// target_path 只是 /user_input/code/<id>(缺前缀)。这里补全成 manager 视角的绝对路径。
const MANAGER_SOURCE_ROOT = '/data/files';
const buildTargetDir = (projectId: string, targetPath: string) =>`${MANAGER_SOURCE_ROOT}/${projectId}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;

// 构建仍在进行的状态(manager FSM)。completed/failed 为终态。
const IN_PROGRESS_STATUSES = new Set(['queued', 'accepted', 'building_analyze', 'building_repair']);
const POLL_INTERVAL_MS = 3000;
// fileserver 上传记录里“文件已落盘、可被 analyze 扫描”的状态。
const USABLE_UPLOAD_STATUSES = new Set(['succeeded', 'partial_failed']);

type Phase =
  | 'loading'        // 查上传记录中
  | 'no-upload'      // 没有 code 上传
  | 'upload-pending' // 有 code 上传但还没处理完(文件未落盘)
  | 'starting'       // 已触发构建,正在起 serve
  | 'ready'          // serve 就绪,iframe 展示(构建可能仍在后台进行)
  | 'error';         // 起 serve / 接口异常

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  accepted: '已受理',
  building_analyze: '解析代码中',
  building_repair: '补全调用关系中',
  completed: '已完成',
  failed: '构建失败',
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '请求失败';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
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
  // 防止 serve 重复启动。
  const startingServeRef = useRef(false);

  const projectName = useMemo(
    () => projects.find((item) => item.id === projectId)?.name || projectId,
    [projectId, projects],
  );
  const taskId = useMemo(() => buildTaskId(projectId), [projectId]);

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
      // 取最新一条 code 上传(按创建时间倒序)。
      const latest = [...items].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];

      // 查构建状态;404 表示这个项目还没构建过。
      let current: CodemapTaskStatus | null = null;
      try {
        current = await api.codemapManager.getTaskStatus(taskId);
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
          task_id: taskId,
          product_id: projectId,
          product_name: projectName,
          target_dir: buildTargetDir(projectId, latest.target_path),
        });
        current = {
          task_id: triggered.task_id,
          status: triggered.status,
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
  }, [projectId, projectName, taskId, startServe]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // serve 就绪后,只要构建仍在进行就继续轮询状态(驱动顶部进度横幅);
  // 到达终态(completed/failed)即停止。
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    if (status && !IN_PROGRESS_STATUSES.has(status.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await api.codemapManager.getTaskStatus(taskId);
        setStatus(next);
        if (!IN_PROGRESS_STATUSES.has(next.status)) {
          window.clearInterval(timer);
        }
      } catch (error) {
        if ((error as any)?.status === 404) return; // 瞬时,下一拍重试
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase, status, taskId]);

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
    const building = status ? IN_PROGRESS_STATUSES.has(status.status) : false;
    const failed = status?.status === 'failed';
    const progress = status?.progress;
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.completed / progress.total) * 100)
        : null;
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: LK.canvas }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surface }}>
          <div className="flex items-center gap-2">
            <Network size={18} style={{ color: LK.primary }} />
            <h1 className="text-base font-semibold" style={{ color: LK.ink }}>知识图谱</h1>
            <span className="text-sm" style={{ color: LK.muted }}>{projectName}</span>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
            onClick={() => void bootstrap()}
            onMouseEnter={(e) => { e.currentTarget.style.color = LK.primarySoft; e.currentTarget.style.borderColor = LK.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
        {building ? (
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: `${LK.info}14`, color: LK.info }}>
            <Loader2 size={14} className="animate-spin" />
            <span>
              图谱构建中 · {STATUS_LABELS[status?.status || ''] || '处理中'}
              {pct !== null ?` · ${progress?.completed}/${progress?.total}（${pct}%）` : ''}
              ，结果会持续补全，可刷新查看最新。
            </span>
          </div>
        ) : failed ? (
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: `${LK.error}14`, color: LK.error }}>
            <XCircle size={14} />
            <span>{status?.error || '构建部分失败'}，图谱可能不完整。</span>
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
        <div className="mb-5 flex items-center gap-2 pb-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
          <Network size={20} style={{ color: LK.primary }} />
          <h1 className="text-2xl font-semibold" style={{ color: LK.ink }}>知识图谱</h1>
          <span className="text-sm" style={{ color: LK.muted }}>{projectName}</span>
        </div>
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
      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      style={{ backgroundColor: LK.primary, color: '#ffffff' }}
      onClick={onRetry}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
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

