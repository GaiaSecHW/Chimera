import React, { useEffect, useRef } from 'react';

import {
  DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  DataflowFileserverRunFile,
  DataflowFileserverRunOverview,
  DataflowFileserverRunSession,
  DataflowFileserverRunSummary,
  adoptDataflowFileserverRun,
  cancelDataflowFileserverRun,
  deleteDataflowFileserverRun,
  getDataflowFileserverRunFile,
  getDataflowFileserverRunLog,
  getDataflowFileserverRunSessionFile,
  inspectDataflowFileserverRunCycle,
  inspectDataflowFileserverRunOverview,
  listDataflowFileserverRunFiles,
  listDataflowFileserverRunSessions,
  retryDataflowFileserverRun,
} from '../../clients/dataflowVulnRunsFileserver';
import { DATAFLOW_DASHBOARD_MIRROR_CSS } from './DataflowFileserverRunDashboardCss';

const DASHBOARD_HTML = `
<div class="dfv-dashboard-root">
<div id="app">
  <main id="mainContent">
    <div class="page-shell">
      <div class="page-backbar">
        <button id="btnBack" class="btn btn-back" data-action="back">← 返回任务列表</button>
      </div>

      <section class="page-header-card">
        <div class="page-header-copy">
          <p class="page-eyebrow">Dataflow Vulnerability Mining</p>
          <h1 class="page-title">Run 详情</h1>
          <p class="page-description">当前详情由微服务后端统一读取 /data Run 目录展示，集中查看当前 Run 的概览、轮次、结果、会话、文件、日志与任务关联信息。</p>
        </div>
        <div class="page-header-actions">
          <label class="toggle-label">
            <input type="checkbox" id="autoRefresh">
            <span class="toggle-slider"></span>
            自动刷新
          </label>
          <button id="btnRefresh" class="btn btn-sm" data-action="refresh">刷新 Run</button>
          <button id="btnAdoptRun" class="btn btn-sm" data-action="adopt-run" disabled>关联任务记录</button>
          <button id="btnCancelRun" class="btn btn-sm btn-warning" data-action="cancel-run" disabled>取消 Run</button>
          <button id="btnRetryRun" class="btn btn-sm" data-action="retry-run" disabled>重试 Run</button>
          <button id="btnDeleteRun" class="btn btn-sm btn-danger" data-action="delete-open" disabled>删除 Run</button>
        </div>
      </section>

      <div id="welcomeView" class="welcome">
        <div class="welcome-icon">📊</div>
        <h2>正在加载 Run</h2>
        <p>请稍候，系统正在整理当前 Run 的概览、轮次、结果、会话、文件与日志信息</p>
      </div>

      <div id="runDetail" class="run-detail" style="display:none">
        <div class="detail-header">
          <div class="detail-title">
            <h2 id="runName"></h2>
            <span id="runStatus" class="badge"></span>
            <span id="runMode" class="badge badge-mode"></span>
          </div>
          <div id="runMeta" class="detail-meta"></div>
        </div>

        <nav class="tabs">
          <button class="tab active" data-tab="overview">概览</button>
          <button class="tab" data-tab="cycles">评审轮次</button>
          <button class="tab" data-tab="results">漏洞结果</button>
          <button class="tab" data-tab="sessions">会话记录</button>
          <button class="tab" data-tab="files">文件浏览</button>
          <button class="tab" data-tab="log">运行日志</button>
          <button class="tab" data-tab="task">任务信息</button>
        </nav>

        <div id="tabOverview" class="tab-content active">
          <div class="grid-2">
            <div class="card" id="scoreChart"></div>
            <div class="card" id="issuesCard"></div>
          </div>
          <div class="card" id="manifestCard"></div>
          <div class="card" id="cycleTimeline"></div>
        </div>

        <div id="tabCycles" class="tab-content">
          <div id="cyclesContainer"></div>
        </div>

        <div id="tabResults" class="tab-content">
          <div id="resultsContainer"></div>
        </div>

        <div id="tabSessions" class="tab-content">
          <div id="sessionsContainer"></div>
        </div>

        <div id="tabFiles" class="tab-content">
          <div id="filesContainer"></div>
        </div>

        <div id="tabLog" class="tab-content">
          <div class="card log-card">
            <div id="logToolbar" class="log-toolbar"></div>
            <pre id="logContent" class="log-viewer"></pre>
          </div>
        </div>

        <div id="tabTask" class="tab-content">
          <div class="card" id="taskInfoCard"></div>
        </div>
      </div>
    </div>
  </main>
</div>

<!-- Delete confirmation modal -->
<div id="deleteModal" class="modal">
  <div class="modal-content" style="max-width:440px">
    <div class="modal-header">
      <span>⚠️ 确认删除</span>
      <button data-action="delete-close" class="btn-close">✕</button>
    </div>
    <div class="modal-body" style="text-align:center">
      <p style="margin-bottom:8px">确定要删除运行记录 <strong id="deleteRunName"></strong> 吗？</p>
      <p class="text-muted" style="font-size:12px">如果 Run 正在运行，后端会先停止 run_vuln_scan.py 进程，再永久删除本地文件夹和关联记录。此操作不可恢复。</p>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
        <button class="btn" data-action="delete-close">取消</button>
        <button class="btn btn-danger" id="confirmDeleteBtn" data-action="delete-confirm">删除</button>
      </div>
    </div>
  </div>
</div>

<!-- File viewer modal -->
<div id="fileModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <span id="fileModalTitle"></span>
      <button data-action="file-close" class="btn-close">✕</button>
    </div>
    <div id="fileModalBody" class="modal-body"></div>
  </div>
</div>
</div>
`;

const DATAFLOW_DASHBOARD_SECFLOW_REFRESH_CSS = `
/* SecFlow visual refresh */
:host {
  display: block;
  --bg: #f8fafc;
  --bg-surface: #ffffff;
  --bg-hover: #f8fafc;
  --bg-active: #ecfeff;
  --border: #dbe4ee;
  --border-accent: #0891b2;
  --text: #0f172a;
  --text-muted: #475569;
  --text-dim: #94a3b8;
  --text-bright: #020617;
  --primary: #0891b2;
  --success: #047857;
  --warning: #b45309;
  --error: #be123c;
  --info: #0369a1;
  --purple: #7c3aed;
  --orange: #c2410c;
  --radius: 18px;
  --line-height: 20px;
  --mono: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

:host, .dfv-dashboard-root {
  background:
    radial-gradient(circle at top left, rgba(6, 182, 212, 0.12), transparent 24%),
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.08), transparent 22%),
    linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  color: var(--text);
}

* {
  scrollbar-color: #cbd5e1 transparent;
}

.dfv-dashboard-root {
  font-family: var(--sans);
  font-size: 13px;
  overflow: visible;
  height: auto;
  min-height: 100%;
}

#header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: auto;
  min-height: 68px;
  padding: 16px 22px;
  background: rgba(248, 250, 252, 0.92);
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(14px);
}

.header-left,
.header-right {
  gap: 10px;
}

.header-left h1 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--text-bright);
}

.logo {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
  box-shadow: inset 0 0 0 1px rgba(8, 145, 178, 0.12);
  font-size: 18px;
}

#app {
  display: block;
  height: auto;
  min-height: calc(100% - 68px);
}

#mainContent {
  padding: 24px;
  overflow: visible;
}

.page-shell {
  max-width: 1800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-backbar {
  display: flex;
  align-items: center;
}

.page-header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.page-header-copy {
  min-width: 0;
}

.page-eyebrow {
  color: #0e7490;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.page-title {
  margin-top: 8px;
  color: #020617;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.page-description {
  max-width: 72rem;
  margin-top: 8px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.7;
}

.page-header-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toggle-label {
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.toggle-slider {
  background: #cbd5e1;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.26);
}

.toggle-slider::after {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
}

.toggle-label input:checked + .toggle-slider {
  background: #22d3ee;
}

.btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: #ffffff;
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.btn:hover {
  background: #f8fafc;
  border-color: #bae6fd;
  color: var(--text-bright);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(14, 165, 233, 0.10);
}

.btn-sm {
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.btn-back {
  padding: 0 16px;
  color: #334155;
  font-weight: 900;
}

.btn-close {
  color: #64748b;
  border-radius: 999px;
}

.btn-close:hover {
  color: var(--error);
  background: rgba(244, 63, 94, 0.08);
}

.btn-danger {
  background: linear-gradient(135deg, #fb7185 0%, #e11d48 100%);
  color: #ffffff;
  border-color: transparent;
}

.btn-danger:hover {
  background: linear-gradient(135deg, #f43f5e 0%, #be123c 100%);
  border-color: transparent;
}

.btn-warning {
  background: #fffbeb;
  color: #92400e;
  border-color: #fde68a;
}

.btn-warning:hover {
  background: #fef3c7;
  border-color: #fcd34d;
}

.btn:disabled,
.btn:disabled:hover {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
  box-shadow: none;
}

.welcome,
.detail-header,
.card,
.session-header-card,
.session-group,
.modal-content {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.92);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06);
}

.welcome {
  min-height: calc(100vh - 210px);
  padding: 48px 28px;
  border-radius: 28px;
  text-align: center;
}

.welcome-icon {
  display: inline-grid;
  place-items: center;
  width: 80px;
  height: 80px;
  margin-bottom: 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%);
  box-shadow: inset 0 0 0 1px rgba(8, 145, 178, 0.10);
  font-size: 38px;
  opacity: 1;
}

.welcome h2 {
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 800;
  color: var(--text-bright);
}

.welcome p {
  max-width: 680px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.detail-header {
  margin-bottom: 18px;
  padding: 22px 24px;
  border-radius: 26px;
}

.detail-title {
  gap: 10px;
  margin-bottom: 12px;
}

.detail-title h2 {
  font-size: 26px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--text-bright);
}

.detail-meta {
  gap: 10px 14px;
  font-size: 12px;
  color: var(--text-muted);
}

.detail-meta span {
  padding: 8px 12px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.task-state-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.task-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.task-info-row {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
  min-width: 0;
}

.task-info-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.task-info-value {
  color: #0f172a;
  font-family: var(--mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.run-command-block {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #bae6fd;
  border-radius: 16px;
  background: #f0f9ff;
}

.run-command-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #075985;
  font-size: 12px;
  font-weight: 900;
}

.run-command-pre {
  margin-top: 10px;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 18px;
}

.task-action-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.tabs {
  gap: 10px;
  margin-bottom: 18px;
  border-bottom: 0;
  flex-wrap: wrap;
}

.tab {
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.tab:hover {
  color: var(--text-bright);
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(186, 230, 253, 0.92);
}

.tab.active {
  color: var(--text-bright);
  background: #ffffff;
  border-bottom-color: #bae6fd;
  border-color: #bae6fd;
  box-shadow: 0 8px 18px rgba(14, 165, 233, 0.10);
}

.tab-danger {
  margin-left: auto;
  background: rgba(255, 241, 242, 0.96);
  color: var(--error) !important;
}

.tab-danger:hover {
  background: #ffe4e6;
}

.card {
  margin-bottom: 18px;
  padding: 20px;
  border-radius: 24px;
}

.card-title {
  margin-bottom: 12px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.badge {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 800;
  text-transform: none;
  letter-spacing: 0.02em;
}

.badge-completed, .badge-succeeded, .badge-passed {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: var(--success);
}

.badge-failed, .badge-interrupted, .badge-cancelled, .badge-stopped, .badge-delete_requested,
.badge-review_error, .badge-review_plateau, .badge-summary_incomplete,
.badge-runtime_output_limit, .badge-runtime_timeout, .badge-blocked_context_window,
.badge-blocked_quota, .badge-provider_rate_limited, .badge-model_contract_violation,
.badge-blocked_external_source, .badge-no_workspace, .badge-error {
  background: #fff1f2;
  border-color: #fecdd3;
  color: var(--error);
}

.badge-running {
  background: #ecfeff;
  border-color: #a5f3fc;
  color: var(--primary);
}

.badge-cancel_requested {
  background: #fffbeb;
  border-color: #fde68a;
  color: #b45309;
}

.badge-unknown, .badge-pending, .badge-queued {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #64748b;
}

.badge-mode {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #5b21b6;
}

.badge-warning {
  background: #fffbeb;
  border-color: #fde68a;
  color: var(--warning);
}

.manifest-grid {
  gap: 12px;
}

.manifest-grid > div,
.cycle-metrics,
.issue-item,
.review-card,
.call-row,
.file-row,
.accordion-header,
.accordion-body,
.progress-stat {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.manifest-grid > div {
  padding: 12px;
  border-radius: 18px;
}

.metric-num {
  color: var(--text-bright);
  font-size: 22px;
  font-weight: 800;
}

.cycle-row {
  padding: 12px 0;
  border-bottom-color: #e2e8f0;
  font-size: 12px;
}

.score-pill {
  border-radius: 999px;
  padding: 4px 8px;
  background: #ffffff;
  border-color: #dbe4ee;
}

.issue-item {
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-left-width: 1px;
  border-radius: 16px;
}

.issue-item.framework-issue {
  border-color: #fecdd3;
  background: #fff1f2;
}

.issue-id {
  color: #b45309;
}

.review-card {
  margin-bottom: 10px;
  padding: 14px;
  border-left-width: 1px;
  border-radius: 18px;
}

.review-card.passed {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.review-card.failed {
  background: #fff7ed;
  border-color: #fed7aa;
}

.result-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 10px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
}

.result-card:hover {
  border-color: #67e8f9;
  box-shadow: 0 16px 28px rgba(14, 165, 233, 0.08);
}

.result-card-muted {
  background: #f8fafc;
}

.result-name {
  font-size: 14px;
  color: var(--text-bright);
}

.result-title {
  font-size: 11px;
  color: var(--text-muted);
}

.session-group {
  margin-bottom: 16px;
  padding: 18px;
  border-radius: 22px;
}

.session-name,
.file-group-title {
  color: var(--text-bright);
  font-size: 13px;
}

.call-row {
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}

.log-viewer {
  max-height: calc(100vh - 240px);
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #1e293b;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
}

.log-card {
  padding-top: 16px;
}

.log-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.log-toolbar-copy {
  min-width: 0;
}

.log-toolbar-title {
  color: var(--text-bright);
  font-size: 13px;
  font-weight: 800;
}

.log-toolbar-desc {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.log-toolbar-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.log-mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.log-mode-badge.full {
  background: #ecfeff;
  border-color: #a5f3fc;
  color: #0f766e;
}

.modal {
  background: rgba(15, 23, 42, 0.30);
  backdrop-filter: blur(10px);
}

.modal-content {
  border-radius: 28px;
}

.modal-header {
  padding: 16px 20px;
  border-bottom-color: #e2e8f0;
  color: var(--text-bright);
  font-size: 13px;
}

.modal-body {
  color: var(--text);
  line-height: 1.7;
}

.modal-body pre {
  padding: 14px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.modal-body code,
.markdown-content code {
  background: #eff6ff;
  color: #075985;
}

.modal-body th,
.modal-body td,
.markdown-content th,
.markdown-content td {
  border-color: #dbe4ee;
}

.modal-body th,
.markdown-content th {
  background: #f8fafc;
}

.accordion-header {
  padding: 12px 14px;
  border-radius: 18px;
}

.accordion-header:hover {
  border-color: #67e8f9;
}

.accordion-body {
  padding: 14px;
  border-radius: 0 0 18px 18px;
}

.file-toolbar {
  gap: 10px;
  margin-bottom: 14px;
}

.file-toolbar input {
  padding: 10px 12px;
  background: #ffffff;
  color: var(--text);
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  font-size: 12px;
}

.file-toolbar input:focus {
  border-color: #67e8f9;
  box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.12);
}

.file-row {
  grid-template-columns: minmax(0, 1fr) 96px 88px;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}

.file-row:hover {
  border-color: #67e8f9;
}

.action-link {
  color: #0f766e;
  font-weight: 700;
}

.action-link:hover,
.link:hover {
  color: #155e75;
}

.empty-state {
  padding: 30px;
  color: #64748b;
  font-size: 14px;
}

.link,
.text-primary {
  color: #0f766e;
}

.text-success {
  color: var(--success);
}

.text-error {
  color: var(--error);
}

.session-header-card {
  padding: 22px;
  margin-bottom: 18px;
  border-radius: 24px;
}

.session-header-card h1 {
  margin-bottom: 16px;
  color: var(--text-bright);
  font-size: 22px;
  font-weight: 800;
}

.session-header-info {
  gap: 6px;
}

.info-label {
  min-width: 110px;
  color: #64748b;
}

.info-value {
  color: var(--text);
}

.session-progress-bar {
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 0 0;
  margin-top: 16px;
  border-top: 1px solid #e2e8f0;
  border-bottom: 0;
}

.progress-stat {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  color: #64748b;
  font-size: 11px;
}

.progress-num {
  color: var(--text-bright);
  font-size: 16px;
}

.model-change-event,
.thinking-level-event {
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 14px;
  background: #eff6ff;
  color: #475569;
}

.model-name {
  color: #075985;
}

.user-message {
  background: linear-gradient(135deg, #ecfeff 0%, #f0fdfa 100%);
  color: var(--text);
  border: 1px solid #bae6fd;
  border-radius: 20px;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.08);
}

.user-message .message-timestamp {
  color: #0f766e;
  opacity: 1;
}

.assistant-message {
  padding: 12px 0;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.assistant-message .message-timestamp {
  padding: 0 18px;
  margin-bottom: 8px;
  color: #94a3b8;
}

.assistant-text-content,
.thinking-block {
  padding: 0 18px 18px;
}

.message-timestamp + .assistant-text-content,
.message-timestamp + .thinking-block {
  padding-top: 0;
}

.thinking-text,
.thinking-collapsed {
  color: #64748b;
}

.thinking-toggle-btn {
  color: #0f766e;
  font-size: 11px;
  font-weight: 700;
}

.tool-execution {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid #e2e8f0;
}

.tool-execution.pending {
  background: #eff6ff;
}

.tool-execution.success {
  background: #ecfdf5;
  border-color: #bbf7d0;
}

.tool-execution.error {
  background: #fff1f2;
  border-color: #fecdd3;
}

.tool-header,
.tool-name,
.tool-command {
  color: var(--text-bright);
}

.tool-path {
  color: #0f766e;
}

.tool-output,
.tool-result-output {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #dbe4ee;
  color: #334155;
}

.tool-result-message {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  border-radius: 18px;
}

.tool-result-message.has-error {
  background: #fff1f2;
  border-color: #fecdd3;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  color: var(--text-bright);
}

.markdown-content blockquote {
  border-left-color: #cbd5e1;
  color: #64748b;
}

@media (max-width: 960px) {
  #mainContent {
    padding: 18px;
  }

  .page-header-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .detail-header,
  .card,
  .session-header-card,
  .session-group {
    padding: 16px;
    border-radius: 20px;
  }

  .detail-title h2,
  .session-header-card h1 {
    font-size: 20px;
  }

  .file-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .call-row {
    flex-wrap: wrap;
  }

  .log-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .log-toolbar-actions {
    width: 100%;
  }

  .detail-meta {
    flex-direction: column;
    align-items: stretch;
  }

  .task-info-grid {
    grid-template-columns: 1fr;
  }
}
`;

