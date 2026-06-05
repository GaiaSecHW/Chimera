import React from 'react';

interface ReviewJudgmentPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

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
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-slate-800">
        <h1 className="text-xl font-black text-white tracking-tight">评审研判</h1>
        <p className="mt-1 text-sm text-slate-400">
          围绕研判阶段的漏洞案例进行专家评审，形成评审结论、证据链与处置建议。
        </p>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: '待评审', value: '0', color: 'text-amber-400' },
            { label: '评审中', value: '0', color: 'text-blue-400' },
            { label: '已完成', value: '0', color: 'text-emerald-400' },
            { label: '已驳回', value: '0', color: 'text-rose-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Review Task List */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">评审任务列表</h2>
              <button
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
                onClick={() => {/* TODO: create task */}}
              >
                创建评审任务
              </button>
            </div>
            <div className="text-center py-16 text-slate-500 text-sm">
              暂无评审任务，点击上方按钮创建新任务。
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-bold text-white mb-4">快捷操作</h2>
            <div className="space-y-2">
              {[
                { label: '新建评审任务', icon: '📋' },
                { label: '导入研判案例', icon: '📥' },
                { label: '批量评审', icon: '⚡' },
                { label: '导出评审报告', icon: '📤' },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl transition-colors text-left"
                >
                  <span>{action.icon}</span>
                  <span className="font-medium">{action.label}</span>
                </button>
              ))}
            </div>

            {/* Phase Context */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">阶段说明</h3>
              <div className="space-y-2 text-xs text-slate-400">
                <p>• 评审研判是对研判阶段漏洞案例的二次确认</p>
                <p>• 由安全专家对漏洞真实性、严重程度进行独立评审</p>
                <p>• 评审结果将作为漏洞生命周期推进的关键依据</p>
              </div>
            </div>
          </div>
        </div>

        {/* Review Judgments Table Placeholder */}
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-base font-bold text-white mb-4">评审记录</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                <th className="pb-3 font-bold">漏洞案例</th>
                <th className="pb-3 font-bold">评审结论</th>
                <th className="pb-3 font-bold">严重程度</th>
                <th className="pb-3 font-bold">评审人</th>
                <th className="pb-3 font-bold">状态</th>
                <th className="pb-3 font-bold">更新时间</th>
                <th className="pb-3 font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  暂无评审记录，请先创建评审任务并关联研判案例。
                </td>
              </tr>
            </tbody>
          </table>

          {/* Pagination Placeholder */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-500">共 0 条记录</span>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 text-xs text-slate-500 bg-slate-800 rounded-lg cursor-not-allowed">上一页</button>
              <span className="text-xs text-slate-400">1 / 1</span>
              <button className="px-3 py-1 text-xs text-slate-500 bg-slate-800 rounded-lg cursor-not-allowed">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};