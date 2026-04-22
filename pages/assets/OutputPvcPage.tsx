import React from 'react';
import { PvcManagementPage } from './PvcManagementPage';

export const OutputPvcPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  return <PvcManagementPage projectId={projectId} />;
};
