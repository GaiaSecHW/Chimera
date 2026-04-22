
import React from 'react';
import { BaseResourcePage } from './BaseResourcePage';

export const OtherInputPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  return (
    <BaseResourcePage 
      type="other"
      title="输入-其他资源管理"
      subtitle="管理自定义配置文件、字典、Payload 库及临时安全测试数据"
      projectId={projectId}
    />
  );
};
