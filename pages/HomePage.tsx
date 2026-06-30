import React, { useEffect, useState } from 'react';
import { saveHomeCreateTaskMode } from '../utils/executionReturnContext';
import { ServiceBuildVersionBadge } from '../components/execution/ServiceBuildVersion';

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
  'dragon-tail': (
    <svg viewBox="0 0 1024 1024" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M128 384V160c0-17.6 14.4-32 32-32h224v64H192v192h-64z m512-192h192v192h64V160c0-17.6-14.4-32-32-32H640v64z m192 448v192H640v64h224c17.6 0 32-14.4 32-32V640h-64z m-448 192H192V640h-64v224c0 17.6 14.4 32 32 32h224v-64z m512-352H128v64h768v-64z" />
    </svg>
  ),
  'ram-horn': (
    <svg viewBox="0 0 1024 1024" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M545.70715308 210.42529273v99.28729272c0 9.37353516-3.29754663 17.30346656-9.9074707 23.89855981-6.56048608 6.59014916-14.52502465 9.88769508-23.82934546 9.88769507-9.3092649 0-17.24908448-3.29754663-23.81945801-9.88769507-6.61486816-6.59509253-9.89758325-14.52502465-9.89758325-23.89855981V210.42529273c-34.78491234 3.91552734-67.72576928 13.49670411-98.88189698 28.7385869-31.16107178 15.24188209-58.49560547 34.70581055-82.05303907 58.18908644-23.52282715 23.58709741-42.92742944 50.88207984-58.19403124 82.09259034-15.2666018 31.1017456-24.83294702 64.06237817-28.69409155 98.7731328h99.29223608c9.3092649 0 17.25402856 3.39642334 23.81451464 9.98657178 6.62475562 6.59509253 9.89758325 14.52502465 9.89758254 23.79473901 0 9.37353516-3.27777099 17.20458984-9.89758254 23.89361572-6.56542945 6.49127173-14.50524903 9.78881836-23.81451464 9.78881836H210.42529273c3.85620117 34.80963135 13.42749047 67.77026391 28.69409227 98.87695289 15.2666018 31.20556641 34.67120337 58.50054955 58.19403052 82.08764696 23.52777124 23.58215333 50.89196801 42.94720435 82.05303979 58.18908644 31.15612769 15.24682617 64.14642334 24.82305884 98.87695289 28.7385869v-99.28729272c0-9.37353516 3.28765845-17.30346656 9.90252662-23.89855981 6.57531762-6.59014916 14.51019311-9.88769508 23.8244021-9.88769507 9.29937744 0 17.26391602 3.29754663 23.82440209 9.88769507 6.60992408 6.59509253 9.9074707 14.52502465 9.9074707 23.89855981V813.57470727c34.78491234-3.91552734 67.71093773-13.49670411 98.87695289-28.7385869 31.16107178-15.24188209 58.48571801-34.70581055 82.01348853-58.18908644 23.55743432-23.58709741 42.96203589-50.88207984 58.21875024-82.09259034 15.27648926-31.1017456 24.81811547-64.06237817 28.69409155-98.87695359h-99.27246045c-9.32409644 0-17.26391602-3.29260253-23.8244021-9.78387427-6.62475562-6.69396997-9.89758325-14.52008057-9.89758325-23.89361573 0-9.26971435 3.27282691-17.20458984 9.89758325-23.79473901 6.56048608-6.59014916 14.50030493-9.9865725 23.8244021-9.98657178h99.27246045c-3.86114526-34.71075463-13.42254638-67.67138648-28.69409155-98.77807618-15.25671363-31.20556641-34.66131592-58.50054955-58.21875024-82.08764696-23.50305152-23.58215333-50.85241675-42.94720435-82.00854445-58.18908644-31.17095923-15.24682617-64.15136742-24.82305884-98.88189697-28.7385869M511.99505592 141.21142578c50.39758301 0 98.46661377 9.78881836 144.20214891 29.35656762 45.71081543 19.56774926 85.1182251 45.82946778 118.23211646 78.99774122 33.10894799 33.05950928 59.43493676 72.50646949 79.00268531 118.23706055C873.00964332 413.53338623 882.78857422 461.63702416 882.78857422 512c0 50.36791992-9.77398682 98.36279297-29.35656762 144.19720483-19.56774926 45.73059106-45.89373803 85.07373047-79.00268531 118.13323974-33.11389136 33.16827416-72.52130103 59.53381347-118.23211646 79.10156203C610.46661377 872.90087914 562.39263892 882.78857422 511.99505592 882.78857422c-50.39758301 0-98.45672632-9.88769508-144.18237257-29.35656762-45.73059106-19.56774926-85.13305664-45.93328857-118.24200464-79.10156202-33.10894799-33.05950928-59.42504859-72.40264868-79.00268531-118.13323975C150.99035668 610.36279297 141.21142578 562.36297584 141.21142578 512c0-50.36791992 9.77398682-98.46661377 29.35656762-144.19720483 19.57763672-45.73059106 45.89373803-85.17755127 79.00268531-118.23706055 33.11389136-33.16827416 72.51141357-59.42999268 118.24200464-79.0026853C413.53833031 151.00024414 461.5974729 141.21142578 512 141.21142578" />
    </svg>
  ),
  'lion-head': (
    <svg viewBox="0 0 1024 1024" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M693.812245 818.155102c-56.946939 0-108.669388-32.391837-134.269388-81.502041-29.779592 20.897959-65.306122 32.391837-102.4 32.391837-73.142857 0-137.926531-44.408163-164.571428-110.759184-15.15102 4.702041-30.302041 7.314286-46.49796 7.314286-83.591837 0-151.510204-67.918367-151.510204-151.510204 0-39.183673 15.15102-76.8 42.318368-105.012245-2.089796-8.359184-3.134694-17.240816-3.134694-25.6 0-62.171429 50.155102-112.326531 112.32653-112.326531 6.269388 0 12.016327 0.522449 18.285715 1.567347 15.673469-25.077551 42.840816-40.75102 73.142857-40.75102 14.106122 0 27.689796 3.134694 39.706122 9.404082 15.673469-21.942857 41.273469-35.526531 70.008164-35.526531 18.285714 0 36.04898 5.746939 50.677551 16.718367 14.628571-10.44898 32.391837-16.718367 50.677551-16.718367 18.808163 0 37.616327 6.269388 52.244898 17.763265 15.15102-6.791837 31.346939-10.44898 48.065306-10.448979 43.885714 0 83.069388 25.6 101.877551 64.783673 48.587755 14.628571 87.24898 53.289796 101.877551 102.4 49.110204 32.914286 78.367347 87.771429 78.367347 147.330612 0 62.693878-32.391837 119.640816-85.159184 152.032653-7.836735 77.322449-73.142857 138.44898-152.032653 138.44898z m-125.910204-136.881633c1.567347 0 3.657143 0 5.22449 0.522449 7.314286 2.089796 13.061224 7.314286 14.628571 14.628572 13.061224 47.020408 56.42449 79.934694 105.534694 79.934694 60.604082 0 109.714286-49.110204 109.714286-109.191837v-0.522449c0-7.836735 4.179592-15.15102 11.493877-18.808163 45.453061-23.510204 73.665306-69.485714 73.665306-120.685715 0-48.065306-24.555102-91.428571-65.306122-115.983673-4.702041-3.134694-8.359184-7.836735-9.404082-13.061225-9.404082-40.75102-42.318367-73.142857-83.069388-82.546938-7.314286-1.567347-13.061224-6.791837-15.15102-13.583674-9.926531-28.212245-36.571429-47.542857-66.35102-47.542857-14.106122 0-27.689796 4.179592-39.183674 12.016327-8.881633 5.746939-20.37551 4.179592-27.167347-3.657143-8.359184-9.926531-20.897959-15.15102-33.436734-15.151021-13.583673 0-26.122449 5.746939-34.481633 16.718368-4.179592 4.702041-9.926531 7.836735-16.195918 7.836734s-12.016327-2.612245-16.195919-7.836734c-8.359184-10.44898-20.897959-16.718367-34.481632-16.718368-19.330612 0-37.093878 13.061224-42.318368 31.346939-2.089796 7.314286-7.836735 12.538776-15.15102 14.106123-7.314286 1.567347-14.628571-0.522449-19.853061-5.746939-8.359184-8.881633-19.853061-13.583673-31.869388-13.583674-18.808163 0-36.04898 12.016327-41.795919 30.302041-1.567347 5.22449-5.746939 9.404082-10.448979 12.016327-5.22449 2.612245-10.971429 2.612245-16.195919 1.044898-7.314286-2.612245-15.15102-3.657143-22.987755-3.657143-38.661224 0-70.530612 31.869388-70.530612 70.530612 0 8.359184 1.567347 16.718367 4.702041 24.555102 3.134694 8.359184 0.522449 17.240816-5.746939 22.987755-24.032653 20.897959-37.616327 51.2-37.616326 83.069388 0 60.604082 49.110204 109.714286 109.714285 109.714286 17.240816 0 34.481633-4.179592 49.632653-12.016327 5.746939-3.134694 12.538776-3.134694 18.285715-0.522449s9.926531 7.836735 11.493877 14.106123c15.15102 60.081633 69.485714 101.877551 131.657143 101.877551 36.571429 0 70.530612-14.106122 96.130612-40.228572 2.089796-4.179592 7.314286-6.269388 13.061225-6.269388z" />
      <path fill="currentColor" d="M693.812245 818.155102c-67.395918 0-127.477551-45.453061-145.763265-110.236735-3.134694-10.971429 3.134694-22.465306 14.628571-25.6 10.971429-3.134694 22.465306 3.134694 25.6 14.628572 13.061224 47.020408 56.42449 79.934694 105.534694 79.934694 60.604082 0 109.714286-49.110204 109.714286-109.714286 0-34.481633-15.673469-65.828571-42.840817-86.726531-8.881633-7.314286-10.971429-20.37551-3.657143-29.257143s20.37551-10.971429 29.257143-3.657142c37.616327 28.734694 59.036735 72.620408 59.036735 120.163265 0 82.546939-68.440816 150.465306-151.510204 150.465306z" />
      <path fill="currentColor" d="M456.620408 769.044898c-97.697959 0-177.632653-79.934694-177.632653-177.632653 0-35.526531 10.44898-70.008163 30.302041-99.265306 6.269388-9.404082 19.330612-12.016327 29.257143-5.746939 9.404082 6.269388 12.016327 19.330612 5.746939 29.257143-15.15102 22.465306-22.987755 48.587755-22.987756 75.755102 0 74.710204 61.126531 135.836735 135.836735 135.836735 36.571429 0 70.530612-14.106122 96.130612-40.228572 8.359184-8.359184 21.420408-8.359184 29.779592 0 8.359184 8.359184 8.359184 21.420408 0 29.779592-33.959184 33.959184-78.889796 52.244898-126.432653 52.244898zM210.02449 488.489796c-2.612245 0-5.22449-0.522449-8.359184-1.567347-41.795918-17.763265-68.440816-57.991837-68.440816-103.444898 0-62.171429 50.155102-112.326531 112.32653-112.326531 10.971429 0 21.942857 1.567347 31.869388 4.702041 10.971429 3.134694 17.240816 15.15102 14.106123 26.122449-3.134694 10.971429-15.15102 17.240816-26.122449 14.106123-6.269388-2.089796-13.061224-3.134694-20.375511-3.134694-38.661224 0-70.530612 31.869388-70.530612 70.530612 0 28.212245 16.718367 53.812245 42.840817 64.783673 10.44898 4.702041 15.673469 16.718367 10.971428 27.167347-2.612245 8.359184-10.44898 13.061224-18.285714 13.061225zM556.930612 345.861224c-11.493878 0-20.897959-9.404082-20.897959-20.897959 0-62.171429 50.155102-112.326531 112.326531-112.32653 47.542857 0 90.383673 30.302041 106.057143 75.232653 3.657143 10.971429-2.089796 22.987755-13.061225 26.644898-10.971429 3.657143-22.987755-2.089796-26.644898-13.061225-9.926531-28.212245-36.571429-47.542857-66.873469-47.542857-38.661224 0-70.530612 31.869388-70.530613 70.530612 0.522449 12.538776-8.881633 21.420408-20.37551 21.420408zM600.293878 537.6c-18.808163 0-37.616327-4.702041-54.334694-14.628571-41.273469-23.510204-62.693878-70.530612-53.289796-117.551021 2.089796-11.493878 13.061224-18.808163 24.555102-16.195918 11.493878 2.089796 18.808163 13.061224 16.195918 24.555102-5.746939 28.734694 7.314286 58.514286 33.436735 73.142857 32.914286 18.808163 74.710204 7.314286 93.518367-25.6 5.746939-9.926531 18.285714-13.583673 28.734694-7.836735 9.926531 5.746939 13.583673 18.285714 7.836735 28.734694-14.628571 25.6-38.138776 43.885714-66.87347 51.722449-9.926531 2.612245-19.853061 3.657143-29.779591 3.657143z" />
    </svg>
  ),
};

