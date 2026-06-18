import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Search, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { secoctoClients } from '../../clients/secocto';
import type { SecOctoMemory, SecOctoMemoryStatus, SecOctoPagerState, SecOctoNavKey } from '../../types/secocto';
import { SecOctoPager, PAGE_SIZE_OPTIONS } from './shared/Pager';
import { PageHeader } from '../../design-system';

interface Props {
  onNavigate: (navKey: SecOctoNavKey) => void;
}

const escHtml = (s: string | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const splitKeywords = (s: string | null | undefined) =>
  String(s ?? '').split(/[,，;；]\s*/).map((t) => t.trim()).filter(Boolean);

const splitSources = (s: string | null | undefined) =>
  String(s ?? '').split(/[,，;\s]+/).map((t) => t.trim()).filter(Boolean);

export const SecOctoCardsPage: React.FC<Props> = ({ onNavigate }) => {
  const [items, setItems] = useState<SecOctoMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [pager, setPager] = useState<SecOctoPagerState>({ page: 1, size: 10 });
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [modalItem, setModalItem] = useState<SecOctoMemory | null>(null);
  const [modalMd, setModalMd] = useState<string | null>(null);
  const [modalMdLoading, setModalMdLoading] = useState(false);

  const fetchSeq = useMemo(() => ({ current: 0 }), []);

  const loadData = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const offset = (pager.page - 1) * pager.size;
      const resp = await secoctoClients.memories.list({ title: appliedSearch, limit: pager.size, offset });
      if (seq !== fetchSeq.current) return;
      setItems(resp.items);
      setTotal(resp.total);
      const maxPage = Math.max(1, Math.ceil(resp.total / pager.size));
      if (pager.page > maxPage) {
        setPager((prev) => ({ ...prev, page: maxPage }));
      }
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setError(e?.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!modalItem?.fastpath) return;
    setModalMdLoading(true);
    setModalMd(null);
    secoctoClients.wiki
      .fetchMd(modalItem.fastpath)
      .then((md) => {
        const body = md && /^---\s*\r?\n/.test(md) ? md.replace(/^---\s*\r?\n/, '').replace(/\r?\n---\s*(\r?\n|$)/, '') : md || '';
        setModalMd(body);
      })
      .catch(() => setModalMd(null))
      .finally(() => setModalMdLoading(false));
  }, [modalItem?.id, modalItem?.fastpath]);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const handleSearchCommit = useCallback(() => {
    setAppliedSearch(search.trim());
    setPager((prev) => ({ ...prev, page: 1 }));
  }, [search]);

  const handlePageChange = useCallback((page: number) => {
    setPager((prev) => ({ ...prev, page }));
  }, []);

  const handleSizeChange = useCallback((size: number) => {
    setPager({ page: 1, size });
  }, []);

  const openModal = useCallback((item: SecOctoMemory) => {
    setModalItem(item);
  }, []);

  const closeModal = useCallback(() => {
    setModalItem(null);
    setModalMd(null);
  }, []);

  const keywords = useMemo(() => splitKeywords(modalItem?.keywords), [modalItem?.keywords]);
  const sources = useMemo(() => splitSources(modalItem?.sources), [modalItem?.sources]);

  const visibleItems = useMemo(() => {
    if (loading && items.length === 0) return [];
    return items;
  }, [loading, items]);

  return (
    <div className="px-8 pt-8 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title={<>记忆<span className="gradient-text bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 bg-clip-text text-transparent">卡片库</span></>}
        description={<>Agent 进化过程中沉淀的安全知识 · 共 {total} 张卡片 · {pendingCount ?? '—'} 张卡片未编译 · <button onClick={() => onNavigate('compile')} className="inline-flex items-center gap-1 ml-1 text-xs font-medium text-brand-primary hover:underline"><Zap size={14} />执行编译</button></>}
        actions={<div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchCommit()}
            placeholder="按标题搜索..."
            className="pl-9 pr-4 py-2 rounded-xl border border-theme-border bg-theme-surface text-theme-text-primary text-sm w-56 outline-none focus:border-brand-primary transition-colors"
          />
        </div>}
      />

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-theme-border bg-theme-surface p-4 animate-pulse">
              <div className="h-4 bg-theme-elevated rounded mb-2" />
              <div className="h-3 bg-theme-elevated rounded mb-1" />
              <div className="h-3 bg-theme-elevated rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-center py-12 text-theme-text-secondary">加载失败：{escHtml(error)}</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-center py-12 text-theme-text-secondary">
          {appliedSearch ? `没有匹配 "${appliedSearch}" 的记忆卡` : '暂无记忆卡'}
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((m) => {
            const kw = splitKeywords(m.keywords).slice(0, 5);
            const meta: string[] = [];
            if (m.scope) meta.push(m.scope);
            if (m.confidence) meta.push(`置信度 ${m.confidence}`);
            if (m.updated) meta.push(`更新 ${m.updated}`);
            return (
              <button
                key={m.id}
                onClick={() => openModal(m)}
                className="rounded-xl border border-theme-border bg-theme-surface p-4 text-left transition-all hover:shadow-lg hover:border-brand-primary/30 hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="font-semibold text-theme-text-primary truncate">{m.title || '—'}</div>
                <div className="text-sm text-theme-text-secondary mt-1 line-clamp-2">{m.abstract || ''}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {kw.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{t}</span>
                  ))}
                </div>
                <div className="text-xs text-theme-text-faint mt-2 truncate">{meta.join(' · ')}</div>
              </button>
            );
          })}
        </div>
      )}

      <SecOctoPager
        total={total}
        state={pager}
        onChange={handlePageChange}
        onSizeChange={handleSizeChange}
        sizeOptions={PAGE_SIZE_OPTIONS}
      />

      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl mx-4 bg-theme-surface rounded-2xl border border-theme-border shadow-xl overflow-hidden">
            <button onClick={closeModal} className="absolute top-4 right-4 p-2 rounded-xl bg-theme-elevated text-theme-text-secondary hover:text-theme-text-inverse transition-colors">
              <X size={20} />
            </button>
            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <h2 className="text-xl font-bold text-theme-text-primary mb-4">{modalItem.title || '—'}</h2>
              <div className="flex flex-col gap-2 mb-4">
                {modalItem.scope && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-text-faint w-16">作用域</span>
                    <span className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{modalItem.scope}</span>
                  </div>
                )}
                {modalItem.confidence && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-text-faint w-16">置信度</span>
                    <span className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{modalItem.confidence}</span>
                  </div>
                )}
                {keywords.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-text-faint w-16">关键词</span>
                    <div className="flex flex-wrap gap-1">
                      {keywords.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {sources.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-text-faint w-16">来源</span>
                    <div className="flex flex-wrap gap-1">
                      {sources.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-md text-xs bg-brand-soft text-brand-primary">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {modalItem.fastpath && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-text-faint w-16">路径</span>
                    <code className="text-xs font-mono text-theme-text-secondary">{modalItem.fastpath}</code>
                  </div>
                )}
              </div>
              <div className="border-t border-theme-border pt-4 mt-2">
                {modalMdLoading ? (
                  <p className="text-sm text-theme-text-secondary">加载详情中…</p>
                ) : modalMd ? (
                  <div className="markdown-body text-sm text-theme-text-secondary leading-relaxed">
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
