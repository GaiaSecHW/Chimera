import React from 'react';
import { saveHomeCreateTaskMode } from '../utils/executionReturnContext';

interface HomePageProps {
  setCurrentView: (view: string) => void;
}

const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
} as const;

const MODES = [
  {
    key: 'dragon-tail',
    name: '龙尾',
    en: 'Dragon Tail',
    tagline: '广域探索',
    summary: '横扫资产面，规模化复现已知漏洞，覆盖度优先。',
    points: ['资产发现 + 全量扫描', '模式库即查即用', '适合合规与基线验证'],
    accent: '#4f73ff',
  },
  {
    key: 'ram-horn',
    name: '羊角',
    en: 'Ram Horn',
    tagline: '深度挖掘',
    summary: '锁定单一目标，多能力组合深挖，找到未知漏洞。',
    points: ['能力编排 + 链路推进', '攻击路径推断', '适合重点目标深挖'],
    accent: '#7590ff',
  },
  {
    key: 'lion-head',
    name: '狮首',
    en: 'Lion Head',
    tagline: '巅峰突破',
    summary: '智能体群协作调度，按场景挑选最优能力与节奏。',
    points: ['多 Agent 协同', '动态任务编排', '适合复杂场景自治'],
    accent: '#3f63f1',
  },
] as const;

export const HomePage: React.FC<HomePageProps> = ({ setCurrentView }) => {
  const handleCardClick = (modeKey: string) => {
    saveHomeCreateTaskMode(modeKey);
    setCurrentView('task-list');
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: LK.canvas }}>
      <div className="mx-auto max-w-[1180px] px-8 py-6">
        {/* Hero */}
        <section className="flex flex-col items-center text-center pt-2 pb-16">
          <h1
            className="mt-7 text-5xl font-semibold tracking-tight"
            style={{ color: LK.ink }}
          >
            奇美拉 <span style={{ color: LK.primarySoft }}>Chimera</span>
          </h1>

          <p
            className="mt-5 text-xl font-semibold"
            style={{ color: LK.inkSoft }}
          >
            智能体群协作 AI 安全验证平台
          </p>

          <p
            className="mt-4 max-w-[720px] text-[15px] leading-7"
            style={{ color: LK.body }}
          >
            面向安全团队与产品团队，将安全专家的经验转化为可复用的自动化能力。
            以「双轨制 + 进化闭环 + 引擎三层」为核心，让安全验证从一次性脚本走向可持续演进的智能体群协作。
          </p>
        </section>

        {/* Modes — 突出 3 种模式 */}
        <section className="pb-16">
          <div className="mb-8 flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold" style={{ color: LK.ink }}>
              三种执行模式，覆盖全场景
            </h2>
            <p className="mt-3 text-sm" style={{ color: LK.muted }}>
              根据目标特征自动收敛到最优模式 —— 龙尾横扫 / 羊角深挖 / 狮首人机协同
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {MODES.map((mode) => (
              <div
                key={mode.key}
                className="group relative flex flex-col rounded-2xl p-6 transition-transform hover:-translate-y-1 cursor-pointer"
                style={{
                  backgroundColor: LK.surface,
                  border: `1px solid ${LK.border}`,
                }}
                onClick={() => handleCardClick(mode.key)}
              >
                <div
                  className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
                  style={{ backgroundColor: mode.accent }}
                />
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold" style={{ color: LK.ink }}>
                    {mode.name}
                  </span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: LK.muted }}
                  >
                    {mode.en}
                  </span>
                </div>

                <span
                  className="mt-3 inline-flex self-start rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    color: mode.accent,
                    backgroundColor: LK.primaryMuted,
                  }}
                >
                  {mode.tagline}
                </span>

                <p className="mt-4 text-[13px] leading-6" style={{ color: LK.body }}>
                  {mode.summary}
                </p>

                <ul className="mt-5 space-y-2">
                  {mode.points.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-2 text-[13px]"
                      style={{ color: LK.inkSoft }}
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: mode.accent }}
                      />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="flex justify-center pb-8">
          <button
            onClick={() => setCurrentView('project-mgmt')}
            className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: LK.primary }}
          >
            进入平台 →
          </button>
        </section>
      </div>
    </div>
  );
};
