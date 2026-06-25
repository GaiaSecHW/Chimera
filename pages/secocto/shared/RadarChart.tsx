import React from 'react';

interface RadarChartProps {
  values: number[];
  labels: readonly string[];
  /** SVG viewBox 大小,默认 260 */
  size?: number;
  /** 数据最大值(用于归一化半径) */
  max?: number;
}

/**
 * 简易雷达图 — 与 secocto-ui overview.js 的 _radarSvg 等价,
 * 但去掉硬编码 hex,改用 Chimera 的 theme tokens(经 currentColor / fill 配置)。
 * 不依赖 chart.js,纯 SVG;5 维度时与 task.score_vector 完全对齐。
 *
 * 视觉:外圈/轴线用 theme-border,极坐标顶点连成的多边形用 brand-primary 半透明填充。
 */
export const RadarChart: React.FC<RadarChartProps> = ({ values, labels, size = 260, max = 100 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.74; // 留出边距给文字
  const n = labels.length;
  const angles = labels.map((_, i) => -Math.PI / 2 + (i * Math.PI * 2) / n);
  const pt = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const normalized = values.map((v) => Math.max(0, Math.min(max, v))) ;

  // 25/50/75/100 四圈网格
  const gridPolys = [25, 50, 75, 100].map((pct) =>
    angles
      .map((a) => {
        const [x, y] = pt((R * pct) / 100, a);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' '),
  );

  const axesEnds = angles.map((a) => pt(R, a));
  const dataPolyPts = normalized
    .map((v, i) => {
      const [x, y] = pt((R * v) / max, angles[i]);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const dataPts = normalized.map((v, i) => pt((R * v) / max, angles[i]));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-theme-border" role="img" aria-label="评分雷达图">
      {gridPolys.map((points, i) => (
        <polygon key={`g${i}`} points={points} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.6} />
      ))}
      {axesEnds.map(([x, y], i) => (
        <line key={`a${i}`} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="currentColor" strokeWidth={1} opacity={0.6} />
      ))}
      <polygon points={dataPolyPts} fill="rgba(99,102,241,0.18)" stroke="#2563EB" strokeWidth={2} />
      {dataPts.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill="#2563EB" />
      ))}
      {angles.map((a, i) => {
        const [lx, ly] = pt(R + 16, a);
        return (
          <g key={`l${i}`}>
            <text
              x={lx.toFixed(1)}
              y={ly.toFixed(1)}
              textAnchor="middle"
              dy=".35em"
              fontSize={11}
              className="fill-theme-text-faint"
            >
              {labels[i]}
            </text>
            <text
              x={lx.toFixed(1)}
              y={(ly + 12).toFixed(1)}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              className="fill-theme-text-primary"
            >
              {normalized[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
