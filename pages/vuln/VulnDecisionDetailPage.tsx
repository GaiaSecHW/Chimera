import React from 'react';
import { PageHeader } from '../../design-system';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnDecisionDetailPage: React.FC<VulnPageProps> = ({ onNavigateToView }) => {
  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title="漏洞详情"
        back={{ label: '返回漏洞中心', onClick: () => onNavigateToView?.('vuln-decision') }}
      />
    </div>
  );
};
