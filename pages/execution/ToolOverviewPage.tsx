import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { ViewType } from '../../types/types';
import { toolCatalog, type ToolDescriptor } from './toolCatalog';

interface ToolOverviewPageProps {
  projectId: string;
  onNavigate: (view: ViewType) => void;
}

const sectionTone = (index: number): string => {
  const tones = [
    'from-cyan-500 to-sky-600',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-fuchsia-600',
  ];
  return tones[index % tones.length] || tones[0];
};

export const ToolOverviewPage: React.FC<ToolOverviewPageProps> = ({ projectId, onNavigate }) => {
  const [selectedToolId, setSelectedToolId] = useState('');

  const selectedTool = useMemo(
    () => toolCatalog.find((item) => item.id === selectedToolId) || null,
    [selectedToolId],
  );

  useEffect(() => {
    if (!selectedTool) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedToolId('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTool]);

  return (
    <div className="px-8 pb-10 pt-8">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-violet-50/70 to-sky-50 p-7 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-violet-700">
              <Sparkles size={14} />
              Developer Tools
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">工具总览</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              聚焦当前工具菜单下的端到端扫描工具。每张卡片展示工具定位、输入、结果和主要用途，
              点击卡片可查看更详细的使用说明，重点帮助快速理解“给什么输入、能拿到什么结果”。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">工具数量</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{toolCatalog.length}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">已选项目</div>
              <div className="mt-2 break-all text-sm font-bold text-slate-800">{projectId || '未选择项目'}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">说明重点</div>
              <div className="mt-2 text-sm font-bold text-slate-800">输入 / 结果 / 使用场景</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {toolCatalog.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setSelectedToolId(tool.id)}
              className="group rounded-[2rem] border border-slate-200 bg-white/95 p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg shadow-violet-200/70">
                    <Icon size={24} />
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-700">Developer Tool</div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{tool.name}</h3>
                  </div>
                </div>
              </div>

              <p className="mt-5 min-h-[48px] text-sm leading-7 text-slate-600">{tool.summary}</p>

              <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">功能缩略描述</div>
                <div className="mt-3 text-sm leading-7 text-slate-700">{tool.thumbnailDescription}</div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输入</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{tool.inputDescription}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">结果</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{tool.resultDescription}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {tool.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedToolId(tool.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-all hover:bg-slate-800"
                >
                  查看使用说明
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate(tool.viewId);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  进入工具页面
                </button>
              </div>
            </button>
          );
        })}
      </section>

      {selectedTool ? (
        <div className="fixed inset-0 z-[260] bg-slate-950/55 p-4 backdrop-blur-sm md:p-8" onClick={() => setSelectedToolId('')}>
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 px-6 py-5 md:px-8">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-700">Tool Usage Guide</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black tracking-tight text-slate-900">{selectedTool.name}</h2>
                </div>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{selectedTool.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedToolId('')}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:text-slate-800"
                title="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">输入</div>
                  <div className="mt-3 text-sm leading-7 text-slate-700">{selectedTool.inputDescription}</div>
                </section>
                <section className="rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">结果</div>
                  <div className="mt-3 text-sm leading-7 text-slate-700">{selectedTool.resultDescription}</div>
                </section>
              </div>

              <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">功能缩略描述</div>
                <div className="mt-3 text-sm leading-7 text-slate-700">{selectedTool.thumbnailDescription}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTool.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <div className="mt-5 space-y-5">
                {selectedTool.usageSections.map((section, index) => (
                  <section key={section.title} className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${sectionTone(index)} text-white shadow-lg`}>
                        <Sparkles size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-lg font-black text-slate-900">{section.title}</h4>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{section.description}</p>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
