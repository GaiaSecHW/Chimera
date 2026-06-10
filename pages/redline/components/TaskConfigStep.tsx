import React from 'react';
import type { RedlineTask } from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onNext: () => void;
}

export const TaskConfigStep: React.FC<Props> = ({ taskId }) => {
  return <div className="p-6 text-theme-text-primary">配置步骤 - {taskId}</div>;
};
