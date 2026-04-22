import React from 'react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnVerificationPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => (
  <VulnEnginePage
    projectId={projectId}
    currentViewId="vuln-verification"
    onNavigateToView={onNavigateToView}
    initialWorkspaceView="cases"
    pageTitle="验证复现工作台"
    pageDescription="紧凑查看验证阶段实例，点击后进入验证详情页完成验证动作、结果查看与结论提交。"
    showStats={false}
    showWorkspaceTabs={false}
    hidePhaseContext
    compactCaseLayout
    listEntryMode
    preserveLifecycleProgressBand
    casePoolTitle="验证复现案例"
    casePoolDescription="只展示验证阶段实例，点击后进入验证详情。"
    phasePresetLabel="验证阶段默认偏向验证与人工验证"
    stageScope={['validation']}
    defaultStageFilter="validation"
    lockStageFilter
    hideStageFilter
    showCreateCaseForm={false}
    preferredActionType="validation"
    preferredTaskType="manual_validation"
    detailTargetView="vuln-verification-detail"
    detailStorageKey="secflow-vuln-open-verification-case-id"
    detailEntryLabel="查看验证详情"
  />
);