const DATAFLOW_DASHBOARD_STYLES = `${DATAFLOW_DASHBOARD_MIRROR_CSS}\n${DATAFLOW_DASHBOARD_SECFLOW_REFRESH_CSS}`;

const normalizeProjectPath = (value: string) => {
  const text = String(value || '/').trim() || '/';
  const withRoot = text.startsWith('/') ? text : `/${text}`;
  return withRoot.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const joinPath = (...parts: string[]) => {
  const joined = parts
    .map((part, index) => {
      const text = String(part || '');
      if (index === 0) return text.replace(/\/+$/g, '');
      return text.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
  return normalizeProjectPath(joined || '/');
};

const getFileType = (path: string) => {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.jsonl')) return 'jsonl';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
};

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const parseSessionJsonl = (content: string, path: string) => {
  const events: Record<string, any>[] = [];
  let sessionMeta: Record<string, any> = {};

  content.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj: Record<string, any>;
    try {
      const parsed = JSON.parse(trimmed);
      obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { type: 'raw', text: trimmed };
    } catch {
      events.push({ type: 'raw', line: lineNo, text: trimmed.slice(0, 200) });
      return;
    }

    const etype = obj.type || '';

    if (etype === 'session') {
      sessionMeta = {
        id: obj.id || '',
        version: obj.version || '',
        timestamp: obj.timestamp || '',
        cwd: obj.cwd || '',
      };
      return;
    }

    if (etype === 'model_change') {
      events.push({
        type: 'model_change',
        line: lineNo,
        timestamp: obj.timestamp || '',
        provider: obj.provider || '',
        modelId: obj.modelId || '',
      });
      return;
    }

    if (etype === 'thinking_level_change') {
      events.push({
        type: 'thinking_level_change',
        line: lineNo,
        timestamp: obj.timestamp || '',
        thinkingLevel: obj.thinkingLevel || '',
      });
      return;
    }

    if (etype === 'message') {
      const msg = obj.message || {};
      const role = msg.role || '';
      const ts = obj.timestamp || '';
      const contentValue = msg.content || [];
      const extra: Record<string, any> = {};
      if (role === 'toolResult') {
        extra.toolCallId = msg.toolCallId || msg.tool_call_id || '';
        extra.toolName = msg.toolName || msg.tool_name || '';
        extra.isError = msg.isError || msg.is_error || false;
      }

      const parts: Record<string, any>[] = [];
      if (typeof contentValue === 'string') {
        parts.push({ type: 'text', text: contentValue });
      } else if (Array.isArray(contentValue)) {
        contentValue.forEach((part: any) => {
          if (!part || typeof part !== 'object') return;
          const ct = part.type || '';
          if (ct === 'text') {
            parts.push({ type: 'text', text: part.text || '' });
          } else if (ct === 'thinking') {
            parts.push({ type: 'thinking', text: part.thinking || '' });
          } else if (ct === 'toolCall') {
            parts.push({
              type: 'toolCall',
              name: part.name || '',
              id: part.id || '',
              arguments: part.arguments || {},
            });
          } else if (ct === 'toolResult') {
            parts.push({ type: 'toolResult', text: part.text || '' });
          } else {
            parts.push({ type: 'unknown', detail: String(part).slice(0, 200) });
          }
        });
      }

      events.push({
        type: 'message',
        line: lineNo,
        timestamp: ts,
        role,
        parts,
        ...extra,
      });
      return;
    }

    events.push({
      type: etype || 'unknown_event',
      line: lineNo,
      summary: String(obj).slice(0, 200),
    });
  });

  return {
    path,
    session_meta: sessionMeta,
    events,
  };
};

interface DashboardAppOptions {
  projectId: string;
  rootPath: string;
  initialRunName: string;
  initialSummary?: DataflowFileserverRunSummary | null;
  onBack?: () => void;
  root: ShadowRoot;
}

const createDashboardApp = ({ projectId, rootPath, initialRunName, initialSummary = null, onBack, root }: DashboardAppOptions) => {
  const app: any = {
    runs: initialSummary ? [initialSummary] as DataflowFileserverRunSummary[] : [] as DataflowFileserverRunSummary[],
    currentRun: initialRunName || null,
    currentRunData: null as DataflowFileserverRunOverview | null,
    currentSummary: initialSummary as DataflowFileserverRunSummary | null,
    currentFiles: [] as DataflowFileserverRunFile[],
    runSessions: [] as DataflowFileserverRunSession[],
    runLog: '',
    tabCacheByRun: {} as Record<string, {
      overview: DataflowFileserverRunOverview | null;
      sessionsLoaded: boolean;
      sessions: DataflowFileserverRunSession[];
      filesLoaded: boolean;
      files: DataflowFileserverRunFile[];
      logLoaded: boolean;
      log: string;
      fullLogLoaded: boolean;
      fullLog: string;
      logMode: 'tail' | 'full';
      cycleDetails: Record<string, Record<string, any>>;
      cycleDetailPromises: Record<string, Promise<Record<string, any>>>;
      allCycleDetailsLoaded: boolean;
      allCycleDetailsPromise: Promise<void> | null;
      fileText: Record<string, string>;
      sessionViews: Record<string, Record<string, any>>;
    }>,
    refreshTimer: null as ReturnType<typeof setInterval> | null,
    REFRESH_INTERVAL: 6000,
    currentRunsFilter: '',
    collapsedRunDates: {} as Record<string, boolean>,
    runDetailRequestSeq: 0,
    _mutationBusy: '' as '' | 'adopt' | 'cancel' | 'retry' | 'delete',
    _durationTimer: null as ReturnType<typeof setInterval> | null,
    _durationSeconds: 0,
    _destroyed: false,
    _toolResultText: {} as Record<string, { preview: string; full: string; expanded: boolean }>,
    _handleClick: null as ((event: Event) => void) | null,
    _handleInput: null as ((event: Event) => void) | null,
    runsRootPath: normalizeProjectPath(rootPath || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT),
    root,

    $(id: string) {
      return this.root.getElementById(id) as HTMLElement | null;
    },

    $all(selector: string) {
      return Array.from(this.root.querySelectorAll(selector)) as HTMLElement[];
    },

    getRunCache(runName: string) {
      const key = String(runName || '');
      if (!this.tabCacheByRun[key]) {
        this.tabCacheByRun[key] = {
          overview: null,
          sessionsLoaded: false,
          sessions: [],
          filesLoaded: false,
          files: [],
          logLoaded: false,
          log: '',
          fullLogLoaded: false,
          fullLog: '',
          logMode: 'tail',
          cycleDetails: {},
          cycleDetailPromises: {},
          allCycleDetailsLoaded: false,
          allCycleDetailsPromise: null,
          fileText: {},
          sessionViews: {},
        };
      }
      return this.tabCacheByRun[key];
    },

    bindEvents() {
      if (!this._handleClick) {
        this._handleClick = (event: Event) => {
          const target = event.target as HTMLElement | null;
          if (!target) return;

          const deleteModal = this.$('deleteModal');
          if (deleteModal && target === deleteModal) {
            this.closeDeleteModal();
            return;
          }
          const fileModal = this.$('fileModal');
          if (fileModal && target === fileModal) {
            this.closeFile();
            return;
          }

          const thinkingToggle = target.closest('[data-action="toggle-thinking"]') as HTMLElement | null;
          if (thinkingToggle) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleThinkingBlock(thinkingToggle.dataset.targetId || '', thinkingToggle, thinkingToggle.dataset.expandLabel || '▼ hide', thinkingToggle.dataset.collapseLabel || '▶ show');
            return;
          }

          const toolArgsToggle = target.closest('[data-action="toggle-tool-args"]') as HTMLElement | null;
          if (toolArgsToggle) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleThinkingBlock(toolArgsToggle.dataset.targetId || '', toolArgsToggle, toolArgsToggle.dataset.expandLabel || '▼ hide', toolArgsToggle.dataset.collapseLabel || '▶ show args');
            return;
          }

          const toolResultToggle = target.closest('[data-action="toggle-tool-result"]') as HTMLElement | null;
          if (toolResultToggle) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleToolResultFull(toolResultToggle.dataset.resultId || '', toolResultToggle);
            return;
          }

          const backButton = target.closest('[data-action="back"]') as HTMLElement | null;
          if (backButton) {
            event.preventDefault();
            if (typeof onBack === 'function') onBack();
            else window.history.back();
            return;
          }

          const refreshButton = target.closest('[data-action="refresh"]') as HTMLElement | null;
          if (refreshButton) {
            event.preventDefault();
            void this.refresh({ forceActiveTabReload: true });
            return;
          }

          const adoptButton = target.closest('[data-action="adopt-run"]') as HTMLElement | null;
          if (adoptButton) {
            event.preventDefault();
            void this.adoptCurrentRun();
            return;
          }

          const cancelButton = target.closest('[data-action="cancel-run"]') as HTMLElement | null;
          if (cancelButton) {
            event.preventDefault();
            void this.cancelCurrentRun();
            return;
          }

          const retryButton = target.closest('[data-action="retry-run"]') as HTMLElement | null;
          if (retryButton) {
            event.preventDefault();
            void this.retryCurrentRun();
            return;
          }

          const loadFullLogButton = target.closest('[data-action="load-log-full"]') as HTMLElement | null;
          if (loadFullLogButton) {
            event.preventDefault();
            if (!this.currentRun) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.logMode = 'full';
            void this.loadLog();
            return;
          }

          const showTailLogButton = target.closest('[data-action="show-log-tail"]') as HTMLElement | null;
          if (showTailLogButton) {
            event.preventDefault();
            if (!this.currentRun) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.logMode = 'tail';
            void this.loadLog();
            return;
          }

          const deleteConfirm = target.closest('[data-action="delete-confirm"]') as HTMLElement | null;
          if (deleteConfirm) {
            event.preventDefault();
            void this.confirmDeleteRun();
            return;
          }

          const deleteClose = target.closest('[data-action="delete-close"]') as HTMLElement | null;
          if (deleteClose) {
            event.preventDefault();
            this.closeDeleteModal();
            return;
          }

          const fileClose = target.closest('[data-action="file-close"]') as HTMLElement | null;
          if (fileClose) {
            event.preventDefault();
            this.closeFile();
            return;
          }

          const deleteOpen = target.closest('[data-action="delete-open"]') as HTMLElement | null;
          if (deleteOpen) {
            event.preventDefault();
            this.showDeleteModal();
            return;
          }

          const openSession = target.closest('[data-action="open-session"]') as HTMLElement | null;
          if (openSession) {
            event.preventDefault();
            event.stopPropagation();
            void this.openSessionFile(openSession.dataset.run || '', openSession.dataset.path || '');
            return;
          }

          const openFile = target.closest('[data-action="open-file"]') as HTMLElement | null;
          if (openFile) {
            event.preventDefault();
            event.stopPropagation();
            void this.openFile(openFile.dataset.run || '', openFile.dataset.path || '');
            return;
          }

          const cycleHeader = target.closest('[data-action="toggle-cycle"]') as HTMLElement | null;
          if (cycleHeader) {
            event.preventDefault();
            this.toggleAccordion(cycleHeader);
            void this.loadCycleDetail(cycleHeader.dataset.run || '', Number(cycleHeader.dataset.cycle || 0));
            return;
          }

          const runItem = target.closest('[data-action="select-run"]') as HTMLElement | null;
          if (runItem) {
            event.preventDefault();
            void this.selectRun(runItem.dataset.run || '', event);
            return;
          }

          const dateToggle = target.closest('[data-action="toggle-date-group"]') as HTMLElement | null;
          if (dateToggle) {
            event.preventDefault();
            this.toggleRunDateGroup(dateToggle.dataset.dateKey || '');
            return;
          }

          const tab = target.closest('.tab[data-tab]') as HTMLElement | null;
          if (tab) {
            event.preventDefault();
            this.switchTab(tab.dataset.tab || 'overview');
          }
        };
        this.root.addEventListener('click', this._handleClick);
      }

      if (!this._handleInput) {
        this._handleInput = (event: Event) => {
          const target = event.target as HTMLInputElement | null;
          if (!target) return;
          if (target.id === 'searchInput') {
            this.filterRuns(target.value);
            return;
          }
          if (target.id === 'fileSearchInput') {
            this.filterFiles(target.value);
          }
        };
        this.root.addEventListener('input', this._handleInput);
      }
    },

    async init() {
      this.bindEvents();
      this.startAutoRefresh();
      if (this.currentRun) {
        this.showLoadingState(this.currentRun);
        await this.loadRunDetail(this.currentRun);
      }
    },

    destroy() {
      this._destroyed = true;
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (this._durationTimer) clearInterval(this._durationTimer);
      if (this._handleClick) this.root.removeEventListener('click', this._handleClick);
      if (this._handleInput) this.root.removeEventListener('input', this._handleInput);
      this._handleClick = null;
      this._handleInput = null;
    },

    startAutoRefresh() {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(() => {
        const checkbox = this.$('autoRefresh') as HTMLInputElement | null;
        if (checkbox?.checked) this.refresh();
      }, this.REFRESH_INTERVAL);
    },

    async refresh(options?: { forceActiveTabReload?: boolean }) {
      if (this.currentRun) await this.loadRunDetail(this.currentRun, true, !!options?.forceActiveTabReload);
    },

    getActiveTab() {
      return (this.root.querySelector('.tab.active[data-tab]') as HTMLElement | null)?.dataset.tab || 'overview';
    },

    refreshActiveTabContent(force = false) {
      const activeTab = this.getActiveTab();
      if (activeTab === 'sessions') this.loadSessions(force);
      if (activeTab === 'files') this.loadFiles(force);
      if (activeTab === 'log') this.loadLog(force);
    },

    async preloadAllCycleDetails(name: string, data: DataflowFileserverRunOverview, force = false) {
      const runCache = this.getRunCache(name);
      const cycles = Array.isArray(data.cycles) ? data.cycles : [];
      if (force) {
        runCache.cycleDetails = {};
        runCache.cycleDetailPromises = {};
        runCache.allCycleDetailsLoaded = false;
        runCache.allCycleDetailsPromise = null;
      }
      if (!cycles.length) {
        runCache.allCycleDetailsLoaded = true;
        return;
      }
      if (!force && runCache.allCycleDetailsLoaded) return;
      if (!force && runCache.allCycleDetailsPromise) {
        await runCache.allCycleDetailsPromise;
        return;
      }
      const promise = (async () => {
        await Promise.allSettled(
          cycles.map((cycle: any) => this.loadCycleDetail(name, Number(cycle?.cycle || 0), force))
        );
        runCache.allCycleDetailsLoaded = true;
      })();
      runCache.allCycleDetailsPromise = promise;
      try {
        await promise;
      } finally {
        if (runCache.allCycleDetailsPromise === promise) {
          runCache.allCycleDetailsPromise = null;
        }
      }
    },

    async loadRuns() {
      return;
    },

    _groupRunsByDate(runs: DataflowFileserverRunSummary[]) {
      const groups: Array<{ dateLabel: string; runs: DataflowFileserverRunSummary[] }> = [];
      let current: { dateLabel: string; runs: DataflowFileserverRunSummary[] } | null = null;
      runs.forEach((r) => {
        const dateLabel = this.runDateLabel(r);
        if (!current || current.dateLabel !== dateLabel) {
          current = { dateLabel, runs: [] };
          groups.push(current);
        }
        current.runs.push(r);
      });
      return groups;
    },

    renderRunsList(runs: DataflowFileserverRunSummary[]) {
      const el = this.$('runsList');
      if (!el) return;
      if (!runs.length) { el.innerHTML = '<div class="empty-state">暂无运行记录</div>'; return; }

      const groups = this._groupRunsByDate(runs);
      const forceExpanded = !!this.currentRunsFilter;
      el.innerHTML = groups.map((group: any) => {
        const dateKey = group.dateLabel;
        const collapsed = !forceExpanded && !!this.collapsedRunDates[dateKey];
        const arrow = collapsed ? '▶' : '▼';
        const runsHtml = group.runs.map((r: DataflowFileserverRunSummary) => {
          const timeLabel = (r.start_time || '').split(' ')[1] || '--:--:--';
          return `
          <div class="run-item ${this.currentRun === r.name ? 'active' : ''}"
               data-action="select-run"
               data-run="${this.attr(r.name)}">
            <div class="run-item-header">
              <span class="run-item-name" title="${this.esc(r.name)}">${this.esc(this.shortName(r.name))}</span>
              ${this.statusBadge(r.status, 'badge-sm')}
            </div>
            <div class="run-item-time">🕒 ${this.esc(timeLabel)}</div>
            <div class="run-item-stats">
              <span>🔄 ${r.cycles_used}/${r.max_cycles}</span>
              <span>✅ ${r.passed_count}</span>
              <span>❌ ${r.failed_count}</span>
              <span>⏳ ${this.fmtDuration(this._estimateDuration(r))}</span>
              <span class="text-muted">${this.esc((r.model || '').split('/').pop())}</span>
            </div>
          </div>
        `;
        }).join('');
        return `
        <div class="run-date-group ${collapsed ? 'collapsed' : ''}">
          <button class="run-date-header" data-action="toggle-date-group" data-date-key="${this.attr(dateKey)}">
            <span class="run-date-arrow">${arrow}</span>
            <span class="run-date-label">${this.esc(dateKey)}</span>
            <span class="run-date-count">${group.runs.length}</span>
          </button>
          <div class="run-date-body" style="display:${collapsed ? 'none' : 'block'}">
            ${runsHtml}
          </div>
        </div>
      `;
      }).join('');
    },

    toggleRunDateGroup(dateKey: string) {
      this.collapsedRunDates[dateKey] = !this.collapsedRunDates[dateKey];
      this.filterRuns(this.currentRunsFilter);
    },

    filterRuns(query: string) {
      this.currentRunsFilter = String(query || '');
      const q = this.currentRunsFilter.toLowerCase();
      const filtered = this.runs.filter((r: DataflowFileserverRunSummary) => r.name.toLowerCase().includes(q));
      this.renderRunsList(filtered);
    },

    shortName(name: string) {
      return String(name || '').replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ');
    },

    runDateLabel(run: any) {
      if (run.start_date) return run.start_date;
      if (run.start_time) return String(run.start_time).split(' ')[0];
      const name = run.name || '';
      const m = name.match(/(\d{8})_(\d{6})/) || name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
      if (m) {
        if (m[1] && m[1].length === 8) {
          return `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`;
        }
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
      return '未解析日期';
    },

    async selectRun(name: string, ev?: Event) {
      this.currentRun = name;
      this.$all('.run-item').forEach((el: HTMLElement) => el.classList.remove('active'));
      (ev?.target as HTMLElement | null)?.closest('.run-item')?.classList.add('active');
      await this.loadRunDetail(name);
    },

    showLoadingState(name: string) {
      const summary = this.currentSummary?.name === name
        ? this.currentSummary
        : this.runs.find((item: DataflowFileserverRunSummary) => item.name === name) || null;
      const welcome = this.$('welcomeView');
      const detail = this.$('runDetail');
      if (welcome) welcome.style.display = 'none';
      if (detail) detail.style.display = 'block';

      const runNameEl = this.$('runName');
      if (runNameEl) runNameEl.textContent = name;
      const statusEl = this.$('runStatus');
      if (statusEl) {
        statusEl.className = `badge badge-${summary?.status || 'pending'}`;
        statusEl.textContent = summary?.status || 'loading';
      }
      const modeEl = this.$('runMode');
      if (modeEl) {
        modeEl.textContent = summary?.workflow_mode || '';
        modeEl.style.display = summary?.workflow_mode ? '' : 'none';
      }
      const metaEl = this.$('runMeta');
      if (metaEl) {
        metaEl.innerHTML = `
          <span>🤖 ${this.esc(summary?.model || '-')}</span>
          <span>🧠 ${this.esc(summary?.thinking || '-')}</span>
          <span>🔄 ${summary?.cycles_used || 0} cycles</span>
          <span>⏳ 正在加载详细信息...</span>
        `;
      }

      const loadingCard = '<div class="card-title">加载中</div><div class="empty-state">正在解析该 Run 的详细信息...</div>';
      const emptyCard = '<div class="empty-state">正在加载...</div>';
      const scoreChart = this.$('scoreChart');
      const issuesCard = this.$('issuesCard');
      const manifestCard = this.$('manifestCard');
      const cycleTimeline = this.$('cycleTimeline');
      const cyclesContainer = this.$('cyclesContainer');
      const resultsContainer = this.$('resultsContainer');
      const sessionsContainer = this.$('sessionsContainer');
      const filesContainer = this.$('filesContainer');
      const logToolbar = this.$('logToolbar');
      const logContent = this.$('logContent');
      const taskInfoCard = this.$('taskInfoCard');
      if (scoreChart) scoreChart.innerHTML = loadingCard;
      if (issuesCard) issuesCard.innerHTML = loadingCard;
      if (manifestCard) manifestCard.innerHTML = loadingCard;
      if (cycleTimeline) cycleTimeline.innerHTML = loadingCard;
      if (cyclesContainer) cyclesContainer.innerHTML = emptyCard;
      if (resultsContainer) resultsContainer.innerHTML = emptyCard;
      if (sessionsContainer) sessionsContainer.innerHTML = emptyCard;
      if (filesContainer) filesContainer.innerHTML = emptyCard;
      if (taskInfoCard) taskInfoCard.innerHTML = loadingCard;
      if (logToolbar) {
        logToolbar.innerHTML = `
          <div class="log-toolbar-copy">
            <div class="log-toolbar-title">运行日志</div>
            <div class="log-toolbar-desc">默认展示日志尾部预览，加载详情后可按需读取完整 run.log。</div>
          </div>
          <div class="log-toolbar-actions">
            <span class="log-mode-badge">尾部预览</span>
            <button class="btn btn-sm" type="button" disabled>加载全文</button>
          </div>
        `;
      }
      if (logContent) logContent.textContent = '加载中...';
      this.updateActionButtons(summary);
    },

    showLoadError(name: string, message: string) {
      this.showLoadingState(name);
      const errorCard = `<div class="card-title">加载失败</div><div class="empty-state text-error">${this.esc(message)}</div>`;
      const scoreChart = this.$('scoreChart');
      const issuesCard = this.$('issuesCard');
      const manifestCard = this.$('manifestCard');
      const cycleTimeline = this.$('cycleTimeline');
      if (scoreChart) scoreChart.innerHTML = errorCard;
      if (issuesCard) issuesCard.innerHTML = errorCard;
      if (manifestCard) manifestCard.innerHTML = '<div class="card-title">提示</div><div class="empty-state">请检查浏览器控制台，以及 Run 后端对 /data 的挂载和索引配置。</div>';
      if (cycleTimeline) cycleTimeline.innerHTML = '<div class="card-title">运行状态</div><div class="empty-state">当前 Run 详情解析失败，因此无法展示轮次和结果信息。</div>';
    },

    async loadRunDetail(name: string, silent = false, forceActiveTabReload = false) {
      const requestSeq = ++this.runDetailRequestSeq;
      if (!silent) {
        this.showLoadingState(name);
      }
      try {
        const data = await inspectDataflowFileserverRunOverview(projectId, this.runsRootPath, name);
        if (this._destroyed || requestSeq !== this.runDetailRequestSeq || this.currentRun !== name) return;
        const runCache = this.getRunCache(name);
        runCache.overview = data;
        runCache.sessionsLoaded = true;
        runCache.sessions = Array.isArray(data.sessions) ? data.sessions : [];
        runCache.filesLoaded = true;
        runCache.files = Array.isArray(data.files) ? data.files : [];
        if (!runCache.logLoaded) {
          runCache.log = data.run_log || '';
        }
        this.currentRunData = data;
        this.currentSummary = {
          run_id: data.run_id || '',
          project_id: data.project_id,
          source_type: data.source_type,
          source_key: data.source_key,
          linked_task_id: data.linked_task_id,
          linked_execution_id: data.linked_execution_id,
          profile_id: data.profile_id,
          name: data.name,
          path: data.path,
          root_path: data.root_path,
          status: data.status,
          start_time: data.start_time,
          start_epoch: data.start_epoch,
          duration_seconds: data.duration_seconds,
          last_activity: data.last_activity,
          model: data.model,
          provider: data.provider,
          thinking: data.thinking,
          max_cycles: data.max_cycles,
          cycles_used: data.cycles_used,
          result_count: data.result_count,
          passed_count: data.passed_count,
          failed_count: data.failed_count,
          workflow_mode: data.workflow_mode,
          updated_at: data.updated_at,
        };
        this.runSessions = runCache.sessions;
        this.currentFiles = runCache.files;
        this.runLog = runCache.logMode === 'full' && runCache.fullLogLoaded ? runCache.fullLog : runCache.log;
        this.renderRunDetail(data);
        const welcome = this.$('welcomeView');
        const detail = this.$('runDetail');
        if (welcome) welcome.style.display = 'none';
        if (detail) detail.style.display = 'block';
        void this.preloadAllCycleDetails(name, data, forceActiveTabReload);
        this.refreshActiveTabContent(forceActiveTabReload);
      } catch (e: any) {
        if (this._destroyed || requestSeq !== this.runDetailRequestSeq || this.currentRun !== name) return;
        const message = e?.message || '加载 Run 失败';
        console.error('loadRunDetail failed', e);
        this.showLoadError(name, message);
      }
    },

    renderRunDetail(data: DataflowFileserverRunOverview) {
      const cycles = data.cycles || [];
      const runNameEl = this.$('runName');
      if (runNameEl) runNameEl.textContent = data.name;
      const statusEl = this.$('runStatus');
      if (statusEl) {
        statusEl.className = `badge badge-${data.status}`;
        statusEl.textContent = data.status;
      }
      const modeEl = this.$('runMode');
      const lastCycle = cycles[cycles.length - 1];
      const mode = lastCycle?.workflow_mode || '';
      if (modeEl) {
        modeEl.textContent = mode;
        modeEl.style.display = mode ? '' : 'none';
      }

      const c = data.config || {};
      const advisorCount = (c.global_review_advisors || []).length;
      const metaEl = this.$('runMeta');
      if (metaEl) {
        const thinking = String(c.thinking || '').trim() || '不支持/未启用';
        metaEl.innerHTML = `
      <span>🤖 ${this.esc(c.model)}</span>
      <span>🧠 ${this.esc(thinking)}</span>
      <span>🔄 ${data.cycles_used || cycles.length} cycles</span>
      <span>⏱️ ${c.timeout_seconds}s</span>
      <span>🎯 ${c.parallel_result_review ? '并行结果评审' : '串行结果评审'}${c.parallel_result_review_limit ? ` ×${c.parallel_result_review_limit}` : ''}</span>
      ${advisorCount ? `<span>🧩 全局参谋 ${advisorCount}</span>` : ''}
      <span class="run-duration" id="runDuration">⏳ ${this.fmtDuration(this._estimateDuration(data))}</span>
      ${data.error ? `<span class="text-error">⚠️ ${this.esc(data.error).substring(0, 80)}</span>` : ''}
    `;
      }
      this._startDurationTimer(data.status === 'running');
      this.updateActionButtons(data);

      this.renderOverview(data);
      this.renderCycles(data);
      this.renderResults(data);
      this.renderTaskInfo(data);
    },

    currentRunId() {
      return String(this.currentRunData?.run_id || this.currentSummary?.run_id || '');
    },

    isActiveRunStatus(statusText: string) {
      return ['pending', 'queued', 'running', 'cancel_requested', 'delete_requested'].includes(String(statusText || '').toLowerCase());
    },

    isRetryableRunStatus(statusText: string) {
      return [
        'cancelled',
        'failed',
        'interrupted',
        'stopped',
        'review_error',
        'review_plateau',
        'summary_incomplete',
        'runtime_output_limit',
        'runtime_timeout',
        'blocked_context_window',
        'blocked_quota',
        'provider_rate_limited',
        'model_contract_violation',
        'blocked_external_source',
        'error',
      ].includes(String(statusText || '').toLowerCase());
    },

    updateActionButton(id: string, options: { disabled: boolean; hidden?: boolean; text?: string }) {
      const button = this.$(id) as HTMLButtonElement | null;
      if (!button) return;
      button.disabled = options.disabled || !!this._mutationBusy;
      button.style.display = options.hidden ? 'none' : '';
      if (options.text) button.textContent = options.text;
    },

    updateActionButtons(data?: Partial<DataflowFileserverRunSummary> | null) {
      const current = data || this.currentRunData || this.currentSummary || null;
      const hasRun = !!this.currentRun && !!current;
      const linked = !!(current?.linked_task_id || current?.linked_execution_id);
      const active = this.isActiveRunStatus(String(current?.status || ''));
      const retryable = this.isRetryableRunStatus(String(current?.status || ''));
      const busy = this._mutationBusy;
      this.updateActionButton('btnAdoptRun', {
        disabled: !hasRun || linked || !!busy,
        hidden: linked,
        text: busy === 'adopt' ? '正在关联...' : '关联任务记录',
      });
      this.updateActionButton('btnCancelRun', {
        disabled: !hasRun || !linked || !active || !!busy,
        text: busy === 'cancel' ? '正在取消...' : '取消 Run',
      });
      this.updateActionButton('btnRetryRun', {
        disabled: !hasRun || !retryable || !!busy,
        text: busy === 'retry' ? '正在提交...' : '重试 Run',
      });
      this.updateActionButton('btnDeleteRun', {
        disabled: !hasRun || !!busy,
        text: busy === 'delete' ? '正在删除...' : '删除 Run',
      });
    },

    taskActionButtons(data: DataflowFileserverRunOverview) {
      const linked = !!(data.linked_task_id || data.linked_execution_id);
      const active = this.isActiveRunStatus(data.status);
      const retryable = this.isRetryableRunStatus(data.status);
      const busy = !!this._mutationBusy;
      return `
        <div class="task-action-panel">
          <button class="btn btn-sm" data-action="adopt-run" ${linked || busy ? 'disabled' : ''}>关联任务记录</button>
          <button class="btn btn-sm btn-warning" data-action="cancel-run" ${!linked || !active || busy ? 'disabled' : ''}>取消 Run</button>
          <button class="btn btn-sm" data-action="retry-run" ${!retryable || busy ? 'disabled' : ''} title="取消/失败/可恢复异常的 Run 可重试">重试 Run</button>
          <button class="btn btn-sm btn-danger" data-action="delete-open" ${busy ? 'disabled' : ''}>删除 Run</button>
        </div>
      `;
    },

    runCommandDisplay(data: DataflowFileserverRunOverview) {
      const raw = data.raw && typeof data.raw === 'object' ? data.raw : {};
      const cli = raw.dataflow_cli && typeof raw.dataflow_cli === 'object' ? raw.dataflow_cli : {};
      const commandDisplay = String(data.command_display || cli.command_display || raw.command_display || '').trim();
      if (commandDisplay) return commandDisplay;
      const command = Array.isArray(data.command) ? data.command : Array.isArray(cli.command) ? cli.command : Array.isArray(raw.command) ? raw.command : [];
      return command.map((item: any) => String(item)).join(' ');
    },

    renderTaskInfo(data: DataflowFileserverRunOverview) {
      const el = this.$('taskInfoCard');
      if (!el) return;
      const linked = !!(data.linked_task_id || data.linked_execution_id);
      const commandDisplay = this.runCommandDisplay(data);
      const rows = [
        ['Run ID', data.run_id || '-'],
        ['Task ID', data.linked_task_id || '-'],
        ['Execution ID', data.linked_execution_id || '-'],
        ['Profile ID', data.profile_id || '-'],
        ['Source', data.source_type || '-'],
        ['Run Root', data.path || '-'],
        ['Atomic Work', data.atomic_work_path || '-'],
        ['解析时间', data.updated_at || '-'],
      ];
      el.innerHTML = `
        <div class="card-title">任务 / Run 信息</div>
        <div class="task-state-line">
          <span class="badge ${linked ? 'badge-succeeded' : 'badge-warning'}">${linked ? '已关联任务记录' : '未关联任务记录'}</span>
          <span class="text-muted">${linked ? '当前 Run 已关联任务与执行记录，可以统一使用取消、重试、删除能力。' : '点击“关联任务记录”会创建任务与执行记录并绑定该 Run，不会启动扫描。'}</span>
        </div>
        <div class="task-info-grid">
          ${rows.map(([label, value]) => `
            <div class="task-info-row">
              <span class="task-info-label">${this.esc(label)}</span>
              <span class="task-info-value">${this.esc(value)}</span>
            </div>
          `).join('')}
        </div>
        ${commandDisplay ? `
          <div class="run-command-block">
            <div class="run-command-title">
              <span>Pod 执行命令</span>
              <span>${this.esc(data.linked_execution_id || data.name || '')}</span>
            </div>
            <pre class="run-command-pre">${this.esc(commandDisplay)}</pre>
          </div>
        ` : `
          <div class="run-command-block">
            <div class="run-command-title">Pod 执行命令</div>
            <div class="text-muted" style="margin-top:8px;font-size:12px">任务开始运行并产生 execution_started 事件后会显示完整命令。</div>
          </div>
        `}
        ${this.taskActionButtons(data)}
      `;
    },

    renderOverview(data: DataflowFileserverRunOverview) {
      this.renderScoreChart(data.cycles || []);
      this.renderIssuesCard(data.latest_issues || []);
      this.renderManifestCard(data.manifests || {}, data.config || {});
      this.renderCycleTimeline(data.cycles || []);
    },

    renderManifestCard(manifests: Record<string, any>, config: Record<string, any>) {
      const el = this.$('manifestCard');
      if (!el) return;
      const m = manifests || {};
      const advisors = (config?.global_review_advisors || []).map((a: any) => {
        const fields = (a.score_fields || []).join(', ');
        return `<div class="manifest-advisor"><span class="mono">${this.esc(a.instance_id)}</span><span>${this.esc(fields || '-')}</span></div>`;
      }).join('');
      const manifestLinks = [
        ['result_relations_manifest', '结果关系'],
        ['results_manifest', '结果生命周期'],
        ['coverage_ledger', '覆盖账本'],
      ].map(([key, label]) => {
        const item = m[key] || {};
        const cls = item.exists ? 'text-success' : 'text-muted';
        return item.exists
          ? `<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(item.path)}">${label}</span>`
          : `<span class="${cls}">${label}: 缺失</span>`;
      }).join('');
      el.innerHTML = `
      <div class="card-title">框架产物一致性</div>
      <div class="manifest-grid">
        <div><span class="metric-num">${m.taskable_result_count ?? 0}</span><span class="text-muted">taskable</span></div>
        <div><span class="metric-num">${m.supplemental_result_count ?? 0}</span><span class="text-muted">supplement</span></div>
        <div><span class="metric-num">${m.inactive_result_count ?? 0}</span><span class="text-muted">inactive</span></div>
        <div><span class="metric-num">${(m.missing_referenced_results || []).length}</span><span class="text-muted">missing refs</span></div>
      </div>
      <div class="manifest-links">${manifestLinks}</div>
      ${advisors ? `<div class="manifest-advisors">${advisors}</div>` : ''}
    `;
    },

    renderScoreChart(cycles: Record<string, any>[]) {
      const el = this.$('scoreChart');
      if (!el) return;
      if (!cycles.length) { el.innerHTML = '<div class="card-title">分数趋势</div><div class="empty-state">暂无数据</div>'; return; }

      const scoreKeys = [...new Set(cycles.flatMap((c: any) => Object.keys(c?.scores || {})))];
      if (!scoreKeys.length) { el.innerHTML = '<div class="card-title">分数趋势</div><div class="empty-state">暂无分数数据</div>'; return; }

      const colors = ['#7aa2f7','#9ece6a','#e0af68','#f7768e','#7dcfff','#bb9af7','#ff9e64'];
      const W = 500, H = 220, PAD = 40, PADR = 20, PADT = 30, PADB = 30;
      const chartW = W - PAD - PADR, chartH = H - PADT - PADB;
      const n = cycles.length;
      const xStep = n > 1 ? chartW / (n - 1) : chartW;

      let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">`;
      for (let v = 0; v <= 1; v += 0.25) {
        const y = PADT + chartH * (1 - v);
        svg += `<line x1="${PAD}" y1="${y}" x2="${W-PADR}" y2="${y}" stroke="#3b4261" stroke-width="0.5"/>`;
        svg += `<text x="${PAD-4}" y="${y+4}" text-anchor="end" fill="#565f89" font-size="10">${v.toFixed(2)}</text>`;
      }
      cycles.forEach((c: any, i: number) => {
        const x = PAD + (n > 1 ? i * xStep : chartW / 2);
        svg += `<text x="${x}" y="${H-6}" text-anchor="middle" fill="#565f89" font-size="10">C${c.cycle}</text>`;
      });
      scoreKeys.forEach((key: any, ki: number) => {
        const color = colors[ki % colors.length];
        const points = cycles.map((c: any, i: number) => {
          const x = PAD + (n > 1 ? i * xStep : chartW / 2);
          const v = Number(c.scores?.[key] ?? 0);
          const y = PADT + chartH * (1 - v);
          return `${x},${y}`;
        });
        svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
        cycles.forEach((c: any, i: number) => {
          const x = PAD + (n > 1 ? i * xStep : chartW / 2);
          const v = Number(c.scores?.[key] ?? 0);
          const y = PADT + chartH * (1 - v);
          svg += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"><title>${key}: ${v.toFixed(2)} (Cycle ${c.cycle})</title></circle>`;
        });
      });
      svg += '</svg>';

      const legend = scoreKeys.map((key: any, ki: number) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px">` +
        `<span style="width:10px;height:3px;background:${colors[ki % colors.length]};border-radius:2px;display:inline-block"></span>` +
        `${this.esc(key)}</span>`
      ).join('');

      el.innerHTML = `<div class="card-title">分数趋势</div><div class="score-chart">${svg}</div><div style="margin-top:8px">${legend}</div>`;
    },

    renderIssuesCard(issues: Record<string, any>[]) {
      const el = this.$('issuesCard');
      if (!el) return;
      if (!issues || !issues.length) {
        el.innerHTML = '<div class="card-title">当前评审问题</div><div class="empty-state text-success">✅ 无未解决问题</div>';
        return;
      }
      el.innerHTML = `<div class="card-title">当前评审问题 (${issues.length})</div>` +
        issues.map((b: any) => `
        <div class="issue-item ${String(b.actionable_by || b.owner || '').toLowerCase() === 'framework' ? 'framework-issue' : ''}">
          <div><span class="issue-id">${this.esc(b.id || '')}</span></div>
          <div class="issue-detail">${this.esc(b.required_action || b.detail || b.description || '')}</div>
          <div class="issue-meta">
            target: ${this.esc(b.target || '')}
            ${b.category ? ` · category: ${this.esc(b.category)}` : ''}
            ${b.actionable_by || b.owner ? ` · owner: ${this.esc(b.actionable_by || b.owner)}` : ''}
            ${b.advisor_id ? ` · advisor: ${this.esc(b.advisor_id)}` : ''}
            ${b.severity ? ` · severity: ${this.esc(b.severity)}` : ''}
          </div>
        </div>
      `).join('');
    },

    renderCycleTimeline(cycles: Record<string, any>[]) {
      const el = this.$('cycleTimeline');
      if (!el) return;
      if (!cycles.length) { el.innerHTML = '<div class="card-title">评审轮次</div><div class="empty-state">暂无轮次数据</div>'; return; }

      const rows = cycles.map((c: any) => {
        const scorePills = Object.entries(c.scores || {}).map(([k, v]) => {
          const num = Number(v || 0);
          const cls = num >= 0.9 ? 'high' : num >= 0.7 ? 'mid' : 'low';
          return `<span class="score-pill ${cls}" title="${this.esc(k)}">${this.esc(k.substring(0, 18))}: ${num.toFixed(2)}</span>`;
        }).join('');
        const scope = c.global_failure_scope ? `<span class="score-pill low" title="global_failure_scope">${this.esc(c.global_failure_scope)}</span>` : '';
        return `
        <div class="cycle-row">
          <div class="cycle-num">Cycle ${c.cycle}</div>
          <div class="cycle-outcome">${this.outcomeBadge(c.outcome)}</div>
          <div class="cycle-scores">${scorePills}${scope}</div>
          <div class="cycle-issues">${c.issue_count ?? 0} issues</div>
        </div>`;
      }).join('');

      el.innerHTML = `<div class="card-title">评审轮次概览</div>${rows}`;
    },

    renderCycles(data: DataflowFileserverRunOverview) {
      const el = this.$('cyclesContainer');
      if (!el) return;
      const cycles = data.cycles || [];
      if (!cycles.length) { el.innerHTML = '<div class="empty-state">暂无轮次数据</div>'; return; }

      el.innerHTML = cycles.map((c: any) => `
      <div class="accordion-header" data-action="toggle-cycle" data-run="${this.attr(data.name)}" data-cycle="${this.attr(c.cycle)}">
        <span class="arrow">▶</span>
        <span style="font-weight:600">Cycle ${c.cycle}</span>
        ${this.outcomeBadge(c.outcome)}
        <span class="text-muted" style="margin-left:auto;font-size:12px">
          Global: ${c.global_passed ? '✅' : '❌'}${c.global_failure_scope ? `/${this.esc(c.global_failure_scope)}` : ''} · Results: ${c.result_passed}/${c.result_total} · Removed: ${c.historical_removed_result_count || 0} · Issues: ${c.issue_count ?? 0}
        </span>
      </div>
      <div class="accordion-body" id="cycle-body-${c.cycle}">
        <div class="text-muted">加载中...</div>
      </div>
    `).join('');
    },

    async loadCycleDetail(name: string, cycle: number, force = false) {
      const bodyEl = this.$(`cycle-body-${cycle}`) as HTMLElement | null;
      const runCache = this.getRunCache(name);
      const cycleKey = String(cycle);
      if (!force && runCache.cycleDetails[cycleKey]) {
        if (bodyEl) {
          bodyEl.dataset.loaded = '1';
          this.renderCycleContent(bodyEl, runCache.cycleDetails[cycleKey], name);
        }
        return runCache.cycleDetails[cycleKey];
      }
      if (!force && runCache.cycleDetailPromises[cycleKey]) {
        const data = await runCache.cycleDetailPromises[cycleKey];
        if (bodyEl) {
          bodyEl.dataset.loaded = '1';
          this.renderCycleContent(bodyEl, data, name);
        }
        return data;
      }
      if (!force && bodyEl?.dataset.loaded) return runCache.cycleDetails[cycleKey];
      const promise = inspectDataflowFileserverRunCycle(projectId, this.runsRootPath, name, cycle);
      runCache.cycleDetailPromises[cycleKey] = promise;
      try {
        const data = await promise;
        runCache.cycleDetails[cycleKey] = data;
        if (bodyEl) {
          bodyEl.dataset.loaded = '1';
          this.renderCycleContent(bodyEl, data, name);
        }
        return data;
      } catch (e) {
        if (bodyEl) bodyEl.innerHTML = '<div class="text-error">加载失败</div>';
        throw e;
      } finally {
        if (runCache.cycleDetailPromises[cycleKey] === promise) {
          delete runCache.cycleDetailPromises[cycleKey];
        }
      }
    },

    renderCycleContent(el: HTMLElement, data: Record<string, any>, runName: string) {
      let html = '';

      if (data.metrics && Object.keys(data.metrics).length) {
        const m = data.metrics;
        html += `<div class="cycle-metrics">
        <span>scope: <strong>${this.esc(m.global_failure_scope || 'n/a')}</strong></span>
        <span>failed: ${m.current_failed_result_count ?? m.failed_result_count ?? 0}</span>
        <span>unreviewed: ${m.unreviewed_new_result_count ?? 0}</span>
        <span>removed: ${m.historical_removed_result_count ?? 0}</span>
      </div>`;
      }

      if ((data.global_reviews || []).length) {
        html += '<div class="card-title">全局评审</div>';
        html += (data.global_reviews || []).map((r: any) => `
        <div class="review-card ${r.passed ? 'passed' : 'failed'}">
          <div class="review-header">
            <span class="review-advisor">${this.esc(r.advisor_id)}</span>
            <span class="text-muted">${this.esc(r.role_name)}</span>
            ${this.statusBadge(r.passed ? 'passed' : 'failed', 'badge-sm')}
            ${r.schema_valid === false ? '<span class="badge badge-sm" style="background:rgba(224,175,104,.15);color:#e0af68">schema repair ×' + r.repair_attempts + '</span>' : ''}
            ${r.parser_mode ? `<span class="badge badge-sm badge-mode">${this.esc(r.parser_mode)}</span>` : ''}
            ${r.path ? `<span class="action-link" data-action="open-file" data-run="${this.attr(runName)}" data-path="${this.attr(r.path)}">查看 JSON</span>` : ''}
          </div>
          <div class="review-feedback">${this.esc(r.feedback || r.feedback_detail || '').substring(0, 500)}</div>
          <div class="review-scores">
            ${Object.entries(r.scores || {}).map(([k,v]) => {
              const num = Number(v || 0);
              const cls = num >= 0.9 ? 'high' : num >= 0.7 ? 'mid' : 'low';
              return `<span class="score-pill ${cls}">${this.esc(k)}: ${num.toFixed(2)}</span>`;
            }).join('')}
          </div>
          ${(r.issues || []).length ? `<div class="mt-8">${r.issues.map((b: any) =>
            `<div class="issue-item"><span class="issue-id">${this.esc(b.id||'')}</span> ${this.esc(b.required_action||b.detail||'')}</div>`
          ).join('')}</div>` : ''}
        </div>
      `).join('');
      }

      if ((data.result_reviews || []).length) {
        html += '<div class="card-title mt-8">结果评审</div>';
        html += (data.result_reviews || []).map((r: any) => `
        <div class="review-card ${r.passed ? 'passed' : 'failed'}">
          <div class="review-header">
            <span class="review-advisor mono">${this.esc(r.result_file)}</span>
            ${this.verdictBadge(r.verdict)}
            <span class="text-muted">conf: ${(r.confidence || 0).toFixed(2)}</span>
            ${r.schema_valid === false ? '<span class="badge badge-sm" style="background:rgba(224,175,104,.15);color:#e0af68">repair ×' + r.repair_attempts + '</span>' : ''}
            ${r.parser_mode ? `<span class="badge badge-sm badge-mode">${this.esc(r.parser_mode)}</span>` : ''}
            ${r.path ? `<span class="action-link" data-action="open-file" data-run="${this.attr(runName)}" data-path="${this.attr(r.path)}">查看 JSON</span>` : ''}
          </div>
          <div class="review-feedback">${this.esc(r.feedback_detail || r.feedback || '').substring(0, 500)}</div>
        </div>
      `).join('');
      }

      if (data.summary_snapshot) {
        html += `<div class="card-title mt-8">Summary 快照</div>`;
        html += `<div class="card" style="max-height:300px;overflow-y:auto;font-size:12px">${this.renderMarkdown(data.summary_snapshot).substring(0, 5000)}</div>`;
      }

      el.innerHTML = html || '<div class="text-muted">无评审数据</div>';
    },

    renderResults(data: DataflowFileserverRunOverview) {
      const el = this.$('resultsContainer');
      if (!el) return;
      const activeResults = data.results || [];
      const removedResults = data.removed_results || [];
      if (!activeResults.length && !removedResults.length) { el.innerHTML = '<div class="empty-state">暂无漏洞结果</div>'; return; }

      const activeHtml = activeResults.map((r: any) => `
      <div class="result-card" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.path || ('results/' + r.filename))}">
        <div class="result-header">
          <span class="result-name">${this.esc(r.filename)}</span>
          ${this.verdictBadge(r.verdict)}
          ${this.lifecycleBadge(r)}
          ${r.multi_finding ? '<span class="badge badge-sm badge-warning">multi-finding</span>' : ''}
          <span class="result-verdict text-muted">conf: ${(r.confidence || 0).toFixed(2)} · cycle ${r.review_cycle}</span>
          <span class="result-title">${this.esc(r.title || '')}</span>
          ${r.related_to ? `<span class="text-muted">related: ${this.esc(r.related_to)}</span>` : ''}
          ${r.review_path ? `<span class="action-link" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.review_path)}">评审 JSON</span>` : ''}
        </div>
        <div class="review-feedback mt-8">${this.esc(r.feedback_detail || r.feedback || '').substring(0, 260)}</div>
      </div>
    `).join('');

      const removedHtml = removedResults.length ? `
      <div class="card-title mt-8">已迁移/撤回结果</div>
      ${removedResults.map((r: any) => `
        <div class="result-card result-card-muted" ${r.path ? `data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.path)}"` : ''}>
          <div class="result-header">
            <span class="result-name">${this.esc(r.filename)}</span>
            <span class="badge badge-sm badge-failed">${this.esc(r.lifecycle_status || 'inactive')}</span>
            <span class="text-muted">cycle ${r.cycle || '-'}</span>
            ${r.meta_path ? `<span class="action-link" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.meta_path)}">迁移 JSON</span>` : ''}
          </div>
          <div class="review-feedback mt-8">${this.esc(r.reason || '').substring(0, 260)}</div>
        </div>
      `).join('')}
    ` : '';

      el.innerHTML = activeHtml + removedHtml;
    },

    async loadSessions(force = false) {
      if (!this.currentRun) return;
      const runName = this.currentRun;
      const runCache = this.getRunCache(runName);
      const el = this.$('sessionsContainer');
      if (!el) return;
      if (!force && runCache.sessionsLoaded) {
        this.runSessions = runCache.sessions;
        this.renderSessions(this.runSessions);
        return;
      }
      el.innerHTML = '<div class="empty-state">正在加载会话记录...</div>';
      try {
        const sessions = await listDataflowFileserverRunSessions(projectId, this.runsRootPath, runName);
        if (this.currentRun !== runName) return;
        runCache.sessionsLoaded = true;
        runCache.sessions = sessions;
        this.runSessions = sessions;
        if (this.currentRunData) {
          this.renderSessions(this.runSessions);
        }
      } catch (error) {
        if (this.currentRun !== runName) return;
        console.error('loadSessions failed', error);
        el.innerHTML = '<div class="empty-state text-error">加载会话记录失败</div>';
      }
    },

    renderSessions(sessions: DataflowFileserverRunSession[]) {
      const el = this.$('sessionsContainer');
      if (!el) return;
      if (!sessions.length) { el.innerHTML = '<div class="empty-state">暂无会话记录</div>'; return; }

      const jsonlSessions = sessions.filter((s: any) => s.format === 'jsonl' || s.format === 'hybrid');
      const callSessions = sessions.filter((s: any) => s.format !== 'jsonl');

      let html = '';

      if (jsonlSessions.length) {
        html += '<div class="card-title" style="margin-bottom:8px">会话文件 (JSONL)</div>';
        jsonlSessions.forEach((s: any) => {
          const sessionText = String(s.session_id || '');
          const sessionIdShort = sessionText.length > 40 ? sessionText.substring(0, 40) + '…' : sessionText;
          html += `
          <div class="session-group">
            <div class="session-name" style="display:flex;align-items:center;gap:8px">
              <span>${this.esc(s.worker_id)}</span>
              <span class="text-muted" style="font-size:11px">${this.fmtSize(s.size)}</span>
              <span class="action-link" data-action="open-session" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(s.jsonl_path)}">查看对话</span>
            </div>
            <div class="text-muted" style="font-size:11px;margin-bottom:6px">${this.esc(sessionIdShort)}</div>
          </div>`;
        });
      }

      if (callSessions.length) {
        html += '<div class="card-title mt-8" style="margin-bottom:8px">会话记录 (Calls)</div>';
        callSessions.forEach((s: any) => {
          const calls = Array.isArray(s.calls) ? s.calls : [];
          const callHtml = calls.map((c: any) => {
            const attempts = Array.isArray(c.attempts) ? c.attempts : [];
            const attemptCount = attempts.length;
            const timeoutFailures = Number(c.timeout_failures || 0);
            const timeoutLimitRaw = Number(c.timeout_max_retries);
            const timeoutLimit = Number.isFinite(timeoutLimitRaw) ? timeoutLimitRaw : 0;
            const restartedAttempts = attempts.filter((a: any) =>
              a && a.retry_kind === 'runtime_timeout_restart' && a.will_retry
            ).length;
            const effectiveSessionId = String(c.effective_session_id || '');
            const switchedSession = effectiveSessionId && effectiveSessionId !== String(s.session_id || '');
            const outputBytes = Number(c.output_total_bytes || c.output_len || 0);
            const stdoutTraceLimit = Number((c.trace_limits || {}).stdout_bytes || 0);
            const stdoutLimitText = stdoutTraceLimit > 0 ? `stdout trace ${this.fmtSize(stdoutTraceLimit)}` : 'stdout trace limit';
            const attemptTitle = attempts.map((a: any) => {
              const parts = [
                '#' + (a.attempt || '?'),
                a.status || 'unknown',
                a.error_code || '',
                a.session_id ? 'session=' + a.session_id : '',
                a.will_retry ? 'will_retry' : '',
              ].filter(Boolean);
              return parts.join(' · ');
            }).join('\n');
            const retryBadges = [
              attemptCount > 1 ? `<span class="badge badge-sm badge-mode" title="${this.attr(attemptTitle)}">attempts ×${attemptCount}</span>` : '',
              restartedAttempts > 0 ? `<span class="badge badge-sm badge-warning">重启 ${restartedAttempts}/${timeoutLimit}</span>` : '',
              timeoutFailures > 0 && restartedAttempts === 0 ? `<span class="badge badge-sm badge-failed">超时 ${timeoutFailures}</span>` : '',
              switchedSession ? `<span class="badge badge-sm badge-mode" title="${this.attr(effectiveSessionId)}">新 session</span>` : '',
              c.stdout_soft_limit_exceeded ? `<span class="badge badge-sm badge-warning" title="${this.attr(stdoutLimitText)}">stdout 截断</span>` : '',
              c.events_truncated_count > 0 ? `<span class="badge badge-sm badge-warning">events 截断</span>` : '',
            ].join('');
            return `
              <div class="call-row">
                <div class="call-turn">#${c.turn}</div>
                <div class="call-agent">${this.esc(c.agent_id)}</div>
                <div class="call-size">↑${this.fmtSize(c.user_prompt_len)} ↓${this.fmtSize(outputBytes)}</div>
                <div class="call-duration">${c.duration_ms ? (c.duration_ms / 1000).toFixed(1) + 's' : '-'}</div>
                <div class="call-status" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${this.statusBadge(c.status, 'badge-sm')}${retryBadges}</div>
                <div class="file-actions">
                  ${Object.entries({user_prompt:'Prompt', system_prompt:'System', response:'Response', stdout:'Stdout', stderr:'Stderr', request:'Req'}).map(([key,label]) =>
                    c.files && c.files[key] ? `<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(c.files[key])}">${label}</span>` : ''
                  ).join('')}
                  ${c.files && c.files.stdout_events ? `<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(c.files.stdout_events)}">Events</span>` : ''}
                </div>
                ${attemptCount > 1 ? `<div class="text-muted" style="font-size:11px;flex:1" title="${this.attr(attemptTitle)}">timeout/process attempts 已聚合在当前 call，避免与业务 turn 错位</div>` : ''}
                ${c.error ? `<div class="text-error" style="font-size:11px;flex:1">${this.esc(c.error).substring(0, 60)}</div>` : ''}
              </div>
            `;
          }).join('');
          html += `
          <div class="session-group">
            <div class="session-name">${this.esc(s.session_id)}</div>
            ${callHtml}
          </div>`;
        });
      }

      el.innerHTML = html || '<div class="empty-state">暂无会话记录</div>';
    },

    async ensureRunData(runName: string) {
      const runCache = this.getRunCache(runName);
      if (this.currentRunData?.name === runName) return this.currentRunData;
      if (runCache.overview) return runCache.overview;
      const overview = await inspectDataflowFileserverRunOverview(projectId, this.runsRootPath, runName);
      runCache.overview = overview;
      return overview;
    },

    async readRunFileText(runName: string, path: string) {
      const runCache = this.getRunCache(runName);
      if (runCache.fileText[path] !== undefined) {
        return runCache.fileText[path];
      }
      const payload = await getDataflowFileserverRunFile(projectId, this.runsRootPath, runName, path);
      runCache.fileText[path] = payload.content || '';
      return runCache.fileText[path];
    },

    async openSessionFile(runName: string, path: string) {
      try {
        const runCache = this.getRunCache(runName);
        const data = runCache.sessionViews[path] || await getDataflowFileserverRunSessionFile(projectId, this.runsRootPath, runName, path);
        runCache.sessionViews[path] = data;
        const title = this.$('fileModalTitle');
        if (title) title.textContent = data.path || path;
        const modal = this.$('fileModal');
        const mc = modal?.querySelector('.modal-content') as HTMLElement | null;
        if (mc) mc.style.maxWidth = '1100px';
        const body = this.$('fileModalBody');
        if (body) body.innerHTML = this.renderSessionConversation(data);
        modal?.classList.add('open');
      } catch (e) { console.error('openSessionFile failed', e); alert('Failed to load session file'); }
    },

    renderSessionConversation(data: Record<string, any>) {
      const meta = data.session_meta || {};
      const events = data.events || [];

      let html = '';

      html += '<div class="session-header-card">';
      html += '<h1>Session</h1>';
      html += '<div class="session-header-info">';
      if (meta.id) html += `<div class="info-item"><span class="info-label">Session ID</span><span class="info-value">${this.esc(meta.id)}</span></div>`;
      if (meta.timestamp) html += `<div class="info-item"><span class="info-label">Started</span><span class="info-value">${this.esc(meta.timestamp)}</span></div>`;
      if (meta.cwd) html += `<div class="info-item"><span class="info-label">Working Dir</span><span class="info-value">${this.esc(meta.cwd)}</span></div>`;
      html += '</div></div>';

      const msgEvents = events.filter((e: any) => e.type === 'message');
      const userMsgs = msgEvents.filter((e: any) => e.role === 'user');
      const assistantMsgs = msgEvents.filter((e: any) => e.role === 'assistant');
      const toolResultMsgs = msgEvents.filter((e: any) => e.role === 'toolResult');
      const toolCalls = msgEvents.reduce((n: number, e: any) => n + (e.parts || []).filter((p: any) => p.type === 'toolCall').length, 0);

      html += '<div class="session-progress-bar">';
      html += `<span class="progress-stat"><span class="progress-num">${userMsgs.length}</span>User</span>`;
      html += `<span class="progress-stat"><span class="progress-num">${assistantMsgs.length}</span>Assistant</span>`;
      html += `<span class="progress-stat"><span class="progress-num">${toolCalls}</span>Tool Calls</span>`;
      html += `<span class="progress-stat"><span class="progress-num">${toolResultMsgs.length}</span>Results</span>`;
      html += '</div>';

      const mergedEvents = this._mergeToolResults(events);

      for (const event of mergedEvents) {
        if (event.type === 'model_change') {
          html += `<div class="model-change-event">Model: <span class="model-name">${this.esc(event.provider || '')}/${this.esc(event.modelId || '')}</span></div>`;
          continue;
        }

        if (event.type === 'thinking_level_change') {
          const level = (event.thinkingLevel || '').toLowerCase();
          const colorCls = 'thinking-' + (({off:'off',minimal:'minimal',low:'low',medium:'medium',high:'high','x-high':'xhigh'} as Record<string, string>)[level] || 'off');
          html += `<div class="thinking-level-event"><span class="thinking-level-label ${colorCls}">Thinking: ${this.esc(event.thinkingLevel || '')}</span></div>`;
          continue;
        }
        if (event.type === 'message') {
          html += this.renderPiMessage(event);
          continue;
        }
        if (event.type !== 'raw') {
          html += `<div class="model-change-event text-muted" style="font-size:10px">[Line ${event.line}] ${this.esc(event.type)}: ${this.esc(event.summary || '').substring(0, 80)}</div>`;
        }
      }

      return html || '<div class="empty-state">Empty session</div>';
    },

    _mergeToolResults(events: Record<string, any>[]) {
      const result: Record<string, any>[] = [];
      for (const event of events) {
        if (event.type === 'message' && event.role === 'toolResult') {
          if (result.length > 0 && result[result.length - 1].type === 'message' && result[result.length - 1].role === 'assistant') {
            if (!result[result.length - 1]._toolResults) result[result.length - 1]._toolResults = [];
            result[result.length - 1]._toolResults.push(event);
          }
          continue;
        }
        result.push(event);
      }
      return result;
    },

    renderPiMessage(event: Record<string, any>) {
      const role = event.role;
      const parts = event.parts || [];
      const ts = event.timestamp || '';
      const timeStr = ts ? ts.split('T')[1]?.replace(/\.\d+Z$/, '').replace('Z', '') : '';

      if (role === 'user') {
        const texts = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
        return `<div class="user-message">
        ${timeStr ? `<div class="message-timestamp">${timeStr}</div>` : ''}
        <div class="message-text">${this.renderMarkdown(texts)}</div>
      </div>`;
      }

      if (role === 'assistant') {
        let html = `<div class="assistant-message">`;
        if (timeStr) html += `<div class="message-timestamp">${timeStr}</div>`;

        for (const part of parts) {
          if (part.type === 'thinking') {
            html += this.renderThinkingBlock(part);
          } else if (part.type === 'text') {
            html += `<div class="assistant-text-content">${this.renderMarkdown(part.text)}</div>`;
          } else if (part.type === 'toolCall') {
            html += this.renderToolCall(part);
          }
        }

        const toolResults = event._toolResults || [];
        for (const tr of toolResults) {
          html += this.renderToolResultInline(tr);
        }

        html += '</div>';
        return html;
      }

      if (role === 'toolResult') {
        return this.renderToolResultInline(event);
      }

      return `<div class="model-change-event text-muted">[${role}]</div>`;
    },

    renderThinkingBlock(part: Record<string, any>) {
      const text = part.text || '';
      const uid = 'think_' + Math.random().toString(36).substr(2, 6);
      return `<div class="thinking-block">
    <button class="thinking-toggle-btn" data-action="toggle-thinking" data-target-id="${uid}" data-expand-label="▼ hide" data-collapse-label="▶ thinking">▶ thinking</button>
    <div id="${uid}" class="thinking-text" style="display:none">${this.esc(text)}</div>
  </div>`;
    },

    renderToolCall(part: Record<string, any>) {
      const name = part.name || 'unknown';
      const args = part.arguments || {};

      let statusCls = 'pending';
      let headerHtml = '';

      if (name === 'bash' || name === 'shell' || name === 'exec') {
        const cmd = args.command || args.cmd || '';
        headerHtml = `<span class="tool-name">${this.esc(name)}</span> <span class="tool-command">${this.esc(cmd.substring(0, 200))}</span>`;
      } else if (name === 'read' || name === 'cat' || name === 'head') {
        const path = args.path || args.file || '';
        headerHtml = `<span class="tool-name">${this.esc(name)}</span> <span class="tool-path">${this.esc(path)}</span>`;
      } else if (name === 'write' || name === 'edit') {
        const path = args.path || args.file || '';
        headerHtml = `<span class="tool-name">${this.esc(name)}</span> <span class="tool-path">${this.esc(path)}</span>`;
      } else {
        headerHtml = `<span class="tool-name">${this.esc(name)}</span>`;
      }

      const argsStr = JSON.stringify(args, null, 2);
      const maxArgsLen = 600;
      const truncated = argsStr.length > maxArgsLen;
      const displayArgs = truncated ? argsStr.substring(0, maxArgsLen) + '\n...' : argsStr;
      const argsUid = 'args_' + Math.random().toString(36).substr(2, 6);

      return `<div class="tool-execution ${statusCls}">
    <div class="tool-header">${headerHtml}</div>
    <button class="thinking-toggle-btn" data-action="toggle-tool-args" data-target-id="${argsUid}" data-expand-label="▼ hide args" data-collapse-label="▶ show args">▶ show args</button>
    <div id="${argsUid}" class="tool-output" style="display:none"><pre>${this.esc(displayArgs)}</pre></div>
  </div>`;
    },

    toggleThinkingBlock(targetId: string, button: HTMLElement, expandLabel: string, collapseLabel: string) {
      const el = this.$(targetId);
      if (!el) return;
      const expanded = el.style.display !== 'none';
      el.style.display = expanded ? 'none' : 'block';
      button.textContent = expanded ? collapseLabel : expandLabel;
    },

    renderToolResultInline(event: Record<string, any>) {
      const parts = event.parts || [];
      const textParts = parts.filter((p: any) => p.type === 'text' || p.type === 'toolResult');
      const text = textParts.map((p: any) => p.text || '').join('\n');
      const isError = event.isError || parts.some((p: any) => p.isError);
      const statusCls = isError ? 'has-error' : '';
      const toolName = event.toolName || '';

      const maxLen = 2000;
      const truncated = text.length > maxLen;
      const preview = truncated ? text.substring(0, maxLen) : text;
      const uid = 'result_' + Math.random().toString(36).substr(2, 6);
      this._toolResultText[uid] = { preview: preview + (truncated ? '\n\n... truncated' : ''), full: text, expanded: false };

      let html = `<div class="tool-result-message ${statusCls}">`;
      html += `<div class="tool-result-header">${toolName ? this.esc(toolName) + ' — ' : ''}Output${truncated ? ` (${text.length} bytes)` : ''}</div>`;
      html += `<div class="tool-result-output" id="${uid}">${this.esc(preview)}${truncated ? '\n\n... truncated' : ''}</div>`;
      if (truncated) {
        html += `<button class="thinking-toggle-btn" data-action="toggle-tool-result" data-result-id="${uid}">▶ show full</button>`;
      }
      html += '</div>';
      return html;
    },

    toggleToolResultFull(uid: string, button: HTMLElement) {
      const item = this._toolResultText[uid];
      const el = this.$(uid);
      if (!item || !el) return;
      item.expanded = !item.expanded;
      el.textContent = item.expanded ? item.full : item.preview;
      button.textContent = item.expanded ? '▼ truncate' : '▶ show full';
    },

    async loadFiles(force = false) {
      if (!this.currentRun) return;
      const runName = this.currentRun;
      const runCache = this.getRunCache(runName);
      const el = this.$('filesContainer');
      if (!el) return;
      if (!force && runCache.filesLoaded) {
        this.currentFiles = runCache.files;
        this.renderFiles(this.currentFiles);
        return;
      }
      el.innerHTML = '<div class="empty-state">正在加载文件索引...</div>';
      try {
        const files = await listDataflowFileserverRunFiles(projectId, this.runsRootPath, runName, 2000);
        if (this.currentRun !== runName) return;
        runCache.filesLoaded = true;
        runCache.files = files;
        this.currentFiles = files;
        if (this.currentRunData) {
          this.renderFiles(this.currentFiles);
        }
      } catch (error) {
        if (this.currentRun !== runName) return;
        console.error('loadFiles failed', error);
        el.innerHTML = '<div class="empty-state text-error">加载文件索引失败</div>';
      }
    },

    renderFiles(files: DataflowFileserverRunFile[]) {
      const el = this.$('filesContainer');
      if (!el) return;
      if (!files.length) { el.innerHTML = '<div class="empty-state">暂无文件</div>'; return; }

      const groups: Record<string, DataflowFileserverRunFile[]> = {};
      files.forEach((f: any) => {
        const category = f.category || 'Workspace';
        if (!groups[category]) groups[category] = [];
        groups[category].push(f);
      });

      const body = Object.entries(groups).map(([category, items]) => `
      <div class="file-group">
        <div class="file-group-title">${this.esc(category)} (${items.length})</div>
        ${items.map((f: any) => `
          <div class="file-row" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(f.path)}" title="${this.attr(f.path)}">
            <div class="file-path">${this.esc(f.path)}</div>
            <div class="file-type">${this.esc(f.type)}</div>
            <div class="file-size">${this.fmtSize(f.size)}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

      el.innerHTML = `
      <div class="file-toolbar">
        <input id="fileSearchInput" placeholder="搜索文件路径 / 分类...">
        <span class="text-muted">${files.length} files</span>
      </div>
      ${body}
    `;
    },

    filterFiles(query: string) {
      const q = String(query || '').toLowerCase();
      const filtered = this.currentFiles.filter((f: any) =>
        String(f.path || '').toLowerCase().includes(q) || String(f.category || '').toLowerCase().includes(q) || String(f.type || '').toLowerCase().includes(q)
      );
      this.renderFiles(filtered);
      const input = this.$('fileSearchInput') as HTMLInputElement | null;
      if (input) { input.value = query; input.focus(); }
    },

    renderLogToolbar(runCache: {
      fullLogLoaded: boolean;
      logMode: 'tail' | 'full';
    }, options?: {
      loading?: 'tail' | 'full' | null;
      loadError?: string | null;
    }) {
      const toolbar = this.$('logToolbar');
      if (!toolbar) return;
      const mode = runCache.logMode === 'full' ? 'full' : 'tail';
      const loading = options?.loading || null;
      const isFull = mode === 'full';
      const title = isFull ? '完整日志' : '尾部预览';
      const description = isFull
        ? '当前直接展示 /data 中 run.log 的完整内容，首次加载可能稍慢。'
        : '为保证打开速度，默认只显示 run.log 尾部预览，最多 2000 行。';
      const button = isFull
        ? `<button class="btn btn-sm" type="button" data-action="show-log-tail">恢复尾部预览</button>`
        : `<button class="btn btn-sm" type="button" data-action="load-log-full" ${loading === 'full' ? 'disabled' : ''}>${loading === 'full' ? '正在加载全文...' : '加载全文'}</button>`;
      const error = options?.loadError
        ? `<div class="log-toolbar-desc text-error">${this.esc(options.loadError)}</div>`
        : '';
      toolbar.innerHTML = `
        <div class="log-toolbar-copy">
          <div class="log-toolbar-title">运行日志</div>
          <div class="log-toolbar-desc">${this.esc(description)}</div>
          ${error}
        </div>
        <div class="log-toolbar-actions">
          <span class="log-mode-badge ${isFull ? 'full' : ''}">${this.esc(title)}</span>
          ${button}
        </div>
      `;
    },

    async loadLog(force = false) {
      if (!this.currentRun) return;
      const runName = this.currentRun;
      const runCache = this.getRunCache(runName);
      const el = this.$('logContent') as HTMLElement | null;
      if (!el) return;
      this.renderLogToolbar(runCache);

      if (runCache.logMode === 'full') {
        if (!force && runCache.fullLogLoaded) {
          this.runLog = runCache.fullLog;
          el.textContent = this.runLog || '(empty)';
          el.scrollTop = 0;
          this.renderLogToolbar(runCache);
          return;
        }
        if (force) {
          delete runCache.fileText['run.log'];
          runCache.fullLogLoaded = false;
          runCache.fullLog = '';
        }
        el.textContent = '正在加载完整日志...';
        this.renderLogToolbar(runCache, { loading: 'full' });
        try {
          const logText = await this.readRunFileText(runName, 'run.log');
          if (this.currentRun !== runName) return;
          runCache.fullLogLoaded = true;
          runCache.fullLog = logText;
          this.runLog = logText;
          el.textContent = this.runLog || '(empty)';
          el.scrollTop = 0;
          this.renderLogToolbar(runCache);
        } catch (error) {
          if (this.currentRun !== runName) return;
          console.error('load full log failed', error);
          runCache.logMode = 'tail';
          el.textContent = runCache.log || '(empty)';
          this.renderLogToolbar(runCache, { loadError: '完整日志加载失败，已回退到尾部预览。' });
        }
        return;
      }

      if (!force && runCache.logLoaded) {
        this.runLog = runCache.log;
        el.textContent = this.runLog || '(empty)';
        el.scrollTop = el.scrollHeight;
        this.renderLogToolbar(runCache);
        return;
      }
      el.textContent = '加载中...';
      this.renderLogToolbar(runCache, { loading: 'tail' });
      try {
        const logText = await getDataflowFileserverRunLog(projectId, this.runsRootPath, runName, 2000);
        if (this.currentRun !== runName) return;
        runCache.logLoaded = true;
        runCache.log = logText;
        this.runLog = logText;
        el.textContent = this.runLog || '(empty)';
        el.scrollTop = el.scrollHeight;
        this.renderLogToolbar(runCache);
      } catch (error) {
        if (this.currentRun !== runName) return;
        console.error('loadLog failed', error);
        el.textContent = '加载运行日志失败';
        this.renderLogToolbar(runCache, { loadError: '日志尾部预览加载失败。' });
      }
    },

    switchTab(tab: string, force = false) {
      this.$all('.tab').forEach((t: HTMLElement) => t.classList.toggle('active', t.dataset.tab === tab));
      this.$all('.tab-content').forEach((t: HTMLElement) => t.classList.toggle('active', t.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`));
      if (tab === 'sessions') this.loadSessions(force);
      if (tab === 'files') this.loadFiles(force);
      if (tab === 'log') this.loadLog(force);
    },

    async openFile(runName: string, path: string) {
      try {
        const content = await this.readRunFileText(runName, path);
        const data = { path, type: getFileType(path), content };
        const title = this.$('fileModalTitle');
        if (title) title.textContent = data.path || path;
        const modal = this.$('fileModal');
        const mc = modal?.querySelector('.modal-content') as HTMLElement | null;
        if (mc) mc.style.maxWidth = '';
        const body = this.$('fileModalBody');
        if (!body) return;
        if (data.type === 'jsonl') {
          if (mc) mc.style.maxWidth = '1100px';
          body.innerHTML = `<div style="text-align:center;padding:20px">
          <p>这是一个会话记录文件 (.jsonl)</p>
          <button class="btn" style="margin-top:12px" data-action="open-session" data-run="${this.attr(runName)}" data-path="${this.attr(path)}">查看格式化对话</button>
        </div>`;
        } else if (data.type === 'markdown') {
          body.innerHTML = this.renderMarkdown(data.content);
        } else if (data.type === 'json') {
          try {
            body.innerHTML = `<pre>${this.esc(JSON.stringify(JSON.parse(data.content), null, 2))}</pre>`;
          } catch { body.innerHTML = `<pre>${this.esc(data.content)}</pre>`; }
        } else {
          body.innerHTML = `<pre>${this.esc(data.content)}</pre>`;
        }
        modal?.classList.add('open');
      } catch (e) { console.error('openFile failed', e); }
    },

    closeFile() {
      this.$('fileModal')?.classList.remove('open');
    },

    toggleAccordion(header: HTMLElement) {
      const body = header.nextElementSibling as HTMLElement | null;
      const isOpen = header.classList.toggle('open');
      body?.classList.toggle('open', isOpen);
    },

    _startDurationTimer(isRunning: boolean) {
      if (this._durationTimer) clearInterval(this._durationTimer);
      if (!isRunning || !this.currentRunData) return;
      this._durationSeconds = this._estimateDuration(this.currentRunData);
      this._durationTimer = setInterval(() => {
        this._durationSeconds += 1;
        const el = this.$('runDuration');
        if (el) el.textContent = '⏳ ' + this.fmtDuration(this._durationSeconds);
      }, 1000);
    },

    fmtDuration(seconds: number) {
      if (!seconds || seconds <= 0) return '-';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    },

	    _estimateDuration(data: any) {
	      if (typeof data.duration_seconds === 'number' && data.duration_seconds > 0) return data.duration_seconds;
	      const startStr = data.start_time || '';
	      if (!startStr) return 0;
      const m = startStr.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (!m) return 0;
      const startMs = new Date(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+'Z').getTime();
      if (isNaN(startMs)) return 0;

      if (data.status === 'running') {
        const nowMs = Date.now();
        const dur = Math.floor((nowMs - startMs) / 1000);
        return dur > 0 ? dur : 0;
      }

      const lastStr = data.last_activity || '';
      if (lastStr) {
        const lastMs = new Date(lastStr).getTime();
        if (!isNaN(lastMs) && lastMs > startMs) {
          return Math.floor((lastMs - startMs) / 1000);
        }
      }

	      return 0;
	    },

    setMutationBusy(action: '' | 'adopt' | 'cancel' | 'retry' | 'delete') {
      this._mutationBusy = action;
      this.updateActionButtons();
      if (this.currentRunData) this.renderTaskInfo(this.currentRunData);
    },

    clearCurrentRunCache() {
      if (!this.currentRun) return;
      delete this.tabCacheByRun[this.currentRun];
    },

    async reloadCurrentRunAfterMutation() {
      if (!this.currentRun) return;
      this.clearCurrentRunCache();
      await this.loadRunDetail(this.currentRun, false, true);
    },

    async adoptCurrentRun() {
      if (!this.currentRun || !this.currentRunId()) return;
      this.setMutationBusy('adopt');
      try {
        const result = await adoptDataflowFileserverRun(projectId, this.runsRootPath, this.currentRun);
        alert(result.message || '任务记录已关联');
        await this.reloadCurrentRunAfterMutation();
      } catch (error: any) {
        alert(error?.message || '关联任务记录失败');
      } finally {
        this.setMutationBusy('');
      }
    },

    async cancelCurrentRun() {
      if (!this.currentRun || !this.currentRunId()) return;
      if (!window.confirm(`确认取消 Run ${this.currentRun}？`)) return;
      this.setMutationBusy('cancel');
      try {
        const result = await cancelDataflowFileserverRun(projectId, this.runsRootPath, this.currentRun);
        alert(result.message || '取消请求已提交');
        await this.reloadCurrentRunAfterMutation();
      } catch (error: any) {
        alert(error?.message || '取消 Run 失败');
      } finally {
        this.setMutationBusy('');
      }
    },

	    async retryCurrentRun() {
	      if (!this.currentRun || !this.currentRunId()) return;
	      if (!this.isRetryableRunStatus(String(this.currentRunData?.status || this.currentSummary?.status || ''))) {
	        alert('当前 Run 状态不可重试。运行中的 Run 请先取消并等待进入终态；已完成的 Run 不需要重试。');
	        return;
	      }
      const extraCyclesText = window.prompt('追加评审轮次', '5');
      if (extraCyclesText === null) return;
      const extraCycles = Number.parseInt(extraCyclesText, 10);
      if (!Number.isFinite(extraCycles) || extraCycles < 1) {
        alert('追加评审轮次必须是大于 0 的整数');
        return;
      }
      if (!window.confirm(`确认重试 Run ${this.currentRun}，追加 ${extraCycles} 个评审轮次？`)) return;
      this.setMutationBusy('retry');
      try {
        const result = await retryDataflowFileserverRun(projectId, this.runsRootPath, this.currentRun, { extra_cycles: extraCycles });
        alert(result.message || '重试已提交');
        await this.reloadCurrentRunAfterMutation();
      } catch (error: any) {
        alert(error?.message || '重试 Run 失败');
      } finally {
        this.setMutationBusy('');
      }
    },

    showDeleteModal() {
      if (!this.currentRun) return;
      const nameEl = this.$('deleteRunName');
      if (nameEl) nameEl.textContent = this.currentRun;
      this.$('deleteModal')?.classList.add('open');
    },

    closeDeleteModal() {
      this.$('deleteModal')?.classList.remove('open');
    },

    async confirmDeleteRun() {
      this.closeDeleteModal();
      if (!this.currentRun || !this.currentRunId()) return;
      this.setMutationBusy('delete');
      try {
        const result = await deleteDataflowFileserverRun(projectId, this.runsRootPath, this.currentRun);
        alert(result.message || 'Run 已删除');
        if (typeof onBack === 'function') onBack();
        else window.history.back();
      } catch (error: any) {
        alert(error?.message || '删除 Run 失败');
      } finally {
        this.setMutationBusy('');
      }
    },

    esc(s: any) {
      const d = document.createElement('div');
      d.textContent = String(s || '');
      return d.innerHTML;
    },

    attr(s: any) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    fmtSize(bytes: number) {
      if (!bytes) return '0';
      if (bytes < 1024) return bytes + 'B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
      return (bytes / 1024 / 1024).toFixed(1) + 'M';
    },

    statusBadge(status: string, extra = '') {
      const s = String(status || 'unknown').toLowerCase();
      const label = ({
        completed: '完成',
        succeeded: '成功',
        failed: '失败',
        running: '运行中',
        passed: '通过',
        pending: '等待',
        queued: '排队',
        cancel_requested: '取消中',
        delete_requested: '删除中',
        timeout: '超时',
        error: '错误',
        interrupted: '中断',
        cancelled: '取消',
        stopped: '停止',
        review_error: '评审契约错误',
        review_plateau: '评审停滞',
        summary_incomplete: 'Summary 未收敛',
        runtime_output_limit: '输出超限',
        runtime_timeout: '运行超时',
        blocked_context_window: '上下文超限',
        blocked_quota: '额度受限',
        provider_rate_limited: '限流',
        model_contract_violation: '模型契约错误',
        blocked_external_source: '外部源码阻塞',
        no_workspace: '无工作区',
      } as Record<string, string>)[s] || s;
      return `<span class="badge badge-${s} ${extra}">${label}</span>`;
    },

    outcomeBadge(outcome: string) {
      const map: Record<string, { cls: string; label: string }> = {
        all_passed: { cls: 'completed', label: '全部通过' },
        global_failed: { cls: 'failed', label: '全局未通过' },
        results_failed: { cls: 'failed', label: '结果未通过' },
        review_error: { cls: 'failed', label: '评审错误' },
        review_plateau: { cls: 'failed', label: '评审停滞' },
        summary_incomplete: { cls: 'failed', label: 'Summary 未收敛' },
      };
      const m = map[outcome] || { cls: 'unknown', label: outcome || '?' };
      return `<span class="badge badge-${m.cls} badge-sm">${m.label}</span>`;
    },

    verdictBadge(verdict: string) {
      const v = String(verdict || '').toUpperCase();
      const map: Record<string, { cls: string; label: string }> = {
        CONFIRMED: { cls: 'completed', label: 'CONFIRMED' },
        PASS: { cls: 'completed', label: 'PASS' },
        FALSE_POSITIVE: { cls: 'failed', label: 'FALSE_POSITIVE' },
        FAIL: { cls: 'failed', label: 'FAIL' },
        INSUFFICIENT_INFO: { cls: 'pending', label: 'INSUFFICIENT' },
      };
      const m = map[v] || { cls: 'unknown', label: v || '-' };
      return `<span class="badge badge-${m.cls} badge-sm">${m.label}</span>`;
    },

    lifecycleBadge(result: Record<string, any>) {
      const status = String(result.lifecycle_status || result.role || '').toLowerCase();
      if (!status) return '';
      const cls = result.taskable === false || result.active === false ? 'badge-warning' : 'badge-mode';
      const label = result.role && result.lifecycle_status
        ? `${result.role}/${result.lifecycle_status}`
        : status;
      return `<span class="badge badge-sm ${cls}">${this.esc(label)}</span>`;
    },

    renderMarkdown(md: string) {
      if (!md) return '';
      let html = this.esc(md);
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/^\|(.+)\|$/gm, (match: string) => {
        const cells = match.split('|').filter((c) => c.trim());
        if (cells.every((c) => /^[\s-:]+$/.test(c))) return '';
        const tag = 'td';
        return '<tr>' + cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      });
      html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table>$1</table>');
      html = html.replace(/<\/table>\s*<table>/g, '');
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
      html = html.replace(/<\/ul>\s*<ul>/g, '');
      html = html.replace(/\n\n/g, '<br><br>');
      html = html.replace(/\n/g, '<br>');
      return '<div class="markdown-content">' + html + '</div>';
    },
  };

  return app;
};

