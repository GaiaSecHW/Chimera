import React, { useMemo } from 'react';

/**
 * Gitea-style unified diff 渲染器。
 *
 * 输入是 `git diff` / GitHub 兼容的 unified diff 文本(可能包含多个文件 / 多个 hunk),
 * 解析后按文件分卡渲染:
 *   - 文件头:展示路径 + add/del 数量
 *   - hunk header (`@@ -a,b +c,d @@ ...`) 蓝灰背景独占一行
 *   - 每行 4 列:[oldLineNo | newLineNo | sign(+/-/空) | code],add 绿底 / del 红底 / 上下文中性
 *
 * 不依赖第三方 diff 库;仅做语法层渲染,不做语义高亮。
 */

type LineKind = 'add' | 'del' | 'ctx' | 'hunk' | 'meta';

interface DiffLine {
  kind: LineKind;
  oldLineNo: number | null;
  newLineNo: number | null;
  /** kind=hunk 时,完整 hunk header(含 @@ 前后) */
  /** 其它 kind 是去掉首字符标记后的 code 内容 */
  text: string;
}

interface DiffFile {
  /** 优先 b 路径(post-diff),无则 a 路径,再无则 'unknown' */
  path: string;
  oldPath?: string;
  newPath?: string;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  isBinary: boolean;
  addCount: number;
  delCount: number;
  lines: DiffLine[];
}

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

