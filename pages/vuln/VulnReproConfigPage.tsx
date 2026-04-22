import React from 'react';
import { VulnEnginePage } from './VulnEnginePage';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

export const VulnReproConfigPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => (
  <VulnEnginePage
    projectId={projectId}
    currentViewId="vuln-repro-config"
    onNavigateToView={onNavigateToView}
    initialWorkspaceView="repro"
    pageTitle="漏洞上报复现模块配置"
    pageDescription="针对漏洞上报、复现、自动化确认类模块配置注册信息、阶段绑定与能力关联关系。"
    hideLifecycleChrome
    showWorkspaceTabs={false}
    showStats={false}
    summaryCards={[
      { label: '关键阶段范围', source: 'scope_count', helper: '验证阶段当前关联的疑点量级。' },
      { label: '注册服务数', source: 'metric:registered_services', helper: '当前已经注册到漏洞引擎的能力服务。' },
      { label: '排队动作数', source: 'metric:queued_actions', helper: '队列中的动作越多，越需要关注阶段绑定与模块质量。' },
      { label: '活跃服务数', source: 'metric:active_services', helper: '当前可用并能被调度的服务数量。' },
    ]}
    initialServiceForm={{
      service_type: 'validator',
      action_type: 'validation',
      module_role: 'reproducer',
      bind_stage: 'validation',
    }}
    phaseHighlights={[
      '这里专门处理疑点复现与验证模块的注册元数据、阶段绑定和能力关联。',
      '复现模块配置不只是注册服务，还要明确它服务于验证或终态回传。',
      '建议把自动确认、验证脚本生成和结果回传模块拆成不同能力声明。'
    ]}
    phaseActions={[
      '为复现或上报模块补全阶段绑定、模块角色和回传方式。',
      '检查阶段关联矩阵，确认验证与结束两个关键阶段都有合适模块。',
      '配置完成后回到验证阶段或结束管理页面直接消费这些模块。'
    ]}
    phaseActionLinks={[
      { label: '去验证复现', view: 'vuln-verification' },
      { label: '去结束管理', view: 'vuln-decision' },
      { label: '去能力注册', view: 'vuln-services' },
    ]}
  />
);
