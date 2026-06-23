import { escapeHtml, formatNumber } from "./utils.js";

export function metricCell(value, denominator, suffix = "") {
  const raw = Number(value || 0);
  const text = suffix ? `${raw.toFixed(2)}${suffix}` : formatNumber(raw);
  const denom = denominator === undefined || denominator === null
    ? ""
    : `<span class="lb-muted"> / ${escapeHtml(formatNumber(denominator))}</span>`;
  return `<span class="lb-mono">${escapeHtml(text)}</span>${denom}`;
}

export function fmtSeconds(value) {
  const total = Math.round(Number(value || 0));
  if (!total) return "0s";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m${s}s`;
  return `${s}s`;
}

export function fmtCompact(value) {
  const num = Number(value || 0);
  const abs = Math.abs(num);
  const trim = (n) => n.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return `${trim(num / 1e9)}B`;
  if (abs >= 1e6) return `${trim(num / 1e6)}M`;
  if (abs >= 1e3) return `${trim(num / 1e3)}K`;
  return formatNumber(num);
}

export function renderSkillBadge(skillBucket) {
  const categories = skillBucket?.categories || [];
  if (!categories.length) {
    return `<span class="lb-muted">—</span>`;
  }
  return categories.map((cat) => {
    const badgeHtml = cat.mode === "all"
      ? `<span class="skill-mode-badge is-all">ALL</span>`
      : `<span class="skill-mode-badge is-partial" data-skill-partial="${escapeHtml(JSON.stringify({
          category_name: cat.category_name,
          partial_index: cat.partial_index,
          skills: cat.skills || [],
        }))}">P${escapeHtml(String(cat.partial_index ?? "?"))}</span>`;
    return `
      <span class="skill-cell">
        <span class="skill-cat-name">${escapeHtml(cat.category_name)}</span>
        ${badgeHtml}
      </span>
    `;
  }).join("");
}
