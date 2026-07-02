import React, { useEffect, useState } from 'react';
import { ServiceBuildVersionBadge } from '../components/execution/ServiceBuildVersion';
import banner1Img from '@/assets/homeBanner/banner1.png';
import banner2Img from '@/assets/homeBanner/banner2.png';
import banner3Img from '@/assets/homeBanner/banner3.png';
import banner4Img from '@/assets/homeBanner/banner4.png';
import banner5Img from '@/assets/homeBanner/banner5.png';
import banner6Img from '@/assets/homeBanner/banner6.png';
import banner7Img from '@/assets/homeBanner/banner7.png';
import dragonImg from '@/assets/images/dragon.png';
import sheepImg from '@/assets/images/sheep.png';
import lionImg from '@/assets/images/lion.png';

interface HomePageProps {
  setCurrentView: (view: string) => void;
}

const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
} as const;

// 科技背景轮播：每张为多层 CSS（网格 + 光晕），全部用主题变量 + color-mix，
// 深浅两套主题下都自适应、与界面同色系，且透明度低不遮挡文字。
const BG_SLIDES: string[] = [
  `linear-gradient(to right, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
linear-gradient(to bottom, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
radial-gradient(circle at 18% 35%, color-mix(in srgb, var(--brand-primary) 26%, transparent), transparent 55%) 0 0 / cover no-repeat,
radial-gradient(circle at 82% 55%, color-mix(in srgb, var(--brand-secondary) 20%, transparent), transparent 55%) 0 0 / cover no-repeat`,
  `linear-gradient(to right, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
linear-gradient(to bottom, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
radial-gradient(circle at 78% 28%, color-mix(in srgb, var(--brand-secondary) 24%, transparent), transparent 55%) 0 0 / cover no-repeat,
radial-gradient(circle at 22% 60%, color-mix(in srgb, var(--brand-primary) 22%, transparent), transparent 55%) 0 0 / cover no-repeat`,
  `linear-gradient(to right, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
linear-gradient(to bottom, color-mix(in srgb, var(--text-primary) 6%, transparent) 1px, transparent 1px) 0 0 / 44px 44px repeat,
radial-gradient(circle at 50% 22%, color-mix(in srgb, var(--brand-primary) 24%, transparent), transparent 60%) 0 0 / cover no-repeat,
radial-gradient(circle at 72% 68%, color-mix(in srgb, var(--brand-secondary) 18%, transparent), transparent 50%) 0 0 / cover no-repeat`,
];

// 玻璃面板：主题自适应的半透明表面 + 边框，保证文字可读。
const GLASS_BG = 'color-mix(in srgb, var(--bg-surface) 80%, transparent)';
const GLASS_BORDER = 'color-mix(in srgb, var(--border-default) 65%, transparent)';

// 背景带底部消散：顶部到 60% 不透明，之后渐变到透明。
const FADE_MASK = 'linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)';

const MODES = [
  {
    key: 'dragon-tail',
    name: '龙尾',
    en: 'Dragon Tail',
    tagline: '广域探索',
    summary: '横扫资产面，规模化复现已知漏洞，覆盖度优先。',
    points: ['资产发现 + 全量扫描', '模式库即查即用', '适合合规与基线验证'],
    bg: 'rgba(37, 99, 235, 0.08)',
    accent: '#2563EB',
    jumpMsg: '进入扫描',
  },
  {
    key: 'ram-horn',
    name: '羊角',
    en: 'Ram Horn',
    tagline: '深度挖掘',
    summary: '锁定单一目标，多能力组合深挖，找到未知漏洞。',
    points: ['能力编排 + 链路推进', '攻击路径推断', '适合重点目标深挖'],
    bg: 'rgba(232, 168, 56, 0.12)',
    accent: '#D97706',
    jumpMsg: '开始挖掘',
  },
  {
    key: 'lion-head',
    name: '狮首',
    en: 'Lion Head',
    tagline: '巅峰突破',
    summary: '智能体群协作调度，按场景挑选最优能力与节奏。',
    points: ['多 Agent 协同', '动态任务编排', '适合复杂场景自治'],
    bg: 'rgba(48, 164, 108, 0.12)',
    accent: '#059669',
    jumpMsg: '启动协同',
  },
] as const;

const MODE_ICONS: Record<string, React.ReactNode> = {
  'dragon-tail': <img src={dragonImg} alt="龙尾" className="h-10 w-10 object-contain" />,
  'ram-horn': <img src={sheepImg} alt="羊角" className="h-10 w-10 object-contain" />,
  'lion-head': <img src={lionImg} alt="狮首" className="h-10 w-10 object-contain" />,
};