// 宣传轮播：image 字段暂留空，后续补充宣传图 URL 即可显示；link 默认 '#'，补充后点击在新标签打开。
const PROMO_SLIDES = [
  { title: '第一章 · 降生', subtitle: '四世神裔，融源之子的来历', image: '/homeBanner/banner1.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22379614?l=zh-cn' },
  { title: '第二章 · 三身', subtitle: '一体三面，各司其职的完美共生', image: '/homeBanner/banner2.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22382361?l=zh-cn' },
  { title: '第三章 · 吐息', subtitle: '烈焰淬炼，重塑万物本真', image: '/homeBanner/banner3.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22385845?l=zh-cn' },
  { title: '第四章 · 破局', subtitle: '旧维失效，新序诞生的必然', image: '/homeBanner/banner4.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386057?l=zh-cn' },
  { title: '第五章 · 驭者', subtitle: '顺势而为，维度跃升', image: '/homeBanner/banner5.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386058?l=zh-cn' },
  { title: '第六章 · 群像', subtitle: '从一躯真身，到一世图腾', image: '/homeBanner/banner6.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386060?l=zh-cn' },
  { title: '第七章 · 永续', subtitle: '图腾永生，融合求真永不止歇', image: '/homeBanner/banner7.png', link: 'https://3ms.huawei.com/km/groups/337/blogs/details/22386062?l=zh-cn' },
    //
];

export const HomePage: React.FC<HomePageProps> = ({ setCurrentView }) => {
  const handleCardClick = (modeKey: string) => {
    saveHomeCreateTaskMode(modeKey);
    setCurrentView('task-list');
  };

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
              <img alt="Chimera" className="relative w-14 h-14 rounded-2xl" src="/logo.png" />
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
              AI 安全验证平台
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
        </div>

        {/* mode cards */}
        <div className="grid gap-6 md:grid-cols-3 lg:gap-8 xl:gap-10 2xl:gap-12">
          {MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => handleCardClick(mode.key)}
              className="group relative overflow-hidden rounded-2xl border p-7 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.5)] lg:p-8 xl:p-9 2xl:p-10"
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
                <div className="mt-6 flex items-center gap-2 border-t pt-4 text-sm font-semibold" style={{ color: mode.accent, borderColor: GLASS_BORDER }}>
                  {mode.jumpMsg}
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1">
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
