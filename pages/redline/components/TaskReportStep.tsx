import React from 'react';
import type { RedlineTask } from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onPrev: () => void;
}

export const TaskReportStep: React.FC<Props> = ({ taskId }) => {
  return <div className="p-6 text-theme-text-primary">报告 - {taskId}</div>;
};
