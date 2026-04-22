
import React from 'react';
import { BaseResourcePage } from './BaseResourcePage';

export const CodeAuditPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  return (
    <BaseResourcePage 
      type="code"
      title="输入-源代码管理"
      subtitle="自动拉取 Git 归档或源代码包，编排静态分析与审计上下文"
      projectId={projectId}
    />
  );
};
