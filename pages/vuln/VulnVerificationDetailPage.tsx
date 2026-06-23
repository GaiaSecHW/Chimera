import React from 'react';
import { PageHeader } from '../../design-system';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnVerificationDetailPage: React.FC<VulnPageProps> = ({ onNavigateToView }) => {
  return (
    <div className="min-h-screen bg-theme-app animate-in fade-in duration-300">
      <PageHeader
        title="验证详情"
        back={{ label: '返回验证列表', onClick: () => onNavigateToView?.('vuln-verification') }}
      />
    </div>
  );
};