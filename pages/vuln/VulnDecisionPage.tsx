import React from 'react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnDecisionPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => (
  <VulnEnginePage
    projectId={projectId}
    currentViewId="vuln-decision"
    onNavigateToView={onNavigateToView}
    initialWorkspaceView="cases"
    pageTitle="漏洞中心"
    pageDescription="集中查看已完成研判或验证收敛的案例，只有在形成明确结论后，才在这里作为漏洞或非漏洞结果统一管理。"
    showStats={false}
    showWorkspaceTabs={false}
    hidePhaseContext
    compactCaseLayout
    listEntryMode
    preserveLifecycleProgressBand
    casePoolTitle="已收敛案例"
    casePoolDescription="只展示已经过研判或验证收敛的 finished 实例，点击后进入漏洞详情。"
    stageScope={['finished']}
    defaultStageFilter="finished"
    lockStageFilter
    hideStageFilter
    showCreateCaseForm={false}
    preferredTaskType="manual_decision"
    detailTargetView="vuln-decision-detail"
    detailStorageKey="chimera-vuln-open-decision-case-id"
    detailEntryLabel="查看漏洞详情"
  />
);
