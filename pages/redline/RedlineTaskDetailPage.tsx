import React from 'react';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

export const RedlineTaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  return <div className="p-6 text-theme-text-primary">任务详情 - {taskId}</div>;
};