const PROMO_SLIDES = [
  { title: '第一章 · 降生', subtitle: '四世神裔，融源之子的来历', image: banner1Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22379614?l=zh-cn' },
  { title: '第二章 · 三身', subtitle: '一体三面，各司其职的完美共生', image: banner2Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22382361?l=zh-cn' },
  { title: '第三章 · 吐息', subtitle: '烈焰淬炼，重塑万物本真', image: banner3Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22385845?l=zh-cn' },
  { title: '第四章 · 破局', subtitle: '旧维失效，新序诞生的必然', image: banner4Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386057?l=zh-cn' },
  { title: '第五章 · 驭者', subtitle: '顺势而为，维度跃升', image: banner5Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386058?l=zh-cn' },
  { title: '第六章 · 群像', subtitle: '从一躯真身，到一世图腾', image: banner6Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386060?l=zh-cn' },
  { title: '第七章 · 永续', subtitle: '图腾永生，融合求真永不止歇', image: banner7Img, link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386062?l=zh-cn' }
];

export const HomePage: React.FC<HomePageProps> = ({ setCurrentView }) => {
  const handlePromoClick = (link: string) => {
    if (link && link !== '#') {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  const [bgIndex, setBgIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBgIndex((i) => (i + 1) % BG_SLIDES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const [promoIndex, setPromoIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setPromoIndex((i) => (i + 1) % PROMO_SLIDES.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="h-full overflow-y-auto isolate relative" style={{ backgroundColor: LK.canvas }}>
      {/* tech background band: crossfade slides, fading toward the bottom */}
      <div
        className="absolute inset-x-0 top-0 z-0 h-[42vh] overflow-hidden pointer-events-none"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        {BG_SLIDES.map((bg, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-[1500ms] ease-in-out"
            style={{ background: bg, opacity: i === bgIndex ? 1 : 0 }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full px-8 sm:px-12 lg:px-20 xl:px-28 2xl:px-40 pt-10 pb-8 space-y-8 lg:space-y-12 lg:pt-14 xl:pt-16">
        {/* hero */}
        <header className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl opacity-60 blur-xl" style={{ background: 'radial-gradient(circle, var(--brand-primary) 0%, transparent 70%)' }} />
              <img alt="Chimera" className="relative w-20 h-20 rounded-2xl" src={`/logo.png`} />
            </div>
            <h1
                className="text-4xl font-bold tracking-tight md:text-5xl xl:text-6xl 2xl:text-7xl"
                style={{
                  background: 'linear-gradient(120deg, var(--brand-primary) 0%, #818cf8 45%, #c084fc 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
            >
              ICSL Chimera
            </h1>
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-theme-text-muted backdrop-blur" style={{ backgroundColor: GLASS_BG, borderColor: GLASS_BORDER }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              AI辅助安全验证平台
            </span>
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:justify-between lg:items-center">

            <div className="max-w-3xl border-l-2 pl-6 lg:max-w-2xl xl:max-w-3xl 2xl:max-w-4xl" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' }}>
              <p className="text-sm leading-relaxed text-theme-text-secondary md:text-base">
                面向安全验证的群体AI智能体平台。将ICSL安全专家的经验与智慧，转化为可编排、可进化的AI智能体集群，以龙尾、羊角、狮首三种模式，驱动自动化安全验证，看护每一个版本风险。
              </p>
            </div>
          </div>
        </header>

        {/* promo carousel — slim banner, imgs to be filled later */}
        <section className="relative h-36 overflow-hidden rounded-2xl border md:h-40 lg:h-44 xl:h-48 2xl:h-52" style={{ backgroundColor: GLASS_BG, borderColor: GLASS_BORDER }}>
          {PROMO_SLIDES.map((slide, i) => (
            <div
              key={i}
              role="button"
              tabIndex={i === promoIndex ? 0 : -1}
              onClick={() => handlePromoClick(slide.link)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePromoClick(slide.link); } }}
              className="absolute inset-0 cursor-pointer select-none transition-opacity duration-700 ease-in-out"
              style={{
                opacity: i === promoIndex ? 1 : 0,
                pointerEvents: i === promoIndex ? 'auto' : 'none',
                background: 'linear-gradient(120deg, color-mix(in srgb, var(--brand-primary) 18%, var(--bg-surface)) 0%, color-mix(in srgb, var(--brand-secondary) 12%, var(--bg-surface)) 100%)',
              }}
            >
              <img src={slide.image} alt={slide.title} className="absolute inset-0 h-full w-full object-cover" style={{ display: slide.image ? 'block' : 'none' }} />
            </div>
          ))}
          <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
            {PROMO_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPromoIndex(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === promoIndex ? 18 : 6,
                  backgroundColor: i === promoIndex ? 'var(--brand-primary)' : 'color-mix(in srgb, var(--text-secondary) 45%, transparent)',
                }}
                aria-label={`切换到第 ${i + 1} 张`}
              />
            ))}
          </div>
        </section>

        {/* section header */}
        <div className="flex flex-wrap items-end justify-left gap-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', boxShadow: '0 0 10px var(--brand-primary)' }} />
            <h2 className="text-xl font-semibold text-theme-text-primary md:text-2xl xl:text-3xl">三种执行模式，覆盖全场景</h2>
          </div>
          <p className="text-sm text-theme-text-muted">根据目标特征自动收敛到最优模式</p>
          <button
            type="button"
            onClick={() => setCurrentView('project-mgmt')}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: 'var(--brand-primary)', boxShadow: '0 8px 24px -8px var(--brand-primary)' }}
          >
            开始使用
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </button>
        </div>

        {/* mode cards */}
        <div className="grid gap-6 md:grid-cols-3 lg:gap-8 xl:gap-10 2xl:gap-12">
          {MODES.map((mode) => (
            <div
              key={mode.key}
              className="group relative overflow-hidden rounded-2xl border p-7 text-left backdrop-blur-xl transition-all duration-300 lg:p-8 xl:p-9 2xl:p-10"
              style={{ backgroundColor: GLASS_BG, borderColor: GLASS_BORDER }}
            >
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity duration-300 group-hover:opacity-40" style={{ backgroundColor: mode.accent }} />
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: mode.bg, color: mode.accent, boxShadow: `0 0 24px ${mode.accent}33` }}>
                    {MODE_ICONS[mode.key]}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-theme-text-primary">{mode.name}</div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-theme-text-muted">{mode.en}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold" style={{ color: mode.accent }}>{mode.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-theme-text-secondary">{mode.summary}</p>
                <ul className="mt-5 space-y-2.5">
                  {mode.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[13px] text-theme-text-secondary">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: mode.accent }}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="m9 12 2 2 4-4"></path>
                      </svg>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
