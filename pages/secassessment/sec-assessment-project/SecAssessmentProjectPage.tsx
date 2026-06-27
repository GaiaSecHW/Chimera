import React from 'react';
import { Construction } from 'lucide-react';
import { PageHeader, EmptyState } from '../../../design-system';

export interface SecAssessmentProjectPageProps {
  projectId?: string;
}

export const SecAssessmentProjectPage: React.FC<SecAssessmentProjectPageProps> = () => {
  return (
    <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
      <PageHeader title="安全评估项目" description="安全评估项目的创建、执行与结果管理" />
      <EmptyState
        variant="block"
        icon={<Construction size={32} />}
        title="开发中"
        description="该模块正在建设中，敬请期待"
      />
    </div>
  );
};

export default SecAssessmentProjectPage;
