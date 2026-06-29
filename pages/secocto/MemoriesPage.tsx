import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Search, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoMemory, SecOctoPagerState, SecOctoNavKey } from '../../types/secocto';
import { SecOctoPager } from './shared/Pager';
import { splitKeywords, splitSources } from './shared/format';
import {
  getInitialResponsivePageSize,
  useResponsivePageSize,
  type ResponsivePageSizeConfig,
} from './shared/useResponsivePageSize';

interface Props {
  onNavigate: (navKey: SecOctoNavKey) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

// 与"技能进化"页同口径:
//   - 网格 1024 以下按 sm/md 退,1920 之前一律 3 列(笔记本/常见外屏),>=1920 才 4 列
//   - 分页:小屏默认 12(3×4),大屏默认 16(4×4),选项 [12,16,24,48]
const CARDS_PAGE_SIZE_OPTIONS = [12, 16, 24, 48];
const CARDS_PAGE_SIZE_CONFIG: ResponsivePageSizeConfig = {
  breakpoints: [
    // 与下方 grid 的 min-[1920px]:grid-cols-4 完全同断点
    { query: '(min-width: 1920px)', size: 16 },
  ],
  fallback: 12,
};

export const SecOctoMemoriesPage: React.FC<Props> = ({ onNavigate }) => {
  const [items, setItems] = useState<SecOctoMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // appliedSearch 是真正发请求用的关键字;input → debounce → appliedSearch
  const [appliedSearch, setAppliedSearch] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>(() => ({
    page: 1,
    size: getInitialResponsivePageSize(CARDS_PAGE_SIZE_CONFIG),
  }));
  const [userPickedSize, setUserPickedSize] = useState(false);
  const responsiveSize = useResponsivePageSize(CARDS_PAGE_SIZE_CONFIG);

  // 视口跨断点时自动跟随;用户从下拉手动选过 size 就锁住,与"技能进化"页一致。
  // 切 size 时按"原首条仍可见"重算 page。
  useEffect(() => {
    if (userPickedSize) return;
    setPager((prev) => {
      if (prev.size === responsiveSize) return prev;
      const firstItemIndex = (prev.page - 1) * prev.size;
      const nextPage = Math.floor(firstItemIndex / responsiveSize) + 1;
      return { page: Math.max(1, nextPage), size: responsiveSize };
    });
  }, [responsiveSize, userPickedSize]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [modalItem, setModalItem] = useState<SecOctoMemory | null>(null);
  const [modalMd, setModalMd] = useState<string | null>(null);
  const [modalMdLoading, setModalMdLoading] = useState(false);

  // 自增 seq,丢弃过时响应(用户快速翻页/搜索时常见)
  const fetchSeqRef = useRef(0);
  // modal 拉 wiki 也有自己的 seq,用户来回点不同卡片时避免老响应覆盖新卡
  const modalSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const offset = (pager.page - 1) * pager.size;
      const resp = await secoctoClients.memories.list({ title: appliedSearch, limit: pager.size, offset });
      if (seq !== fetchSeqRef.current) return;
      setItems(resp.items);
      setTotal(resp.total);
      const maxPage = Math.max(1, Math.ceil(resp.total / pager.size));
      if (pager.page > maxPage) {
        setPager((prev) => ({ ...prev, page: maxPage }));
      }
    } catch (e: any) {
      if (seq !== fetchSeqRef.current) return;
      // UI 不再展示原始错误信息(避免显示"Unknown error"),控制台保留以便排查。
      console.warn('[cards] load failed:', e);
      setError(e?.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [pager.page, pager.size, appliedSearch]);

  const loadPending = useCallback(async () => {
    try {
      const data = await secoctoClients.memories.status();
      setPendingCount(data.raw_pending ?? null);
    } catch {
      setPendingCount(null);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void loadPending(); }, [loadPending]);

  // 输入 debounce 250ms 自动触发搜索(对齐 secocto-ui memories.js bindMemoriesEvents)
  useEffect(() => {
    const next = search.trim();
    if (next === appliedSearch) return;
    const tid = window.setTimeout(() => {
      setAppliedSearch(next);
      setPager((prev) => ({ ...prev, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(tid);
  }, [search, appliedSearch]);

  // 拉 modal 的 markdown 详情(frontmatter 已在 client 里剥掉,UI 不再处理)
  useEffect(() => {
    if (!modalItem?.fastpath) {
      setModalMd(null);
      return;
    }
    const seq = ++modalSeqRef.current;
    setModalMdLoading(true);
    setModalMd(null);
    secoctoClients.wiki
      .fetchMd(modalItem.fastpath)
      .then((md) => { if (seq === modalSeqRef.current) setModalMd(md); })
      .catch(() => { if (seq === modalSeqRef.current) setModalMd(null); })
      .finally(() => { if (seq === modalSeqRef.current) setModalMdLoading(false); });
  }, [modalItem?.id, modalItem?.fastpath]);

  // Modal 打开时锁定 body 滚动,关闭时恢复;ESC 关闭
  useEffect(() => {
    if (!modalItem) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [modalItem]);

  const handlePageChange = useCallback((page: number) => {
    setPager((prev) => ({ ...prev, page }));
  }, []);

  const handleSizeChange = useCallback((size: number) => {
    setUserPickedSize(true);
    setPager({ page: 1, size });
  }, []);

  const openModal = useCallback((item: SecOctoMemory) => setModalItem(item), []);
  const closeModal = useCallback(() => setModalItem(null), []);

  const keywords = useMemo(() => splitKeywords(modalItem?.keywords), [modalItem?.keywords]);
  const sources = useMemo(() => splitSources(modalItem?.sources), [modalItem?.sources]);

  const visibleItems = useMemo(() => {
    if (loading && items.length === 0) return [];
    return items;
  }, [loading, items]);

  return (
    <div className="px-6 lg:px-8 xl:px-10 pt-6 pb-12 animate-in fade-in duration-300">
      {/* 与 secocto-ui 对齐的页头 */}
      <div className="flex items-end justify-between gap-3 flex-wrap pb-5">
        <div>
          <h1 className="text-2xl font-bold mb-1 text-theme-text-primary">
            进化
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">记忆库</span>
          </h1>
          <p className="text-sm text-theme-text-secondary">
            Agent 进化过程中沉淀的安全知识 · 共 {total} 张记忆卡片
            {pendingCount != null && (
              <>
                {' '}·{' '}
                <span className={pendingCount > 0 ? 'text-amber-600 font-semibold' : ''}>
                  {pendingCount} 张记忆卡片未编译
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按标题搜索..."
              className="pl-9 pr-3 py-1.5 rounded-lg border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          {/* 执行编译 — 主操作按钮:品牌底色,有未编译时显示 badge 和呼吸光晕,引导点击 */}
          <button
            onClick={() => onNavigate('compile')}
            className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-brand-primary text-white shadow-sm hover:opacity-90 hover:shadow-md transition-all ${
              pendingCount && pendingCount > 0
                ? 'ring-2 ring-brand-primary/30 ring-offset-1 ring-offset-theme-bg-surface'
                : ''
            }`}
            title={pendingCount && pendingCount > 0 ? `有 ${pendingCount} 张待编译卡片` : '执行编译'}
          >
            <Zap size={16} />
            执行编译
            {pendingCount != null && pendingCount > 0 && (
              <span className="ml-1 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-white text-brand-primary">
                {pendingCount}
              </span>
            )}
            {pendingCount != null && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
            )}
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 min-[1920px]:grid-cols-4 gap-3 lg:gap-4 items-stretch">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-theme-border bg-theme-surface p-4 lg:p-5 min-h-[170px] lg:min-h-[200px] animate-pulse">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-lg bg-theme-bg-elevated shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-theme-bg-elevated rounded w-2/3" />
                  <div className="h-3 bg-theme-bg-elevated rounded w-1/3" />
                </div>
              </div>
              <div className="h-3 bg-theme-bg-elevated rounded mb-1" />
              <div className="h-3 bg-theme-bg-elevated rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        // 加载失败也走空态(后端不稳定时 Unknown error 体验差),仅控制台保留 error,UI 统一显示"暂无记忆"。
        <p className="text-center py-12 text-theme-text-secondary">
          {appliedSearch ? `没有匹配 "${appliedSearch}" 的记忆` : '暂无记忆'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 min-[1920px]:grid-cols-4 gap-3 lg:gap-4 mb-4 items-stretch">
          {visibleItems.map((m) => (
            <MemoryCard key={m.id} memory={m} onClick={() => openModal(m)} />
          ))}
        </div>
      )}

      <SecOctoPager
        total={total}
        state={pager}
        onChange={handlePageChange}
        onSizeChange={handleSizeChange}
        sizeOptions={CARDS_PAGE_SIZE_OPTIONS}
      />

      {modalItem && (
        // items-start + p-* 上下留白：modal 从视口顶部往下流，超长时整体不会跑出视口。
        // 关键约束：外层 padding 双边总和 必须 = max-h 的"留白预算"，否则 modal 底部
        // 会伸进 padding 区域，看起来像"被遮挡"。
        //   p-4   = 1rem * 2 = 2rem 总留白  ← 移动端
        //   sm:p-6 = 1.5rem * 2 = 3rem 总留白  ← 平板
        //   md:p-8 = 2rem * 2 = 4rem 总留白  ← 桌面
        // max-h 对应分级，永远比可用区少 1rem 给视觉呼吸。
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-8">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-[65.625rem] bg-theme-surface rounded-2xl border border-theme-border shadow-xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-xl bg-theme-bg-elevated text-theme-text-secondary hover:text-theme-text-primary transition-colors z-10"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
            {/* overscroll-contain 防止滚到底时把 body 一起滚；
                pb-10 比 p-6 默认底部 padding 多 1rem，让最后一行 markdown 不贴底边 */}
            <div className="px-6 pt-6 pb-10 overflow-y-auto overscroll-contain flex-1">
              <h2 className="text-xl font-bold text-theme-text-primary mb-4 pr-10">{modalItem.title || '—'}</h2>
              <div className="flex flex-col gap-2 mb-4">
                {modalItem.scope && (
                  <ModalAttr label="作用域">
                    <span className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{modalItem.scope}</span>
                  </ModalAttr>
                )}
                {modalItem.confidence && (
                  <ModalAttr label="置信度">
                    <span className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{modalItem.confidence}</span>
                  </ModalAttr>
                )}
                {keywords.length > 0 && (
                  <ModalAttr label="关键词">
                    <div className="flex flex-wrap gap-1">
                      {keywords.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{t}</span>
                      ))}
                    </div>
                  </ModalAttr>
                )}
                {sources.length > 0 && (
                  <ModalAttr label="来源">
                    <div className="flex flex-wrap gap-1">
                      {sources.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{t}</span>
                      ))}
                    </div>
                  </ModalAttr>
                )}
                {modalItem.updated && (
                  <ModalAttr label="更新时间">
                    <span className="text-xs text-theme-text-secondary">{modalItem.updated}</span>
                  </ModalAttr>
                )}
                {modalItem.fastpath && (
                  <ModalAttr label="路径">
                    <code className="text-xs font-mono text-theme-text-secondary break-all">{modalItem.fastpath}</code>
                  </ModalAttr>
                )}
              </div>
              <div className="border-t border-theme-border pt-4 mt-2">
                {modalMdLoading ? (
                  <p className="text-sm text-theme-text-secondary">加载详情中…</p>
                ) : modalMd ? (
                  <div className="prose prose-sm max-w-none text-sm text-theme-text-secondary leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{modalMd}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-theme-text-secondary">{modalItem.abstract || ''}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===================== Memory Card =====================
   视觉风格对齐 pages/secocto/GatePages.tsx 中的 SkillCard:
   - 左 icon 圆角块 + 标题(行截断)+ 副标(scope)
   - abstract 2-3 行截断,小屏 2 行、大屏 3 行
   - 底部 keyword chips + 右下 confidence/updated chip
   - padding / 字号 / 图标 / min-h 跟 lg 与 xl 断点放大
*/

const MemoryCard: React.FC<{ memory: SecOctoMemory; onClick: () => void }> = ({ memory, onClick }) => {
  const kw = splitKeywords(memory.keywords).slice(0, 4);
  const abstract = memory.abstract || '';
  const sideTag = memory.confidence
    ? { label: `置信度 ${memory.confidence}`, cls: 'bg-brand-soft text-brand-primary' }
    : memory.updated
    ? { label: memory.updated, cls: 'bg-theme-bg-elevated text-theme-text-faint' }
    : null;

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-theme-border bg-theme-surface p-4 lg:p-5 xl:p-6 hover:border-brand-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col min-h-[170px] lg:min-h-[200px] xl:min-h-[220px] w-full h-full"
    >
      {/* Header: 🧠 icon + title + scope */}
      <div className="flex items-start gap-3 lg:gap-4 mb-2 lg:mb-3">
        <div className="w-9 h-9 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-lg bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
          <Brain size={18} className="lg:hidden" />
          <Brain size={22} className="hidden lg:block xl:hidden" />
          <Brain size={24} className="hidden xl:block" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="font-semibold text-theme-text-primary text-sm lg:text-base xl:text-lg truncate" title={memory.title || ''}>
              {memory.title || '—'}
            </span>
          </div>
          {memory.scope && (
            <div className="text-xs lg:text-sm text-theme-text-faint truncate" title={memory.scope}>
              {memory.scope}
            </div>
          )}
        </div>
      </div>

      {/* Abstract */}
      <p className="text-xs lg:text-sm text-theme-text-secondary line-clamp-2 lg:line-clamp-3 mb-2 lg:mb-3 flex-1">
        {abstract}
      </p>

      {/* Footer: keywords chips + 置信度/更新时间 */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-wrap gap-1 lg:gap-1.5 min-w-0">
          {kw.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] lg:text-xs bg-brand-soft text-brand-primary whitespace-nowrap">
              #{t}
            </span>
          ))}
        </div>
        {sideTag && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] lg:text-xs whitespace-nowrap shrink-0 ${sideTag.cls}`}>
            {sideTag.label}
          </span>
        )}
      </div>
    </button>
  );
};

/* ===================== Modal 属性行 ===================== */

const ModalAttr: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-theme-text-faint w-16 shrink-0">{label}</span>
    {children}
  </div>
);
