// AI4SecBench Leaderboard SPA — embedded into Chimera.
//
// Adapted from the standalone leaderboard SPA to work as a mountable
// module inside the Chimera shell. Changes from the standalone version:
//   • Theme management removed — Chimera ThemeProvider drives <html data-theme>.
//   • Sidebar / header chrome removed — Chimera provides its own layout.
//   • main() auto-execution replaced by exported initLeaderboard(container).
//   • All DOM queries scoped to the mount container instead of global document.
//   • API prefix accepted as a parameter instead of service-card discovery.
//
// The data-grid, cell renderers, filter panels, stat cards, modal and
// API call logic are otherwise identical to the standalone version.

import { renderDataGrid } from "./data_grid.js";
import { escapeHtml, formatDateTime, formatNumber } from "./utils.js";

const DEFAULT_TASK_TYPE = "discovery";

let mountContainer = null;
let state = {
  apiPrefix: "/api/ai4secbench-leaderboard",
  domain_key: "",
  task_type: DEFAULT_TASK_TYPE,
  group_mode: "version",
  include_skills: "1",
};

let gridApi = null;
const skillHandlers = {};

// ── cell renderers (ported verbatim from the local leaderboard page) ──────
function metricCell(value, denominator, suffix = "") {
  const raw = Number(value || 0);
  const text = suffix ? `${raw.toFixed(2)}${suffix}` : formatNumber(raw);
  const denom = denominator === undefined || denominator === null
    ? ""
    : `<span class="lb-muted"> / ${escapeHtml(formatNumber(denominator))}</span>`;
  return `<span class="lb-mono">${escapeHtml(text)}</span>${denom}`;
}

function fmtSeconds(value) {
  const total = Math.round(Number(value || 0));
  if (!total) return "0s";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m${s}s`;
  return `${s}s`;
}

function fmtCompact(value) {
  const num = Number(value || 0);
  const abs = Math.abs(num);
  const trim = (n) => n.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return `${trim(num / 1e9)}B`;
  if (abs >= 1e6) return `${trim(num / 1e6)}M`;
  if (abs >= 1e3) return `${trim(num / 1e3)}K`;
  return formatNumber(num);
}

function renderSkillBadge(skillBucket) {
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

function closeSkillPopovers() {
  mountContainer?.querySelectorAll(".skill-popover").forEach((el) => el.remove());
}

function openSkillPopover(trigger) {
  closeSkillPopovers();
  let payload;
  try {
    payload = JSON.parse(trigger.dataset.skillPartial);
  } catch (err) {
    return;
  }
  const popover = document.createElement("div");
  popover.className = "skill-popover";
  popover.innerHTML = `
    <div class="skill-popover-header">
      <span>${escapeHtml(payload.category_name)} · P${escapeHtml(String(payload.partial_index ?? "?"))}</span>
      <span>${escapeHtml(String((payload.skills || []).length))} skills</span>
    </div>
    <div class="skill-popover-list">
      ${(payload.skills || []).map((s) => `
        <div class="skill-popover-row">
          <span>${escapeHtml(s.display_name || s.name)}</span>
          <span class="skill-popover-version">${escapeHtml(s.version_label || "")}</span>
        </div>
      `).join("")}
    </div>
  `;
  mountContainer.appendChild(popover);
  const rect = trigger.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
  popover.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 296)}px`;
}

function attachSkillPartialHandlers(root, handlers) {
  if (handlers.detach) handlers.detach();
  const onRootClick = (event) => {
    const trigger = event.target.closest("[data-skill-partial]");
    if (trigger) {
      event.stopPropagation();
      openSkillPopover(trigger);
    }
  };
  const onDocClick = (event) => {
    if (!event.target.closest(".skill-popover") && !event.target.closest("[data-skill-partial]")) {
      closeSkillPopovers();
    }
  };
  root.addEventListener("click", onRootClick);
  document.addEventListener("click", onDocClick);
  handlers.detach = () => {
    root.removeEventListener("click", onRootClick);
    document.removeEventListener("click", onDocClick);
    closeSkillPopovers();
  };
}

// ── data access ───────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// ── stat cards ─────────────────────────────────────────────────────────────
function fmtScore(x) {
  return Number(x || 0).toFixed(3);
}
function updateStats(payload, items, hasDiscovery) {
  const find = (id) => mountContainer?.querySelector(`[data-lb-stat="${id}"]`);
  if (find("agents")) find("agents").textContent = formatNumber(payload.count || items.length);
  if (find("domains")) find("domains").textContent = formatNumber((payload.domains || []).length);
  if (find("tasks")) {
    const tasks = items.reduce((s, it) => s + Number(it.sub_task_count || 0), 0);
    find("tasks").textContent = formatNumber(tasks);
  }
  if (find("topscore")) {
    const pick = hasDiscovery
      ? (it) => Number(it.discovery_f1 || 0)
      : (it) => Number(it.trigger_success_rate || 0) / 100;
    const top = items.reduce((m, it) => Math.max(m, pick(it)), 0);
    find("topscore").textContent = items.length ? fmtScore(top) : "—";
  }
}

