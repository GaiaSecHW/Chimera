import React from 'react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnAnalysisPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => (
  <VulnEnginePage
    projectId={projectId}
    currentViewId="vuln-analysis"
    onNavigateToView={onNavigateToView}
    initialWorkspaceView="cases"
    pageTitle="验证准入"
    pageDescription="兼容查看历史准入案例，并快速完成结论确认与阶段推进。"
    showWorkspaceTabs={false}
    casePoolTitle="准入案例"
    casePoolDescription="选择案例后可直接查看当前准入详情。"
    phasePresetLabel="验证准入快捷预设"
    compactCaseLayout
    stageScope={['triage']}
    defaultStageFilter="triage"
    lockStageFilter
    hideStageFilter
    showCreateCaseForm={false}
    preferredActionType="analysis"
    preferredTaskType="manual_analysis"
    listEntryMode
    preserveLifecycleProgressBand
    detailTargetView="vuln-analysis-detail"
    detailStorageKey="chimera-vuln-open-case-id"
    detailEntryLabel="查看准入详情"
    phaseHighlights={[
      '围绕准入结论、时间线和推荐动作形成稳定判断，不急于结束。',
      '优先查看自动规则命中和推荐动作，判断是否具备进入验证的条件。',
      '准入信息质量不足时，应创建人工分析任务补充上下文。'
    ]}
    phaseActions={[
      '派发分析类能力服务，收集多源准入证据。',
      '必要时创建人工分析任务，补充 AI 或工具无法覆盖的判断。',
      '当准入结论稳定且人工确认后，推进到验证阶段。'
    ]}
    phaseActionLinks={[
      { label: '去验证复现', view: 'vuln-verification' },
      { label: '去能力注册', view: 'vuln-services' },
    ]}
  />
);
