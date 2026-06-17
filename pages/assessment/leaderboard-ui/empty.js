import { escapeHtml } from "./utils.js";

export function emptyState(title, detail = "", actionHtml = "") {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      ${detail ? `<div class="muted">${escapeHtml(detail)}</div>` : ""}
      ${actionHtml}
    </div>
  `;
}
