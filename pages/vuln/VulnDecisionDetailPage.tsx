import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const DECISION_DETAIL_TARGET_KEY = 'chimera-vuln-open-decision-case-id';

export const VulnDecisionDetailPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  const targetCaseId = useMemo(() => localStorage.getItem(DECISION_DETAIL_TARGET_KEY) || '', []);

  return (
    <div className="animate-in fade-in duration-300">
      <div className="px-6 pt-6 xl:px-8">
        <button
          type="button"
          onClick={() => onNavigateToView?.('vuln-decision')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm"
        >
          <ArrowLeft size={16} />
          返回漏洞中心
        </button>
      </div>
      <VulnEnginePage
        projectId={projectId}
        currentViewId="vuln-decision-detail"
        onNavigateToView={onNavigateToView}
        initialWorkspaceView="cases"
        pageTitle="漏洞详情"
        pageDescription="聚焦单个已收敛案例，查看它是如何经过研判或验证形成最终漏洞结论、非漏洞结论或观察结论。"
        hideLifecycleChrome
        hidePhaseContext
        hideCasePool
        showStats={false}
        showWorkspaceTabs={false}
        showPhasePreset={false}
        casePoolTitle="漏洞案例"
        casePoolDescription="围绕当前选中案例查看最终结论、时间线证据与人工任务。"
        stageScope={['finished']}
        defaultStageFilter="finished"
        lockStageFilter
        showCreateCaseForm={false}
        preferredTaskType="manual_decision"
        initialSelectedCaseId={targetCaseId}
      />
    </div>
  );
};
