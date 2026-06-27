import React, { useState } from 'react';
import { ArrowLeft, Save, Send, AlertTriangle, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { PageHeader } from '../../design-system';

interface ReviewJudgmentDetailPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <PageHeader
        title="评审研判详情"
        description="对漏洞案例进行详细评审并给出结论"
        back={{ label: '返回评审列表', onClick: handleBack }}
        actions={<>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = LK.surface;
              e.currentTarget.style.color = LK.ink;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = LK.surfaceRaised;
              e.currentTarget.style.color = LK.body;
            }}
          >
            <Save size={14} />
            保存草稿
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: LK.primary, color: '#ffffff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryDeep)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = LK.primary)}
          >
            <Send size={14} />
            提交评审
          </button>
        </>}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: LK.ink }}>
                <FileText size={16} style={{ color: LK.muted }} />
                漏洞信息
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex gap-4">
                  <span className="w-20 shrink-0" style={{ color: LK.muted }}>漏洞编号</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
                <div className="flex gap-4">
                  <span className="w-20 shrink-0" style={{ color: LK.muted }}>漏洞标题</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
                <div className="flex gap-4">
                  <span className="w-20 shrink-0" style={{ color: LK.muted }}>所属项目</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
                <div className="flex gap-4">
                  <span className="w-20 shrink-0" style={{ color: LK.muted }}>当前阶段</span>
                  <span style={{ color: LK.body }}>研判阶段</span>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <h2 className="text-base font-semibold mb-4" style={{ color: LK.ink }}>
                评审结论
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LK.muted }}>
                    漏洞真实性判定
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'confirmed', label: '确认漏洞', icon: AlertTriangle, color: LK.error },
                      { value: 'suspicious', label: '疑似漏洞', icon: CheckCircle2, color: LK.warning },
                      { value: 'false_positive', label: '误报', icon: XCircle, color: LK.success },
                    ].map((opt) => {
                      const isActive = conclusion === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setConclusion(opt.value)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border rounded-lg transition-colors"
                          style={{
                            backgroundColor: isActive ?`${opt.color}22` : 'transparent',
                            borderColor: isActive ? opt.color : LK.border,
                            color: isActive ? opt.color : LK.body,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.borderSoft;
                              e.currentTarget.style.color = LK.inkSoft;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.border;
                              e.currentTarget.style.color = LK.body;
                            }
                          }}
                        >
                          <Icon size={14} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LK.muted }}>
                    严重程度评估
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { level: 'critical', label: '严重', color: LK.error },
                      { level: 'high', label: '高危', color: '#f97316' },
                      { level: 'medium', label: '中危', color: LK.warning },
                      { level: 'low', label: '低危', color: LK.info },
                      { level: 'info', label: '信息', color: LK.muted },
                    ].map((item) => {
                      const isActive = severity === item.level;
                      return (
                        <button
                          key={item.level}
                          onClick={() => setSeverity(item.level)}
                          className="px-3 py-2 text-sm font-semibold border rounded-lg transition-colors"
                          style={{
                            backgroundColor: isActive ?`${item.color}22` : 'transparent',
                            borderColor: isActive ? item.color : LK.border,
                            color: isActive ? item.color : LK.body,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.borderSoft;
                              e.currentTarget.style.color = LK.inkSoft;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.border;
                              e.currentTarget.style.color = LK.body;
                            }
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LK.muted }}>
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
                          className="px-4 py-2 text-sm font-semibold border rounded-lg transition-colors"
                          style={{
                            backgroundColor: isActive ? LK.primaryMuted : 'transparent',
                            borderColor: isActive ? LK.primary : LK.border,
                            color: isActive ? LK.primary : LK.body,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.borderSoft;
                              e.currentTarget.style.color = LK.inkSoft;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = LK.border;
                              e.currentTarget.style.color = LK.body;
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LK.muted }}>
                    证据描述
                  </label>
                  <textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="请描述评审依据和关键证据..."
                    rows={5}
                    className="w-full resize-none rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LK.muted }}>
                    处置建议
                  </label>
                  <textarea
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    placeholder="请描述建议的处置措施..."
                    rows={3}
                    className="w-full resize-none rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: LK.muted }}>
                评审状态
              </h3>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LK.warning }} />
                <span className="text-sm font-semibold" style={{ color: LK.warning }}>
                  草稿
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: LK.muted }}>
                评审尚未提交
              </p>
            </div>

            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: LK.muted }}>
                操作时间线
              </h3>
              <div className="text-xs py-4 text-center" style={{ color: LK.muted }}>
                暂无操作记录
              </div>
            </div>

            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: LK.muted }}>
                评审信息
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: LK.muted }}>评审人</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: LK.muted }}>创建时间</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: LK.muted }}>更新时间</span>
                  <span style={{ color: LK.body }}>--</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};