import React from 'react';
import type { RedlineTask } from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export const TaskRunningStep: React.FC<Props> = ({ taskId }) => {
  return <div className="p-6 text-theme-text-primary">执行中 - {taskId}</div>;
};
