import React from 'react';
import { PvcManagementPage } from './PvcManagementPage';
import { TaskMgmtPage } from './TaskMgmtPage';

type PublicResourceTab = 'pvc' | 'tasks';

interface PublicResourceManagementPageProps {
  projectId: string;
  initialTab?: PublicResourceTab;
}

export const PublicResourceManagementPage: React.FC<PublicResourceManagementPageProps> = ({
  projectId,
  initialTab = 'pvc',
}) => {
  if (initialTab === 'tasks') {
    return <TaskMgmtPage projectId={projectId} />;
  }
  return <PvcManagementPage projectId={projectId} />;
};
