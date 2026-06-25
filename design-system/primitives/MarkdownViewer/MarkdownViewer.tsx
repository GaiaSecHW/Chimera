import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

import { cx } from '../../utils/cx';

export interface MarkdownViewerProps {
  /** Markdown 原文。null/undefined/纯空白 时显示 emptyText。 */
  content?: string | null;
  /** 空态文案，默认"暂无内容"。 */
  emptyText?: string;
  /** 追加到最外层容器的 className。 */
  className?: string;
}

/**
 * 只读 Markdown 渲染组件。
 * - 启用 rehype-sanitize（默认 schema），过滤来自外部来源的危险 HTML/脚本。
 * - 使用 theme token Tailwind 类，与设计系统其它组件配色一致。
 * - 不提供编辑/预览切换。
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  emptyText = '暂无内容',
  className,
}) => {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    return (
      <div className={cx('rounded-lg px-3 py-4 text-sm text-theme-text-secondary', className)}>
        {emptyText}
      </div>
    );
  }
  return (
    <div className={cx('markdown-body break-words leading-6 text-sm text-theme-text-secondary', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-400 underline decoration-cyan-300 underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold text-theme-text-primary last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold text-theme-text-primary last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-base font-semibold text-theme-text-primary last:mb-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 text-sm font-semibold text-theme-text-primary last:mb-0">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-theme-border bg-theme-elevated px-4 py-2 italic text-theme-text-secondary last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-theme-elevated">{children}</thead>,
          th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-semibold text-theme-text-primary">{children}</th>,
          td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top">{children}</td>,
          code: ({ children, className: codeClassName }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 font-mono text-xs text-theme-text-primary">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
