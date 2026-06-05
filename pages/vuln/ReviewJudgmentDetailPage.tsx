import React, { useState } from 'react';
import { ArrowLeft, Save, Send, AlertTriangle, CheckCircle2, XCircle, FileText } from 'lucide-react';

interface ReviewJudgmentDetailPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

/**
 * 评审研判详情页
 *
 * 对单个漏洞案例进行详细评审，包括：
 * - 漏洞基本信息展示
 * - 评审结论填写（真实性、严重程度、置信度）
 * - 证据链与时间线
 * - 处置建议
 *
 * 业务逻辑待后续开发填充。
 */
export const ReviewJudgmentDetailPage: React.FC<ReviewJudgmentDetailPageProps> = ({ projectId, onNavigateToView }) => {
  const [conclusion, setConclusion] = useState('');
  const [severity, setSeverity] = useState('');
  const [confidence, setConfidence] = useState('');
  const [evidence, setEvidence] = useState('');
  const [suggestion, setSuggestion] = useState('');

  const handleBack = () => {
    onNavigateToView?.('vuln-review-judgment');
  };

  const handleSave = () => {
    // TODO: 保存评审草稿
  };

  const handleSubmit = () => {
    // TODO: 提交评审结论
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          title="返回评审列表"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-white">评审研判详情</h1>
          <p className="text-xs text-slate-500 mt-0.5">对漏洞案例进行详细评审并给出结论</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            <Save size={14} />
            保存草稿
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
          >
            <Send size={14} />
            提交评审
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Review Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vulnerability Info Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                漏洞信息
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex gap-4">
                  <span className="text-slate-500 w-20 shrink-0">漏洞编号</span>
                  <span className="text-slate-300">--</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-slate-500 w-20 shrink-0">漏洞标题</span>
                  <span className="text-slate-300">--</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-slate-500 w-20 shrink-0">所属项目</span>
                  <span className="text-slate-300">--</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-slate-500 w-20 shrink-0">当前阶段</span>
                  <span className="text-slate-300">研判阶段</span>
                </div>
              </div>
            </div>

            {/* Review Conclusion */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-base font-bold text-white mb-4">评审结论</h2>

              <div className="space-y-4">
                {/* Verdict */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    漏洞真实性判定
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'confirmed', label: '确认漏洞', icon: AlertTriangle, color: 'border-rose-500 bg-rose-500/10 text-rose-300' },
                      { value: 'suspicious', label: '疑似漏洞', icon: CheckCircle2, color: 'border-amber-500 bg-amber-500/10 text-amber-300' },
                      { value: 'false_positive', label: '误报', icon: XCircle, color: 'border-emerald-500 bg-emerald-500/10 text-emerald-300' },
                    ].map((opt) => {
                      const isActive = conclusion === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setConclusion(opt.value)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border rounded-xl transition-all ${
                            isActive
                              ? opt.color + ' border-current'
                              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          <Icon size={14} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Severity */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    严重程度评估
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {['critical', 'high', 'medium', 'low', 'info'].map((level) => {
                      const isActive = severity === level;
                      const colors: Record<string, string> = {
                        critical: 'border-rose-500 bg-rose-500/10 text-rose-300',
                        high: 'border-orange-500 bg-orange-500/10 text-orange-300',
                        medium: 'border-amber-500 bg-amber-500/10 text-amber-300',
                        low: 'border-blue-500 bg-blue-500/10 text-blue-300',
                        info: 'border-slate-500 bg-slate-500/10 text-slate-300',
                      };
                      const labels: Record<string, string> = {
                        critical: '严重',
                        high: '高危',
                        medium: '中危',
                        low: '低危',
                        info: '信息',
                      };
                      return (
                        <button
                          key={level}
                          onClick={() => setSeverity(level)}
                          className={`px-3 py-2 text-sm font-bold border rounded-xl transition-all ${
                            isActive
                              ? colors[level] + ' border-current'
                              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          {labels[level]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    评审置信度
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'high', label: '高' },
                      { value: 'medium', label: '中' },
                      { value: 'low', label: '低' },
                    ].map((opt) => {
                      const isActive = confidence === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setConfidence(opt.value)}
                          className={`px-4 py-2 text-sm font-bold border rounded-xl transition-all ${
                            isActive
                              ? 'border-blue-500 bg-blue-500/10 text-blue-300 border-current'
                              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Evidence */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    证据描述
                  </label>
                  <textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="请描述评审依据和关键证据..."
                    rows={5}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200
                      placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                </div>

                {/* Suggestion */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    处置建议
                  </label>
                  <textarea
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    placeholder="请描述建议的处置措施..."
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200
                      placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">评审状态</h3>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-sm font-bold text-amber-400">草稿</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">评审尚未提交</p>
            </div>

            {/* Timeline Placeholder */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">操作时间线</h3>
              <div className="text-xs text-slate-500 py-4 text-center">
                暂无操作记录
              </div>
            </div>

            {/* Reviewer Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">评审信息</h3>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span className="text-slate-500">评审人</span>
                  <span className="text-slate-300">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">创建时间</span>
                  <span className="text-slate-300">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">更新时间</span>
                  <span className="text-slate-300">--</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};