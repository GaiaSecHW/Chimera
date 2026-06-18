import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../design-system';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const VERIFICATION_DETAIL_TARGET_KEY = 'chimera-vuln-open-verification-case-id';

export const VulnVerificationDetailPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  const targetCaseId = useMemo(() => localStorage.getItem(VERIFICATION_DETAIL_TARGET_KEY) || '', []);

  return (
  <div className="min-h-screen bg-theme-bg-app animate-in fade-in duration-300">
      <PageHeader
        title="验证详情"
        back={{ label: '返回验证列表', onClick: () => onNavigateToView?.('vuln-verification') }}
      />
      <VulnEnginePage
        projectId={projectId}
        currentViewId="vuln-verification-detail"
        onNavigateToView={onNavigateToView}
        initialWorkspaceView="cases"
        pageTitle="验证详情"
        pageDescription="聚焦单个验证案例，集中完成自动验证、人工复核、验证结论提交与结束推进。"
        hideLifecycleChrome
        hidePhaseContext
        hideCasePool
        showStats={false}
        showWorkspaceTabs={false}
        showPhasePreset={false}
        fullscreenLayout
        casePoolTitle="验证案例"
        casePoolDescription="围绕当前选中案例查看验证结果、动作、时间线与人工验证任务。"
        stageScope={['validation']}
        defaultStageFilter="validation"
        lockStageFilter
        showCreateCaseForm={false}
        preferredActionType="validation"
        preferredTaskType="manual_validation"
        initialSelectedCaseId={targetCaseId}
      />
    </div>
  );
};
