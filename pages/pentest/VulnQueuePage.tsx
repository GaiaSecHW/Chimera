import React from 'react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnQueuePage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => (
  <VulnEnginePage
    projectId={projectId}
    currentViewId="vuln-queue"
    onNavigateToView={onNavigateToView}
    initialWorkspaceView="queue"
    pageTitle="引擎运行队列"
    pageDescription="从项目级运营视角查看动作队列、失败动作、重试与取消，保障生命周期引擎持续运转。"
    hideLifecycleChrome
    showWorkspaceTabs={false}
    showStats={false}
    phaseHighlights={[
      '从项目级统一观察动作拥塞、失败和重试，优先保障引擎连续运转。',
      '队列页不做漏洞定性，重点是运行可靠性和执行效率。',
      '失败动作要尽快定位到服务异常、参数问题还是生命周期配置问题。'
    ]}
    phaseActions={[
      '重试失败动作，或取消明显无效的排队动作。',
      '跳转到对应案例查看详细时间线和结果。',
      '配合能力注册页检查目标服务健康状态与能力声明。'
    ]}
    phaseActionLinks={[
      { label: '去能力注册', view: 'vuln-services' },
      { label: '回生命周期总览', view: 'vuln-overview' },
    ]}
  />
);