// ── agent detail modal ─────────────────────────────────────────────────────
async function showAgentStats(snapshotKey, name) {
  const modal = mountContainer?.querySelector("[data-lb-modal]");
  const title = mountContainer?.querySelector("[data-lb-modal-title]");
  const body = mountContainer?.querySelector("[data-lb-modal-body]");
  if (!modal) return;
  title.textContent = `${name || snapshotKey} · 详情`;
  body.innerHTML = "<p class='lb-muted'>加载中…</p>";
  modal.hidden = false;
  if (!snapshotKey) {
    body.innerHTML = "<p class='lb-muted'>未找到记录。</p>";
    return;
  }
  try {
    const data = await fetchJSON(`${state.apiPrefix}/agents/${encodeURIComponent(snapshotKey)}/stats`);
    const ap = data.agent_profile || {};
    const dom = (data && data.by_domain) || {};
    const rows = Object.entries(dom);
    const parts = [
      `<dl>
        <dt>Agent 家族</dt><dd>${escapeHtml(ap.family || "—")}</dd>
        <dt>版本</dt><dd>${escapeHtml(ap.version || "—")}</dd>
        <dt>类型</dt><dd>${escapeHtml(ap.agent_type || "local")}</dd>
        <dt>来源</dt><dd>${escapeHtml(ap.local_server_id || "—")}</dd>
      </dl>`,
    ];
    if (rows.length) {
      parts.push(`<div class="lb-dom-list"><h3>按领域分布</h3>`);
      for (const [key, v] of rows) {
        parts.push(`<span class="lb-key">${escapeHtml(key)}</span>`);
        parts.push(`<span>任务 ${formatNumber(v.count)}</span>`);
        parts.push(`<span>成功 ${formatNumber(v.succeeded)}</span>`);
      }
      parts.push(`</div>`);
    }
    body.innerHTML = parts.join("");
  } catch (e) {
    body.innerHTML = `<p class='lb-muted'>加载失败：${escapeHtml(e.message)}</p>`;
  }
}

// ── page render ─────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const root = mountContainer?.querySelector("[data-lb-root]");
  if (!root) return;
  const search = new URLSearchParams();
  if (state.domain_key) search.set("domain_key", state.domain_key);
  if (state.task_type) search.set("task_type", state.task_type);
  search.set("group_mode", state.group_mode === "family" ? "family" : "version");
  search.set("include_skills", state.include_skills === "0" ? "0" : "1");
  let payload;
  try {
    payload = await fetchJSON(`${state.apiPrefix}/leaderboard?${search.toString()}`);
  } catch (e) {
    root.innerHTML = `<section class="lb-page-section"><div class="lb-status error">加载失败：${escapeHtml(e.message)}</div></section>`;
    return;
  }
  renderPage(root, payload);
}

