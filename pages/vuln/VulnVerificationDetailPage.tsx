import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const VERIFICATION_DETAIL_TARGET_KEY = 'chimera-vuln-open-verification-case-id';

export const VulnVerificationDetailPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  const targetCaseId = useMemo(() => localStorage.getItem(VERIFICATION_DETAIL_TARGET_KEY) || '', []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] animate-in fade-in duration-300">
      <div className="px-4 pt-4 xl:px-6 2xl:px-8">
        <button
          type="button"
          onClick={() => onNavigateToView?.('vuln-verification')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm"
        >
          <ArrowLeft size={16} />
          返回验证列表
        </button>
      </div>
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
