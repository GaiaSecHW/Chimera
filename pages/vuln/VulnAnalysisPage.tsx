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
    pageTitle="研判工作台"
    pageDescription="紧凑查看研判中案例，并快速完成研判结论与阶段推进。"
    showWorkspaceTabs={false}
    casePoolTitle="研判中案例"
    casePoolDescription="选择案例后可直接查看当前研判详情。"
    phasePresetLabel="研判阶段快捷预设"
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
    detailEntryLabel="查看研判详情"
    phaseHighlights={[
      '围绕研判结论、时间线和推荐动作形成稳定判断，不急于结束。',
      '优先查看自动规则命中和推荐动作，判断是否具备进入验证的条件。',
      '研判结果质量不足时，应创建人工分析任务补充上下文。'
    ]}
    phaseActions={[
      '派发分析类能力服务，收集多源研判结果。',
      '必要时创建人工分析任务，补充 AI 或工具无法覆盖的判断。',
      '当研判结论稳定且人工确认后，推进到验证阶段。'
    ]}
    phaseActionLinks={[
      { label: '去验证复现', view: 'vuln-verification' },
      { label: '去能力注册', view: 'vuln-services' },
    ]}
  />
);
