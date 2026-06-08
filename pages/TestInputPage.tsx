
import React from 'react';
import { Code2, FileBox, FileText, Package } from 'lucide-react';

interface TestInputPageProps {
  currentView: string;
}

const pageMeta: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
  'test-input-code': {
    title: '源码',
    description: '源码任务输入页面预留中',
    icon: <Code2 size={28} />,
  },
  'test-input-doc': {
    title: '文档',
    description: '文档任务输入页面预留中',
    icon: <FileText size={28} />,
  },
  'test-input-release': {
    title: '软件包',
    description: '软件包任务输入页面预留中',
    icon: <Package size={28} />,
  },
  'test-input-other': {
    title: '其他',
    description: '其他任务输入页面预留中',
    icon: <FileBox size={28} />,
  },
};

export const TestInputPage: React.FC<TestInputPageProps> = ({ currentView }) => {
  const meta = pageMeta[currentView] || {
    title: '任务输入',
    description: '任务输入页面预留中',
    icon: <FileBox size={28} />,
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-5rem)] items-center justify-center p-10">
      <section className="w-full max-w-3xl rounded-[2rem] border border-theme-border bg-theme-surface px-10 py-14 text-center shadow-brand">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-elevated text-theme-text-primary">
          {meta.icon}
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-theme-text-primary">{meta.title}</h1>
        <p className="mt-3 text-base font-medium text-theme-text-faint">{meta.description}</p>
      </section>
    </div>
  );
};
