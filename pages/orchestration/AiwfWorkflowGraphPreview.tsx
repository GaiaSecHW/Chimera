import React, { useMemo } from 'react';

import { AiwfCard, prettyJson } from './AiwfShared';

type WorkflowNode = {
  id: string;
  name: string;
  type: string;
  description?: string;
};

export const AiwfWorkflowGraphPreview: React.FC<{
  definitionJson: Record<string, any> | null;
}> = ({ definitionJson }) => {
  const workflows = useMemo(() => {
    const payload = definitionJson || {};
    const atomic = Array.isArray(payload?.workflows?.atomic) ? payload.workflows.atomic : [];
    const composite = Array.isArray(payload?.workflows?.composite) ? payload.workflows.composite : [];
    return [
      ...atomic.map((item: any) => ({
        id: String(item?.id || ''),
        name: String(item?.name || item?.id || 'Unnamed Atomic'),
        type: 'atomic',
        description: String(item?.description || ''),
        stageCount: 0,
      })),
      ...composite.map((item: any) => ({
        id: String(item?.id || ''),
        name: String(item?.name || item?.id || 'Unnamed Composite'),
        type: 'composite',
        description: String(item?.description || ''),
        stageCount: Array.isArray(item?.stages) ? item.stages.length : 0,
      })),
    ];
  }, [definitionJson]);

  const entryWorkflowId = String(definitionJson?.execution?.entry_workflow || '');
  const entryWorkflowType = String(definitionJson?.execution?.entry_workflow_type || '');

  return (
    <AiwfCard className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-black text-slate-900">流程结构预览</div>
        <div className="mt-1 text-xs text-slate-500">当前为轻量图形预览，会优先展示 entry workflow 与工作流节点关系。</div>
      </div>
      {!definitionJson ? (
        <div className="px-5 py-10 text-sm text-slate-500">暂无 definition JSON。</div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Entry Workflow</div>
            <div className="mt-2 text-sm font-black text-slate-900">{entryWorkflowId || '未设置'}</div>
            <div className="mt-1 text-xs text-slate-600">{entryWorkflowType || '未设置类型'}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {workflows.map((workflow) => (
              <div key={`${workflow.type}:${workflow.id}`} className={`rounded-2xl border px-4 py-3 ${workflow.id === entryWorkflowId ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">{workflow.name}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{workflow.id}</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">
                    {workflow.type}
                  </span>
                </div>
                {workflow.description ? <div className="mt-3 text-sm text-slate-600">{workflow.description}</div> : null}
                {workflow.type === 'composite' ? (
                  <div className="mt-3 text-xs font-bold text-slate-500">Stages: {workflow.stageCount}</div>
                ) : null}
              </div>
            ))}
          </div>
          <details className="rounded-2xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">查看原始 JSON 摘要</summary>
            <pre className="overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
              {prettyJson(definitionJson)}
            </pre>
          </details>
        </div>
      )}
    </AiwfCard>
  );
};