/** 把 'a/path/to/file' 或 'b/path/to/file' 还原成纯路径(去掉首段 a/ 或 b/)*/
function stripDiffPrefix(p: string): string {
  if (!p) return p;
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

export function parseUnifiedDiff(raw: string): DiffFile[] {
  if (!raw) return [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let oldLn = 0;
  let newLn = 0;
  let inHunk = false;

  const flushFileFromMinus = (l: string) => {
    // '--- a/foo' 或 '--- /dev/null'
    const p = l.slice(4).trim();
    if (cur) cur.oldPath = p === '/dev/null' ? undefined : stripDiffPrefix(p);
    if (cur && p === '/dev/null') cur.isNew = true;
  };
  const flushFileFromPlus = (l: string) => {
    const p = l.slice(4).trim();
    if (cur) cur.newPath = p === '/dev/null' ? undefined : stripDiffPrefix(p);
    if (cur && p === '/dev/null') cur.isDeleted = true;
    if (cur) {
      cur.path = cur.newPath || cur.oldPath || cur.path || 'unknown';
      cur.isRename = !!(cur.oldPath && cur.newPath && cur.oldPath !== cur.newPath);
    }
  };

  for (const l of lines) {
    // 'diff --git a/foo b/foo' 开新文件
    if (l.startsWith('diff --git ')) {
      // 尝试从 git header 直接提取路径(兜底)
      const m = l.match(/^diff --git\s+(\S+)\s+(\S+)$/);
      cur = {
        path: m ? stripDiffPrefix(m[2]) : 'unknown',
        oldPath: m ? stripDiffPrefix(m[1]) : undefined,
        newPath: m ? stripDiffPrefix(m[2]) : undefined,
        isNew: false,
        isDeleted: false,
        isRename: false,
        isBinary: false,
        addCount: 0,
        delCount: 0,
        lines: [],
      };
      files.push(cur);
      inHunk = false;
      continue;
    }

    // 没有 git header 但直接走 ---/+++ 的极简 diff,首次见到 --- 时也开新文件
    if (l.startsWith('--- ') && !inHunk) {
      if (!cur || cur.lines.length > 0 || cur.addCount + cur.delCount > 0) {
        cur = {
          path: 'unknown',
          oldPath: undefined,
          newPath: undefined,
          isNew: false,
          isDeleted: false,
          isRename: false,
          isBinary: false,
          addCount: 0,
          delCount: 0,
          lines: [],
        };
        files.push(cur);
      }
      flushFileFromMinus(l);
      continue;
    }
    if (l.startsWith('+++ ') && !inHunk) {
      flushFileFromPlus(l);
      continue;
    }

    // 二进制文件提示
    if (cur && /^Binary files .* differ$/.test(l)) {
      cur.isBinary = true;
      continue;
    }

    // hunk header 之外的 git extended header(index xxx, similarity, rename from/to 等),作为 meta 行
    if (cur && !inHunk && !l.startsWith('@@') &&
        (l.startsWith('index ') || l.startsWith('similarity ') ||
         l.startsWith('rename ') || l.startsWith('new file ') ||
         l.startsWith('deleted file ') || l.startsWith('old mode ') ||
         l.startsWith('new mode '))) {
      if (l.startsWith('rename from ')) cur.oldPath = l.slice('rename from '.length);
      if (l.startsWith('rename to ')) {
        cur.newPath = l.slice('rename to '.length);
        cur.path = cur.newPath;
      }
      if (l.startsWith('new file ')) cur.isNew = true;
      if (l.startsWith('deleted file ')) cur.isDeleted = true;
      continue;
    }

    // hunk header
    const hm = l.match(HUNK_HEADER_RE);
    if (hm && cur) {
      oldLn = parseInt(hm[1], 10);
      newLn = parseInt(hm[3], 10);
      inHunk = true;
      cur.lines.push({ kind: 'hunk', oldLineNo: null, newLineNo: null, text: l });
      continue;
    }

    if (!cur || !inHunk) continue;

    // 行内容
    if (l.startsWith('+') && !l.startsWith('+++')) {
      cur.lines.push({ kind: 'add', oldLineNo: null, newLineNo: newLn, text: l.slice(1) });
      cur.addCount++;
      newLn++;
    } else if (l.startsWith('-') && !l.startsWith('---')) {
      cur.lines.push({ kind: 'del', oldLineNo: oldLn, newLineNo: null, text: l.slice(1) });
      cur.delCount++;
      oldLn++;
    } else if (l.startsWith(' ')) {
      cur.lines.push({ kind: 'ctx', oldLineNo: oldLn, newLineNo: newLn, text: l.slice(1) });
      oldLn++;
      newLn++;
    } else if (l === '\\ No newline at end of file') {
      cur.lines.push({ kind: 'meta', oldLineNo: null, newLineNo: null, text: l });
    }
    // 其它无前缀行忽略(防御性)
  }

  return files;
}

/* ===================== 渲染 ===================== */

interface DiffViewProps {
  /** 原始 unified diff 文本 */
  raw: string;
  /** 等宽字体大小,默认 12px */
  fontSize?: number;
}

export const DiffView: React.FC<DiffViewProps> = ({ raw, fontSize = 12 }) => {
  const files = useMemo(() => parseUnifiedDiff(raw), [raw]);

  if (files.length === 0) {
    return (
      <pre className="px-3 py-2 text-[11px] font-mono text-theme-text-faint whitespace-pre-wrap">
        {raw || '(空 diff)'}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((f, i) => (
        <DiffFileCard key={`${f.path}-${i}`} file={f} fontSize={fontSize} />
      ))}
    </div>
  );
};

const DiffFileCard: React.FC<{ file: DiffFile; fontSize: number }> = ({ file, fontSize }) => {
  const tag = file.isNew
    ? { label: 'new file', cls: 'bg-emerald-500/15 text-emerald-700' }
    : file.isDeleted
    ? { label: 'deleted', cls: 'bg-red-500/15 text-red-700' }
    : file.isRename
    ? { label: 'renamed', cls: 'bg-blue-500/15 text-blue-700' }
    : null;

  return (
    <div className="rounded-lg border border-theme-border bg-theme-surface overflow-hidden">
      {/* 文件头 */}
      <div className="flex items-center gap-3 px-3 py-2 bg-theme-bg-elevated/50 border-b border-theme-border">
        <span className="font-mono text-xs text-theme-text-primary truncate flex-1" title={file.path}>
          {file.isRename && file.oldPath && file.oldPath !== file.path
            ? `${file.oldPath} → ${file.path}`
            : file.path}
        </span>
        {tag && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${tag.cls}`}>
            {tag.label}
          </span>
        )}
        <span className="text-[11px] font-mono whitespace-nowrap">
          <span className="text-emerald-700">+{file.addCount}</span>
          <span className="mx-1 text-theme-text-faint">/</span>
          <span className="text-red-700">-{file.delCount}</span>
        </span>
      </div>

      {/* 二进制兜底 */}
      {file.isBinary ? (
        <div className="px-3 py-3 text-xs text-theme-text-faint">二进制文件,内容已省略</div>
      ) : file.lines.length === 0 ? (
        <div className="px-3 py-3 text-xs text-theme-text-faint">该文件无可显示的 diff 行</div>
      ) : (
        <div className="overflow-x-auto max-h-[60vh]">
          <table
            className="w-full font-mono border-collapse"
            style={{ fontSize, lineHeight: 1.5 }}
          >
            <tbody>
              {file.lines.map((ln, idx) => (
                <DiffRow key={idx} line={ln} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const DiffRow: React.FC<{ line: DiffLine }> = ({ line }) => {
  if (line.kind === 'hunk') {
    return (
      <tr className="bg-blue-500/10">
        <td colSpan={4} className="px-3 py-1 text-[11px] text-blue-700/90 select-text whitespace-pre">
          {line.text}
        </td>
      </tr>
    );
  }
  if (line.kind === 'meta') {
    return (
      <tr className="bg-theme-bg-elevated/40">
        <td colSpan={4} className="px-3 py-0.5 text-[10px] text-theme-text-faint italic whitespace-pre">
          {line.text}
        </td>
      </tr>
    );
  }

  // add / del / ctx
  const rowCls =
    line.kind === 'add'
      ? 'bg-emerald-500/10'
      : line.kind === 'del'
      ? 'bg-red-500/10'
      : 'hover:bg-theme-bg-elevated/30';
  const sign =
    line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
  const signCls =
    line.kind === 'add'
      ? 'text-emerald-700'
      : line.kind === 'del'
      ? 'text-red-700'
      : 'text-theme-text-faint';
  const codeCls =
    line.kind === 'add'
      ? 'text-emerald-900/90'
      : line.kind === 'del'
      ? 'text-red-900/90'
      : 'text-theme-text-secondary';

  return (
    <tr className={rowCls}>
      <td className="px-2 text-right text-theme-text-faint select-none w-[3.25rem] min-w-[3.25rem] border-r border-theme-border/60">
        {line.oldLineNo ?? ''}
      </td>
      <td className="px-2 text-right text-theme-text-faint select-none w-[3.25rem] min-w-[3.25rem] border-r border-theme-border/60">
        {line.newLineNo ?? ''}
      </td>
      <td className={`px-2 select-none w-[1.25rem] min-w-[1.25rem] text-center ${signCls}`}>
        {sign}
      </td>
      <td className={`px-2 whitespace-pre ${codeCls}`}>{line.text || ' '}</td>
    </tr>
  );
};