function renderPage(root, payload) {
  if (gridApi) {
    gridApi.destroy();
    gridApi = null;
  }
  if (skillHandlers.detach) {
    skillHandlers.detach();
    skillHandlers.detach = null;
  }
  closeSkillPopovers();

  const domains = payload.domains || [];
  const taskTypes = payload.task_types || [];
  const selectedDomain = payload.domain || domains[0] || null;
  const selectedTaskType = payload.task_type || DEFAULT_TASK_TYPE;
  const groupMode = payload.group_mode === "family" ? "family" : "version";
  const includeSkills = payload.include_skills !== false && state.include_skills !== "0";

  state.domain_key = selectedDomain?.key || "";
  state.task_type = selectedTaskType;
  state.group_mode = groupMode;
  state.include_skills = includeSkills ? "1" : "0";

  const items = (payload.items || []).map((row, index) => ({
    ...row,
    _key: `${row.agent_profile_id}|${row.llm_profile_id}|${row.skill_bucket?.signature || ""}|${row.main_task_id || index}`,
    skill_category_text: row.skill_bucket?.primary_label || "",
  }));

  const hasDiscovery = selectedTaskType === "discovery";
  updateStats(payload, items, hasDiscovery);
  const footer = mountContainer?.querySelector("[data-lb-footer]");
  if (footer) footer.textContent = `API: ${state.apiPrefix} · 更新时间: ${new Date().toLocaleString()}`;

  root.innerHTML = `
    <section class="lb-page-section">
      <div class="page-head">
        <div class="lb-page-head-copy">
          <h3>排行榜</h3>
          <p>按领域与任务类型比较 Agent × LLM × Skill 组合的最佳主任务测评结果。</p>
        </div>
      </div>
      <section class="lb-surface-panel">
        <div class="lb-panel-header">
          <h4>领域</h4>
          <span class="lb-subtle">${escapeHtml(selectedDomain?.display_name || "未选择")}</span>
        </div>
        <div class="lb-view-switch leaderboard-domain-switch">
          ${domains.map((domain) => `
            <button class="lb-view-switch-button ${domain.key === selectedDomain?.key ? "is-active" : ""}" type="button" data-leaderboard-domain="${escapeHtml(domain.key)}">
              ${escapeHtml(domain.display_name || domain.key)}
            </button>
          `).join("")}
        </div>
      </section>
      <div class="lb-panel-row">
        <section class="lb-surface-panel">
          <div class="lb-panel-header">
            <h4>任务类型</h4>
            <span class="lb-subtle">${escapeHtml(taskTypes.find((t) => t.key === selectedTaskType)?.display_name || selectedTaskType)}</span>
          </div>
          <div class="lb-view-switch leaderboard-task-type-switch">
            ${taskTypes.map((tt) => `
              <button class="lb-view-switch-button ${tt.key === selectedTaskType ? "is-active" : ""}" type="button" data-leaderboard-task-type="${escapeHtml(tt.key)}">
                ${escapeHtml(tt.display_name || tt.key)}
              </button>
            `).join("")}
          </div>
        </section>
        <section class="lb-surface-panel">
          <div class="lb-panel-header">
            <h4>显示维度</h4>
            <span class="lb-subtle">${groupMode === "family" ? "按家族合并" : "按版本号"} · Skills ${includeSkills ? "开" : "关"}</span>
          </div>
          <div class="lb-toggle-row">
            <div class="lb-view-switch leaderboard-group-switch">
              <button class="lb-view-switch-button ${groupMode === "version" ? "is-active" : ""}" type="button" data-leaderboard-group="version">按版本号</button>
              <button class="lb-view-switch-button ${groupMode === "family" ? "is-active" : ""}" type="button" data-leaderboard-group="family">按家族</button>
            </div>
            <div class="lb-view-switch leaderboard-skills-switch">
              <button class="lb-view-switch-button ${includeSkills ? "is-active" : ""}" type="button" data-leaderboard-skills="1">Skills 开</button>
              <button class="lb-view-switch-button ${!includeSkills ? "is-active" : ""}" type="button" data-leaderboard-skills="0">Skills 关</button>
            </div>
          </div>
        </section>
      </div>
      <section class="lb-surface-panel">
        <div class="lb-panel-header">
          <h4>Agent × LLM 最佳结果</h4>
          <span class="lb-subtle">${escapeHtml(String(items.length))} 组</span>
        </div>
        <div id="leaderboard-table"></div>
      </section>
    </section>
  `;

  const metricColumns = hasDiscovery
    ? [
        { key: "discovery_f1", label: "F1", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(Number(value || 0) * 100, null, "%") },
        { key: "discovery_precision", label: "Precision", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(Number(value || 0) * 100, null, "%") },
        { key: "discovery_recall", label: "Recall", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(Number(value || 0) * 100, null, "%") },
        { key: "discovery_mean_score", label: "均分", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(value) },
      ]
    : [
        { key: "trigger_success", label: "触发成功", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value, row) => metricCell(value, row.sub_task_count) },
        { key: "trigger_success_rate", label: "触发率", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(value, null, "%") },
        { key: "execution_success", label: "执行成功", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value, row) => metricCell(value, row.sub_task_count) },
        { key: "submissions", label: "提交数", sortable: true, filterable: true, filterMode: "numeric-range",
          render: (value) => metricCell(value) },
      ];

  const missNote = hasDiscovery ? "1-Recall" : "1-触发率";
  const fpNote = hasDiscovery ? "未命中位置" : "噪声提交";
  const costColumns = [
    { key: "avg_tokens_per_subtask", label: "平均子任务Token", sortable: true, filterable: true, filterMode: "numeric-range",
      render: (value) => `<span class="lb-mono" title="${escapeHtml(formatNumber(Number(value || 0)))}">${escapeHtml(fmtCompact(value))}</span>` },
    { key: "avg_elapsed_sec", label: "平均子任务耗时", sortable: true, filterable: true, filterMode: "numeric-range",
      render: (value) => `<span class="lb-mono">${escapeHtml(fmtSeconds(value))}</span>` },
    { key: "miss_rate", label: `漏报率(${missNote})`, sortable: true, filterable: true, filterMode: "numeric-range",
      render: (value) => metricCell(value, null, "%") },
    { key: "fp_rate", label: `误报率(${fpNote})`, sortable: true, filterable: true, filterMode: "numeric-range",
      render: (value) => metricCell(value, null, "%") },
  ];

  const agentColumn = groupMode === "family"
    ? {
        key: "agent_family", label: "Agent 家族", sortable: true, filterable: true,
        sortValueGetter: (row) => row.agent_family || row.agent_name || "",
        render: (_value, row) => {
          const fam = row.agent_family || row.agent_name || "—";
          const n = Number(row.merged_count || 1);
          const badgeN = n > 1 ? ` <span class="lb-badge" title="${escapeHtml((row.merged_versions || []).join(", "))}">×${escapeHtml(String(n))}</span>` : "";
          return `${escapeHtml(fam)}${badgeN}`;
        },
      }
    : { key: "agent_name", label: "Agent", sortable: true, filterable: true };

  const skillColumn = includeSkills
    ? [{
        key: "skill_category_text",
        label: "Skill 类别",
        sortable: true,
        filterable: true,
        filterValueGetter: (row) => row.skill_bucket?.signature || "none",
        filterLabelGetter: (row) => row.skill_bucket?.primary_label
          ? `${row.skill_bucket.primary_label}${row.skill_bucket.has_partial ? "（含 P）" : "（ALL）"}`
          : "—",
        sortValueGetter: (row) => row.skill_category_text || "",
        render: (_value, row) => renderSkillBadge(row.skill_bucket),
      }]
    : [];

  const columns = [
    { key: "rank", label: "排名", sortable: true,
      render: (value) => `<span class="lb-mono">${escapeHtml(value)}</span>` },
    agentColumn,
    { key: "llm_name", label: "LLM", sortable: true, filterable: true },
    ...skillColumn,
    ...metricColumns,
    ...costColumns,
    {
      key: "difficulty",
      label: "难度",
      sortable: true,
      filterable: true,
      render: (value) => escapeHtml(value || "—"),
    },
    {
      key: "updated_at",
      label: "更新时间",
      sortable: true,
      filterable: true,
      filterLabelGetter: (_row, value) => formatDateTime(value),
      render: (value) => escapeHtml(formatDateTime(value)),
    },
    {
      key: "open",
      label: "操作",
      sortable: false,
      render: (_value, row) => `<button class="lb-subtle-button" type="button" data-open-snapshot="${escapeHtml(String(row.snapshot_key || ""))}" data-name="${escapeHtml(String(row.agent_name || ""))}">详情</button>`,
    },
  ];

  const container = root.querySelector("#leaderboard-table");
  gridApi = renderDataGrid(container, {
    rows: items,
    columns,
    emptyText: "当前筛选下没有 Agent × LLM 组合的测评结果。",
    rowKey: (row) => row._key,
  });

  attachSkillPartialHandlers(root, skillHandlers);

  root.querySelectorAll("[data-leaderboard-domain]").forEach((button) => {
    button.addEventListener("click", () => {
      state.domain_key = button.dataset.leaderboardDomain;
      loadLeaderboard();
    });
  });
  root.querySelectorAll("[data-leaderboard-task-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.task_type = button.dataset.leaderboardTaskType;
      loadLeaderboard();
    });
  });
  root.querySelectorAll("[data-leaderboard-group]").forEach((button) => {
    button.addEventListener("click", () => {
      state.group_mode = button.dataset.leaderboardGroup;
      loadLeaderboard();
    });
  });
  root.querySelectorAll("[data-leaderboard-skills]").forEach((button) => {
    button.addEventListener("click", () => {
      state.include_skills = button.dataset.leaderboardSkills;
      loadLeaderboard();
    });
  });
  root.querySelectorAll("[data-open-snapshot]").forEach((button) => {
    button.addEventListener("click", () => showAgentStats(button.dataset.openSnapshot, button.dataset.name));
  });
}

function bindModal() {
  const modal = mountContainer?.querySelector("[data-lb-modal]");
  const modalClose = mountContainer?.querySelector("[data-lb-modal-close]");
  if (modalClose) modalClose.addEventListener("click", () => { modal.hidden = true; });
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
}

// ── exported lifecycle ──────────────────────────────────────────────────────
export async function initLeaderboard(containerEl, options = {}) {
  mountContainer = containerEl;
  state = {
    apiPrefix: options.apiPrefix || "/api/ai4secbench-leaderboard",
    domain_key: "",
    task_type: DEFAULT_TASK_TYPE,
    group_mode: "version",
    include_skills: "1",
  };

  bindModal();
  await loadLeaderboard();
}

export function destroyLeaderboard() {
  if (gridApi) {
    gridApi.destroy();
    gridApi = null;
  }
  if (skillHandlers.detach) {
    skillHandlers.detach();
    skillHandlers.detach = null;
  }
  closeSkillPopovers();
  mountContainer = null;
}

export function refreshLeaderboard() {
  return loadLeaderboard();
}
