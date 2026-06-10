import React from 'react';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

export const RedlineOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  return <div className="p-6 text-theme-text-primary">红线验证 - 加载中...</div>;
};
