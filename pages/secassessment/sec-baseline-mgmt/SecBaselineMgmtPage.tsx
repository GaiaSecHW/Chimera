import React from 'react';
import { Construction } from 'lucide-react';
import { PageHeader, EmptyState } from '../../../design-system';

export interface SecBaselineMgmtPageProps {
  projectId?: string;
}

export const SecBaselineMgmtPage: React.FC<SecBaselineMgmtPageProps> = () => {
  return (
    <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
      <PageHeader title="安全功能基线管理" description="安全功能基线的定义、维护与核查" />
      <EmptyState
        variant="block"
        icon={<Construction size={32} />}
        title="开发中"
        description="该模块正在建设中，敬请期待"
      />
    </div>
  );
};

export default SecBaselineMgmtPage;
