import { escapeHtml } from "./utils.js";
import { emptyState } from "./empty.js";

// Excel-style table:
//   - per-column sort toggle (asc/desc/none)
//   - per-column filter popover (checklist or numeric-range)
//   - filter state is held in memory; caller can persist via onStateChange.
//
// columns: [
//   { key, label,
//     sortable?: bool,
//     filterable?: bool,
//     filterMode?: "checklist" | "numeric-range",   // default "checklist"
//     filterValueGetter?: (row) => string|number,   // value used for filtering
//     filterLabelGetter?: (row, value) => string,   // human label for checklist
//     sortValueGetter?: (row) => any,               // value used for sorting
//     render?: (value, row) => htmlString,
//   }
// ]
//
// state: { sort: { col: string|null, dir: "asc"|"desc"|null },
//          filters: { [colKey]: { type: "set", values: string[] }
//                              | { type: "range", min: number|null, max: number|null } } }

const SORT_NONE = "none";

function defaultSortValue(row, column) {
  const raw = column.sortValueGetter ? column.sortValueGetter(row) : row[column.key];
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  return raw;
}

function defaultFilterValue(row, column) {
  const raw = column.filterValueGetter ? column.filterValueGetter(row) : row[column.key];
  if (raw === null || raw === undefined) {
    return "";
  }
  return raw;
}

function rowMatchesFilters(row, columns, filters) {
  for (const col of columns) {
    const f = filters[col.key];
    if (!f) continue;
    const value = defaultFilterValue(row, col);
    if (f.type === "set") {
      if (!f.values?.length) continue;
      if (!f.values.includes(String(value))) {
        return false;
      }
    } else if (f.type === "range") {
      const num = Number(value);
      if (Number.isNaN(num)) {
        return false;
      }
      if (f.min !== null && f.min !== undefined && num < Number(f.min)) {
        return false;
      }
      if (f.max !== null && f.max !== undefined && num > Number(f.max)) {
        return false;
      }
    }
  }
  return true;
}

function compareValues(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), "zh-CN");
}

function sortIcon(state, columnKey) {
  if (!state.sort || state.sort.col !== columnKey || !state.sort.dir || state.sort.dir === SORT_NONE) {
    return `<span class="dg-sort-indicator dg-sort-none" aria-hidden="true">⇅</span>`;
  }
  return state.sort.dir === "asc"
    ? `<span class="dg-sort-indicator dg-sort-asc" aria-hidden="true">▲</span>`
    : `<span class="dg-sort-indicator dg-sort-desc" aria-hidden="true">▼</span>`;
}

function filterIcon(active) {
  return `<span class="dg-filter-indicator ${active ? "is-active" : ""}" aria-hidden="true">▾</span>`;
}

function cycleSortDir(current) {
  if (current === "asc") return "desc";
  if (current === "desc") return null;
  return "asc";
}

