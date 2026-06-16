import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const ANALYSIS_DETAIL_TARGET_KEY = 'chimera-vuln-open-case-id';

export const VulnAnalysisDetailPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  const targetCaseId = useMemo(() => localStorage.getItem(ANALYSIS_DETAIL_TARGET_KEY) || '', []);

  return (
    <div className="animate-in fade-in duration-300">
      <div className="px-6 pt-6 xl:px-8">
        <button
          type="button"
          onClick={() => onNavigateToView?.('vuln-verification')}
 className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700"
        >
          <ArrowLeft size={16} />
          返回验证列表
        </button>
      </div>
      <VulnEnginePage
        projectId={projectId}
        currentViewId="vuln-analysis-detail"
        onNavigateToView={onNavigateToView}
        initialWorkspaceView="cases"
        pageTitle="研判详情"
        pageDescription="聚焦单个研判案例，集中完成动作派发、结果查看、人工分析与阶段推进。"
        hideLifecycleChrome
        hidePhaseContext
        hideCasePool
        showStats={false}
        showWorkspaceTabs={false}
        casePoolTitle="研判案例"
        casePoolDescription="围绕当前选中案例查看时间线、结果与人工任务。"
        phasePresetLabel="研判详情快捷预设"
        stageScope={['triage']}
        defaultStageFilter="triage"
        lockStageFilter
        showCreateCaseForm={false}
        preferredActionType="analysis"
        preferredTaskType="manual_analysis"
        phaseHighlights={[
          '在单案例上下文中集中查看自动规则、时间线和多源结果，避免频繁跨页跳转。',
          '优先完成人工裁决、补充人工分析任务，再决定是否进入验证阶段。',
        ]}
        phaseActions={[
          '派发分析类能力服务，收集进一步的研判证据。',
          '创建人工分析任务，补足自动分析无法覆盖的结论。',
          '确认研判结论后，推进到验证阶段或结束案例。'
        ]}
        phaseActionLinks={[
          { label: '去验证复现', view: 'vuln-verification' },
        ]}
        initialSelectedCaseId={targetCaseId}
      />
    </div>
  );
};
