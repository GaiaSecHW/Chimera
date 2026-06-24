import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../design-system';
import { ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { reportSanitizeSchema } from '../redline/components/reportMarkdownSanitize';
import { fileserverApi } from '../../clients/fileserver';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

/* ── Theme tokens (matching TaskVulnListPage LK style) ── */
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  error: '#f15d5d',
} as const;

/* ── TOC extraction ── */
interface TocItem {
  level: number;
  text: string;
  id: string;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w一-鿿\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const extractToc = (markdown: string): TocItem[] => {
  const results: TocItem[] = [];
  const seen = new Map<string, number>();
  const regex = /^(#{1,4})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    let id = slugify(text);
    const count = seen.get(id) || 0;
    if (count > 0) id = `${id}-${count}`;
    seen.set(id, count + 1);
    results.push({ level, text, id });
  }
  return results;
};

/* ── Markdown custom components ── */
const buildMdComponents = (toc: TocItem[]): Components => {
  const makeHeading = (level: number) => {
    const Component: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
      const text = String(
        React.Children.toArray(children)
          .map((c) => (typeof c === 'string' ? c : ''))
          .join('')
      ).trim();
      const item = toc.find((t) => t.level === level && t.text === text);
      const id = item?.id || slugify(text);
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      const sizeClass =
        level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
      return (
        <Tag id={id} className={`mb-3 ${sizeClass} font-bold text-theme-text-primary last:mb-0 scroll-mt-4`}>
          {children}
        </Tag>
      );
    };
    return Component;
  };

  return {
    h1: makeHeading(1),
    h2: makeHeading(2),
    h3: makeHeading(3),
    h4: makeHeading(4),
    p: ({ children }) => <p className="mb-3 last:mb-0 text-theme-text-primary">{children}</p>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-400 underline">
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-4 border-slate-500 bg-theme-surface px-4 py-2 italic text-theme-text-secondary last:mb-0">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="min-w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-theme-surface">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-theme-border px-3 py-2 font-bold text-theme-text-primary">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-theme-border px-3 py-2 align-top text-theme-text-primary">{children}</td>
    ),
    code: ({ children, className }) =>
      className ? (
        <code className="block overflow-x-auto rounded-lg border border-theme-border bg-theme-elevated px-4 py-3 font-mono text-xs text-theme-text-primary">
          {children}
        </code>
      ) : (
        <code className="rounded bg-theme-surface px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">
          {children}
        </code>
      ),
    pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
    hr: () => <hr className="my-4 border-theme-border" />,
    img: ({ src, alt }) => (
      <img src={src} alt={alt || ''} className="max-w-full rounded-lg my-3" style={{ maxHeight: 600 }} />
    ),
  };
};

/* ── Main Component ── */
export const TaskReportViewPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [activeTocId, setActiveTocId] = useState('');

  const toc = useMemo(() => extractToc(markdown), [markdown]);
  const mdComponents = useMemo(() => buildMdComponents(toc), [toc]);

  const loadReport = useCallback(async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError('');
    try {
      const dirPath = `/tasks/${taskId}/output`;
      const children = await fileserverApi.getProjectFilesystemChildren(projectId, dirPath);
      const mdFile = children.files.find((f) => f.name.endsWith('.md'));
      if (!mdFile) {
        setMarkdown('');
        setError('');
        setLoading(false);
        return;
      }
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, mdFile.path);
      const text = await blob.text();
      setMarkdown(text);
    } catch (err: any) {
      const status = err?.status as number | undefined;
      const code = err?.code as string | undefined;
      // 目录/文件不存在(404 NOT_FOUND)、路径非目录/目录不支持预览(400 VALIDATION_ERROR)
      // 均视为报告尚未生成，展示"暂无报告"而非错误信息
      if (
        status === 404 ||
        status === 400 ||
        code === 'NOT_FOUND' ||
        code === 'VALIDATION_ERROR'
      ) {
        setMarkdown('');
        setError('');
      } else {
        setError(err?.message || '加载报告失败');
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const scrollToSection = (id: string) => {
    setActiveTocId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  /* ── Render ── */
  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <div className="px-5 py-5 md:px-6 2xl:px-8">
        <PageHeader
          title="任务报告"
          description={
            <span className="font-mono text-xs" style={{ color: LK.muted }}>
              task_id: {taskId || '—'}
            </span>
          }
          back={{ label: '返回', onClick: onBack }}
          actions={
            <button
              onClick={() => void loadReport()}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = LK.primary;
                e.currentTarget.style.color = LK.primarySoft;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = LK.border;
                e.currentTarget.style.color = LK.inkSoft;
              }}
            >
              <RefreshCw size={15} /> 刷新
            </button>
          }
        />
      </div>

      {/* Error banner */}
      {error ? (
        <div
          className="mx-5 md:mx-6 2xl:mx-8 mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
        >
          {error}
          <button
            onClick={() => void loadReport()}
            className="ml-3 underline"
          >
            重试
          </button>
        </div>
      ) : null}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden mx-5 md:mx-6 2xl:mx-8 mb-5 rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        {/* TOC sidebar */}
        {!tocCollapsed && toc.length > 0 ? (
          <nav
            className="flex-shrink-0 border-r overflow-y-auto py-4 px-2"
            style={{ width: 192, borderColor: LK.border }}
          >
            <div className="flex items-center justify-between px-3 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LK.mutedSoft }}>
                目录
              </div>
              <button
                onClick={() => setTocCollapsed(true)}
                className="p-0.5 rounded hover:bg-white/5"
                title="收起目录"
              >
                <ChevronLeft size={14} style={{ color: LK.muted }} />
              </button>
            </div>
            {toc.map((item) => (
              <div
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="py-1.5 text-xs rounded-lg cursor-pointer truncate transition-colors"
                style={{
                  paddingLeft: item.level === 1 ? 12 : item.level === 2 ? 24 : item.level === 3 ? 36 : 48,
                  paddingRight: 12,
                  backgroundColor: activeTocId === item.id ? LK.primaryMuted : 'transparent',
                  color: activeTocId === item.id ? LK.primary : LK.body,
                }}
                onMouseEnter={(e) => {
                  if (activeTocId !== item.id) e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                }}
                onMouseLeave={(e) => {
                  if (activeTocId !== item.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={item.text}
              >
                {item.text}
              </div>
            ))}
          </nav>
        ) : toc.length > 0 ? (
          <div className="flex-shrink-0 border-r py-4 px-1" style={{ borderColor: LK.border }}>
            <button
              onClick={() => setTocCollapsed(false)}
              className="p-1.5 rounded hover:bg-white/5"
              title="展开目录"
            >
              <ChevronRight size={14} style={{ color: LK.muted }} />
            </button>
          </div>
        ) : null}

        {/* Markdown content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20" style={{ color: LK.muted }}>
              <Loader2 size={20} className="animate-spin mr-2" />
              加载报告中...
            </div>
          ) : !markdown && !error ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: LK.muted }}>
              <FileText size={40} className="mb-3 opacity-40" />
              <div className="text-sm">暂无报告</div>
              <div className="text-xs mt-1">任务完成后报告将在此展示</div>
            </div>
          ) : markdown ? (
            <div className="break-words leading-7 max-w-none prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, [rehypeSanitize, reportSanitizeSchema]]}
                components={mdComponents}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