function buildChecklistOptions(rows, column) {
  const counts = new Map();
  const labelByValue = new Map();
  for (const row of rows) {
    const value = defaultFilterValue(row, column);
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!labelByValue.has(key)) {
      const label = column.filterLabelGetter ? column.filterLabelGetter(row, value) : key;
      labelByValue.set(key, String(label || key || "—"));
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: labelByValue.get(value) || value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function closeAllPopovers(container) {
  container.querySelectorAll(".dg-popover").forEach((el) => el.remove());
  container.querySelectorAll(".dg-filter-trigger.is-open").forEach((el) => el.classList.remove("is-open"));
}

function popoverChecklistHtml(column, rows, currentFilter) {
  const options = buildChecklistOptions(rows, column);
  const selected = new Set((currentFilter?.values || []).map((v) => String(v)));
  const allChecked = options.length > 0 && options.every((opt) => selected.has(opt.value));
  return `
    <div class="dg-popover dg-popover-checklist" role="dialog">
      <label class="dg-popover-row dg-popover-row-all">
        <input type="checkbox" data-dg-select-all ${allChecked ? "checked" : ""} />
        <span>(全选)</span>
      </label>
      <div class="dg-popover-list">
        ${options.map((opt) => `
          <label class="dg-popover-row">
            <input type="checkbox" value="${escapeHtml(opt.value)}" ${selected.has(opt.value) ? "checked" : ""} />
            <span class="dg-popover-row-label">${escapeHtml(opt.label)}</span>
            <span class="dg-popover-row-count">${opt.count}</span>
          </label>
        `).join("")}
      </div>
      <div class="dg-popover-footer">
        <button type="button" class="dg-popover-button" data-dg-clear>清空</button>
        <button type="button" class="dg-popover-button is-primary" data-dg-apply>应用</button>
      </div>
    </div>
  `;
}

function popoverRangeHtml(column, currentFilter) {
  return `
    <div class="dg-popover dg-popover-range" role="dialog">
      <div class="dg-popover-row">
        <label class="dg-popover-input">
          <span>Min</span>
          <input type="number" step="any" data-dg-range-min value="${currentFilter?.min ?? ""}" />
        </label>
      </div>
      <div class="dg-popover-row">
        <label class="dg-popover-input">
          <span>Max</span>
          <input type="number" step="any" data-dg-range-max value="${currentFilter?.max ?? ""}" />
        </label>
      </div>
      <div class="dg-popover-footer">
        <button type="button" class="dg-popover-button" data-dg-clear>清空</button>
        <button type="button" class="dg-popover-button is-primary" data-dg-apply>应用</button>
      </div>
    </div>
  `;
}

function headerCell(column, state) {
  const sortable = column.sortable !== false;
  const filterable = column.filterable === true;
  const sortClasses = state.sort?.col === column.key && state.sort?.dir
    ? `is-sorted is-${state.sort.dir}`
    : "";
  const filterActive = !!state.filters?.[column.key];
  return `
    <th class="dg-th ${sortClasses}" data-col-key="${escapeHtml(column.key)}">
      <span class="dg-th-label">${escapeHtml(column.label)}</span>
      <span class="dg-th-controls">
        ${sortable ? `<button type="button" class="dg-sort-trigger" data-dg-sort="${escapeHtml(column.key)}" aria-label="排序">${sortIcon(state, column.key)}</button>` : ""}
        ${filterable ? `<button type="button" class="dg-filter-trigger ${filterActive ? "is-active" : ""}" data-dg-filter="${escapeHtml(column.key)}" aria-label="筛选">${filterIcon(filterActive)}</button>` : ""}
      </span>
    </th>
  `;
}

export function renderDataGrid(container, options) {
  const {
    rows = [],
    columns = [],
    state: initialState = {},
    onStateChange,
    emptyText = "暂无数据。",
    rowKey = (row, index) => row._key ?? index,
  } = options;

  const state = {
    sort: initialState.sort ? { ...initialState.sort } : { col: null, dir: null },
    filters: { ...(initialState.filters || {}) },
  };

  function persist() {
    if (typeof onStateChange === "function") {
      onStateChange({
        sort: { ...state.sort },
        filters: { ...state.filters },
      });
    }
  }

  function visibleRows() {
    const filtered = rows.filter((row) => rowMatchesFilters(row, columns, state.filters));
    if (state.sort?.col && state.sort?.dir) {
      const column = columns.find((c) => c.key === state.sort.col);
      if (column) {
        filtered.sort((a, b) => {
          const result = compareValues(defaultSortValue(a, column), defaultSortValue(b, column));
          return state.sort.dir === "asc" ? result : -result;
        });
      }
    }
    return filtered;
  }

  function render() {
    const visible = visibleRows();
    if (!visible.length) {
      const headerHtml = columns.map((col) => headerCell(col, state)).join("");
      container.innerHTML = `
        <div class="table-frame dg-frame">
          <table class="dg-table">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody><tr><td colspan="${columns.length}" class="dg-empty">${emptyState("没有结果", emptyText)}</td></tr></tbody>
          </table>
        </div>
      `;
      bindHeaderEvents();
      return;
    }
    const headerHtml = columns.map((col) => headerCell(col, state)).join("");
    const body = visible.map((row, index) => {
      const cells = columns.map((col) => {
        const value = row[col.key];
        const content = col.render ? col.render(value, row) : escapeHtml(value ?? "—");
        return `<td>${content}</td>`;
      }).join("");
      return `<tr data-dg-row-key="${escapeHtml(String(rowKey(row, index)))}" class="${escapeHtml(row._rowClass || "")}">${cells}</tr>`;
    }).join("");
    container.innerHTML = `
      <div class="table-frame dg-frame">
        <table class="dg-table">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
    bindHeaderEvents();
  }

  function bindHeaderEvents() {
    container.querySelectorAll("[data-dg-sort]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = button.dataset.dgSort;
        const nextDir = state.sort?.col === key ? cycleSortDir(state.sort.dir) : "asc";
        state.sort = { col: nextDir ? key : null, dir: nextDir };
        persist();
        render();
      });
    });
    container.querySelectorAll("[data-dg-filter]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = button.dataset.dgFilter;
        const wasOpen = button.classList.contains("is-open");
        closeAllPopovers(container);
        if (wasOpen) return;
        const column = columns.find((c) => c.key === key);
        if (!column) return;
        button.classList.add("is-open");
        const mode = column.filterMode || "checklist";
        const currentFilter = state.filters[key];
        const popoverHtml = mode === "numeric-range"
          ? popoverRangeHtml(column, currentFilter)
          : popoverChecklistHtml(column, rows, currentFilter);
        const wrapper = document.createElement("div");
        wrapper.innerHTML = popoverHtml;
        const popoverEl = wrapper.firstElementChild;
        button.closest(".dg-th").appendChild(popoverEl);
        bindPopoverEvents(popoverEl, column, key);
      });
    });
  }

  function bindPopoverEvents(popoverEl, column, key) {
    popoverEl.addEventListener("click", (event) => event.stopPropagation());

    if ((column.filterMode || "checklist") === "checklist") {
      const selectAll = popoverEl.querySelector("[data-dg-select-all]");
      const optionInputs = Array.from(popoverEl.querySelectorAll(".dg-popover-list input[type=checkbox]"));
      if (selectAll) {
        selectAll.addEventListener("change", () => {
          optionInputs.forEach((input) => { input.checked = selectAll.checked; });
        });
      }
      optionInputs.forEach((input) => {
        input.addEventListener("change", () => {
          if (selectAll) selectAll.checked = optionInputs.every((i) => i.checked);
        });
      });
      popoverEl.querySelector("[data-dg-apply]")?.addEventListener("click", () => {
        const values = optionInputs.filter((i) => i.checked).map((i) => i.value);
        if (!values.length || values.length === optionInputs.length) {
          delete state.filters[key];
        } else {
          state.filters[key] = { type: "set", values };
        }
        closeAllPopovers(container);
        persist();
        render();
      });
    } else {
      popoverEl.querySelector("[data-dg-apply]")?.addEventListener("click", () => {
        const min = popoverEl.querySelector("[data-dg-range-min]").value;
        const max = popoverEl.querySelector("[data-dg-range-max]").value;
        const hasMin = min !== "" && !Number.isNaN(Number(min));
        const hasMax = max !== "" && !Number.isNaN(Number(max));
        if (!hasMin && !hasMax) {
          delete state.filters[key];
        } else {
          state.filters[key] = {
            type: "range",
            min: hasMin ? Number(min) : null,
            max: hasMax ? Number(max) : null,
          };
        }
        closeAllPopovers(container);
        persist();
        render();
      });
    }

    popoverEl.querySelector("[data-dg-clear]")?.addEventListener("click", () => {
      delete state.filters[key];
      closeAllPopovers(container);
      persist();
      render();
    });
  }

  // Outside-click closes any open popover (per grid instance).
  const outsideClickHandler = (event) => {
    if (!container.contains(event.target)) {
      closeAllPopovers(container);
      return;
    }
    if (!event.target.closest(".dg-popover") && !event.target.closest(".dg-filter-trigger")) {
      closeAllPopovers(container);
    }
  };
  document.addEventListener("click", outsideClickHandler);
  // Re-render API for callers
  render();
  return {
    refresh: render,
    destroy: () => {
      document.removeEventListener("click", outsideClickHandler);
      closeAllPopovers(container);
    },
    getState: () => ({ sort: { ...state.sort }, filters: { ...state.filters } }),
  };
}
