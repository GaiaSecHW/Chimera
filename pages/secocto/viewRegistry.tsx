import React from 'react';
import { SecOctoMemoriesPage } from './MemoriesPage';
import { SecOctoCompilePage } from './CompilePage';
import { SecOctoVulnsListPage, SecOctoVulnDetailPage, SecOctoReportDetailPage } from './VulnsPages';
import { SecOctoOverviewPage, SecOctoTaskDetailPage } from './OverviewPages';
import { SecOctoSkillsPage, SecOctoSkillDetailPage, SecOctoEvolvePage, SecOctoResultPage } from './GatePages';

/**
 * SecOcto 模块自治的 view 调度器。
 *
 * 该模块所有页面状态(skill fullName / proposal ids / report id 等)都编码进
 * currentView 这一根字符串里(不占用 ViewRegistryContext 的 active*Id 字段),
 * 因此对接面只需 currentView 读 + setCurrentView 写两件事。
 *
 * 框架(app/viewRegistry.tsx)只负责:
 *   1) 用 SECOCTO_VIEW_PREFIX 做前缀守卫
 *   2) 调用 renderSecOctoView,若返回 null 走框架自己的 default 占位
 *
 * 本模块新增/修改 view 形态,不再需要触碰 app/ 下任何文件。
 */
export const SECOCTO_VIEW_PREFIX = 'secocto-' as const;

export interface SecOctoViewContext {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const renderSecOctoView = (ctx: SecOctoViewContext): React.ReactNode | null => {
  switch (ctx.currentView) {
    case 'secocto-memories':
      return <SecOctoMemoriesPage onNavigate={(navKey) => {
        // compile 必须映射到 'secocto-memories-compile' 让 viewRegistry 渲染 SecOctoCompilePage,
        // 此前错误写成 'secocto-memories'(自指),点"执行编译"按钮没反应
        const viewMap: Record<string, string> = { overview: 'secocto-overview', skills: 'secocto-skills', memories: 'secocto-memories', vulns: 'secocto-vulns', compile: 'secocto-memories-compile' };
        ctx.setCurrentView(viewMap[navKey] || 'secocto-memories');
      }} />;
    case 'secocto-vulns':
      return <SecOctoVulnsListPage onNavigateDetail={(id) => ctx.setCurrentView(`secocto-vuln-detail-${id}`)} onNavigate={(navKey) => ctx.setCurrentView('secocto-vulns')} />;
    case 'secocto-overview':
      return <SecOctoOverviewPage onNavigateTask={(taskId) => ctx.setCurrentView(`secocto-task-detail-${taskId}`)} />;
    case 'secocto-skills':
      return <SecOctoSkillsPage onNavigateSkill={(fullName) => ctx.setCurrentView(`secocto-skill-${encodeURIComponent(fullName)}`)} onNavigate={(navKey) => ctx.setCurrentView('secocto-skills')} />;
    case 'secocto-memories-compile':
      return <SecOctoCompilePage onBack={() => ctx.setCurrentView('secocto-memories')} />;
  }

  if (ctx.currentView.startsWith('secocto-vuln-detail-')) {
    const id = parseInt(ctx.currentView.replace('secocto-vuln-detail-', ''), 10);
    if (id) return <SecOctoVulnDetailPage findingId={id} onBack={() => ctx.setCurrentView('secocto-vulns')} onNavigateReport={(rid) => ctx.setCurrentView(`secocto-report-detail-${rid}`)} />;
  }
  if (ctx.currentView.startsWith('secocto-report-detail-')) {
    const id = parseInt(ctx.currentView.replace('secocto-report-detail-', ''), 10);
    if (id) return <SecOctoReportDetailPage reportId={id} onBack={() => ctx.setCurrentView('secocto-vulns')} onNavigateFinding={(fid) => ctx.setCurrentView(`secocto-vuln-detail-${fid}`)} />;
  }
  if (ctx.currentView.startsWith('secocto-task-detail-')) {
    const taskId = ctx.currentView.replace('secocto-task-detail-', '');
    return <SecOctoTaskDetailPage taskId={decodeURIComponent(taskId)} onBack={() => ctx.setCurrentView('secocto-overview')} />;
  }
  if (ctx.currentView.startsWith('secocto-skill-')) {
    // skill 的 full_name 含 `/`(如 demo/03-command-injection),必须 encode 才能
    // 让 React Router 把整段当成一个 :view 参数;decodeURIComponent 兼容 routeView
    // 同步前(encoded)和同步后(已 decoded)两种状态。
    const fullName = decodeURIComponent(ctx.currentView.replace('secocto-skill-', ''));
    return <SecOctoSkillDetailPage
      fullName={fullName}
      onNavigateEvolve={(fn) => ctx.setCurrentView(`secocto-evolve-${encodeURIComponent(fn)}`)}
      onNavigateDecision={(args) => {
        // 支持两种调用形态:
        //   1) onNavigateDecision('demo/07-ssrf')               → 无 proposalIds
        //   2) onNavigateDecision({fullName, proposalIds})       → 携带 ?proposals=24,25
        const fn = typeof args === 'string' ? args : args.fullName;
        const ids = typeof args === 'string' ? undefined : args.proposalIds;
        const suffix = ids && ids.length ? `?proposals=${ids.join(',')}` : '';
        ctx.setCurrentView(`secocto-result-${encodeURIComponent(fn + suffix)}`);
      }}
      onBack={() => ctx.setCurrentView('secocto-skills')}
    />;
  }
  if (ctx.currentView.startsWith('secocto-evolve-')) {
    const fullName = decodeURIComponent(ctx.currentView.replace('secocto-evolve-', ''));
    return <SecOctoEvolvePage
      fullName={fullName}
      onBack={() => ctx.setCurrentView(`secocto-skill-${encodeURIComponent(fullName)}`)}
      onNavigateResult={(fn, proposalIds) => {
        const suffix = proposalIds && proposalIds.length ? `?proposals=${proposalIds.join(',')}` : '';
        ctx.setCurrentView(`secocto-result-${encodeURIComponent(fn + suffix)}`);
      }}
    />;
  }
  if (ctx.currentView.startsWith('secocto-result-')) {
    // 解析 view string 里可选的 ?proposals=24,25:
    //   secocto-result-{encodeURIComponent(fullName)} 或
    //   secocto-result-{encodeURIComponent(fullName?proposals=24,25)}
    const raw = decodeURIComponent(ctx.currentView.replace('secocto-result-', ''));
    const qIdx = raw.indexOf('?');
    const fullName = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    const query = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
    let proposalIds: number[] | undefined;
    if (query) {
      const params = new URLSearchParams(query);
      const rawIds = params.get('proposals');
      if (rawIds) {
        proposalIds = rawIds.split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        if (!proposalIds.length) proposalIds = undefined;
      }
    }
    return <SecOctoResultPage
      fullName={fullName}
      proposalIds={proposalIds}
      decisionId={0}
      onBack={() => ctx.setCurrentView(`secocto-skill-${encodeURIComponent(fullName)}`)}
      onNavigateSkills={() => ctx.setCurrentView('secocto-skills')}
    />;
  }

  // 不命中任何 secocto 形态 → 返回 null,让框架 default 走"开发中"占位
  return null;
};
