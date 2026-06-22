import React from 'react';
import { PageHeader } from '../../design-system';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnAnalysisDetailPage: React.FC<VulnPageProps> = ({ onNavigateToView }) => {
  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="研判详情"
        back={{ label: '返回验证列表', onClick: () => onNavigateToView?.('vuln-verification') }}
      />
    </div>
  );
};