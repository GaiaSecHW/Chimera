import React from 'react';
import { DataTable, DataTableColumn, PageHeader } from '../../design-system';

interface ReviewJudgmentPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

/**
 * 评审研判主页面
 *
 * 作为"漏洞/研判阶段"下的二级目录视图，提供评审研判任务的整体管理入口，
 * 包括评审任务列表、研判案例池、批量操作等功能。
 *
 * 业务逻辑待后续开发填充。
 */
export const ReviewJudgmentPage: React.FC<ReviewJudgmentPageProps> = ({ projectId, onNavigateToView }) => {
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <PageHeader
        title="评审研判"
        description="围绕研判阶段的漏洞案例进行专家评审，形成评审结论、证据链与处置建议。"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: '待评审', value: '0', color: LK.warning },
            { label: '评审中', value: '0', color: LK.info },
            { label: '已完成', value: '0', color: LK.success },
            { label: '已驳回', value: '0', color: LK.error },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div
            className="rounded-xl p-5 lg:col-span-2"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: LK.ink }}>
                评审任务列表
              </h2>
              <button
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryDeep)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = LK.primary)}
                onClick={() => {/* TODO: create task */}}
              >
                创建评审任务
              </button>
            </div>
            <div className="py-16 text-center text-sm" style={{ color: LK.muted }}>
              暂无评审任务，点击上方按钮创建新任务。
            </div>
          </div>

          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <h2 className="mb-4 text-base font-semibold" style={{ color: LK.ink }}>
              快捷操作
            </h2>
            <div className="space-y-2">
              {[
                { label: '新建评审任务', icon: '📋' },
                { label: '导入研判案例', icon: '📥' },
                { label: '批量评审', icon: '⚡' },
                { label: '导出评审报告', icon: '📤' },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
                  style={{ color: LK.body }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                    e.currentTarget.style.color = LK.ink;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = LK.body;
                  }}
                >
                  <span>{action.icon}</span>
                  <span className="font-medium">{action.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4" style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                阶段说明
              </h3>
              <div className="space-y-2 text-xs" style={{ color: LK.body }}>
                <p>• 评审研判是对研判阶段漏洞案例的二次确认</p>
                <p>• 由安全专家对漏洞真实性、严重程度进行独立评审</p>
                <p>• 评审结果将作为漏洞生命周期推进的关键依据</p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-6 rounded-xl p-5"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <h2 className="mb-4 text-base font-semibold" style={{ color: LK.ink }}>
            评审记录
          </h2>
          {(() => {
            interface ReviewRecord {
              id: string;
              case: string;
              conclusion: string;
              severity: string;
              reviewer: string;
              status: string;
              updatedAt: string;
              action: string;
            }
            const columns: DataTableColumn<ReviewRecord>[] = [
              { key: 'case', header: '漏洞案例', render: (r) => r.case },
              { key: 'conclusion', header: '评审结论', render: (r) => r.conclusion },
              { key: 'severity', header: '严重程度', render: (r) => r.severity },
              { key: 'reviewer', header: '评审人', render: (r) => r.reviewer },
              { key: 'status', header: '状态', render: (r) => r.status },
              { key: 'updatedAt', header: '更新时间', render: (r) => r.updatedAt },
              { key: 'action', header: '操作', render: (r) => r.action },
            ];
            const records: ReviewRecord[] = [];
            return (
              <DataTable<ReviewRecord>
                columns={columns}
                data={records}
                rowKey={(r) => String(r.id)}
                loading={false}
                empty="暂无评审记录，请先创建评审任务并关联研判案例。"
              />
            );
          })()}

          <div className="mt-4 flex items-center justify-between pt-4" style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
            <span className="text-xs" style={{ color: LK.muted }}>共 0 条记录</span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.muted, border: `1px solid ${LK.border}` }}
                disabled
              >
                上一页
              </button>
              <span className="text-xs" style={{ color: LK.mutedSoft }}>1 / 1</span>
              <button
                className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.muted, border: `1px solid ${LK.border}` }}
                disabled
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};