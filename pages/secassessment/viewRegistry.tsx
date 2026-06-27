import React from 'react';
import { SecAssessmentProjectPage } from './sec-assessment-project/SecAssessmentProjectPage';
import { SecBaselineMgmtPage } from './sec-baseline-mgmt/SecBaselineMgmtPage';

/**
 * 安全评估模块自治的 view 调度器。
 *
 * 框架(app/viewRegistry.tsx)只负责:
 *   1) 用 SEC_ASSESSMENT_VIEW_PREFIX / SEC_BASELINE_VIEW_PREFIX 做前缀守卫
 *   2) 调用 renderSecAssessmentView,若返回 null 走框架 default 的"开发中"占位
 *
 * 本模块新增/修改 view 形态,不再需要触碰 app/ 下任何文件。
 * 约定:安全评估模块所有 view 均以 'sec-assessment-' 或 'sec-baseline-' 前缀开头;
 * 需要带 id 的详情页可用 'sec-assessment-project-detail-{id}' / 'sec-baseline-detail-{id}'
 * 等形态,在下方用 startsWith 解析(参考 pages/secocto/viewRegistry.tsx)。
 */
export const SEC_ASSESSMENT_VIEW_PREFIX = 'sec-assessment-' as const;
export const SEC_BASELINE_VIEW_PREFIX = 'sec-baseline-' as const;

export interface SecAssessmentViewContext {
  currentView: string;
  setCurrentView: (view: string) => void;
  projectId?: string;
}

export const renderSecAssessmentView = (ctx: SecAssessmentViewContext): React.ReactNode | null => {
  switch (ctx.currentView) {
    case 'sec-assessment-project':
      return <SecAssessmentProjectPage projectId={ctx.projectId} />;
    case 'sec-baseline-mgmt':
      return <SecBaselineMgmtPage projectId={ctx.projectId} />;
  }

  // 不命中任何形态 → 返回 null,让框架 default 走"开发中"占位
  return null;
};