export const DataflowFileserverRunDashboardPage: React.FC<{
  projectId: string;
  initialRunName: string;
  rootPath: string;
  initialSummary?: DataflowFileserverRunSummary | null;
  onBack?: () => void;
}> = ({ projectId, initialRunName, rootPath, initialSummary = null, onBack }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef<typeof onBack>(onBack);
  const initialSummaryRef = useRef<DataflowFileserverRunSummary | null | undefined>(initialSummary);
  onBackRef.current = onBack;
  initialSummaryRef.current = initialSummary;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${DATAFLOW_DASHBOARD_STYLES}</style>${DASHBOARD_HTML}`;
    let app: ReturnType<typeof createDashboardApp> | null = null;
    const renderInitError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error || 'unknown error');
      console.error('DataflowFileserverRunDashboardPage init failed', error);
      shadow.innerHTML = `
        <style>${DATAFLOW_DASHBOARD_STYLES}</style>
        <div class="dfv-dashboard-root">
          <div id="mainContent">
            <div class="card">
              <div class="card-title">Run 详情加载失败</div>
              <div class="empty-state text-error">${message.replace(/[&<>"]/g, (ch) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
              }[ch] || ch))}</div>
            </div>
          </div>
        </div>
      `;
    };
    try {
      app = createDashboardApp({
        projectId,
        initialRunName,
        initialSummary: initialSummaryRef.current || null,
        onBack: () => onBackRef.current?.(),
        rootPath: rootPath || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
        root: shadow,
      });
      (window as any).App = app;
      void app.init().catch(renderInitError);
    } catch (error) {
      renderInitError(error);
    }

    return () => {
      app?.destroy();
      if (app && (window as any).App === app) {
        delete (window as any).App;
      }
      shadow.innerHTML = '';
    };
  }, [projectId, initialRunName, rootPath]);

  return (
    <div
      ref={hostRef}
      style={{
        minHeight: 'calc(100vh - 80px)',
        width: '100%',
      }}
    />
  );
};
