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
  previewDataflowFileserverRunRetry,
  reportDataflowFileserverRunVulnerabilities,
  retryDataflowFileserverRun,
} from '../../clients/dataflowVulnRunsFileserver';
import { dataflowVulnScannerApi, DataflowScanTaskDetail, DataflowTaskTimelineEvent } from '../../clients/dataflowVulnScanner';
import { FileWatchMessage, fileserverApi } from '../../clients/fileserver';
import { AppSaSessionEvent } from '../../types/types';
import { DATAFLOW_DASHBOARD_MIRROR_CSS } from './DataflowFileserverRunDashboardCss';
import { mergeAgentSessionToolResults, parseAgentSessionJsonlDelta } from './agentSessionParsing';
import { useUiFeedback } from '../../components/UiFeedback';

const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const DASHBOARD_HTML =`
<div class="dfv-dashboard-root">
<div id="app">
  <main id="mainContent">
    <div class="page-shell">
      <div class="page-backbar">
        <button id="btnBack" class="btn btn-back" data-action="back">← 返回任务列表</button>
      </div>

      <section class="page-header-card">
        <div class="page-header-copy">
          <p class="page-eyebrow">DATAFLOW VULNERABILITY DISCOVERY</p>
          <div class="page-title-row">
            <h1 id="runName" class="page-title">Run 详情</h1>
            <span id="runStatus" class="badge badge-pending">加载中</span>
            <span id="runMode" class="badge badge-mode" style="display:none"></span>
          </div>
          <p id="runSubtitle" class="page-description">统一查看当前 Run 的概览、轮次、结果、会话、文件、日志与任务关联信息。</p>
          <div id="runMeta" class="detail-meta header-run-meta"></div>
        </div>
        <div class="page-header-actions">
          <label class="toggle-label">
            <input type="checkbox" id="autoRefresh" checked>
            <span class="toggle-slider"></span>
            自动刷新
          </label>
          <button id="btnRefresh" class="btn btn-sm" data-action="refresh">刷新概要</button>
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
        <nav class="tabs">
          <button class="tab active" data-tab="overview">概览</button>
          <button class="tab" data-tab="cycles">评审轮次</button>
          <button class="tab" data-tab="results">漏洞结果</button>
          <button class="tab" data-tab="sessions">会话记录</button>
          <button class="tab" data-tab="files">文件浏览</button>
          <button class="tab" data-tab="log">运行日志</button>
          <button class="tab" data-tab="task-config">任务配置</button>
          <button class="tab" data-tab="task">任务信息</button>
          <button class="tab" data-tab="timeline">事件时间线</button>
        </nav>

        <div id="tabOverview" class="tab-content active">
          <div class="card" id="taskOverviewCard"></div>
          <div class="grid-2">
            <div class="card" id="scoreChart"></div>
            <div class="card" id="vulnTrendCard"></div>
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

        <div id="tabTask-config" class="tab-content">
          <div id="taskConfigContainer"></div>
        </div>

        <div id="tabTask" class="tab-content">
          <div class="card" id="taskInfoCard"></div>
        </div>

        <div id="tabTimeline" class="tab-content">
          <div id="taskTimelineContainer"></div>
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
</div>`;

const DATAFLOW_DASHBOARD_CHIMERA_REFRESH_CSS =`
/* Chimera visual refresh - LOKI dark theme */
:host {
  display: block;
  --bg: #111a2b;
  --bg-surface: #111a2b;
  --bg-hover: #18233a;
  --bg-active: #18233a;
  --border: #26324a;
  --border-accent: #4f73ff;
  --text: #f5f7ff;
  --text-muted: #a4aec4;
  --text-dim: #72809a;
  --text-bright: #f5f7ff;
  --primary: #4f73ff;
  --success: #45c06f;
  --warning: #d5a13a;
  --error: #f15d5d;
  --info: #4f8cff;
  --purple: #8b5cf6;
  --orange: #ff8b3d;
  --radius: 12px;
  --line-height: 20px;
  --mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

:host, .dfv-dashboard-root {
 background: var(--canvas);
  color: var(--text);
}

* {
 scrollbar-color: var(--border) transparent;
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
  background: rgba(17, 26, 43, 0.84);
  border-bottom: 1px solid rgba(38, 50, 74, 0.5);
  backdrop-filter: blur(14px);
}

.header-left,
.header-right {
  gap: 10px;
}

.header-left h1 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-bright);
}

.logo {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
 background: linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-surface) 100%);
  border: 1px solid rgba(79, 115, 255, 0.2);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: 12px;
 background: var(--bg-surface);
 border: 1px solid var(--border);
}

.page-header-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.page-eyebrow {
  color: #7590ff;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.page-title {
 color: var(--text-bright);
  font-size: 28px;
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.page-title-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.page-description {
  max-width: 72rem;
  margin-top: 8px;
 color: var(--text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.page-header-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.toggle-label {
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.toggle-slider {
 background: var(--border);
  border: 1px solid #1b2438;
}

.toggle-slider::after {
 background: var(--text-muted);
}

.toggle-label input:checked + .toggle-slider {
 background: var(--primary);
}

.btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
 background: var(--bg-hover);
 color: var(--text-muted);
 border: 1px solid var(--border);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 600;
}

.btn:hover {
 background: var(--border);
 border-color: var(--primary);
 color: var(--text-bright);
}

.btn-sm {
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.btn-inline-compact {
  min-height: 24px;
  padding: 0 8px;
  font-size: 11px;
}

.btn-back {
  padding: 0 16px;
 color: var(--text-bright);
  font-weight: 600;
}

.btn-close {
 color: var(--text-muted);
  border-radius: 999px;
}

.btn-close:hover {
 color: var(--error);
  background: rgba(241, 93, 93, 0.15);
}

.btn-danger {
 background: var(--error);
 color: var(--text-bright);
  border-color: transparent;
}

.btn-danger:hover {
  background: #ff4d4f;
  border-color: transparent;
}

.btn-warning {
 background: var(--bg-hover);
 color: var(--warning);
 border-color: var(--border);
}

.btn-warning:hover {
 background: var(--border);
 border-color: var(--warning);
}

.btn:disabled,
.btn:disabled:hover {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
  box-shadow: none;
}

.welcome,
.card,
.session-header-card,
.session-group,
.modal-content {
  background: rgba(17, 26, 43, 0.9);
 border: 1px solid var(--border);
}

.welcome {
  min-height: calc(100vh - 210px);
  padding: 48px 28px;
  border-radius: 12px;
  text-align: center;
}

.welcome-icon {
  display: inline-grid;
  place-items: center;
  width: 80px;
  height: 80px;
  margin-bottom: 18px;
  border-radius: 12px;
 background: var(--bg-hover);
  border: 1px solid rgba(79, 115, 255, 0.2);
  font-size: 38px;
  opacity: 1;
}

.welcome h2 {
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-bright);
}

.welcome p {
  max-width: 680px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  font-size: 12px;
  color: var(--text-muted);
}

.header-run-meta {
  margin-top: 12px;
}

.detail-meta span {
  padding: 8px 12px;
  border-radius: 999px;
 background: var(--bg-hover);
 border: 1px solid var(--border);
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

.task-info-grid.compact {
  grid-template-columns: 1fr;
  gap: 6px;
}

.task-config-summary {
  display: grid;
  gap: 0;
}

.task-config-summary-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 8px 0;
 border-bottom: 1px solid var(--border);
}

.task-config-summary-row:first-child {
  padding-top: 0;
}

.task-config-summary-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.task-config-summary-label {
 color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}

.task-config-summary-value {
  min-width: 0;
 color: var(--text-bright);
  font-size: 12px;
}

.task-config-summary-value .text-muted {
  font-size: 11px;
}

.task-info-row {
  display: grid;
  gap: 4px;
  padding: 12px;
 border: 1px solid var(--border);
  border-radius: 12px;
 background: var(--bg-hover);
  min-width: 0;
}

.task-info-row.compact {
  gap: 2px;
  padding: 6px 8px;
  border-radius: 8px;
}

.task-info-label {
 color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.task-info-row.compact .task-info-label {
  font-size: 10px;
  letter-spacing: 0.06em;
}

.task-info-value {
 color: var(--text-bright);
  font-family: var(--mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.task-info-row.compact .task-info-value {
  font-size: 11px;
  line-height: 1.3;
}

.run-command-block {
  margin-top: 14px;
  padding: 14px;
 border: 1px solid var(--border);
  border-radius: 12px;
 background: var(--bg-hover);
}

.run-command-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #7590ff;
  font-size: 12px;
  font-weight: 600;
}

.run-command-pre {
  margin-top: 10px;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px;
 border: 1px solid var(--border);
  border-radius: 8px;
 background: var(--canvas);
 color: var(--text-bright);
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
 color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.tab:hover {
  color: var(--text-bright);
  background: rgba(24, 35, 58, 0.8);
  border-color: rgba(79, 115, 255, 0.3);
}

.tab.active {
  color: var(--text-bright);
 background: var(--bg-hover);
 border-bottom-color: var(--primary);
 border-color: var(--primary);
}

.tab-danger {
  margin-left: auto;
  background: rgba(241, 93, 93, 0.2);
  color: var(--error) !important;
}

.tab-danger:hover {
  background: rgba(241, 93, 93, 0.3);
}

.card {
  margin-bottom: 18px;
  padding: 20px;
  border-radius: 12px;
}

.card-title {
  margin-bottom: 12px;
 color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.timeline-toolbar,
.timeline-filters,
.timeline-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.timeline-toolbar {
  justify-content: space-between;
  margin-bottom: 14px;
}

.timeline-filters {
  margin-bottom: 14px;
}

.timeline-summary-pill {
  padding: 8px 12px;
  border-radius: 999px;
 border: 1px solid var(--border);
 background: var(--bg-hover);
 color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.timeline-select {
  min-height: 34px;
  padding: 0 12px;
 border: 1px solid var(--border);
  border-radius: 999px;
 background: var(--bg-surface);
 color: var(--text-bright);
  font-size: 12px;
  font-weight: 600;
}

.timeline-table-wrap {
  overflow: hidden;
 border: 1px solid var(--border);
  border-radius: 12px;
 background: var(--bg-surface);
}

.timeline-table-scroll {
  overflow-x: auto;
}

.timeline-table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 12px;
}

.timeline-table thead {
 background: var(--bg-hover);
 color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.timeline-table th,
.timeline-table td {
  padding: 10px 12px;
 border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.timeline-table tbody tr:last-child td {
  border-bottom: none;
}

.timeline-table .mono {
  font-family: var(--mono);
}

.timeline-expand-row {
  background: rgba(24, 35, 58, 0.5);
}

.timeline-payload-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.timeline-payload-item {
  min-width: 0;
  padding: 10px 12px;
 border: 1px solid var(--border);
  border-radius: 8px;
 background: var(--bg-surface);
}

.timeline-payload-item-label {
 color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.timeline-payload-item-value {
  margin-top: 6px;
 color: var(--text-bright);
  font-size: 12px;
  word-break: break-all;
  font-family: var(--mono);
}

.timeline-json {
  margin-top: 12px;
  padding: 12px;
  overflow: auto;
 border: 1px solid var(--border);
  border-radius: 16px;
 background: var(--canvas);
 color: var(--text-bright);
  font-size: 12px;
  line-height: 1.65;
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
 background: rgba(69, 192, 111, 0.14);
 border-color: rgba(69, 192, 111, 0.42);
  color: var(--success);
}

.badge-failed, .badge-soft_failed, .badge-interrupted, .badge-cancelled, .badge-stopped, .badge-delete_requested,
.badge-review_error, .badge-review_plateau, .badge-summary_incomplete,
.badge-runtime_output_limit, .badge-runtime_timeout, .badge-blocked_context_window,
.badge-blocked_quota, .badge-provider_rate_limited, .badge-model_contract_violation,
.badge-blocked_external_source, .badge-no_workspace, .badge-error {
 background: rgba(241, 93, 93, 0.14);
 border-color: rgba(241, 93, 93, 0.42);
  color: var(--error);
}

.badge-running, .badge-started {
 background: rgba(79, 140, 255, 0.14);
 border-color: rgba(79, 140, 255, 0.42);
  color: var(--primary);
}

.badge-cancel_requested, .badge-retrying {
 background: rgba(213, 161, 58, 0.14);
 border-color: rgba(213, 161, 58, 0.42);
 color: var(--warning);
}

.badge-unknown, .badge-pending, .badge-queued, .badge-recorded {
 background: var(--bg-hover);
 border-color: var(--border);
 color: var(--text-muted);
}

.badge-mode {
 background: rgba(79, 115, 255, 0.14);
 border-color: rgba(79, 115, 255, 0.42);
 color: var(--primary);
}

.badge-warning {
 background: rgba(213, 161, 58, 0.14);
 border-color: rgba(213, 161, 58, 0.42);
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
 background: var(--bg-hover);
 border-color: var(--border);
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
 border-bottom-color: var(--border);
  font-size: 12px;
}

.score-pill {
  border-radius: 999px;
  padding: 4px 8px;
 background: var(--bg-surface);
  border-color: #dbe4ee;
}

.issue-item {
  margin-bottom: 8px;
  padding: 10px 12px;
 border: 1px solid rgba(213, 161, 58, 0.42);
  border-left-width: 1px;
  border-radius: 16px;
}

.issue-item.framework-issue {
 border-color: rgba(241, 93, 93, 0.42);
 background: rgba(241, 93, 93, 0.14);
}

.issue-id {
 color: var(--warning);
}

.review-card {
  margin-bottom: 10px;
  padding: 14px;
  border-left-width: 1px;
  border-radius: 18px;
}

.review-card.passed {
 background: rgba(69, 192, 111, 0.14);
 border-color: rgba(69, 192, 111, 0.42);
}

.review-card.failed {
 background: rgba(213, 161, 58, 0.14);
 border-color: rgba(213, 161, 58, 0.42);
}

.result-card {
 background: var(--bg-surface);
 border: 1px solid var(--border);
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 10px;
 box-shadow: none;
}

.result-card:hover {
 border-color: var(--info);
 box-shadow: none;
}

.result-card.selected {
 border-color: var(--info);
 background: linear-gradient(180deg, rgba(79, 140, 255, 0.16) 0%, var(--bg-surface) 100%);
 box-shadow: none;
}

.result-card-muted {
 background: var(--bg-hover);
}

.result-toolbar {
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
  padding: 16px;
 border: 1px solid var(--border);
  border-radius: 20px;
 background: linear-gradient(180deg, var(--bg-hover) 0%, var(--bg-surface) 100%);
}

.result-toolbar-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.result-toolbar-title {
  color: var(--text-bright);
  font-size: 13px;
  font-weight: 900;
}

.result-toolbar-desc {
  margin-top: 4px;
 color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.result-toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-toolbar-meta span {
  padding: 6px 10px;
 border: 1px solid rgba(79, 115, 255, 0.42);
  border-radius: 999px;
 background: var(--bg-surface);
 color: var(--primary);
  font-size: 11px;
  font-weight: 800;
}

.result-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-feedback {
  padding: 12px 14px;
  border-radius: 16px;
 border: 1px solid var(--border);
 background: var(--bg-surface);
 color: var(--text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.result-feedback.success {
 border-color: rgba(69, 192, 111, 0.42);
 background: rgba(69, 192, 111, 0.14);
 color: var(--success);
}

.result-feedback.error {
 border-color: rgba(241, 93, 93, 0.42);
 background: rgba(241, 93, 93, 0.14);
 color: var(--error);
}

.result-feedback.info {
 border-color: rgba(79, 115, 255, 0.42);
 background: rgba(79, 115, 255, 0.14);
 color: var(--primary);
}

.result-select-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.result-select-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.result-select-box input {
  width: 16px;
  height: 16px;
 accent-color: var(--info);
  cursor: pointer;
}

.result-main {
  min-width: 0;
  flex: 1 1 auto;
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

.session-content-stack {
  display: grid;
  gap: 18px;
}

.session-browser-shell {
  display: grid;
  grid-template-columns: minmax(320px, 400px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
}

.session-browser-nav,
.session-viewer-pane {
  min-width: 0;
  min-height: 520px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-browser-nav {
  border-radius: 24px;
}

.session-nav-header,
.session-viewer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.session-nav-list {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  gap: 10px;
  overflow: auto;
  padding-right: 2px;
}

.session-nav-item {
  width: 100%;
  padding: 12px;
  text-align: left;
 border: 1px solid var(--border);
  border-radius: 18px;
 background: var(--bg-hover);
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.session-nav-item:hover {
 border-color: var(--info);
 background: var(--bg-surface);
 box-shadow: none;
}

.session-nav-item.active {
 border-color: var(--success);
 background: linear-gradient(135deg, rgba(79, 140, 255, 0.14) 0%, rgba(69, 192, 111, 0.14) 100%);
 box-shadow: none;
}

.session-nav-title {
  color: var(--text-bright);
  font-size: 13px;
  font-weight: 800;
}

.session-nav-path {
  margin-top: 4px;
  word-break: break-all;
 color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
}

.session-nav-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
 color: var(--text-muted);
  font-size: 11px;
}

.session-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.session-live-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.session-live-dot::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 999px;
 background: var(--text-muted);
}

.session-live-dot.live::before {
 background: var(--success);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.14);
}

.session-warning-list {
  display: grid;
  gap: 6px;
  margin: 0 0 14px;
}

.session-warning-item {
  padding: 8px 10px;
 border: 1px solid rgba(213, 161, 58, 0.42);
  border-radius: 14px;
 background: rgba(213, 161, 58, 0.14);
  color: #92400e;
  font-size: 11px;
}

.session-message-list {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  gap: 12px;
  max-height: calc(100vh - 330px);
  overflow: auto;
  padding-right: 2px;
}

.session-call-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.calls-panel {
  overflow: visible;
}

.calls-panel .session-group {
  margin-bottom: 18px;
  padding: 0;
}

.calls-panel .session-group:last-child {
  margin-bottom: 0;
}

.call-row {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  padding: 12px;
 border: 1px solid var(--border);
  border-radius: 16px;
  font-size: 11px;
  min-width: 0;
}

.call-row:last-child {
  margin-bottom: 0;
}

.call-head {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.call-head-main {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.call-turn {
  flex-shrink: 0;
  font-weight: 800;
  color: var(--text-bright);
}

.call-agent {
  min-width: 0;
  color: var(--purple);
  overflow-wrap: anywhere;
}

.call-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.call-size,
.call-duration {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 4px 8px;
 border: 1px solid var(--border);
  border-radius: 999px;
 background: var(--bg-surface);
  color: var(--text-muted);
  white-space: nowrap;
}

.call-status {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
}

.call-files-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding-top: 8px;
 border-top: 1px dashed var(--border-accent);
}

.call-files-label {
 color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.session-call-list .file-actions {
  display: flex;
  min-width: 0;
  margin-left: 0;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
}

.call-note,
.call-error {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.call-note {
 color: var(--text-muted);
}

.call-error {
  color: var(--error);
}

.execution-trace-card {
  overflow: hidden;
  background:
    radial-gradient(circle at 0% 0%, rgba(8, 145, 178, 0.14), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(245, 158, 11, 0.10), transparent 28%),
 var(--bg-surface);
}

.execution-trace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.execution-trace-title {
  color: var(--text-bright);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.execution-trace-subtitle {
  max-width: 820px;
  margin-top: 6px;
 color: var(--text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.execution-trace-badges,
.session-trace-tags,
.call-stage-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.execution-current-card {
  position: relative;
  padding: 18px;
 border: 1px solid rgba(79, 140, 255, 0.42);
  border-radius: 24px;
  background:
 linear-gradient(135deg, rgba(79, 140, 255, 0.16) 0%, rgba(17, 26, 43, 0.96) 58%),
 var(--bg-surface);
 box-shadow: none;
}

.execution-current-card::before {
  content: '';
  position: absolute;
  inset: 18px auto auto 18px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
 background: var(--info);
  box-shadow: 0 0 0 7px rgba(8, 145, 178, 0.12);
}

.execution-current-card.status-started::before,
.execution-current-card.status-running::before {
  animation: executionPulse 1.5s ease-in-out infinite;
}

@keyframes executionPulse {
  0%, 100% {
    box-shadow: 0 0 0 6px rgba(8, 145, 178, 0.12);
  }
  50% {
    box-shadow: 0 0 0 13px rgba(8, 145, 178, 0.04);
  }
}

.execution-current-beacon {
  margin-left: 22px;
 color: var(--info);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.execution-current-main {
  margin-top: 10px;
  color: var(--text-bright);
  font-size: 18px;
  font-weight: 900;
}

.execution-current-step {
  margin-top: 6px;
 color: var(--success);
  font-size: 14px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.execution-current-detail {
  margin-top: 8px;
 color: var(--text-muted);
  font-family: var(--mono);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.execution-current-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.execution-current-cell {
  min-width: 0;
  padding: 11px 12px;
 border: 1px solid rgba(79, 115, 255, 0.42);
  border-radius: 16px;
 background: var(--bg-surface);
}

.execution-current-cell span {
  display: block;
 color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.execution-current-cell strong {
  display: block;
  margin-top: 4px;
 color: var(--text-bright);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.execution-cycle-map {
  margin-top: 16px;
}

.execution-map-title {
  margin-bottom: 10px;
 color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}

.execution-cycle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.execution-cycle-card {
  min-width: 0;
  padding: 14px;
 border: 1px solid var(--border);
  border-radius: 20px;
 background: var(--bg-hover);
}

.execution-cycle-head,
.execution-phase-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.execution-cycle-head {
 color: var(--text-bright);
  font-size: 12px;
  font-weight: 900;
}

.execution-cycle-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.execution-cycle-duration,
.execution-current-duration {
 color: var(--text-muted);
  font-weight: 900;
}

.execution-cycle-duration-separator {
 color: var(--border-accent);
}

.execution-cycle-head span:last-child,
.execution-phase-head span:last-child {
 color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
}

.execution-cycle-title .execution-cycle-duration {
 color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}

.execution-phase-stack {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.execution-phase-lane {
  padding: 10px;
 border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 16px;
 background: var(--bg-surface);
}

.execution-phase-lane.phase-worker { border-left-color: var(--info); }
.execution-phase-lane.phase-reflect { border-left-color: var(--primary); }
.execution-phase-lane.phase-summary { border-left-color: var(--success); }
.execution-phase-lane.phase-global-review { border-left-color: var(--warning); }
.execution-phase-lane.phase-result-review { border-left-color: var(--error); }
.execution-phase-lane.phase-review { border-left-color: var(--purple); }
.execution-phase-lane.phase-other { border-left-color: var(--text-muted); }

.execution-phase-head {
 color: var(--text);
  font-size: 11px;
  font-weight: 900;
}

.execution-step-list {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.execution-step-pill,
.execution-step-more,
.trace-mini-badge {
  max-width: 100%;
 border: 1px solid var(--border);
 background: var(--bg-hover);
 color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
}

.execution-step-pill {
  display: grid;
  flex: 1 1 240px;
  min-width: min(100%, 220px);
  gap: 8px;
  padding: 10px 11px;
  border-radius: 18px;
 background: linear-gradient(180deg, var(--bg-hover) 0%, var(--bg-surface) 100%);
 box-shadow: none;
}

.execution-step-head,
.execution-step-main {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
}

.execution-step-main {
  flex: 1 1 auto;
}

.execution-step-label,
.trace-step-mini {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.execution-step-duration {
  flex: 0 0 auto;
  align-self: flex-start;
  padding: 4px 8px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 999px;
 background: var(--bg-hover);
  color: currentColor;
  font-size: 9px;
  font-weight: 800;
  opacity: 0.88;
  white-space: nowrap;
}

.execution-step-pill.status-completed,
.execution-step-pill.status-passed {
 background: linear-gradient(180deg, rgba(69, 192, 111, 0.16) 0%, var(--bg-surface) 100%);
 border-color: var(--success);
 color: var(--success);
}

.execution-step-pill.status-failed,
.execution-step-pill.status-error,
.execution-step-pill.status-soft-failed {
 background: linear-gradient(180deg, rgba(241, 93, 93, 0.16) 0%, var(--bg-surface) 100%);
 border-color: var(--error);
 color: var(--error);
}

.execution-step-pill.status-retrying {
 background: linear-gradient(180deg, rgba(213, 161, 58, 0.16) 0%, var(--bg-surface) 100%);
 border-color: var(--warning);
 color: var(--warning);
}

.execution-step-pill.current {
  position: relative;
 border-color: var(--info);
 background: linear-gradient(180deg, rgba(79, 140, 255, 0.16) 0%, var(--bg-surface) 100%);
 color: var(--info);
  box-shadow:
    0 0 0 1px rgba(8, 145, 178, 0.08),
    0 12px 26px rgba(14, 165, 233, 0.08),
    0 0 0 4px rgba(8, 145, 178, 0.10);
}

.execution-step-pill.current::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 18px 0 0 18px;
 background: linear-gradient(180deg, var(--info) 0%, var(--info) 100%);
}

.execution-step-pill.current::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 20px;
  border: 1px solid rgba(8, 145, 178, 0.16);
  opacity: 0;
  pointer-events: none;
}

.execution-step-pill.current.live::after {
  animation: executionCurrentRing 2.2s ease-out infinite;
}

.execution-step-pill.current .execution-step-dot {
  box-shadow: 0 0 0 5px rgba(8, 145, 178, 0.12);
}

.execution-step-pill.current.live .execution-step-dot {
  animation: executionCurrentDot 1.6s ease-in-out infinite;
}

.execution-step-pill.current .execution-step-label,
.execution-step-pill.current .execution-step-duration {
 color: var(--info);
}

.execution-step-pill.current .execution-step-duration {
  border-color: rgba(8, 145, 178, 0.18);
 background: rgba(17, 26, 43, 0.96);
}

@keyframes executionCurrentRing {
  0% {
    transform: scale(0.985);
    opacity: 0.34;
  }
  70% {
    opacity: 0;
  }
  100% {
    transform: scale(1.02);
    opacity: 0;
  }
}

@keyframes executionCurrentDot {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 5px rgba(8, 145, 178, 0.12);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 0 9px rgba(8, 145, 178, 0.05);
  }
}

.execution-step-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 999px;
  background: currentColor;
}

.execution-step-prompt {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.execution-prompt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.execution-prompt-tag {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 4px 8px;
 border: 1px solid rgba(79, 115, 255, 0.42);
  border-radius: 999px;
 background: var(--bg-surface);
 color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.execution-prompt-tag:hover {
 border-color: var(--info);
 color: var(--success);
}

.execution-prompt-tag.user {
 border-color: rgba(79, 140, 255, 0.42);
 background: rgba(79, 140, 255, 0.14);
 color: var(--info);
}

.execution-prompt-tag.system {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #6d28d9;
}

.execution-prompt-preview {
  display: block;
  width: 100%;
  padding: 9px 10px;
 border: 1px solid var(--border);
  border-radius: 14px;
 background: var(--bg-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.execution-prompt-preview:hover {
 border-color: var(--info);
 background: rgba(79, 140, 255, 0.14);
 box-shadow: none;
}

.execution-prompt-preview.loading {
  opacity: 0.86;
}

.execution-prompt-preview.error {
 border-color: rgba(241, 93, 93, 0.42);
 background: rgba(241, 93, 93, 0.14);
}

.execution-prompt-preview-label {
  display: block;
 color: var(--text-muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.execution-prompt-preview-body {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
 color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
  word-break: break-word;
}

.execution-prompt-preview-body.loading {
 color: var(--text-muted);
}

.execution-prompt-preview-body.error {
 color: var(--error);
}

.execution-prompt-empty {
  padding: 9px 10px;
 border: 1px dashed var(--border);
  border-radius: 14px;
 background: var(--bg-hover);
 color: var(--text-muted);
  font-size: 11px;
}

.execution-step-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 14px;
 background: var(--bg-surface);
 color: var(--text-muted);
}

.trace-mini-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
 border-color: rgba(79, 115, 255, 0.42);
 background: var(--bg-surface);
}

.trace-mini-badge.phase-worker { color: var(--info); background: rgba(79, 140, 255, 0.14); border-color: rgba(79, 140, 255, 0.42); }
.trace-mini-badge.phase-reflect { color: var(--primary); background: rgba(79, 115, 255, 0.14); border-color: rgba(79, 115, 255, 0.42); }
.trace-mini-badge.phase-summary { color: var(--success); background: rgba(69, 192, 111, 0.14); border-color: rgba(69, 192, 111, 0.42); }
.trace-mini-badge.phase-global-review { color: var(--warning); background: rgba(213, 161, 58, 0.14); border-color: rgba(213, 161, 58, 0.42); }
.trace-mini-badge.phase-result-review { color: var(--error); background: rgba(241, 93, 93, 0.14); border-color: rgba(241, 93, 93, 0.42); }
.trace-mini-badge.phase-review { color: #6d28d9; background: #f5f3ff; border-color: #ddd6fe; }
.trace-mini-badge.phase-other { color: var(--text-muted); background: var(--bg-hover); border-color: var(--border); }

.session-trace-tags {
  margin-top: 8px;
}

.call-stage-row {
  margin-top: 10px;
}

.log-viewer {
  max-height: calc(100vh - 240px);
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
 color: var(--border);
 border: 1px solid var(--border);
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
 color: var(--text-muted);
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
 border: 1px solid var(--border);
 background: var(--bg-hover);
 color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.log-mode-badge.full {
 background: rgba(79, 140, 255, 0.14);
 border-color: rgba(79, 140, 255, 0.42);
 color: var(--success);
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
 border-bottom-color: var(--border);
  color: var(--text-bright);
  font-size: 13px;
}

.modal-body {
  color: var(--text);
  line-height: 1.7;
  overflow-x: hidden;
}

.modal-body .session-message-list {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.modal-body pre {
  padding: 14px;
  border-radius: 16px;
 background: var(--bg-hover);
 border: 1px solid var(--border);
 color: var(--text);
}

.modal-body code,
.markdown-content code {
 background: rgba(79, 115, 255, 0.14);
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
 background: var(--bg-hover);
}

.accordion-header {
  padding: 12px 14px;
  border-radius: 18px;
}

.accordion-header:hover {
 border-color: var(--info);
}

.accordion-body {
  padding: 14px;
  border-radius: 0 0 18px 18px;
}

.file-browser-shell {
  display: grid;
  grid-template-columns: minmax(320px, 0.42fr) minmax(0, 1fr);
  gap: 16px;
  min-height: calc(100vh - 285px);
}

.file-browser-nav,
.file-preview-pane {
  min-width: 0;
  overflow: hidden;
 border: 1px solid var(--border);
  border-radius: 24px;
 background: var(--bg-hover);
 box-shadow: none;
}

.file-browser-nav {
  display: flex;
  flex-direction: column;
}

.file-browser-titlebar,
.file-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
 border-bottom: 1px solid var(--border);
  background:
 radial-gradient(circle at top left, rgba(79, 140, 255, 0.10), transparent 32%),
 linear-gradient(180deg, var(--bg-hover) 0%, var(--bg-surface) 100%);
}

.file-count-pill {
  flex-shrink: 0;
  padding: 6px 10px;
 border: 1px solid rgba(79, 140, 255, 0.42);
  border-radius: 999px;
 background: rgba(79, 140, 255, 0.14);
 color: var(--info);
  font-size: 11px;
  font-weight: 800;
}

.file-toolbar {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
 border-bottom: 1px solid var(--border);
}

.file-toolbar input,
.file-toolbar select {
  width: 100%;
  padding: 10px 12px;
 background: var(--bg-surface);
  color: var(--text);
 border: 1px solid var(--border-accent);
  border-radius: 14px;
  font-size: 12px;
}

.file-toolbar input:focus,
.file-toolbar select:focus {
  outline: none;
 border-color: var(--info);
  box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.12);
}

.file-filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.file-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 14px 16px;
 border-bottom: 1px solid var(--border);
}

.file-quick-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 8px;
  align-items: center;
  padding: 10px;
 border: 1px solid var(--border);
  border-radius: 16px;
 background: var(--bg-hover);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.file-quick-card:hover {
 border-color: var(--info);
 background: rgba(79, 140, 255, 0.14);
}

.file-quick-card.disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.file-quick-icon {
  display: inline-grid;
  grid-row: span 2;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: #0f172a;
 color: var(--bg-hover);
  font-size: 11px;
  font-weight: 900;
}

.file-quick-main {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-quick-hint {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-panel {
  flex: 1 1 auto;
  min-height: 280px;
  overflow: auto;
  padding: 8px;
}

.file-dir-row,
.file-tree-file {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.file-dir-row {
  grid-template-columns: 16px 44px minmax(0, 1fr);
  gap: 6px;
  padding: 8px 8px 8px calc(8px + var(--level, 0) * 18px);
 color: var(--text);
}

.file-dir-row:hover,
.file-tree-file:hover {
 background: var(--bg-hover);
}

.file-dir-arrow {
 color: var(--text-muted);
  font-size: 11px;
}

.file-dir-icon {
  padding: 2px 7px;
  border-radius: 999px;
 background: rgba(79, 140, 255, 0.14);
 color: var(--info);
  font-size: 10px;
  font-weight: 800;
}

.file-dir-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-file {
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  gap: 8px;
  padding: 8px 8px 8px calc(12px + var(--level, 0) * 18px);
}

.file-tree-file.selected {
 background: rgba(79, 140, 255, 0.14);
 box-shadow: inset 0 0 0 1px var(--info);
}

.file-kind-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
 background: var(--text-muted);
}

.file-kind-markdown { background: var(--info); }
.file-kind-json { background: var(--warning); }
.file-kind-jsonl { background: var(--primary); }
.file-kind-log { background: var(--error); }
.file-kind-text { background: var(--success); }
.file-kind-other { background: var(--text-muted); }

.file-tree-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-bright);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-meta,
.file-tree-size {
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.file-preview-pane {
  display: flex;
  flex-direction: column;
}

.file-preview-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.file-preview-title .file-kind-dot {
  flex-shrink: 0;
}

.file-preview-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-bright);
  font-size: 15px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-path {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.file-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
 border-bottom: 1px solid var(--border);
 background: var(--bg-hover);
}

.file-preview-meta span {
  padding: 5px 8px;
 border: 1px solid var(--border);
  border-radius: 999px;
 background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 11px;
}

.file-preview-body {
  flex: 1 1 auto;
  min-height: 320px;
  overflow: auto;
  padding: 18px;
}

.file-preview-code {
  min-height: 100%;
  margin: 0;
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
 color: var(--border);
  white-space: pre-wrap;
  word-break: break-word;
}

.file-preview-empty,
.file-browser-empty,
.file-jsonl-hint {
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 28px;
  color: var(--text-muted);
  text-align: center;
}

.file-preview-empty p,
.file-jsonl-hint p {
  max-width: 460px;
  line-height: 1.7;
}

.file-preview-empty-icon,
.file-jsonl-icon {
  display: inline-grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-bottom: 14px;
  border-radius: 24px;
 background: rgba(79, 140, 255, 0.14);
 color: var(--info);
  font-weight: 900;
}

.file-jsonl-hint {
  grid-template-columns: auto minmax(0, 420px);
  gap: 18px;
  justify-content: center;
  text-align: left;
}

.file-row {
  grid-template-columns: minmax(0, 1fr) 96px 88px;
  gap: 12px;
  padding: 10px 12px;
 border: 1px solid var(--border);
  border-radius: 16px;
}

.file-row:hover {
 border-color: var(--info);
}

.action-link {
 color: var(--success);
  font-weight: 700;
}

.action-link:hover,
.link:hover {
  color: #155e75;
}

.empty-state {
  padding: 30px;
 color: var(--text-muted);
  font-size: 14px;
}

.link,
.text-primary {
 color: var(--success);
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
 color: var(--text-muted);
}

.info-value {
  color: var(--text);
}

.session-progress-bar {
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 0 0;
  margin-top: 16px;
 border-top: 1px solid var(--border);
  border-bottom: 0;
}

.progress-stat {
  padding: 10px 12px;
 border: 1px solid var(--border);
  border-radius: 16px;
 color: var(--text-muted);
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
 background: rgba(79, 115, 255, 0.14);
 color: var(--text-muted);
}

.model-name {
  color: #075985;
}

.user-message {
  padding: 14px 18px;
 background: linear-gradient(135deg, rgba(79, 140, 255, 0.14) 0%, rgba(69, 192, 111, 0.14) 100%);
  color: var(--text);
 border: 1px solid rgba(79, 140, 255, 0.42);
  border-radius: 20px;
 box-shadow: none;
}

.user-message .message-timestamp {
 color: var(--success);
  opacity: 1;
}

.assistant-message {
  padding: 12px 0;
  border-radius: 20px;
 background: var(--bg-surface);
 border: 1px solid var(--border);
 box-shadow: none;
}

.assistant-message .message-timestamp {
  padding: 0 18px;
  margin-bottom: 8px;
 color: var(--text-muted);
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
 color: var(--text-muted);
}

.thinking-toggle-btn {
 color: var(--success);
  font-size: 11px;
  font-weight: 700;
}

.tool-execution {
  padding: 16px;
  border-radius: 18px;
 border: 1px solid var(--border);
}

.tool-execution.pending {
 background: rgba(79, 115, 255, 0.14);
}

.tool-execution.success {
 background: rgba(69, 192, 111, 0.14);
 border-color: rgba(69, 192, 111, 0.42);
}

.tool-execution.error {
 background: rgba(241, 93, 93, 0.14);
 border-color: rgba(241, 93, 93, 0.42);
}

.tool-header,
.tool-name,
.tool-command {
  color: var(--text-bright);
}

.tool-path {
 color: var(--success);
}

.tool-output,
.tool-result-output {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
 background: var(--bg-surface);
 border: 1px solid var(--border);
 color: var(--text);
}

.tool-result-message {
  padding: 14px 16px;
 background: rgba(69, 192, 111, 0.14);
 border: 1px solid rgba(69, 192, 111, 0.42);
  border-radius: 18px;
}

.tool-result-message.has-error {
 background: rgba(241, 93, 93, 0.14);
 border-color: rgba(241, 93, 93, 0.42);
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
 border-left-color: var(--border-accent);
 color: var(--text-muted);
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

  .card,
  .session-header-card,
  .session-group {
    padding: 16px;
    border-radius: 20px;
  }

  .session-header-card h1 {
    font-size: 20px;
  }

  .file-browser-shell,
  .session-browser-shell {
    grid-template-columns: 1fr;
  }

  .file-browser-nav,
  .file-preview-pane,
  .session-browser-nav,
  .session-viewer-pane {
    border-radius: 20px;
    min-height: auto;
  }

  .file-tree-panel,
  .file-preview-body,
  .session-nav-list,
  .session-message-list {
    max-height: none;
  }

  .file-preview-header {
    flex-direction: column;
  }

  .file-preview-actions {
    justify-content: flex-start;
  }

  .file-jsonl-hint {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .call-row {
    align-items: start;
  }

  .call-head,
  .call-status {
    justify-content: flex-start;
  }

  .execution-trace-header {
    flex-direction: column;
  }

  .execution-current-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .execution-cycle-grid {
    grid-template-columns: 1fr;
  }

  .call-status,
  .session-call-list .file-actions {
    width: 100%;
  }

  .call-files-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .file-row {
    grid-template-columns: minmax(0, 1fr);
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

  .result-toolbar-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-toolbar-actions {
    width: 100%;
  }

  .task-info-grid {
    grid-template-columns: 1fr;
  }

  .task-config-summary-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

}`;

const DATAFLOW_DASHBOARD_STYLES =`${DATAFLOW_DASHBOARD_MIRROR_CSS}\n${DATAFLOW_DASHBOARD_CHIMERA_REFRESH_CSS}`;

const normalizeProjectPath = (value: string) => {
  const text = String(value || '/').trim() || '/';
  const withRoot = text.startsWith('/') ? text :`/${text}`;
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

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const asArray = <T = any,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const hasDisplayContent = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(asRecord(value)).length > 0;
  return true;
};

const prettyJson = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
};

const normalizeProjectFileExplorerPath = (fsPath: string, projectId?: string | null): string => {
  const normalizedPath = String(fsPath || '').trim();
  if (!normalizedPath) return '';
  const normalizedProjectId = String(projectId || '').trim();
  const projectRoot = normalizedProjectId ?`/data/files/${normalizedProjectId}` : '';
  if (projectRoot && normalizedPath.startsWith(projectRoot)) {
    const relativePath = normalizedPath.slice(projectRoot.length).replace(/\/+$/, '');
    if (!relativePath) return '/';
    return relativePath.startsWith('/') ? relativePath :`/${relativePath}`;
  }
  return normalizedPath.startsWith('/') ? normalizedPath :`/${normalizedPath}`;
};

const buildProjectFileExplorerHash = (fsPath: string, projectId?: string | null): string => (`#/project-file-explorer?path=${encodeURIComponent(normalizeProjectFileExplorerPath(fsPath, projectId))}`
);

interface DashboardAppOptions {
  projectId: string;
  rootPath: string;
  initialRunName: string;
  initialSummary?: DataflowFileserverRunSummary | null;
  onBack?: () => void;
  root: ShadowRoot;
  confirm: (options: { message: string; danger?: boolean; title?: string; confirmText?: string; cancelText?: string }) => Promise<boolean>;
}

const createDashboardApp = ({ projectId, rootPath, initialRunName, initialSummary = null, onBack, root, confirm }: DashboardAppOptions) => {
  const app: any = {
    runs: initialSummary ? [initialSummary] as DataflowFileserverRunSummary[] : [] as DataflowFileserverRunSummary[],
    currentRun: initialRunName || null,
    currentRunData: null as DataflowFileserverRunOverview | null,
    currentSummary: initialSummary as DataflowFileserverRunSummary | null,
    currentFiles: [] as DataflowFileserverRunFile[],
    runSessions: [] as DataflowFileserverRunSession[],
    runLog: '',
    sessionBrowser: {
      selectedRun: '',
      selectedPath: '',
      loading: false,
      error: '',
      live: false,
      notice: '',
      data: null as Record<string, any> | null,
      events: [] as AppSaSessionEvent[],
      warnings: [] as string[],
      lineCount: 0,
      sessionMeta: {} as Record<string, any>,
    },
    fileBrowser: {
      selectedPath: '',
      searchQuery: '',
      categoryFilter: 'all',
      typeFilter: 'all',
      previewRun: '',
      previewPath: '',
      previewContent: '',
      previewLoading: false,
      previewError: '',
      expandedDirs: {} as Record<string, boolean>,
    },
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
      linkedTaskDetailLoaded: boolean;
      linkedTaskDetail: DataflowScanTaskDetail | null;
      linkedTaskDetailError: string;
      linkedTaskDetailPromise: Promise<DataflowScanTaskDetail | null> | null;
      timelineLoaded: boolean;
      timelineLoading: boolean;
      timelineClearing: boolean;
      timelineItems: DataflowTaskTimelineEvent[];
      timelineError: string;
      deletingTimelineEventId: string;
      expandedTimelineEventId: string;
      timelineStageFilter: string;
      timelineEventTypeFilter: string;
      timelineLevelFilter: string;
      timelinePage: number;
      timelinePageSize: number;
    }>,
    refreshTimer: null as ReturnType<typeof setInterval> | null,
    activeTabRefreshTimer: null as ReturnType<typeof setInterval> | null,
    REFRESH_INTERVAL: 10000,
    currentRunsFilter: '',
    collapsedRunDates: {} as Record<string, boolean>,
    runDetailRequestSeq: 0,
    _mutationBusy: '' as '' | 'adopt' | 'cancel' | 'retry' | 'delete',
    _durationTimer: null as ReturnType<typeof setInterval> | null,
    _durationSeconds: 0,
    _destroyed: false,
    _sessionSocket: null as WebSocket | null,
    _sessionSocketKey: '',
    _sessionLoadSeq: 0,
    _toolResultText: {} as Record<string, { preview: string; full: string; expanded: boolean }>,
    _resultSelectionByRun: {} as Record<string, string[]>,
    _resultReportFeedbackByRun: {} as Record<string, { tone: 'success' | 'error' | 'info'; message: string }>,
    _resultReportBusy: false,
    _promptPreviewLoadsByRun: {} as Record<string, Record<string, Promise<void>>>,
    _promptPreviewErrorsByRun: {} as Record<string, Record<string, string>>,
    _handleClick: null as ((event: Event) => void) | null,
    _handleInput: null as ((event: Event) => void) | null,
    _handleChange: null as ((event: Event) => void) | null,
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
          linkedTaskDetailLoaded: false,
          linkedTaskDetail: null,
          linkedTaskDetailError: '',
          linkedTaskDetailPromise: null,
          timelineLoaded: false,
          timelineLoading: false,
          timelineClearing: false,
          timelineItems: [],
          timelineError: '',
          deletingTimelineEventId: '',
          expandedTimelineEventId: '',
          timelineStageFilter: '__all__',
          timelineEventTypeFilter: '__all__',
          timelineLevelFilter: '__all__',
          timelinePage: 1,
          timelinePageSize: 200,
        };
      }
      return this.tabCacheByRun[key];
    },

    getResultSelection(runName = this.currentRun || '') {
      const key = String(runName || '');
      return Array.isArray(this._resultSelectionByRun[key]) ? this._resultSelectionByRun[key] : [];
    },

    setResultSelection(runName: string, resultFiles: string[]) {
      const key = String(runName || '');
      this._resultSelectionByRun[key] = uniqueValues(
        resultFiles.map((item) => String(item || '').trim()).filter(Boolean)
      );
    },

    setResultReportFeedback(message: string, tone: 'success' | 'error' | 'info' = 'info', runName = this.currentRun || '') {
      const key = String(runName || '');
      if (!key) return;
      this._resultReportFeedbackByRun[key] = { tone, message };
      if (this.currentRunData?.name === key) this.renderResults(this.currentRunData);
    },

    getPromptPreviewLoadMap(runName = this.currentRun || '') {
      const key = String(runName || '');
      if (!this._promptPreviewLoadsByRun[key]) this._promptPreviewLoadsByRun[key] = {};
      return this._promptPreviewLoadsByRun[key];
    },

    getPromptPreviewErrorMap(runName = this.currentRun || '') {
      const key = String(runName || '');
      if (!this._promptPreviewErrorsByRun[key]) this._promptPreviewErrorsByRun[key] = {};
      return this._promptPreviewErrorsByRun[key];
    },

    summarizePromptPreview(content: string) {
      const text = String(content || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) return 'Prompt 文件为空';
      return text.length > 220 ?`${text.slice(0, 220)}…` : text;
    },

    promptPreviewState(runName: string, path: string) {
      const normalizedRun = String(runName || '');
      const normalizedPath = String(path || '');
      if (!normalizedRun || !normalizedPath) return { text: '', loading: false, error: '' };
      const errors = this.getPromptPreviewErrorMap(normalizedRun);
      if (errors[normalizedPath]) {
        return { text: '提示词加载失败，点击查看原文件', loading: false, error: errors[normalizedPath] };
      }
      const fileText = this.getRunCache(normalizedRun).fileText[normalizedPath];
      if (fileText !== undefined) {
        return { text: this.summarizePromptPreview(String(fileText || '')), loading: false, error: '' };
      }
      const loading = !!this.getPromptPreviewLoadMap(normalizedRun)[normalizedPath];
      return { text: loading ? '加载提示词预览…' : '点击查看 Prompt', loading, error: '' };
    },

    refreshPromptPreviewNodes(runName: string, path: string) {
      const normalizedPath = String(path || '');
      if (!normalizedPath) return;
      const state = this.promptPreviewState(runName, normalizedPath);
      this.$all('[data-prompt-preview-path]').forEach((el) => {
        if (String(el.dataset.promptPreviewPath || '') !== normalizedPath) return;
        el.textContent = state.text;
        el.classList.toggle('loading', !!state.loading);
        el.classList.toggle('error', !!state.error);
      });
      this.$all('[data-prompt-preview-button]').forEach((el) => {
        if (String(el.dataset.promptPreviewButton || '') !== normalizedPath) return;
        el.classList.toggle('loading', !!state.loading);
        el.classList.toggle('error', !!state.error);
      });
    },

    ensurePromptPreview(runName: string, path: string) {
      const normalizedRun = String(runName || '');
      const normalizedPath = String(path || '');
      if (!normalizedRun || !normalizedPath) return;
      const runCache = this.getRunCache(normalizedRun);
      if (runCache.fileText[normalizedPath] !== undefined) {
        this.refreshPromptPreviewNodes(normalizedRun, normalizedPath);
        return;
      }
      const loadMap = this.getPromptPreviewLoadMap(normalizedRun);
      if (loadMap[normalizedPath]) return;
      delete this.getPromptPreviewErrorMap(normalizedRun)[normalizedPath];
      loadMap[normalizedPath] = this.readRunFileText(normalizedRun, normalizedPath)
        .then(() => {
          delete this.getPromptPreviewErrorMap(normalizedRun)[normalizedPath];
        })
        .catch((error: any) => {
          this.getPromptPreviewErrorMap(normalizedRun)[normalizedPath] = error?.message || 'prompt preview load failed';
        })
        .finally(() => {
          delete loadMap[normalizedPath];
          if (this.currentRun === normalizedRun && this.getActiveTab() === 'sessions') {
            this.refreshPromptPreviewNodes(normalizedRun, normalizedPath);
          }
        });
    },

    activeResultFiles(data: DataflowFileserverRunOverview) {
      return uniqueValues(
        (Array.isArray(data.results) ? data.results : []).map((item: any) => String(item?.filename || '').trim()).filter(Boolean)
      );
    },

    syncResultSelection(data: DataflowFileserverRunOverview) {
      const available = new Set(this.activeResultFiles(data));
      const next = this.getResultSelection(data.name).filter((item: string) => available.has(item));
      this.setResultSelection(data.name, next);
      return next;
    },

    bindEvents() {
      if (!this._handleClick) {
        this._handleClick = (event: Event) => {
          const target = event.target as HTMLElement | null;
          if (!target) return;

          const resultSelectionToggle = target.closest('[data-action="toggle-result-selection"], [data-action="select-all-results"]') as HTMLElement | null;
          if (resultSelectionToggle) {
            event.stopPropagation();
            return;
          }

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

          const refreshTimelineButton = target.closest('[data-action="refresh-timeline"]') as HTMLElement | null;
          if (refreshTimelineButton) {
            event.preventDefault();
            if (this.currentRun) void this.loadTaskTimeline(this.currentRun, { force: true });
            return;
          }

          const clearTimelineButton = target.closest('[data-action="clear-timeline"]') as HTMLElement | null;
          if (clearTimelineButton) {
            event.preventDefault();
            if (this.currentRun) void this.clearTaskTimeline(this.currentRun);
            return;
          }

          const deleteTimelineEventButton = target.closest('[data-action="delete-timeline-event"]') as HTMLElement | null;
          if (deleteTimelineEventButton) {
            event.preventDefault();
            const eventId = String(deleteTimelineEventButton.dataset.eventId || '').trim();
            if (this.currentRun && eventId) void this.deleteTaskTimelineEvent(this.currentRun, eventId);
            return;
          }

          const toggleTimelineEventButton = target.closest('[data-action="toggle-timeline-event"]') as HTMLElement | null;
          if (toggleTimelineEventButton) {
            event.preventDefault();
            const eventId = String(toggleTimelineEventButton.dataset.eventId || '').trim();
            if (!this.currentRun || !eventId || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.expandedTimelineEventId = runCache.expandedTimelineEventId === eventId ? '' : eventId;
            this.renderTaskTimeline(this.currentRunData);
            return;
          }

          const timelinePrevPageButton = target.closest('[data-action="timeline-prev-page"]') as HTMLElement | null;
          if (timelinePrevPageButton) {
            event.preventDefault();
            if (!this.currentRun || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.timelinePage = Math.max(1, Number(runCache.timelinePage || 1) - 1);
            this.renderTaskTimeline(this.currentRunData);
            return;
          }

          const timelineNextPageButton = target.closest('[data-action="timeline-next-page"]') as HTMLElement | null;
          if (timelineNextPageButton) {
            event.preventDefault();
            if (!this.currentRun || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.timelinePage = Math.max(1, Number(runCache.timelinePage || 1) + 1);
            this.renderTaskTimeline(this.currentRunData);
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

          const reportSelectedButton = target.closest('[data-action="report-selected-results"]') as HTMLElement | null;
          if (reportSelectedButton) {
            event.preventDefault();
            event.stopPropagation();
            void this.reportSelectedResults();
            return;
          }

          const reportAllButton = target.closest('[data-action="report-all-results"]') as HTMLElement | null;
          if (reportAllButton) {
            event.preventDefault();
            event.stopPropagation();
            void this.reportAllResults();
            return;
          }

          const clearSelectionButton = target.closest('[data-action="clear-result-selection"]') as HTMLElement | null;
          if (clearSelectionButton) {
            event.preventDefault();
            event.stopPropagation();
            this.clearResultSelection();
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

          const selectSession = target.closest('[data-action="select-session"]') as HTMLElement | null;
          if (selectSession) {
            event.preventDefault();
            event.stopPropagation();
            void this.selectSessionInBrowser(selectSession.dataset.path || '');
            return;
          }

          const refreshSessions = target.closest('[data-action="refresh-sessions"]') as HTMLElement | null;
          if (refreshSessions) {
            event.preventDefault();
            event.stopPropagation();
            void this.loadSessions(true);
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

          const selectFile = target.closest('[data-action="select-file"]') as HTMLElement | null;
          if (selectFile) {
            event.preventDefault();
            event.stopPropagation();
            void this.selectFileInBrowser(selectFile.dataset.path || '');
            return;
          }

          const previewModal = target.closest('[data-action="preview-file-modal"]') as HTMLElement | null;
          if (previewModal) {
            event.preventDefault();
            event.stopPropagation();
            void this.openFile(this.currentRun || '', previewModal.dataset.path || this.fileBrowser.selectedPath || '');
            return;
          }

          const toggleFileDir = target.closest('[data-action="toggle-file-dir"]') as HTMLElement | null;
          if (toggleFileDir) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleFileDirectory(toggleFileDir.dataset.dir || '');
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

          const retryTaskConfig = target.closest('[data-action="retry-task-config"]') as HTMLElement | null;
          if (retryTaskConfig) {
            event.preventDefault();
            event.stopPropagation();
            if (this.currentRun) void this.ensureLinkedTaskDetail(this.currentRun, { force: true });
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
            this.fileBrowser.searchQuery = target.value;
            this.renderFiles(this.currentFiles);
            return;
          }
          if (target.dataset.action === 'timeline-stage-filter' || target.dataset.action === 'timeline-event-type-filter' || target.dataset.action === 'timeline-level-filter') {
            if (!this.currentRun || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            if (target.dataset.action === 'timeline-stage-filter') runCache.timelineStageFilter = target.value || '__all__';
            if (target.dataset.action === 'timeline-event-type-filter') runCache.timelineEventTypeFilter = target.value || '__all__';
            if (target.dataset.action === 'timeline-level-filter') runCache.timelineLevelFilter = target.value || '__all__';
            runCache.timelinePage = 1;
            this.renderTaskTimeline(this.currentRunData);
          }
        };
        this.root.addEventListener('input', this._handleInput);
      }

      if (!this._handleChange) {
        this._handleChange = (event: Event) => {
          const target = event.target as HTMLInputElement | HTMLSelectElement | null;
          if (!target) return;
          if (target instanceof HTMLInputElement && target.dataset.action === 'select-all-results') {
            this.toggleSelectAllResults(target.checked);
            return;
          }
          if (target instanceof HTMLInputElement && target.dataset.action === 'toggle-result-selection') {
            const resultFile = String(target.dataset.resultFile || '').trim();
            if (resultFile) this.toggleResultSelection(resultFile, target.checked);
            return;
          }
          if (target instanceof HTMLSelectElement && target.dataset.action === 'timeline-page-size') {
            if (!this.currentRun || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            runCache.timelinePageSize = Math.min(500, Math.max(50, Number(target.value) || 200));
            runCache.timelinePage = 1;
            this.renderTaskTimeline(this.currentRunData);
            return;
          }
          if (target instanceof HTMLSelectElement && (target.dataset.action === 'timeline-stage-filter' || target.dataset.action === 'timeline-event-type-filter' || target.dataset.action === 'timeline-level-filter')) {
            if (!this.currentRun || !this.currentRunData) return;
            const runCache = this.getRunCache(this.currentRun);
            if (target.dataset.action === 'timeline-stage-filter') runCache.timelineStageFilter = target.value || '__all__';
            if (target.dataset.action === 'timeline-event-type-filter') runCache.timelineEventTypeFilter = target.value || '__all__';
            if (target.dataset.action === 'timeline-level-filter') runCache.timelineLevelFilter = target.value || '__all__';
            runCache.timelinePage = 1;
            this.renderTaskTimeline(this.currentRunData);
            return;
          }
          if (target.id === 'fileCategoryFilter') {
            this.fileBrowser.categoryFilter = target.value || 'all';
            this.renderFiles(this.currentFiles);
          }
          if (target.id === 'fileTypeFilter') {
            this.fileBrowser.typeFilter = target.value || 'all';
            this.renderFiles(this.currentFiles);
          }
        };
        this.root.addEventListener('change', this._handleChange);
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
      this.closeSessionSocket();
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (this.activeTabRefreshTimer) clearInterval(this.activeTabRefreshTimer);
      if (this._durationTimer) clearInterval(this._durationTimer);
      if (this._handleClick) this.root.removeEventListener('click', this._handleClick);
      if (this._handleInput) this.root.removeEventListener('input', this._handleInput);
      if (this._handleChange) this.root.removeEventListener('change', this._handleChange);
      this._handleClick = null;
      this._handleInput = null;
      this._handleChange = null;
    },

    startAutoRefresh() {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(() => {
        const checkbox = this.$('autoRefresh') as HTMLInputElement | null;
        if (checkbox?.checked) this.refresh();
      }, this.REFRESH_INTERVAL);
      if (this.activeTabRefreshTimer) clearInterval(this.activeTabRefreshTimer);
      this.activeTabRefreshTimer = setInterval(() => {
        const checkbox = this.$('autoRefresh') as HTMLInputElement | null;
        if (!checkbox?.checked) return;
        this.refreshActiveTabContent(false, { background: true });
      }, Math.min(this.REFRESH_INTERVAL, 5000));
    },

    async refresh(options?: { forceActiveTabReload?: boolean }) {
      if (this.currentRun) await this.loadRunDetail(this.currentRun, true, !!options?.forceActiveTabReload, { scope: 'summary' });
    },

    getActiveTab() {
      return (this.root.querySelector('.tab.active[data-tab]') as HTMLElement | null)?.dataset.tab || 'overview';
    },

    refreshActiveTabContent(force = false, options?: { background?: boolean }) {
      const activeTab = this.getActiveTab();
      if (activeTab === 'sessions') {
        if (!this.sessionBrowser.selectedPath) {
          this.loadSessions(force);
        } else if (force) {
          this.loadSessions(true);
        }
        return;
      }
      if (activeTab === 'files') {
        this.loadFiles(force);
        return;
      }
      if (activeTab === 'log') {
        this.loadLog(force || !!options?.background);
      }
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
          return`
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
          </div>`;
        }).join('');
        return`
        <div class="run-date-group ${collapsed ? 'collapsed' : ''}">
          <button class="run-date-header" data-action="toggle-date-group" data-date-key="${this.attr(dateKey)}">
            <span class="run-date-arrow">${arrow}</span>
            <span class="run-date-label">${this.esc(dateKey)}</span>
            <span class="run-date-count">${group.runs.length}</span>
          </button>
          <div class="run-date-body" style="display:${collapsed ? 'none' : 'block'}">
            ${runsHtml}
          </div>
        </div>`;
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
          return`${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`;
        }
        return`${m[1]}-${m[2]}-${m[3]}`;
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
      const statusText = summary?.status || 'pending';
      if (statusEl) {
        statusEl.className =`badge badge-${statusText}`;
        statusEl.textContent = this.statusLabel(statusText);
      }
      const modeEl = this.$('runMode');
      if (modeEl) {
        modeEl.textContent = summary?.workflow_mode || '';
        modeEl.style.display = summary?.workflow_mode ? '' : 'none';
      }
      const subtitleEl = this.$('runSubtitle');
      if (subtitleEl) subtitleEl.textContent = '正在解析当前 Run，完成后会展示概览、轮次、结果、会话、文件与日志。';
      const metaEl = this.$('runMeta');
      if (metaEl) {
        metaEl.innerHTML =`
          <span>🤖 ${this.esc(summary?.model || '-')}</span>
          <span>🎚️ ${this.esc(this.reviewProfileLabel(summary?.review_profile || ''))}</span>
          <span>🔄 ${summary?.cycles_used || 0}${summary?.max_cycles ?` / ${summary.max_cycles}` : ''} 轮</span>
          <span>⏳ 正在加载详细信息...</span>`;
      }

      const loadingCard = '<div class="card-title">加载中</div><div class="empty-state">正在解析该 Run 的详细信息...</div>';
      const emptyCard = '<div class="empty-state">正在加载...</div>';
      const scoreChart = this.$('scoreChart');
      const vulnTrendCard = this.$('vulnTrendCard');
      const manifestCard = this.$('manifestCard');
      const cycleTimeline = this.$('cycleTimeline');
      const cyclesContainer = this.$('cyclesContainer');
      const resultsContainer = this.$('resultsContainer');
      const sessionsContainer = this.$('sessionsContainer');
      const filesContainer = this.$('filesContainer');
      const logToolbar = this.$('logToolbar');
      const logContent = this.$('logContent');
      const taskInfoCard = this.$('taskInfoCard');
      const taskConfigContainer = this.$('taskConfigContainer');
      if (scoreChart) scoreChart.innerHTML = loadingCard;
      if (vulnTrendCard) vulnTrendCard.innerHTML = loadingCard;
      if (manifestCard) manifestCard.innerHTML = loadingCard;
      if (cycleTimeline) cycleTimeline.innerHTML = loadingCard;
      if (cyclesContainer) cyclesContainer.innerHTML = emptyCard;
      if (resultsContainer) resultsContainer.innerHTML = emptyCard;
      if (sessionsContainer) sessionsContainer.innerHTML = emptyCard;
      if (filesContainer) filesContainer.innerHTML = emptyCard;
      if (taskInfoCard) taskInfoCard.innerHTML = loadingCard;
      if (taskConfigContainer) taskConfigContainer.innerHTML =`<div class="card">${loadingCard}</div>`;
      if (logToolbar) {
        logToolbar.innerHTML =`
          <div class="log-toolbar-copy">
            <div class="log-toolbar-title">运行日志</div>
            <div class="log-toolbar-desc">默认展示日志尾部预览，加载详情后可按需读取完整 run.log。</div>
          </div>
          <div class="log-toolbar-actions">
            <span class="log-mode-badge">尾部预览</span>
            <button class="btn btn-sm" type="button" disabled>加载全文</button>
          </div>`;
      }
      if (logContent) logContent.textContent = '加载中...';
      this.updateActionButtons(summary);
    },

    showLoadError(name: string, message: string) {
      this.showLoadingState(name);
      const errorCard =`<div class="card-title">加载失败</div><div class="empty-state text-error">${this.esc(message)}</div>`;
      const scoreChart = this.$('scoreChart');
      const vulnTrendCard = this.$('vulnTrendCard');
      const manifestCard = this.$('manifestCard');
      const cycleTimeline = this.$('cycleTimeline');
      const taskInfoCard = this.$('taskInfoCard');
      const taskConfigContainer = this.$('taskConfigContainer');
      if (scoreChart) scoreChart.innerHTML = errorCard;
      if (vulnTrendCard) vulnTrendCard.innerHTML = errorCard;
      if (manifestCard) manifestCard.innerHTML = '<div class="card-title">提示</div><div class="empty-state">请检查浏览器控制台，以及 Run 后端对 /data 的挂载和索引配置。</div>';
      if (cycleTimeline) cycleTimeline.innerHTML = '<div class="card-title">运行状态</div><div class="empty-state">当前 Run 详情解析失败，因此无法展示轮次和结果信息。</div>';
      if (taskInfoCard) taskInfoCard.innerHTML = errorCard;
      if (taskConfigContainer) taskConfigContainer.innerHTML =`<div class="card">${errorCard}</div>`;
    },

    async loadRunDetail(name: string, silent = false, forceActiveTabReload = false, options?: { scope?: 'full' | 'summary' }) {
      const requestSeq = ++this.runDetailRequestSeq;
      if (!silent) {
        this.showLoadingState(name);
      }
      try {
        const data = await inspectDataflowFileserverRunOverview(projectId, this.runsRootPath, name);
        if (this._destroyed || requestSeq !== this.runDetailRequestSeq || this.currentRun !== name) return;
        const runCache = this.getRunCache(name);
        const previousTaskId = String(runCache.overview?.linked_task_id || '');
        const previousExecutionId = String(runCache.overview?.linked_execution_id || '');
        const nextTaskId = String(data.linked_task_id || '');
        const nextExecutionId = String(data.linked_execution_id || '');
        if (previousTaskId !== nextTaskId || previousExecutionId !== nextExecutionId) {
          runCache.linkedTaskDetailLoaded = false;
          runCache.linkedTaskDetail = null;
          runCache.linkedTaskDetailError = '';
          runCache.linkedTaskDetailPromise = null;
          runCache.timelineLoaded = false;
          runCache.timelineLoading = false;
          runCache.timelineClearing = false;
          runCache.timelineItems = [];
          runCache.timelineError = '';
          runCache.deletingTimelineEventId = '';
          runCache.expandedTimelineEventId = '';
          runCache.timelineStageFilter = '__all__';
          runCache.timelineEventTypeFilter = '__all__';
          runCache.timelineLevelFilter = '__all__';
          runCache.timelinePage = 1;
        }
        runCache.overview = data;
        const refreshScope = options?.scope || 'full';
        if (refreshScope === 'full') {
          runCache.sessions = Array.isArray(data.sessions) ? data.sessions : [];
          runCache.sessionsLoaded = runCache.sessions.length > 0;
          runCache.files = Array.isArray(data.files) ? data.files : [];
          runCache.filesLoaded = runCache.files.length > 0;
          if (typeof data.run_log === 'string' && data.run_log) {
            runCache.logLoaded = true;
            runCache.log = data.run_log;
          }
        }
        const embeddedTaskDetail = (data as any).linked_task_detail && typeof (data as any).linked_task_detail === 'object'
          ? (data as any).linked_task_detail as DataflowScanTaskDetail
          : null;
        if (embeddedTaskDetail) {
          runCache.linkedTaskDetail = embeddedTaskDetail;
          runCache.linkedTaskDetailLoaded = true;
          runCache.linkedTaskDetailError = '';
        } else if (!nextTaskId) {
          runCache.linkedTaskDetail = null;
          runCache.linkedTaskDetailLoaded = true;
          runCache.linkedTaskDetailError = '';
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
          review_profile: data.review_profile,
          max_cycles: data.max_cycles,
          cycles_used: data.cycles_used,
          result_count: data.result_count,
          passed_count: data.passed_count,
          failed_count: data.failed_count,
          workflow_mode: data.workflow_mode,
          updated_at: data.updated_at,
          process_state: data.process_state,
          retry_command_display: data.retry_command_display,
        };
        if (refreshScope === 'full') {
          this.runSessions = runCache.sessions;
          this.currentFiles = runCache.files;
          this.runLog = runCache.logMode === 'full' && runCache.fullLogLoaded ? runCache.fullLog : runCache.log;
        }
        this.renderRunDetail(data);
        const welcome = this.$('welcomeView');
        const detail = this.$('runDetail');
        if (welcome) welcome.style.display = 'none';
        if (detail) detail.style.display = 'block';
        if (this.getActiveTab() === 'cycles') {
          void this.preloadAllCycleDetails(name, data, forceActiveTabReload);
        }
        if (data.linked_task_id || data.linked_execution_id) {
          const forceTaskDetailReload = forceActiveTabReload && this.getActiveTab() === 'task-config';
          void this.ensureLinkedTaskDetail(name, { force: forceTaskDetailReload });
        }
        if (refreshScope === 'full') {
          this.refreshActiveTabContent(forceActiveTabReload);
        }
      } catch (e: any) {
        if (this._destroyed || requestSeq !== this.runDetailRequestSeq || this.currentRun !== name) return;
        const message = e?.message || '加载 Run 失败';
        console.error('loadRunDetail failed', e);
        this.showLoadError(name, message);
      }
    },

    renderRunDetail(data: DataflowFileserverRunOverview) {
      const cycles = data.cycles || [];
      const linkedTaskDetail = this.cachedLinkedTaskDetail(data.name, data);
      const runNameEl = this.$('runName');
      if (runNameEl) runNameEl.textContent = String(linkedTaskDetail?.title || data.name || 'Run 详情');
      const statusEl = this.$('runStatus');
      if (statusEl) {
        statusEl.className =`badge badge-${data.status}`;
        statusEl.textContent = this.statusLabel(data.status);
      }
      const modeEl = this.$('runMode');
      const lastCycle = cycles[cycles.length - 1];
      const mode = lastCycle?.workflow_mode || '';
      if (modeEl) {
        modeEl.textContent = mode;
        modeEl.style.display = mode ? '' : 'none';
      }
      const subtitleEl = this.$('runSubtitle');
      if (subtitleEl) {
        const updated = data.updated_at ?` · 最近同步 ${this.esc(data.updated_at)}` : '';
        subtitleEl.innerHTML =`统一查看当前 Run 的概览、轮次、结果、会话、文件、日志与任务关联信息${updated}`;
      }

      const c = data.config || {};
      const metaEl = this.$('runMeta');
      if (metaEl) {
        const reviewProfile = String(c.review_profile || data.review_profile || '').trim();
        const model = String(c.model || data.model || '').trim() || '-';
        const cycleText =`${data.cycles_used || cycles.length}${data.max_cycles ?` / ${data.max_cycles}` : ''} 轮`;
        const resultText =`${data.result_count ?? 0} 个结果`;
        metaEl.innerHTML =`
          <span>🤖 ${this.esc(model)}</span>
          <span>🎚️ ${this.esc(this.reviewProfileLabel(reviewProfile))}</span>
          <span>🔄 ${this.esc(cycleText)}</span>
          <span>📄 ${this.esc(resultText)}</span>
          <span class="run-duration" id="runDuration">⏳ ${this.fmtDuration(this._estimateDuration(data))}</span>
          ${data.error ?`<span class="text-error">⚠️ ${this.esc(data.error).substring(0, 120)}</span>` : ''}`;
      }
      this._startDurationTimer(data.status === 'running');
      this.updateActionButtons(data);

      this.renderOverview(data);
      this.renderCycles(data);
      this.renderResults(data);
      this.renderTaskConfig(data);
      this.renderTaskInfo(data);
      this.renderTaskTimeline(data);
    },

    currentRunId() {
      return String(this.currentRunData?.run_id || this.currentSummary?.run_id || '');
    },

    clearResultSelection() {
      if (!this.currentRunData?.name) return;
      this.setResultSelection(this.currentRunData.name, []);
      this.renderResults(this.currentRunData);
    },

    toggleSelectAllResults(checked: boolean) {
      if (!this.currentRunData?.name) return;
      const next = checked ? this.activeResultFiles(this.currentRunData) : [];
      this.setResultSelection(this.currentRunData.name, next);
      this.renderResults(this.currentRunData);
    },

    toggleResultSelection(resultFile: string, checked: boolean) {
      if (!this.currentRunData?.name) return;
      const current = new Set(this.getResultSelection(this.currentRunData.name));
      if (checked) current.add(resultFile);
      else current.delete(resultFile);
      this.setResultSelection(this.currentRunData.name, Array.from(current));
      this.renderResults(this.currentRunData);
    },

    async reportResults(resultFiles: string[], mode: 'selected' | 'all') {
      const data = this.currentRunData;
      if (!data) return;
      const files = uniqueValues(resultFiles.map((item) => String(item || '').trim()).filter(Boolean));
      if (!files.length) {
        this.setResultReportFeedback('请先选择至少一个问题。', 'error', data.name);
        return;
      }
      if (!data.run_id) {
        this.setResultReportFeedback('当前 Run 尚未解析出 run_id，暂时无法上报。', 'error', data.name);
        return;
      }
      if (!data.linked_task_id || !data.linked_execution_id) {
        this.setResultReportFeedback('当前 Run 还没有关联到受管任务，无法上报到漏洞引擎。请先关联任务记录。', 'error', data.name);
        return;
      }
      this._resultReportBusy = true;
      this.setResultReportFeedback(
        mode === 'all' ?`正在将全部 ${files.length} 个问题上报到漏洞引擎...` :`正在上报已选中的 ${files.length} 个问题...`,
        'info',
        data.name,
      );
      this.renderResults(data);
      try {
        const payload = await reportDataflowFileserverRunVulnerabilities(projectId, this.runsRootPath, data.name, files);
        const reported = Number(payload?.reported || 0);
        const failed = Number(payload?.failed || 0);
        const total = Number(payload?.total || files.length);
        const status = String(payload?.status || '');
        const tone = failed > 0 || status === 'failed' || status === 'partial_failed' ? 'error' : 'success';
        this.setResultReportFeedback(`已向漏洞引擎提交 ${total} 个问题，成功 ${reported}，失败 ${failed}。`, tone, data.name);
      } catch (error: any) {
        this.setResultReportFeedback(error?.message || '批量上报漏洞失败。', 'error', data.name);
      } finally {
        this._resultReportBusy = false;
        if (this.currentRunData?.name === data.name) this.renderResults(this.currentRunData);
      }
    },

    async reportSelectedResults() {
      if (!this.currentRunData) return;
      await this.reportResults(this.getResultSelection(this.currentRunData.name), 'selected');
    },

    async reportAllResults() {
      if (!this.currentRunData) return;
      await this.reportResults(this.activeResultFiles(this.currentRunData), 'all');
    },

    isActiveRunStatus(statusText: string) {
      return ['pending', 'queued', 'running', 'cancel_requested', 'delete_requested'].includes(String(statusText || '').toLowerCase());
    },

    runProcessState(data?: Partial<DataflowFileserverRunSummary> | null) {
      const state = data?.process_state;
      return state && typeof state === 'object' ? state : {};
    },

    canRetryRun(data?: Partial<DataflowFileserverRunSummary> | null) {
      return this.runProcessState(data).can_retry === true;
    },

    retryDisabledReason(data?: Partial<DataflowFileserverRunSummary> | null) {
      const state = this.runProcessState(data);
      return String(state.reason || '后端尚未确认该 Run 可重试，请刷新后再试。');
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
      const retryable = this.canRetryRun(current);
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
      const retryable = this.canRetryRun(data);
      const retryReason = this.retryDisabledReason(data);
      const busy = !!this._mutationBusy;
      return`
        <div class="task-action-panel">
          <button class="btn btn-sm" data-action="adopt-run" ${linked || busy ? 'disabled' : ''}>关联任务记录</button>
          <button class="btn btn-sm btn-warning" data-action="cancel-run" ${!linked || !active || busy ? 'disabled' : ''}>取消 Run</button>
          <button class="btn btn-sm" data-action="retry-run" ${!retryable || busy ? 'disabled' : ''} title="${this.esc(retryable ? 'run_vuln_scan.py 进程不存在或心跳过期，可以通过 --resume 重试' : retryReason)}">重试 Run</button>
          <button class="btn btn-sm btn-danger" data-action="delete-open" ${busy ? 'disabled' : ''}>删除 Run</button>
        </div>`;
    },

    runCommandDisplay(data: DataflowFileserverRunOverview) {
      const raw = data.raw && typeof data.raw === 'object' ? data.raw : {};
      const cli = raw.dataflow_cli && typeof raw.dataflow_cli === 'object' ? raw.dataflow_cli : {};
      const commandDisplay = String(data.command_display || cli.command_display || raw.command_display || '').trim();
      if (commandDisplay) return commandDisplay;
      const command = Array.isArray(data.command) ? data.command : Array.isArray(cli.command) ? cli.command : Array.isArray(raw.command) ? raw.command : [];
      return command.map((item: any) => String(item)).join(' ');
    },

    retryCommandDisplay(data: DataflowFileserverRunOverview) {
      return String(data.retry_command_display || '').trim();
    },

    renderTaskConfigRows(rows: Array<{ label: string; value: string }>, options?: { compact?: boolean }) {
      const gridClass = options?.compact ? 'task-info-grid compact' : 'task-info-grid';
      const rowClass = options?.compact ? 'task-info-row compact' : 'task-info-row';
      return`
        <div class="${gridClass}">
          ${rows.map((row) =>`
            <div class="${rowClass}">
              <span class="task-info-label">${this.esc(row.label)}</span>
              <div class="task-info-value" style="word-break:break-word">${row.value}</div>
            </div>`).join('')}
        </div>`;
    },

    renderTaskConfigSummaryRows(rows: Array<{ label: string; value: string }>) {
      return`
        <div class="task-config-summary">
          ${rows.map((row) =>`
            <div class="task-config-summary-row">
              <div class="task-config-summary-label">${this.esc(row.label)}</div>
              <div class="task-config-summary-value">${row.value}</div>
            </div>`).join('')}
        </div>`;
    },

    renderProjectPathValue(path: unknown, options?: { compact?: boolean }) {
      const rawPath = String(path ?? '').trim();
      if (!rawPath) return '<span class="text-muted">-</span>';
      const explorerPath = normalizeProjectFileExplorerPath(rawPath, projectId);
      const href = buildProjectFileExplorerHash(rawPath, projectId);
      const compact = !!options?.compact;
      const gap = compact ? 6 : 8;
      const basis = compact ? 180 : 260;
      const pathFont = compact ? 11 : 12;
      const rawFont = compact ? 10 : 11;
      const buttonClass = compact ? 'action-link' : 'btn btn-sm';
      return`
        <div style="display:flex;flex-wrap:wrap;align-items:${compact ? 'center' : 'flex-start'};gap:${gap}px">
          <div style="min-width:0;flex:1 1 ${basis}px">
            <div style="font-family:var(--mono);font-size:${pathFont}px;line-height:${compact ? '1.2' : '1.4'};word-break:break-all">${this.esc(explorerPath)}</div>
            ${!compact && explorerPath !== rawPath ?`<div class="text-muted" style="margin-top:4px;font-family:var(--mono);font-size:${rawFont}px;word-break:break-all">${this.esc(rawPath)}</div>` : ''}
          </div>
          <a href="${this.attr(href)}" target="_blank" rel="noopener noreferrer" class="${buttonClass}"${compact ? ' style="font-size:11px;white-space:nowrap"' : ''}>项目文件</a>
        </div>`;
    },

    renderJsonDetailsInline(title: string, value: unknown, options?: { emptyText?: string; open?: boolean }) {
      if (!hasDisplayContent(value)) {
        return`<div class="text-muted" style="font-size:12px">${this.esc(options?.emptyText || '暂无数据')}</div>`;
      }
      const open = options?.open ? ' open' : '';
      return`
        <details${open} style="margin-top:6px">
          <summary class="action-link" style="cursor:pointer">${this.esc(title)}</summary>
          <pre class="run-command-pre" style="margin-top:8px">${this.esc(prettyJson(value))}</pre>
        </details>`;
    },

    renderInputRefValue(ref: unknown, options?: { compact?: boolean; hideFilename?: boolean }) {
      const record = asRecord(ref);
      if (!Object.keys(record).length) return '<span class="text-muted">-</span>';
      const compact = !!options?.compact;
      const hideFilename = !!options?.hideFilename;
      const source = String(record.source || '').trim();
      const path = String(record.path || '').trim();
      const storageKey = String(record.storage_key || '').trim();
      const relativePath = String(record.relative_path || '').trim();
      const filename = hideFilename ? '' : String(record.filename || '').trim();
      const metadata = asRecord(record.metadata);
      const extraLines = [
        storageKey ?`<div class="text-muted" style="font-size:${compact ? 11 : 12}px"><strong>storage_key</strong>: <span style="font-family:var(--mono)">${this.esc(storageKey)}</span></div>` : '',
        relativePath ?`<div class="text-muted" style="font-size:${compact ? 11 : 12}px"><strong>relative_path</strong>: <span style="font-family:var(--mono)">${this.esc(relativePath)}</span></div>` : '',
        filename ?`<div class="text-muted" style="font-size:${compact ? 11 : 12}px"><strong>filename</strong>: <span style="font-family:var(--mono)">${this.esc(filename)}</span></div>` : '',
      ].filter(Boolean).join('');
      return`
        <div style="display:grid;gap:${compact ? 4 : 6}px">
          ${source && !compact ?`<div><span class="badge badge-sm badge-mode">${this.esc(source)}</span></div>` : ''}
          ${path ? this.renderProjectPathValue(path, { compact }) : ''}
          ${!path && relativePath ?`<div style="font-family:var(--mono);font-size:${compact ? 11 : 12}px;line-height:${compact ? '1.25' : '1.4'};word-break:break-all">${this.esc(relativePath)}</div>` : ''}
          ${extraLines}
          ${Object.keys(metadata).length ? this.renderJsonDetailsInline('metadata', metadata) : ''}
          ${!path && !extraLines && !Object.keys(metadata).length ? this.renderJsonDetailsInline('原始引用 JSON', record, { open: true }) : ''}
        </div>`;
    },

    cachedLinkedTaskDetail(runName: string, data?: DataflowFileserverRunOverview | null) {
      const runCache = this.getRunCache(runName);
      const embedded = data && typeof (data as any).linked_task_detail === 'object'
        ? (data as any).linked_task_detail as DataflowScanTaskDetail
        : null;
      if (!runCache.linkedTaskDetail && embedded) {
        runCache.linkedTaskDetail = embedded;
        runCache.linkedTaskDetailLoaded = true;
        runCache.linkedTaskDetailError = '';
      }
      return runCache.linkedTaskDetail || embedded;
    },

    async ensureLinkedTaskDetail(runName: string, options?: { force?: boolean }) {
      const normalizedRun = String(runName || '');
      if (!normalizedRun) return null;
      const runCache = this.getRunCache(normalizedRun);
      const overview = runCache.overview || (this.currentRunData?.name === normalizedRun ? this.currentRunData : null);
      const taskId = String(overview?.linked_task_id || '').trim();
      if (!taskId) {
        runCache.linkedTaskDetail = null;
        runCache.linkedTaskDetailLoaded = true;
        runCache.linkedTaskDetailError = '';
        return null;
      }
      if (options?.force) {
        runCache.linkedTaskDetail = null;
        runCache.linkedTaskDetailLoaded = false;
        runCache.linkedTaskDetailError = '';
        runCache.linkedTaskDetailPromise = null;
      }
      if (runCache.linkedTaskDetailLoaded && runCache.linkedTaskDetail) {
        return runCache.linkedTaskDetail;
      }
      if (runCache.linkedTaskDetailPromise) {
        return await runCache.linkedTaskDetailPromise;
      }
      const promise = (async () => {
        try {
          const detail = await dataflowVulnScannerApi.getTask(taskId);
          runCache.linkedTaskDetail = detail;
          runCache.linkedTaskDetailLoaded = true;
          runCache.linkedTaskDetailError = '';
          if (this.currentRun === normalizedRun && this.currentRunData) {
            (this.currentRunData as any).linked_task_detail = detail;
            this.renderRunDetail(this.currentRunData);
            this.renderTaskInfo(this.currentRunData);
            this.renderTaskConfig(this.currentRunData);
          }
          return detail;
        } catch (error: any) {
          runCache.linkedTaskDetail = null;
          runCache.linkedTaskDetailLoaded = false;
          runCache.linkedTaskDetailError = error?.message || '加载任务详情失败';
          if (this.currentRun === normalizedRun && this.currentRunData) {
            this.renderTaskInfo(this.currentRunData);
            this.renderTaskConfig(this.currentRunData);
          }
          return null;
        } finally {
          if (runCache.linkedTaskDetailPromise === promise) {
            runCache.linkedTaskDetailPromise = null;
          }
        }
      })();
      runCache.linkedTaskDetailPromise = promise;
      return await promise;
    },

    timelineStageLabel(value?: string | null) {
      const raw = String(value || '').trim();
      return raw || '-';
    },

    timelineEventCategory(value?: string | null) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return 'other';
      if (/^(task_created|task_retry_queued|task_evolution_created|task_priority_updated|task_projection_rebuilt)$/.test(raw)) return 'task_mutation';
      if (/^(task_cancel_requested|run_cancel_requested|run_resume_queued|run_delete_requested|run_adopted)$/.test(raw)) return 'run_control';
      if (/(queued|dispatch|started|running|completed|finished|succeeded|plugin_|execution_|stage_)/.test(raw)) return 'stage_progress';
      if (/(failed|abnormal|error|cancelled|interrupted)/.test(raw)) return 'failure';
      if (/(report|review|vuln_)/.test(raw)) return 'review_report';
      return 'other';
    },

    timelineEventCategoryLabel(value?: string | null) {
      const category = this.timelineEventCategory(value);
      if (category === 'task_mutation') return '任务操作';
      if (category === 'run_control') return '运行控制';
      if (category === 'stage_progress') return '阶段推进';
      if (category === 'failure') return '异常/终态';
      if (category === 'review_report') return '评审/上报';
      return '其他事件';
    },

    timelineEventTypeLabel(value?: string | null) {
      const raw = String(value || '').trim();
      if (!raw) return '-';
      const exactLabels: Record<string, string> = {
        task_created: '任务已创建',
        execution_queued: '任务已入队',
        task_evolution_created: '演化任务已创建',
        task_retry_queued: '任务重试已入队',
        task_cancel_requested: '任务取消请求',
        task_priority_updated: '任务优先级已更新',
        task_projection_rebuilt: '任务投影已重建',
        run_cancel_requested: 'Run 取消请求',
        run_resume_queued: 'Run 恢复已入队',
        run_adopted: 'Run 已接管',
        run_delete_requested: 'Run 删除请求',
        vuln_report_manual: '人工漏洞上报',
      };
      if (exactLabels[raw]) return exactLabels[raw];
      return raw
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    },

    timelineEventBadgeClass(eventType?: string | null) {
      const raw = String(eventType || '').trim();
      if (/(failed|abnormal|error|cancel)/i.test(raw)) return 'badge-failed';
      if (/(warning|retry)/i.test(raw)) return 'badge-warning';
      if (/(completed|succeeded|finished)/i.test(raw)) return 'badge-succeeded';
      if (/(started|dispatch|queued|running|resume)/i.test(raw)) return 'badge-running';
      return 'badge-unknown';
    },

    timelineLevelBadgeClass(level?: string | null) {
      const raw = String(level || 'info').trim().toLowerCase();
      if (raw === 'error') return 'badge-failed';
      if (raw === 'warning') return 'badge-warning';
      if (raw === 'info') return 'badge-running';
      return 'badge-unknown';
    },

    timelineEventCategoryBadgeClass(eventType?: string | null) {
      const category = this.timelineEventCategory(eventType);
      if (category === 'task_mutation') return 'badge-running';
      if (category === 'run_control') return 'badge-warning';
      if (category === 'stage_progress') return 'badge-succeeded';
      if (category === 'failure') return 'badge-failed';
      if (category === 'review_report') return 'badge-unknown';
      return 'badge-unknown';
    },

    timelineSourceLabel(event: DataflowTaskTimelineEvent) {
      const attempt = Number(event.attempt_no || 0);
      const prefix = attempt > 0 ?`#${attempt}` : '#-';
      return`${prefix} / ${String(event.execution_id || '').trim() || '-'}`;
    },

    timelineMessageLabel(event: DataflowTaskTimelineEvent) {
      const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
      const eventType = String(event.event_type || '').trim();
      if (eventType === 'task_priority_updated') {
        const oldPriority = payload.old_priority ?? '-';
        const newPriority = payload.new_priority ?? '-';
        return`优先级 ${oldPriority} -> ${newPriority}`;
      }
      if (eventType === 'task_cancel_requested') {
        return`取消任务，原状态 ${payload.status_before || '-'}`;
      }
      if (eventType === 'run_cancel_requested') {
        return`取消 Run，原状态 ${payload.status_before || '-'}`;
      }
      if (eventType === 'task_retry_queued') {
        return`重试已入队，Attempt #${payload.attempt_no || event.attempt_no || '-'}`;
      }
      if (eventType === 'task_evolution_created') {
        return`从源任务 ${payload.source_task_id || '-'} 创建演化任务`;
      }
      if (eventType === 'run_delete_requested') {
        return`请求删除 Run ${payload.run_id || '-'}`;
      }
      if (eventType === 'vuln_report_manual') {
        return`人工上报 ${Array.isArray(payload.result_files) ? payload.result_files.length : 0} 个结果，状态 ${payload.status || '-'}`;
      }
      return String(event.message || '-');
    },

    timelinePayloadRows(payload: Record<string, any>) {
      return Object.entries(payload || {}).slice(0, 12).map(([key, value]) => ({
        key,
        label: key.replace(/_/g, ' '),
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
    },

    filteredTimelineItems(runName: string) {
      const runCache = this.getRunCache(runName);
      return (runCache.timelineItems || []).filter((event) => {
        const stageValue = String(event.stage_name || event.stage_key || '__none__');
        const eventTypeValue = String(event.event_type || '__none__');
        const levelValue = String(event.level || 'info');
        if (runCache.timelineStageFilter !== '__all__' && stageValue !== runCache.timelineStageFilter) return false;
        if (runCache.timelineEventTypeFilter !== '__all__' && eventTypeValue !== runCache.timelineEventTypeFilter) return false;
        if (runCache.timelineLevelFilter !== '__all__' && levelValue !== runCache.timelineLevelFilter) return false;
        return true;
      });
    },

    renderTaskTimeline(data: DataflowFileserverRunOverview) {
      const el = this.$('taskTimelineContainer');
      if (!el) return;
      const runCache = this.getRunCache(data.name);
      const taskId = String(data.linked_task_id || '').trim();
      if (!taskId) {
        el.innerHTML =`
          <section class="card">
            <div class="card-title">事件时间线</div>
            <div class="empty-state">当前 Run 尚未关联受管任务，暂无可展示的任务级事件时间线。</div>
          </section>`;
        return;
      }
      const items = this.filteredTimelineItems(data.name);
      const stageOptions = Array.from(new Set((runCache.timelineItems || []).map((event) => String(event.stage_name || event.stage_key || '').trim()).filter(Boolean)));
      const eventTypeOptions = Array.from(new Set((runCache.timelineItems || []).map((event) => String(event.event_type || '').trim()).filter(Boolean)));
      const categoryOptions = Array.from(new Set((runCache.timelineItems || []).map((event) => this.timelineEventCategory(event.event_type)).filter(Boolean)));
      const levelOptions = Array.from(new Set((runCache.timelineItems || []).map((event) => String(event.level || 'info').trim()).filter(Boolean)));
      const categorySummary = categoryOptions
        .map((category) => {
          const count = (runCache.timelineItems || []).filter((event) => this.timelineEventCategory(event.event_type) === category).length;
          return`${this.timelineEventCategoryLabel(category)} ${count}`;
        })
        .join(' · ');
      const pageSize = Math.min(500, Math.max(50, Number(runCache.timelinePageSize || 200)));
      const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
      const currentPage = Math.min(Math.max(1, Number(runCache.timelinePage || 1)), pageCount);
      runCache.timelinePage = currentPage;
      const rangeStart = items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const rangeEnd = Math.min(items.length, currentPage * pageSize);
      const pagedItems = items.slice(rangeStart - 1, rangeEnd);
      const loadingBlock = runCache.timelineLoading ? '<div class="empty-state">加载时间线中...</div>' : '';
      const errorBlock = runCache.timelineError ?`<div class="empty-state text-error">${this.esc(runCache.timelineError)}</div>` : '';
      const emptyBlock = !runCache.timelineLoading && !runCache.timelineError && items.length === 0 ? '<div class="empty-state">当前任务暂无事件时间线</div>' : '';
      el.innerHTML =`
        <section class="card">
          <div class="card-title">事件时间线</div>
          <div class="text-muted" style="margin-top:-6px;margin-bottom:6px;font-size:12px">按时间查看当前任务的调度、阶段推进、重试与异常轨迹。</div>
          <div class="text-muted" style="margin-bottom:12px;font-size:12px">${this.esc(categorySummary || '暂无可分类事件')}</div>
          <div class="timeline-toolbar">
            <div class="timeline-summary-pill">展示 ${rangeStart}-${rangeEnd} / ${items.length}</div>
            <div class="timeline-pagination">
              <label class="timeline-summary-pill">
                每页
                <select class="timeline-select" data-action="timeline-page-size">
                  ${[50, 100, 200, 500].map((size) =>`<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}
                </select>
              </label>
              <button class="btn btn-sm" data-action="refresh-timeline" ${runCache.timelineLoading ? 'disabled' : ''}>刷新</button>
              <button class="btn btn-sm btn-danger" data-action="clear-timeline" ${(runCache.timelineLoading || runCache.timelineClearing || !runCache.timelineItems.length) ? 'disabled' : ''}>${runCache.timelineClearing ? '清空中...' : '清空时间线'}</button>
            </div>
          </div>
          <div class="timeline-filters">
            <select class="timeline-select" data-action="timeline-stage-filter">
              <option value="__all__">全部阶段</option>
              ${stageOptions.map((value) =>`<option value="${this.attr(value)}" ${value === runCache.timelineStageFilter ? 'selected' : ''}>${this.esc(this.timelineStageLabel(value))}</option>`).join('')}
            </select>
            <select class="timeline-select" data-action="timeline-event-type-filter">
              <option value="__all__">全部事件</option>
              ${eventTypeOptions.map((value) =>`<option value="${this.attr(value)}" ${value === runCache.timelineEventTypeFilter ? 'selected' : ''}>${this.esc(this.timelineEventTypeLabel(value))}</option>`).join('')}
            </select>
            <select class="timeline-select" data-action="timeline-level-filter">
              <option value="__all__">全部级别</option>
              ${levelOptions.map((value) =>`<option value="${this.attr(value)}" ${value === runCache.timelineLevelFilter ? 'selected' : ''}>${this.esc(value)}</option>`).join('')}
            </select>
          </div>
          ${loadingBlock || errorBlock || emptyBlock ||`
            <div class="timeline-table-wrap">
              <div class="timeline-table-scroll">
                <table class="timeline-table">
                  <thead>
                    <tr>
                      <th style="width:56px">#</th>
                      <th style="width:180px">时间</th>
                      <th style="width:130px">事件分类</th>
                      <th style="width:180px">事件类型</th>
                      <th style="width:160px">阶段</th>
                      <th style="width:120px">级别</th>
                      <th>消息</th>
                      <th style="width:220px">执行来源</th>
                      <th style="width:120px">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pagedItems.map((event, index) => {
                      const expanded = runCache.expandedTimelineEventId === event.id;
                      const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
                      const hasPayload = Object.keys(payload).length > 0;
                      const payloadRows = this.timelinePayloadRows(payload);
                      return`
                        <tr>
                          <td class="mono">${rangeStart + index}</td>
                          <td>${this.esc(event.created_at ? new Date(event.created_at).toLocaleString('zh-CN') : '-')}</td>
                          <td><span class="badge ${this.timelineEventCategoryBadgeClass(event.event_type)}">${this.esc(this.timelineEventCategoryLabel(event.event_type))}</span></td>
                          <td><span class="badge ${this.timelineEventBadgeClass(event.event_type)}">${this.esc(this.timelineEventTypeLabel(event.event_type))}</span></td>
                          <td>${event.stage_name ?`<span class="badge badge-running">${this.esc(this.timelineStageLabel(event.stage_name || event.stage_key))}</span>` : '<span class="text-muted">-</span>'}</td>
                          <td><span class="badge ${this.timelineLevelBadgeClass(event.level)}">${this.esc(String(event.level || 'info'))}</span></td>
                          <td title="${this.attr(this.timelineMessageLabel(event))}">${this.esc(this.timelineMessageLabel(event))}</td>
                          <td class="mono" title="${this.attr(this.timelineSourceLabel(event))}">${this.esc(this.timelineSourceLabel(event))}</td>
                          <td>
                            <div style="display:flex;justify-content:flex-end;gap:10px">
                              <button class="btn btn-inline-compact" data-action="toggle-timeline-event" data-event-id="${this.attr(event.id)}" ${hasPayload ? '' : 'disabled'}>${expanded ? '收起' : '查看'}</button>
                              <button class="btn btn-inline-compact btn-danger" data-action="delete-timeline-event" data-event-id="${this.attr(event.id)}" ${runCache.deletingTimelineEventId === event.id || runCache.timelineClearing ? 'disabled' : ''}>${runCache.deletingTimelineEventId === event.id ? '删除中' : '删除'}</button>
                            </div>
                          </td>
                        </tr>
                        ${expanded ?`
                          <tr class="timeline-expand-row">
                            <td colspan="9">
                              ${payloadRows.length ?`
                                <div class="timeline-payload-grid">
                                  ${payloadRows.map((row) =>`
                                    <div class="timeline-payload-item">
                                      <div class="timeline-payload-item-label">${this.esc(row.label)}</div>
                                      <div class="timeline-payload-item-value">${this.esc(row.value)}</div>
                                    </div>`).join('')}
                                </div>` : '<div class="empty-state">当前事件没有 payload 明细</div>'}
                              <pre class="timeline-json">${this.esc(JSON.stringify(payload, null, 2))}</pre>
                            </td>
                          </tr>` : ''}`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="timeline-pagination" style="margin-top:14px;justify-content:flex-end">
              <button class="btn btn-sm" data-action="timeline-prev-page" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
              <div class="timeline-summary-pill">第 ${currentPage} / ${pageCount} 页</div>
              <button class="btn btn-sm" data-action="timeline-next-page" ${currentPage >= pageCount ? 'disabled' : ''}>下一页</button>
            </div>`}
        </section>`;
    },

    async loadTaskTimeline(runName: string, options?: { force?: boolean }) {
      const normalizedRun = String(runName || '');
      if (!normalizedRun) return;
      const runCache = this.getRunCache(normalizedRun);
      const overview = runCache.overview || (this.currentRunData?.name === normalizedRun ? this.currentRunData : null);
      const taskId = String(overview?.linked_task_id || '').trim();
      if (!taskId) {
        runCache.timelineLoaded = true;
        runCache.timelineItems = [];
        runCache.timelineError = '';
        if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
        return;
      }
      if (runCache.timelineLoading) return;
      if (runCache.timelineLoaded && !options?.force) {
        if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
        return;
      }
      runCache.timelineLoading = true;
      runCache.timelineError = '';
      if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      try {
        const response = await dataflowVulnScannerApi.getTaskTimeline(taskId);
        runCache.timelineItems = Array.isArray(response.items) ? response.items : [];
        runCache.timelineLoaded = true;
        runCache.timelinePage = 1;
      } catch (error: any) {
        runCache.timelineError = error?.message || '加载任务时间线失败';
      } finally {
        runCache.timelineLoading = false;
        if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      }
    },

    async clearTaskTimeline(runName: string) {
      const normalizedRun = String(runName || '');
      if (!normalizedRun) return;
      const runCache = this.getRunCache(normalizedRun);
      const overview = runCache.overview || (this.currentRunData?.name === normalizedRun ? this.currentRunData : null);
      const taskId = String(overview?.linked_task_id || '').trim();
      if (!taskId || runCache.timelineClearing) return;
      const ok = await confirm({ message: '将删除当前任务的全部事件时间线记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？', danger: true });
      if (!ok) return;
      runCache.timelineClearing = true;
      runCache.timelineError = '';
      if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      try {
        await dataflowVulnScannerApi.clearTaskTimeline(taskId);
        runCache.timelineItems = [];
        runCache.timelineLoaded = true;
        runCache.timelinePage = 1;
        runCache.expandedTimelineEventId = '';
      } catch (error: any) {
        runCache.timelineError = error?.message || '清空任务时间线失败';
      } finally {
        runCache.timelineClearing = false;
        if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      }
    },

    async deleteTaskTimelineEvent(runName: string, eventId: string) {
      const normalizedRun = String(runName || '');
      if (!normalizedRun || !eventId) return;
      const runCache = this.getRunCache(normalizedRun);
      const overview = runCache.overview || (this.currentRunData?.name === normalizedRun ? this.currentRunData : null);
      const taskId = String(overview?.linked_task_id || '').trim();
      if (!taskId || runCache.deletingTimelineEventId) return;
      const ok = await confirm({ message: '将删除当前事件记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？', danger: true });
      if (!ok) return;
      runCache.deletingTimelineEventId = eventId;
      runCache.timelineError = '';
      if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      try {
        await dataflowVulnScannerApi.deleteTaskTimelineEvent(taskId, eventId);
        runCache.timelineItems = (runCache.timelineItems || []).filter((item) => item.id !== eventId);
        if (runCache.expandedTimelineEventId === eventId) runCache.expandedTimelineEventId = '';
      } catch (error: any) {
        runCache.timelineError = error?.message || '删除任务时间线事件失败';
      } finally {
        runCache.deletingTimelineEventId = '';
        if (this.currentRun === normalizedRun && this.currentRunData) this.renderTaskTimeline(this.currentRunData);
      }
    },

    renderTaskConfig(data: DataflowFileserverRunOverview) {
      const el = this.$('taskConfigContainer');
      if (!el) return;
      const linked = !!(data.linked_task_id || data.linked_execution_id);
      const taskPurpose = String(data.linked_task_purpose || 'normal').trim() === 'evolution' ? 'evolution' : 'normal';
      const taskPurposeLabel = taskPurpose === 'evolution' ? '进化任务' : '正常任务';
      const taskPurposeBadgeClass = taskPurpose === 'evolution' ? 'badge-warning' : 'badge-succeeded';
      const runCache = this.getRunCache(data.name);
      const taskDetail = this.cachedLinkedTaskDetail(data.name, data);
      const taskDetailLoading = !!runCache.linkedTaskDetailPromise;
      const taskDetailError = String(runCache.linkedTaskDetailError || '').trim();
      if (linked && !taskDetail && !taskDetailLoading && !taskDetailError && this.getActiveTab() === 'task-config') {
        void this.ensureLinkedTaskDetail(data.name);
      }

      const section = (title: string, body: string, subtitle = '') =>`
        <section class="card">
          <div class="card-title">${this.esc(title)}</div>
          ${subtitle ?`<div class="text-muted" style="margin-top:-6px;margin-bottom:10px;font-size:12px">${this.esc(subtitle)}</div>` : ''}
          ${body}
        </section>`;

      const cards: string[] = [];
      const identityRows = [
        { label: 'Task ID', value: this.esc(String(data.linked_task_id || taskDetail?.task_id || '-')) },
        { label: 'Execution ID', value: this.esc(String(data.linked_execution_id || taskDetail?.latest_execution_id || '-')) },
        { label: 'Run ID', value: this.esc(String(data.run_id || '-')) },
        { label: '任务标题', value: this.esc(String(taskDetail?.title || data.name || '-')) },
        { label: 'Profile', value: this.esc([String(taskDetail?.profile_id || data.profile_id || '-'), taskDetail?.profile_version ?`v${taskDetail.profile_version}` : ''].filter(Boolean).join(' · ')) },
        { label: '任务用途', value:`<span class="badge ${taskPurposeBadgeClass}">${this.esc(taskPurposeLabel)}</span>` },
        { label: '任务来源', value: this.esc(String(taskDetail?.origin_label || taskDetail?.task_origin_type || data.source_type || '-')) },
        { label: '父任务 ID', value: this.esc(String(taskDetail?.parent_task_id || '-')) },
        { label: '父任务类型', value: this.esc(String(taskDetail?.parent_task_type || '-')) },
        { label: '父阶段', value: this.esc(String(taskDetail?.parent_stage_name || '-')) },
      ];
      cards.push(section('任务标识', this.renderTaskConfigRows(identityRows)));

      if (!linked) {
        cards.push(section(
          '任务配置详情',
          '<div class="empty-state">当前 Run 尚未关联任务记录，因此只能展示运行侧摘要。点击“任务信息”中的“关联任务记录”后，即可在这里查看完整任务配置。</div>',
        ));
        cards.push(section('运行侧摘要', this.renderTaskConfigRows([
          { label: '模型', value: this.esc(String(data.model || '-')) },
          { label: 'Provider', value: this.esc(String(data.provider || '-')) },
          { label: 'Thinking', value: this.esc(String(data.thinking || '-')) },
          { label: 'Review Profile', value: this.esc(String(data.review_profile || '-')) },
          { label: 'Run 根目录', value: this.renderProjectPathValue(data.path) },
          { label: 'Atomic Work', value: this.renderProjectPathValue(data.atomic_work_path) },
        ])));
        cards.push(section('运行配置 JSON', this.renderJsonDetailsInline('config', data.config, { open: true })));
        el.innerHTML =`<div style="display:grid;gap:14px">${cards.join('')}</div>`;
        return;
      }

      if (!taskDetail) {
        const loadingOrError = taskDetailError
          ?`
            <div class="empty-state text-error">${this.esc(taskDetailError)}</div>
            <div style="margin-top:12px">
              <button class="btn btn-sm" type="button" data-action="retry-task-config">重新读取任务配置</button>
            </div>`
          : '<div class="empty-state">正在读取关联任务详情，稍后会在此展示输入目录、输出目录、运行参数和原始配置。</div>';
        cards.push(section('任务配置详情', loadingOrError));
        el.innerHTML =`<div style="display:grid;gap:14px">${cards.join('')}</div>`;
        return;
      }

      const taskMetadata = asRecord(taskDetail.task_metadata);
      const requestPayload = asRecord(taskMetadata.dataflow_scan_request);
      const cliMeta = asRecord(taskMetadata.dataflow_cli);
      const inputSummary = asRecord(taskDetail.input_summary);
      const outputSummary = asRecord(taskDetail.output_summary);
      const effectiveConfigSummary = asRecord(taskDetail.effective_config_summary);
      const compiledProfile = asRecord(taskMetadata.compiled_profile || effectiveConfigSummary.compiled_profile);
      const runtimeOverrides = asRecord(taskDetail.runtime_overrides || effectiveConfigSummary.runtime_overrides);
      const attempts = asArray(taskDetail.attempts);
      const agentStateDirs = data.linked_task_agent_state_dirs && typeof data.linked_task_agent_state_dirs === 'object'
        ? Object.values(data.linked_task_agent_state_dirs)
        : [];
      const dataFlowFiles = asArray<string>(inputSummary.data_flow_files);
      const autoReportEnabled = taskDetail.auto_report_vulnerabilities ?? !!taskMetadata.auto_report_vulnerabilities;
      const configRows = [
        { label: '模型', value: this.esc(String(requestPayload.model || data.model || '-')) },
        { label: 'Provider', value: this.esc(String(requestPayload.provider || data.provider || '-')) },
        { label: 'Thinking', value: this.esc(String(data.thinking || '-')) },
        { label: 'Review Profile', value: this.esc(String(requestPayload.review_profile || effectiveConfigSummary.review_profile || data.review_profile || '-')) },
        { label: '最大评审轮次', value: this.esc(String(requestPayload.max_review_cycles ?? data.max_cycles ?? '-')) },
        { label: 'Pi Timeout 最大次数', value: this.esc(String(requestPayload.timeout_max_retries ?? '-')) },
        { label: 'Pi Timeout 重试间隔（秒）', value: this.esc(String(requestPayload.timeout_retry_interval_seconds ?? '-')) },
        { label: '结果评审并发', value: this.esc(String(requestPayload.result_review_concurrency ?? '-')) },
        { label: '自动上报漏洞', value: this.esc(autoReportEnabled ? '开启' : '关闭') },
        { label: '运行模式', value: this.esc(String(cliMeta.mode || 'fresh')) },
      ];
      const inputRows = [
        { label: 'Runs根目录', value: this.renderProjectPathValue(cliMeta.runs_root, { compact: true }) },
        { label: '数据流目录', value: this.renderInputRefValue(inputSummary.data_flow, { compact: true, hideFilename: true }) },
        { label: '代码目录', value: this.renderInputRefValue(inputSummary.source_dir, { compact: true, hideFilename: true }) },
        { label: '自定义输出目录（output_dir）', value: this.renderInputRefValue(inputSummary.output_dir, { compact: true }) },
        { label: '任务 Markdown 路径', value: this.renderProjectPathValue(inputSummary.task_markdown_path, { compact: true }) },
        {
          label: '数据流文件清单',
          value: dataFlowFiles.length
            ?`<div>${this.esc(String(dataFlowFiles.length))} 个文件</div>${this.renderJsonDetailsInline('查看文件列表', dataFlowFiles)}`
            : '<span class="text-muted">未记录</span>',
        },
      ];
      const outputRows = [
        { label: 'TASK ROOT', value: this.renderProjectPathValue(taskDetail.task_root || data.path, { compact: true }) },
        { label: '输出目录', value: this.renderProjectPathValue(outputSummary.output_root, { compact: true }) },
      ];
      cards.push(section('输入信息', this.renderTaskConfigSummaryRows(inputRows)));
      cards.push(section('输出信息', this.renderTaskConfigSummaryRows(outputRows)));
      cards.push(section('运行参数', this.renderTaskConfigRows(configRows)));

      cards.push(section(
        '运行时覆盖与编译后配置',
        [
          this.renderJsonDetailsInline('runtime_overrides', runtimeOverrides, { emptyText: '当前任务没有 runtime_overrides。' }),
          this.renderJsonDetailsInline('effective_config_summary', effectiveConfigSummary, { emptyText: '未记录 effective_config_summary。' }),
          this.renderJsonDetailsInline('compiled_profile', compiledProfile, { emptyText: '未记录 compiled_profile。' }),
        ].join(''),
      ));

      cards.push(section(
        '输入引用 / 请求 JSON',
        [
          this.renderJsonDetailsInline('dataflow_scan_request', requestPayload, { emptyText: '未记录 dataflow_scan_request。', open: true }),
          this.renderJsonDetailsInline('dataflow_cli', cliMeta, { emptyText: '未记录 dataflow_cli。' }),
          this.renderJsonDetailsInline('input_summary', inputSummary, { emptyText: '未记录 input_summary。' }),
          this.renderJsonDetailsInline('output_summary', outputSummary, { emptyText: '未记录 output_summary。' }),
        ].join(''),
      ));


      cards.push(section(
        'Agent 状态目录',
        agentStateDirs.length
          ?`<div style="overflow:auto"><table style="width:100%;min-width:760px;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:rgba(148,163,184,0.08);text-align:left">
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Agent</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Root</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Skills</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Memory</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">来源</th>
                </tr>
              </thead>
              <tbody>
                ${agentStateDirs.map((item: any) =>`
                  <tr>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono);font-weight:700">${this.esc(String(item?.agent_id || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.root_dir || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.skills_dir || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.memory_dir || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12)">${this.esc(String(item?.source || 'shared_default'))}</td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`
          : '<div class="empty-state">当前任务未返回 agent 状态目录信息。</div>',
      ));

      cards.push(section(
        '执行尝试记录',
        attempts.length
          ?`<div style="overflow:auto"><table style="width:100%;min-width:960px;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:rgba(148,163,184,0.08);text-align:left">
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Attempt</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">状态</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Execution ID</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Dispatch</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Process</th>
                  <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Workspace</th>
                </tr>
              </thead>
              <tbody>
                ${attempts.map((item: any) =>`
                  <tr>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-weight:700">#${this.esc(String(item?.attempt_no || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12)">${this.statusBadge(String(item?.status || 'unknown'), 'badge-sm')}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.execution_id || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12)">${this.esc(String(item?.dispatch_status || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12)">${this.esc(String(item?.process_status || '-'))}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.workspace_root || '-'))}</td>
                  </tr>`).join('')}
              </tbody>
            </table></div>
            ${this.renderJsonDetailsInline('attempts JSON', attempts)}`
          : '<div class="empty-state">当前任务没有 execution attempts 记录。</div>',
      ));

      cards.push(section(
        '任务原始信息',
        [
          taskDetail.task_markdown
            ?`<details><summary class="action-link" style="cursor:pointer">查看 task_markdown</summary><pre class="run-command-pre" style="margin-top:8px">${this.esc(taskDetail.task_markdown)}</pre></details>`
            : '<div class="text-muted" style="font-size:12px">未记录 task_markdown 内容。</div>',
          this.renderJsonDetailsInline('task_metadata', taskMetadata, { emptyText: '未记录 task_metadata。' }),
        ].join(''),
      ));

      el.innerHTML =`<div style="display:grid;gap:14px">${cards.join('')}</div>`;
    },

    buildTaskInfoCardHtml(data: DataflowFileserverRunOverview, options?: { title?: string }) {
      const linked = !!(data.linked_task_id || data.linked_execution_id);
      const commandDisplay = this.runCommandDisplay(data);
      const retryCommandDisplay = this.retryCommandDisplay(data);
      const taskPurpose = String(data.linked_task_purpose || 'normal').trim() === 'evolution' ? 'evolution' : 'normal';
      const taskPurposeLabel = taskPurpose === 'evolution' ? '进化任务' : '正常任务';
      const taskPurposeBadgeClass = taskPurpose === 'evolution' ? 'badge-warning' : 'badge-succeeded';
      const agentStateDirs = data.linked_task_agent_state_dirs && typeof data.linked_task_agent_state_dirs === 'object'
        ? Object.values(data.linked_task_agent_state_dirs)
        : [];
      const linkedTaskDetail = this.cachedLinkedTaskDetail(data.name, data);
      const inputSummary = linkedTaskDetail && typeof linkedTaskDetail.input_summary === 'object' ? linkedTaskDetail.input_summary : {};
      const outputSummary = linkedTaskDetail && typeof linkedTaskDetail.output_summary === 'object' ? linkedTaskDetail.output_summary : {};
      const effectiveConfigSummary = linkedTaskDetail && typeof linkedTaskDetail.effective_config_summary === 'object' ? linkedTaskDetail.effective_config_summary : {};
      const runtimeOverrides = linkedTaskDetail && typeof linkedTaskDetail.runtime_overrides === 'object' ? linkedTaskDetail.runtime_overrides : {};
      const artifactRefs = Array.isArray(linkedTaskDetail?.artifact_refs) ? linkedTaskDetail!.artifact_refs : [];
      const rows = [
        ['Run ID', data.run_id || '-'],
        ['Task ID', data.linked_task_id || '-'],
        ['Execution ID', data.linked_execution_id || '-'],
        ['Profile ID', data.profile_id || '-'],
        ['任务用途', taskPurposeLabel],
        ['Source', data.source_type || '-'],
        ['Run Root', data.path || '-'],
        ['Atomic Work', data.atomic_work_path || '-'],
        ['解析时间', data.updated_at || '-'],
      ];
      return`
        <div class="card-title">${this.esc(options?.title || '任务 / Run 信息')}</div>
        <div class="task-state-line">
          <span class="badge ${linked ? 'badge-succeeded' : 'badge-warning'}">${linked ? '已关联任务记录' : '未关联任务记录'}</span>
          <span class="text-muted">${linked ? '当前 Run 已关联任务与执行记录，可以统一使用取消、重试、删除能力。' : '点击“关联任务记录”会创建任务与执行记录并绑定该 Run，不会启动扫描。'}</span>
        </div>
        <div class="task-info-grid">
          ${rows.map(([label, value]) =>`
            <div class="task-info-row">
              <span class="task-info-label">${this.esc(label)}</span>
              <span class="task-info-value">${this.esc(value)}</span>
            </div>`).join('')}
        </div>
        ${linked ?`
          <div class="run-command-block">
            <div class="run-command-title">
              <span>任务用途</span>
              <span class="badge ${taskPurposeBadgeClass}">${taskPurposeLabel}</span>
            </div>
            <div class="text-muted" style="margin-top:8px;font-size:12px">
              ${taskPurpose === 'evolution'
                ? '该任务使用独立的进化目录，可按 agent 固定映射到 skills/ 与 memory/ 子目录。'
                : '该任务使用项目共享默认目录，每个 agent 使用单独的 skills/ 与 memory/ 子目录。'}
            </div>
          </div>` : ''}
        ${linked ?`
          <div class="run-command-block">
            <div class="run-command-title">
              <span>Agent 状态目录</span>
              <span>${this.esc(String(agentStateDirs.length || 0))} 个 agent</span>
            </div>
            ${agentStateDirs.length ?`
              <div style="overflow:auto;margin-top:10px">
                <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:12px">
                  <thead>
                    <tr style="background:rgba(148,163,184,0.08);text-align:left">
                      <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Agent</th>
                      <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Root</th>
                      <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Skills</th>
                      <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">Memory</th>
                      <th style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.18)">来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${agentStateDirs.map((item: any) =>`
                      <tr>
                        <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono);font-weight:700">${this.esc(String(item?.agent_id || '-'))}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.root_dir || '-'))}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.skills_dir || '-'))}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-family:var(--mono)">${this.esc(String(item?.memory_dir || '-'))}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.12)">${this.esc(String(item?.source || 'shared_default'))}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>` :`
              <div class="text-muted" style="margin-top:8px;font-size:12px">当前关联任务未返回 agent 状态目录信息。</div>`}
          </div>` : ''}
        ${linked ?`
          <details class="run-command-block">
            <summary class="run-command-title" style="cursor:pointer">
              <span>任务配置</span>
              <span>${linkedTaskDetail ? '展开查看输入/输出/配置' : '切换到“任务配置”页签后自动加载完整任务配置'}</span>
            </summary>
            <div style="margin-top:12px;display:grid;gap:14px">
              <div>
                <div class="text-muted" style="font-size:12px;font-weight:700;margin-bottom:6px">输入信息</div>
                <div class="task-info-grid">
                  ${[
                    ['workspace_dir', JSON.stringify(inputSummary.workspace_dir || {})],
                    ['data_flow', JSON.stringify(inputSummary.data_flow || {})],
                    ['source_dir', JSON.stringify(inputSummary.source_dir || {})],
                    ['output_dir', JSON.stringify(inputSummary.output_dir || {})],
                    ['data_flow_dir', String(inputSummary.data_flow_dir || '-')],
                    ['data_flow_files', Array.isArray(inputSummary.data_flow_files) ? String(inputSummary.data_flow_files.length) : '-'],
                  ].map(([label, value]) =>`
                    <div class="task-info-row">
                      <span class="task-info-label">${this.esc(label)}</span>
                      <span class="task-info-value" style="white-space:pre-wrap;word-break:break-word">${this.esc(value)}</span>
                    </div>`).join('')}
                </div>
              </div>
              <div>
                <div class="text-muted" style="font-size:12px;font-weight:700;margin-bottom:6px">输出信息</div>
                <div class="task-info-grid">
                  ${[
                    ['task_root', String(linkedTaskDetail?.task_root || '-')],
                    ['run_root', String(linkedTaskDetail?.run_root || outputSummary.run_root || '-')],
                    ['workspace_root', String(linkedTaskDetail?.workspace_root || outputSummary.workspace_root || '-')],
                    ['output_root', String(outputSummary.output_root || '-')],
                    ['atomic_work_path', String(outputSummary.atomic_work_path || '-')],
                  ].map(([label, value]) =>`
                    <div class="task-info-row">
                      <span class="task-info-label">${this.esc(label)}</span>
                      <span class="task-info-value" style="white-space:pre-wrap;word-break:break-word">${this.esc(value)}</span>
                    </div>`).join('')}
                </div>
              </div>
              <div>
                <div class="text-muted" style="font-size:12px;font-weight:700;margin-bottom:6px">运行配置摘要</div>
                <pre class="run-command-pre" style="margin-top:0">${this.esc(JSON.stringify({
                  effective_config_summary: effectiveConfigSummary,
                  runtime_overrides: runtimeOverrides,
                  artifact_refs: artifactRefs,
                }, null, 2))}</pre>
              </div>
            </div>
          </details>` : ''}
        ${commandDisplay ?`
          <div class="run-command-block">
            <div class="run-command-title">
              <span>Pod 执行命令</span>
              <span>${this.esc(data.linked_execution_id || data.name || '')}</span>
            </div>
            <pre class="run-command-pre">${this.esc(commandDisplay)}</pre>
          </div>` :`
          <div class="run-command-block">
            <div class="run-command-title">Pod 执行命令</div>
            <div class="text-muted" style="margin-top:8px;font-size:12px">任务开始运行并产生 execution_started 事件后会显示完整命令。</div>
          </div>`}
        ${retryCommandDisplay ?`
          <div class="run-command-block">
            <div class="run-command-title">
              <span>重试 Run 命令</span>
              <span>${this.esc(data.linked_execution_id || data.name || '')}</span>
            </div>
            <pre class="run-command-pre">${this.esc(retryCommandDisplay)}</pre>
          </div>` : ''}
        ${this.taskActionButtons(data)}`;
    },

    renderTaskInfo(data: DataflowFileserverRunOverview) {
      const taskInfoCardHtml = this.buildTaskInfoCardHtml(data, { title: '任务 / Run 信息' });
      const taskInfoEl = this.$('taskInfoCard');
      if (taskInfoEl) {
        taskInfoEl.innerHTML = taskInfoCardHtml;
      }
      const taskOverviewEl = this.$('taskOverviewCard');
      if (taskOverviewEl) {
        taskOverviewEl.innerHTML = this.buildTaskInfoCardHtml(data, { title: '概览 / 任务信息' });
      }
    },

    renderOverview(data: DataflowFileserverRunOverview) {
      this.renderTaskInfo(data);
      this.renderScoreChart(data.cycles || []);
      this.renderVulnerabilityTrendCard(data.cycles || []);
      this.renderManifestCard(data.manifests || {});
      this.renderCycleTimeline(data.cycles || []);
    },

    renderManifestCard(manifests: Record<string, any>) {
      const el = this.$('manifestCard');
      if (!el) return;
      const m = manifests || {};
      const statusCounts = m.vulnerability_status_counts || {};
      const totalDiscovered = Number(m.total_result_files ?? statusCounts.total ?? 0);
      const activeCount = Number(m.active_result_count ?? 0);
      const confirmedCount = Number(statusCounts.confirmed ?? 0);
      const pendingReviewCount = Number(statusCounts.pending_review ?? 0);
      const falsePositiveCount = Number(statusCounts.false_positive ?? 0);
      const supplementalCount = Number(m.supplemental_result_count ?? 0);

      const manifestLinks = [
        ['result_relations_manifest', '结果关系'],
        ['results_manifest', '结果生命周期'],
        ['vulnerability_list', '漏洞状态列表'],
      ].map(([key, label]) => {
        const item = m[key] || {};
        const cls = item.exists ? 'text-success' : 'text-muted';
        return item.exists
          ?`<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(item.path)}">${label}</span>`
          :`<span class="${cls}">${label}: 缺失</span>`;
      }).join('');

      const secondaryPills = [`<span class="score-pill ${falsePositiveCount > 0 ? 'mid' : ''}">误报 ${falsePositiveCount}</span>`,
        supplementalCount > 0 ?`<span class="score-pill">补充产物 ${supplementalCount}</span>` : '',
      ].filter(Boolean).join('');

      el.innerHTML =`
      <div class="card-title">漏洞结果概况</div>
      <div class="manifest-grid">
        <div><span class="metric-num">${totalDiscovered}</span><span class="text-muted">累计发现</span></div>
        <div><span class="metric-num">${activeCount}</span><span class="text-muted">当前有效</span></div>
        <div><span class="metric-num">${confirmedCount}</span><span class="text-muted">已确认</span></div>
        <div><span class="metric-num">${pendingReviewCount}</span><span class="text-muted">待评审</span></div>
      </div>
      <div class="manifest-links">${manifestLinks}</div>
      ${secondaryPills ?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${secondaryPills}</div>` : ''}`;
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

      let svg =`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">`;
      for (let v = 0; v <= 1; v += 0.25) {
        const y = PADT + chartH * (1 - v);
        svg +=`<line x1="${PAD}" y1="${y}" x2="${W-PADR}" y2="${y}" stroke="#3b4261" stroke-width="0.5"/>`;
        svg +=`<text x="${PAD-4}" y="${y+4}" text-anchor="end" fill="#565f89" font-size="10">${v.toFixed(2)}</text>`;
      }
      cycles.forEach((c: any, i: number) => {
        const x = PAD + (n > 1 ? i * xStep : chartW / 2);
        svg +=`<text x="${x}" y="${H-6}" text-anchor="middle" fill="#565f89" font-size="10">C${c.cycle}</text>`;
      });
      scoreKeys.forEach((key: any, ki: number) => {
        const color = colors[ki % colors.length];
        const points = cycles.map((c: any, i: number) => {
          const x = PAD + (n > 1 ? i * xStep : chartW / 2);
          const v = Number(c.scores?.[key] ?? 0);
          const y = PADT + chartH * (1 - v);
          return`${x},${y}`;
        });
        svg +=`<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
        cycles.forEach((c: any, i: number) => {
          const x = PAD + (n > 1 ? i * xStep : chartW / 2);
          const v = Number(c.scores?.[key] ?? 0);
          const y = PADT + chartH * (1 - v);
          svg +=`<circle cx="${x}" cy="${y}" r="3" fill="${color}"><title>${key}: ${v.toFixed(2)} (Cycle ${c.cycle})</title></circle>`;
        });
      });
      svg += '</svg>';

      const legend = scoreKeys.map((key: any, ki: number) =>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px">` +`<span style="width:10px;height:3px;background:${colors[ki % colors.length]};border-radius:2px;display:inline-block"></span>` +`${this.esc(key)}</span>`
      ).join('');

      el.innerHTML =`<div class="card-title">分数趋势</div><div class="score-chart">${svg}</div><div style="margin-top:8px">${legend}</div>`;
    },

    renderVulnerabilityTrendCard(cycles: Record<string, any>[]) {
      const el = this.$('vulnTrendCard');
      if (!el) return;
      if (!cycles.length) {
        el.innerHTML = '<div class="card-title">漏洞发现总数趋势</div><div class="empty-state">暂无轮次数据</div>';
        return;
      }

      const normalized = [...cycles]
        .map((cycle: any, index: number) => ({
          cycle: Number(cycle?.cycle ?? index + 1),
          newCount: Math.max(0, Number(cycle?.new_result_count ?? (Array.isArray(cycle?.new_results) ? cycle.new_results.length : 0))),
        }))
        .sort((a, b) => a.cycle - b.cycle);

      let cumulative = 0;
      const trend = normalized.map((item) => {
        cumulative += item.newCount;
        return { ...item, cumulative };
      });

      const maxValue = Math.max(...trend.map((item) => item.cumulative), 0);
      const scaleMax = maxValue > 0 ? maxValue : 1;
      const tickCount = maxValue > 0 ? Math.min(maxValue, 4) : 1;
      const tickValues = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxValue * i) / tickCount)))];
      if (tickValues[0] !== 0) tickValues.unshift(0);
      if (tickValues[tickValues.length - 1] !== maxValue) tickValues.push(maxValue);

      const lineColor = '#f43f5e';
      const W = 500, H = 220, PAD = 40, PADR = 20, PADT = 30, PADB = 30;
      const chartW = W - PAD - PADR, chartH = H - PADT - PADB;
      const n = trend.length;
      const xStep = n > 1 ? chartW / (n - 1) : chartW;

      let svg =`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">`;
      tickValues.forEach((tick) => {
        const y = PADT + chartH * (1 - tick / scaleMax);
        svg +=`<line x1="${PAD}" y1="${y}" x2="${W-PADR}" y2="${y}" stroke="#3b4261" stroke-width="0.5"/>`;
        svg +=`<text x="${PAD-4}" y="${y+4}" text-anchor="end" fill="#565f89" font-size="10">${tick}</text>`;
      });
      trend.forEach((item, i) => {
        const x = PAD + (n > 1 ? i * xStep : chartW / 2);
        svg +=`<text x="${x}" y="${H-6}" text-anchor="middle" fill="#565f89" font-size="10">C${item.cycle}</text>`;
      });
      const points = trend.map((item, i) => {
        const x = PAD + (n > 1 ? i * xStep : chartW / 2);
        const y = PADT + chartH * (1 - item.cumulative / scaleMax);
        return { ...item, x, y };
      });
      svg +=`<polyline points="${points.map((item) =>`${item.x},${item.y}`).join(' ')}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round"/>`;
      points.forEach((item) => {
        svg +=`<circle cx="${item.x}" cy="${item.y}" r="3" fill="${lineColor}"><title>累计 ${item.cumulative} · 本轮新增 ${item.newCount} (Cycle ${item.cycle})</title></circle>`;
      });
      svg += '</svg>';

      const latest = trend[trend.length - 1] || { cumulative: 0, newCount: 0, cycle: 0 };
      const activeCycles = trend.filter((item) => item.newCount > 0).length;
      const summary = [`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px"><span style="width:10px;height:3px;background:${lineColor};border-radius:2px;display:inline-block"></span>累计发现数</span>`,`<span class="score-pill ${latest.cumulative > 0 ? 'high' : ''}">累计 ${latest.cumulative}</span>`,`<span class="score-pill ${latest.newCount > 0 ? 'high' : ''}">本轮 +${latest.newCount}</span>`,`<span class="score-pill">${activeCycles} 轮有新增</span>`,
      ].join('');
      const perCycle = trend.map((item) =>`<span class="score-pill ${item.newCount > 0 ? 'high' : ''}" title="Cycle ${item.cycle} 新增 ${item.newCount}">C${item.cycle} +${item.newCount}</span>`).join('');

      el.innerHTML =`<div class="card-title">漏洞发现总数趋势</div><div class="score-chart">${svg}</div><div style="margin-top:8px">${summary}</div>${perCycle ?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${perCycle}</div>` : ''}`;
    },


    renderCycleTimeline(cycles: Record<string, any>[]) {
      const el = this.$('cycleTimeline');
      if (!el) return;
      if (!cycles.length) { el.innerHTML = '<div class="card-title">评审轮次概况</div><div class="empty-state">暂无轮次数据</div>'; return; }

      const rows = cycles.map((c: any) => {
        const scorePills = Object.entries(c.scores || {}).map(([k, v]) => {
          const num = Number(v || 0);
          const cls = num >= 0.9 ? 'high' : num >= 0.7 ? 'mid' : 'low';
          return`<span class="score-pill ${cls}" title="${this.esc(k)}">${this.esc(k.substring(0, 18))}: ${num.toFixed(2)}</span>`;
        }).join('');
        const scope = c.global_failure_scope ?`<span class="score-pill low" title="当前卡点">卡点: ${this.esc(c.global_failure_scope)}</span>` : '';
        return`
        <div class="cycle-row">
          <div class="cycle-num">第 ${c.cycle} 轮</div>
          <div class="cycle-outcome">${this.outcomeBadge(c.outcome)}</div>
          <div class="cycle-scores">${scorePills}${scope}</div>
          <div class="cycle-issues">问题 ${c.issue_count ?? 0}</div>
        </div>`;
      }).join('');

      el.innerHTML =`<div class="card-title">评审轮次概况</div>${rows}`;
    },

    renderCycles(data: DataflowFileserverRunOverview) {
      const el = this.$('cyclesContainer');
      if (!el) return;
      const cycles = data.cycles || [];
      if (!cycles.length) { el.innerHTML = '<div class="empty-state">暂无轮次数据</div>'; return; }

      el.innerHTML = cycles.map((c: any) =>`
      <div class="accordion-header" data-action="toggle-cycle" data-run="${this.attr(data.name)}" data-cycle="${this.attr(c.cycle)}">
        <span class="arrow">▶</span>
        <span style="font-weight:600">Cycle ${c.cycle}</span>
        ${this.outcomeBadge(c.outcome)}
        <span class="text-muted" style="margin-left:auto;font-size:12px">
          Global: ${c.global_passed ? '✅' : '❌'}${c.global_failure_scope ?`/${this.esc(c.global_failure_scope)}` : ''} · Results: ${c.result_passed}/${c.result_total} · Removed: ${c.historical_removed_result_count || 0} · Issues: ${c.issue_count ?? 0}
        </span>
      </div>
      <div class="accordion-body" id="cycle-body-${c.cycle}">
        <div class="text-muted">加载中...</div>
      </div>`).join('');
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
        html +=`<div class="cycle-metrics">
        <span>scope: <strong>${this.esc(m.global_failure_scope || 'n/a')}</strong></span>
        <span>failed: ${m.current_failed_result_count ?? m.failed_result_count ?? 0}</span>
        <span>unreviewed: ${m.unreviewed_new_result_count ?? 0}</span>
        <span>removed: ${m.historical_removed_result_count ?? 0}</span>
      </div>`;
      }

      if ((data.global_reviews || []).length) {
        html += '<div class="card-title">全局评审</div>';
        html += (data.global_reviews || []).map((r: any) =>`
        <div class="review-card ${r.passed ? 'passed' : 'failed'}">
          <div class="review-header">
            <span class="review-advisor">${this.esc(r.advisor_id)}</span>
            <span class="text-muted">${this.esc(r.role_name)}</span>
            ${this.statusBadge(r.passed ? 'passed' : 'failed', 'badge-sm')}
            ${r.schema_valid === false ? '<span class="badge badge-sm" style="background:rgba(224,175,104,.15);color:#e0af68">schema repair ×' + r.repair_attempts + '</span>' : ''}
            ${r.parser_mode ?`<span class="badge badge-sm badge-mode">${this.esc(r.parser_mode)}</span>` : ''}
            ${r.path ?`<span class="action-link" data-action="open-file" data-run="${this.attr(runName)}" data-path="${this.attr(r.path)}">查看 JSON</span>` : ''}
          </div>
          <div class="review-feedback">${this.esc(r.feedback || r.feedback_detail || '').substring(0, 500)}</div>
          <div class="review-scores">
            ${Object.entries(r.scores || {}).map(([k,v]) => {
              const num = Number(v || 0);
              const cls = num >= 0.9 ? 'high' : num >= 0.7 ? 'mid' : 'low';
              return`<span class="score-pill ${cls}">${this.esc(k)}: ${num.toFixed(2)}</span>`;
            }).join('')}
          </div>
          ${(r.issues || []).length ?`<div class="mt-8">${r.issues.map((b: any) =>`<div class="issue-item"><span class="issue-id">${this.esc(b.id||'')}</span> ${this.esc(b.required_action||b.detail||'')}</div>`
          ).join('')}</div>` : ''}
        </div>`).join('');
      }

      if ((data.result_reviews || []).length) {
        html += '<div class="card-title mt-8">结果评审</div>';
        html += (data.result_reviews || []).map((r: any) =>`
        <div class="review-card ${r.passed ? 'passed' : 'failed'}">
          <div class="review-header">
            <span class="review-advisor mono">${this.esc(r.result_file)}</span>
            ${this.verdictBadge(r.verdict)}
            <span class="text-muted">conf: ${(r.confidence || 0).toFixed(2)}</span>
            ${r.schema_valid === false ? '<span class="badge badge-sm" style="background:rgba(224,175,104,.15);color:#e0af68">repair ×' + r.repair_attempts + '</span>' : ''}
            ${r.parser_mode ?`<span class="badge badge-sm badge-mode">${this.esc(r.parser_mode)}</span>` : ''}
            ${r.path ?`<span class="action-link" data-action="open-file" data-run="${this.attr(runName)}" data-path="${this.attr(r.path)}">查看 JSON</span>` : ''}
          </div>
          <div class="review-feedback">${this.esc(r.feedback_detail || r.feedback || '').substring(0, 500)}</div>
        </div>`).join('');
      }

      if (data.summary_snapshot) {
        html +=`<div class="card-title mt-8">Summary 快照</div>`;
        html +=`<div class="card" style="max-height:300px;overflow-y:auto;font-size:12px">${this.renderMarkdown(data.summary_snapshot).substring(0, 5000)}</div>`;
      }

      el.innerHTML = html || '<div class="text-muted">无评审数据</div>';
    },

    renderResults(data: DataflowFileserverRunOverview) {
      const el = this.$('resultsContainer');
      if (!el) return;
      const activeResults = data.results || [];
      const removedResults = data.removed_results || [];
      if (!activeResults.length && !removedResults.length) { el.innerHTML = '<div class="empty-state">暂无漏洞结果</div>'; return; }
      const selected = this.syncResultSelection(data);
      const selectedSet = new Set(selected);
      const selectableFiles = this.activeResultFiles(data);
      const allSelected = selectableFiles.length > 0 && selected.length === selectableFiles.length;
      const feedback = this._resultReportFeedbackByRun[String(data.name || '')] || null;
      const reportDisabled = this._resultReportBusy || !data.linked_task_id || !data.linked_execution_id;
      const toolbarHtml =`
      <div class="result-toolbar">
        <div class="result-toolbar-head">
          <div>
            <div class="result-toolbar-title">漏洞上报到漏洞引擎</div>
            <div class="result-toolbar-desc">支持多选结果文件，批量将当前 Run 发现的问题作为漏洞上报；“一键上报全部”会直接上报当前所有有效问题。</div>
          </div>
          <div class="result-toolbar-meta">
            <span>可上报 ${selectableFiles.length}</span>
            <span>已选 ${selected.length}</span>
            <span>${data.linked_task_id && data.linked_execution_id ? '已关联受管任务' : '未关联任务，暂不可上报'}</span>
          </div>
        </div>
        <div class="result-toolbar-actions">
          <label class="btn btn-sm" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" data-action="select-all-results" ${allSelected ? 'checked' : ''} ${!selectableFiles.length ? 'disabled' : ''} />
            <span>全选</span>
          </label>
          <button class="btn btn-sm" type="button" data-action="clear-result-selection" ${!selected.length ? 'disabled' : ''}>清空选择</button>
          <button class="btn btn-sm" type="button" data-action="report-selected-results" ${reportDisabled || !selected.length ? 'disabled' : ''}>上报已选</button>
          <button class="btn btn-sm" type="button" data-action="report-all-results" ${reportDisabled || !selectableFiles.length ? 'disabled' : ''}>一键上报全部</button>
        </div>
        ${feedback ?`<div class="result-feedback ${this.attr(feedback.tone)}">${this.esc(feedback.message)}</div>` : ''}
      </div>`;

      const activeHtml = activeResults.map((r: any) =>`
      <div class="result-card ${selectedSet.has(String(r.filename || '')) ? 'selected' : ''}" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.path || ('results/' + r.filename))}">
        <div class="result-select-row">
          <label class="result-select-box" title="选择该问题用于批量上报" onclick="event.stopPropagation()">
            <input type="checkbox" data-action="toggle-result-selection" data-result-file="${this.attr(r.filename)}" ${selectedSet.has(String(r.filename || '')) ? 'checked' : ''} />
          </label>
          <div class="result-main">
            <div class="result-header">
              <span class="result-name">${this.esc(r.filename)}</span>
              ${this.verdictBadge(r.verdict)}
              ${this.lifecycleBadge(r)}
              ${r.multi_finding ? '<span class="badge badge-sm badge-warning">multi-finding</span>' : ''}
              <span class="result-verdict text-muted">conf: ${(r.confidence || 0).toFixed(2)} · cycle ${r.review_cycle}</span>
              <span class="result-title">${this.esc(r.title || '')}</span>
              ${r.related_to ?`<span class="text-muted">related: ${this.esc(r.related_to)}</span>` : ''}
              ${r.review_path ?`<span class="action-link" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.review_path)}">评审 JSON</span>` : ''}
            </div>
            <div class="review-feedback mt-8">${this.esc(r.feedback_detail || r.feedback || '').substring(0, 260)}</div>
          </div>
        </div>
      </div>`).join('');

      const removedHtml = removedResults.length ?`
      <div class="card-title mt-8">已迁移/撤回结果</div>
      ${removedResults.map((r: any) =>`
        <div class="result-card result-card-muted" ${r.path ?`data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.path)}"` : ''}>
          <div class="result-header">
            <span class="result-name">${this.esc(r.filename)}</span>
            <span class="badge badge-sm badge-failed">${this.esc(r.lifecycle_status || 'inactive')}</span>
            <span class="text-muted">cycle ${r.cycle || '-'}</span>
            ${r.meta_path ?`<span class="action-link" data-action="open-file" data-run="${this.attr(data.name)}" data-path="${this.attr(r.meta_path)}">迁移 JSON</span>` : ''}
          </div>
          <div class="review-feedback mt-8">${this.esc(r.reason || '').substring(0, 260)}</div>
        </div>`).join('')}` : '';

      el.innerHTML = toolbarHtml + activeHtml + removedHtml;
    },

    async loadSessions(force = false) {
      if (!this.currentRun) return;
      const runName = this.currentRun;
      const runCache = this.getRunCache(runName);
      const el = this.$('sessionsContainer');
      if (!el) return;
      if (!force && this.sessionBrowser.selectedRun === runName && this.sessionBrowser.selectedPath && this._sessionSocket) {
        this.renderSessions(runCache.sessions || []);
        return;
      }
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

    getSessionPath(session: DataflowFileserverRunSession) {
      return String((session as any).jsonl_path || '');
    },

    getJsonlSessions(sessions: DataflowFileserverRunSession[]) {
      return sessions
        .filter((s: any) => (s.format === 'jsonl' || s.format === 'hybrid') && this.getSessionPath(s))
        .sort((a: any, b: any) => Number(b.mtime || 0) - Number(a.mtime || 0));
    },

    getSessionDisplayName(session: Record<string, any>) {
      const path = String(session.jsonl_path || '');
      const basename = path.split('/').filter(Boolean).pop() || '';
      return String(session.display_name || session.worker_id || basename || session.session_id || 'Session');
    },

    tracePhaseMeta(phase: string) {
      const key = String(phase || 'other').toLowerCase().replace(/-/g, '_');
      const map: Record<string, { label: string; shortLabel: string; order: number; cls: string }> = {
        worker: { label: 'Worker 漏洞挖掘', shortLabel: 'Worker', order: 10, cls: 'worker' },
        reflect: { label: 'Worker 自审', shortLabel: '自审', order: 20, cls: 'reflect' },
        summary: { label: '汇总/收敛', shortLabel: '汇总', order: 30, cls: 'summary' },
        global_review: { label: '全局评审', shortLabel: '全局评审', order: 40, cls: 'global-review' },
        result_review: { label: '结果评审', shortLabel: '结果评审', order: 50, cls: 'result-review' },
        review: { label: '评审', shortLabel: '评审', order: 45, cls: 'review' },
        other: { label: '其他调用', shortLabel: '其他', order: 90, cls: 'other' },
      };
      return map[key] || map.other;
    },

    normalizeTracePhase(...values: any[]) {
      const text = values.map((value) => String(value || '')).join(' ').toLowerCase().replace(/-/g, '_');
      if (text.includes('result_review') || (text.includes('result') && text.includes('review'))) return 'result_review';
      if (text.includes('global_review') || (text.includes('global') && text.includes('review'))) return 'global_review';
      if (text.includes('reflect') || text.includes('reflection')) return 'reflect';
      if (text.includes('summary') || text.includes('summar')) return 'summary';
      if (text.includes('worker') || text.includes('vuln_scan') || text.includes('vulnerability')) return 'worker';
      if (text.includes('review')) return 'review';
      return 'other';
    },

    extractTraceCycle(...values: any[]) {
      const text = values.map((value) => String(value || '')).join(' ');
      const patterns = [
        /cycle[_\-\s]?(\d+)/i,
        /cycle(\d+)/i,
        /第\s*(\d+)\s*轮/,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const value = Number(match[1]);
          if (Number.isFinite(value) && value > 0) return value;
        }
      }
      return 0;
    },

    traceCycleLabel(cycle: number) {
      const value = Number(cycle || 0);
      return value > 0 ?`第 ${String(value).padStart(3, '0')} 轮` : '轮次未知';
    },

    traceEpoch(value: any) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1_000_000_000_000 ? value / 1000 : value;
      }
      const parsed = Date.parse(String(value || ''));
      return Number.isFinite(parsed) ? parsed / 1000 : 0;
    },

    fmtTraceDuration(seconds: number) {
      const value = Math.max(0, Math.floor(Number(seconds) || 0));
      if (value <= 0) return '0s';
      return this.fmtDuration(value);
    },

    traceTiming(record: Record<string, any> | null | undefined) {
      const payload = record && typeof record === 'object' ? record : {};
      const startedEpoch = this.traceEpoch(payload.started_epoch ?? payload.started_at);
      const finishedEpoch = this.traceEpoch(payload.finished_epoch ?? payload.finished_at);
      const durationSecondsRaw = Number(payload.duration_seconds);
      const durationMsRaw = Number(payload.duration_ms);
      const elapsedSecondsRaw = Number(payload.elapsed_seconds);
      const status = String(payload.status || '').toLowerCase();
      const running = !!payload.running || (
        ['started', 'running'].includes(status)
        && startedEpoch > 0
        && finishedEpoch <= 0
      );
      let seconds = 0;
      if (Number.isFinite(durationSecondsRaw) && durationSecondsRaw >= 0 && payload.duration_seconds !== undefined) {
        seconds = Math.floor(durationSecondsRaw);
      } else if (Number.isFinite(durationMsRaw) && durationMsRaw >= 0 && payload.duration_ms !== undefined) {
        seconds = Math.floor(durationMsRaw / 1000);
      } else if (finishedEpoch > 0 && startedEpoch > 0 && finishedEpoch >= startedEpoch) {
        seconds = Math.floor(finishedEpoch - startedEpoch);
      } else if (running && startedEpoch > 0) {
        seconds = Math.floor(Date.now() / 1000 - startedEpoch);
      } else if (running && Number.isFinite(elapsedSecondsRaw) && elapsedSecondsRaw >= 0 && payload.elapsed_seconds !== undefined) {
        seconds = Math.floor(elapsedSecondsRaw);
      }
      const hasTiming = (
        startedEpoch > 0
        || finishedEpoch > 0
        || payload.duration_seconds !== undefined
        || payload.duration_ms !== undefined
        || payload.elapsed_seconds !== undefined
      );
      return {
        hasTiming,
        running,
        startedEpoch,
        finishedEpoch,
        seconds: Math.max(0, seconds),
      };
    },

    traceDurationLabel(timing: Record<string, any> | null | undefined) {
      if (!timing || !timing.hasTiming) return '-';
      return`${timing.running ? '已运行' : '耗时'} ${this.fmtTraceDuration(Number(timing.seconds || 0))}`;
    },

    traceDurationLiveAttrs(timing: Record<string, any> | null | undefined) {
      if (!timing || !timing.running || !timing.startedEpoch) return '';
      return` data-live-duration-start="${this.attr(String(timing.startedEpoch))}" data-live-duration-prefix="已运行"`;
    },

    renderTraceDuration(timing: Record<string, any> | null | undefined, className = 'execution-step-duration') {
      return`<span class="${this.attr(className)}"${this.traceDurationLiveAttrs(timing)}>${this.esc(this.traceDurationLabel(timing))}</span>`;
    },

    getRunCycleTimingMap() {
      const data = (this.currentRunData || {}) as Record<string, any>;
      const raw = data.raw && typeof data.raw === 'object' ? data.raw : {};
      const timing = data.cycle_timing && typeof data.cycle_timing === 'object'
        ? data.cycle_timing
        : raw.cycle_timing;
      return timing && typeof timing === 'object' ? timing : {};
    },

    getTraceCycleTiming(cycle: number, items: Record<string, any>[] = []) {
      const key = String(Number(cycle || 0));
      const timingMap = this.getRunCycleTimingMap();
      const backendTiming = timingMap[key] || timingMap[String(cycle).padStart(3, '0')];
      if (backendTiming && typeof backendTiming === 'object') {
        return this.traceTiming(backendTiming);
      }
      const timings = items
        .map((item: any) => item?.timing)
        .filter((timing: any) => timing && timing.hasTiming && timing.startedEpoch > 0);
      if (!timings.length) return this.traceTiming(null);
      const startedEpoch = Math.min(...timings.map((timing: any) => Number(timing.startedEpoch || 0)).filter((value: number) => value > 0));
      const running = timings.some((timing: any) => timing.running);
      const finishedEpochs = timings.map((timing: any) => Number(timing.finishedEpoch || 0)).filter((value: number) => value > 0);
      const finishedEpoch = finishedEpochs.length ? Math.max(...finishedEpochs) : 0;
      const seconds = running
        ? Math.floor(Date.now() / 1000 - startedEpoch)
        : (finishedEpoch > 0 ? Math.floor(finishedEpoch - startedEpoch) : 0);
      return {
        hasTiming: true,
        running,
        startedEpoch,
        finishedEpoch,
        seconds: Math.max(0, seconds),
      };
    },

    getRunCurrentStep() {
      const data = (this.currentRunData || {}) as Record<string, any>;
      const raw = data.raw && typeof data.raw === 'object' ? data.raw : {};
      const step = data.current_step && typeof data.current_step === 'object'
        ? data.current_step
        : raw.current_step;
      return step && typeof step === 'object' && Object.keys(step).length ? step : null;
    },

    getRunStepHistory() {
      const data = (this.currentRunData || {}) as Record<string, any>;
      const raw = data.raw && typeof data.raw === 'object' ? data.raw : {};
      const history = Array.isArray(data.step_history) ? data.step_history : raw.step_history;
      return Array.isArray(history) ? history.filter((item: any) => item && typeof item === 'object') : [];
    },

    humanizeTraceStepKey(phase: string, stepKey: string, extra: Record<string, any> = {}) {
      const raw = String(stepKey || '').trim();
      const normalizedPhase = this.normalizeTracePhase(phase, raw);
      if (!raw) {
        return this.tracePhaseMeta(normalizedPhase).label;
      }
      const parts = raw.split('::').map((part) => part.trim()).filter(Boolean);
      if (normalizedPhase === 'worker') {
        return raw === 'worker'
          ? (extra.worker_prompt_kind === 'rework' ? 'Worker 返工分析' : 'Worker 主分析')
          : raw;
      }
      if (normalizedPhase === 'reflect') {
        const promptId = parts[1] || parts[0] || raw;
        const passMatch = raw.match(/pass[_-]?(\d+)/i);
        const passText = passMatch ?`Pass ${Number(passMatch[1])}` : '自审';
        return`${passText} · ${promptId}`;
      }
      if (normalizedPhase === 'summary') {
        return 'Summary 汇总与结果写入';
      }
      if (normalizedPhase === 'global_review') {
        const advisor = parts[1] || raw.replace(/^global::?/i, '') || String(extra.advisor_instance_id || '');
        const attempt = Number(extra.attempt || 0);
        return`全局评审 · ${advisor || 'advisor'}${attempt > 1 ?` · attempt ${attempt}` : ''}`;
      }
      if (normalizedPhase === 'result_review') {
        const resultFile = parts[1] || String(extra.result_file || '');
        const advisor = parts[2] || String(extra.advisor_instance_id || '');
        const attempt = Number(extra.attempt || 0);
        return`结果评审 · ${resultFile || 'result'}${advisor ?` · ${advisor}` : ''}${attempt > 1 ?` · attempt ${attempt}` : ''}`;
      }
      return raw.replace(/_/g, ' ');
    },

    inferTraceStepLabel(phase: string, text: string, call?: Record<string, any>) {
      const normalizedPhase = this.normalizeTracePhase(phase, text);
      const raw = String(text || '');
      if (normalizedPhase === 'worker') {
        const match = raw.match(/vuln[_-]?scan[_-]?(.+?)(?:[_-]?cycle|\bcycle|$)/i);
        if (match && match[1]) {
          return`漏洞挖掘 · ${match[1].replace(/[_-]+$/g, '').replace(/_/g, ' ')}`;
        }
        const turn = Number(call?.turn || 0);
        if (turn === 1) return 'Worker 主分析';
        if (turn > 1) return`Worker 续写 #${turn}`;
        return '漏洞挖掘主阶段';
      }
      if (normalizedPhase === 'global_review') {
        const match = raw.match(/global[_-]review[_-]cycle[_-]?\d+[_-]?(.+)?$/i);
        return match && match[1] ?`全局评审 · ${match[1]}` : '全局评审';
      }
      if (normalizedPhase === 'result_review') {
        const match = raw.match(/result[_-]review[_-]cycle[_-]?\d+[_-]?(.+)?$/i);
        return match && match[1] ?`结果评审 · ${match[1]}` : '结果评审';
      }
      if (normalizedPhase === 'summary') return 'Summary 汇总与结果写入';
      if (normalizedPhase === 'reflect') return 'Worker 自审';
      return this.tracePhaseMeta(normalizedPhase).label;
    },

    getCheckpointExecutionMeta(step: Record<string, any>, index = 0) {
      const extra = step.extra && typeof step.extra === 'object' ? step.extra : {};
      const phase = this.normalizeTracePhase(step.phase, step.step_key);
      const phaseMeta = this.tracePhaseMeta(phase);
      const cycle = Number(step.cycle || this.extractTraceCycle(step.path, step.step_key) || 0);
      const timestamp = this.traceEpoch(step.timestamp) || Number(step.mtime || 0);
      const stepLabel = this.humanizeTraceStepKey(phase, String(step.step_key || ''), extra);
      const status = String(step.status || 'unknown').toLowerCase();
      const timing = this.traceTiming(step);
      const detailParts = [
        step.agent_id ?`agent=${step.agent_id}` : '',
        step.session_id ?`session=${step.session_id}` : '',
        extra.result_file ?`result=${extra.result_file}` : '',
        step.detail ? String(step.detail).slice(0, 120) : '',
      ].filter(Boolean);
      return {
        id:`checkpoint:${step.path || step.step_key || index}:${status}`,
        kind: 'checkpoint',
        cycle,
        cycleLabel: this.traceCycleLabel(cycle),
        phase,
        phaseLabel: phaseMeta.label,
        phaseShortLabel: phaseMeta.shortLabel,
        phaseOrder: phaseMeta.order,
        phaseClass: phaseMeta.cls,
        stepKey: String(step.step_key || ''),
        stepLabel,
        status,
        timestamp,
        timestampLabel: timestamp ? this.fmtDate(timestamp) : String(step.timestamp || '-'),
        sessionId: String(step.session_id || ''),
        agentId: String(step.agent_id || ''),
        callId: '',
        turn: 0,
        turnCount: Number(extra.turn_count || step.turn_count || 0),
        model: '',
        thinking: '',
        detail: detailParts.join(' · '),
        timing,
        raw: step,
      };
    },

    executionTraceItemKey(item: Record<string, any>) {
      const raw = item && typeof item.raw === 'object' ? item.raw : {};
      const nodeId = String(raw.node_id || item.nodeId || '').trim();
      if (nodeId) return`node:${nodeId}`;
      const stepKey = String(raw.step_key || item.stepKey || '').trim();
      const cycle = Number(item.cycle || raw.cycle || 0);
      const phase = String(item.phase || raw.phase || '').trim();
      const sessionId = String(item.sessionId || raw.session_id || '').trim();
      const agentId = String(item.agentId || raw.agent_id || '').trim();
      if (cycle > 0 || phase || sessionId || agentId || stepKey) {
        return`trace:${cycle}:${phase}:${stepKey}:${sessionId}:${agentId}`;
      }
      const path = String(raw.path || raw.relative_path || item.path || '').trim();
      if (path) return`path:${path}`;
      return String(item.id || '').trim();
    },

    mergeExecutionTraceItems(existing: Record<string, any>, incoming: Record<string, any>) {
      if (!existing) return incoming;
      if (!incoming) return existing;
      const existingTs = Number(existing.timestamp || 0);
      const incomingTs = Number(incoming.timestamp || 0);
      const existingStatus = String(existing.status || '').toLowerCase();
      const incomingStatus = String(incoming.status || '').toLowerCase();
      const activeStatuses = new Set(['pending', 'queued', 'started', 'running', 'retrying']);
      const preferIncoming =
        (activeStatuses.has(incomingStatus) && !activeStatuses.has(existingStatus))
        || incomingTs > existingTs
        || (incomingTs === existingTs && activeStatuses.has(incomingStatus));
      const primary = preferIncoming ? incoming : existing;
      const secondary = preferIncoming ? existing : incoming;
      return {
        ...secondary,
        ...primary,
        id: existing.id || incoming.id,
        raw: primary.raw || secondary.raw || {},
        timestamp: preferIncoming ? incoming.timestamp : existing.timestamp,
        timestampLabel: preferIncoming ? incoming.timestampLabel : existing.timestampLabel,
        timing: preferIncoming ? incoming.timing : existing.timing,
      };
    },

    collapseExecutionTraceItems(items: Record<string, any>[]) {
      const byKey = new Map<string, Record<string, any>>();
      for (const item of items) {
        if (!item) continue;
        const key = this.executionTraceItemKey(item) || String(item.id || '');
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, item);
          continue;
        }
        byKey.set(key, this.mergeExecutionTraceItems(existing, item));
      }
      return Array.from(byKey.values());
    },

    getSessionExecutionMeta(session: Record<string, any>) {
      const name = this.getSessionDisplayName(session);
      const text = [
        name,
        session.session_id,
        session.worker_id,
        session.stage_group,
        session.role_name,
        session.jsonl_path,
      ].join(' ');
      const phase = this.normalizeTracePhase(text);
      const phaseMeta = this.tracePhaseMeta(phase);
      const cycle = this.extractTraceCycle(text);
      const stepLabel = this.inferTraceStepLabel(phase, text);
      return {
        id:`session:${session.session_id || session.jsonl_path || name}`,
        kind: 'session',
        cycle,
        cycleLabel: this.traceCycleLabel(cycle),
        phase,
        phaseLabel: phaseMeta.label,
        phaseShortLabel: phaseMeta.shortLabel,
        phaseOrder: phaseMeta.order,
        phaseClass: phaseMeta.cls,
        stepLabel,
        status: 'recorded',
        timestamp: Number(session.mtime || 0),
        timestampLabel: this.fmtDate(Number(session.mtime || 0)),
        sessionId: String(session.session_id || ''),
        agentId: String(session.worker_id || session.role_name || ''),
        callId: '',
        turn: 0,
        model: String(session.model || session.raw_model || ''),
        thinking: String(session.thinking || ''),
        detail: String(session.jsonl_path || session.session_id || ''),
        timing: this.traceTiming(null),
        raw: session,
      };
    },

    getCallExecutionMeta(session: Record<string, any>, call: Record<string, any>, options: Record<string, any> = {}) {
      const sessionMeta = this.getSessionExecutionMeta(session);
      const currentStep = this.getRunCurrentStep();
      const sessionId = String(session.session_id || call.session_id || call.effective_session_id || '');
      let phase = sessionMeta.phase;
      let stepLabel = sessionMeta.stepLabel;
      if (
        options.isLatestInSession
        && this.isRunActive()
        && currentStep
        && String(currentStep.session_id || '') === sessionId
      ) {
        const checkpointMeta = this.getCheckpointExecutionMeta(currentStep);
        phase = checkpointMeta.phase;
        stepLabel = checkpointMeta.stepLabel;
      } else if (phase === 'worker') {
        stepLabel = this.inferTraceStepLabel(phase,`${sessionMeta.detail} ${sessionMeta.sessionId}`, call);
      } else if (Number(call.turn || 0) > 1 && (phase === 'global_review' || phase === 'result_review')) {
        stepLabel =`${stepLabel} · schema 修复/续问 #${Number(call.turn || 0)}`;
      }
      const phaseMeta = this.tracePhaseMeta(phase);
      const cycle = sessionMeta.cycle || this.extractTraceCycle(sessionId, call.call_id, call.call_dir);
      const status = String(call.status || 'unknown').toLowerCase();
      const timestamp = Number(call.mtime || session.mtime || 0) + (Number(call.turn || 0) / 100000);
      const files = call.files && typeof call.files === 'object' ? call.files : {};
      return {
        ...sessionMeta,
        id:`call:${sessionId}:${call.call_id || call.turn || ''}`,
        kind: 'call',
        cycle,
        cycleLabel: this.traceCycleLabel(cycle),
        phase,
        phaseLabel: phaseMeta.label,
        phaseShortLabel: phaseMeta.shortLabel,
        phaseOrder: phaseMeta.order,
        phaseClass: phaseMeta.cls,
        stepLabel,
        status,
        timestamp,
        timestampLabel: this.fmtDate(Number(session.mtime || 0)),
        sessionId,
        agentId: String(call.agent_id || sessionMeta.agentId || ''),
        callId: String(call.call_id || ''),
        turn: Number(call.turn || 0),
        detail: String(call.call_dir || call.effective_session_id || sessionId || ''),
        promptUserPath: String(files.user_prompt || ''),
        promptSystemPath: String(files.system_prompt || ''),
        promptRequestPath: String(files.request || ''),
        raw: call,
      };
    },

    promptFilesForExecutionItem(item: Record<string, any>) {
      const files: Array<{ label: string; path: string; kind: 'user' | 'system' }> = [];
      const userPath = String(item.promptUserPath || '').trim();
      const systemPath = String(item.promptSystemPath || '').trim();
      if (userPath) files.push({ label: 'Prompt', path: userPath, kind: 'user' });
      if (systemPath && systemPath !== userPath) files.push({ label: 'System', path: systemPath, kind: 'system' });
      return files;
    },

    primaryPromptFileForExecutionItem(item: Record<string, any>) {
      const files = this.promptFilesForExecutionItem(item);
      return files.find((entry) => entry.kind === 'user') || files[0] || null;
    },

    attachPromptInfoToExecutionItem(item: Record<string, any>, source: Record<string, any> | null | undefined) {
      if (!item || !source) return item;
      const nextUserPath = String(item.promptUserPath || source.promptUserPath || '').trim();
      const nextSystemPath = String(item.promptSystemPath || source.promptSystemPath || '').trim();
      const nextRequestPath = String(item.promptRequestPath || source.promptRequestPath || '').trim();
      if (!nextUserPath && !nextSystemPath && !nextRequestPath) return item;
      return {
        ...item,
        promptUserPath: nextUserPath,
        promptSystemPath: nextSystemPath,
        promptRequestPath: nextRequestPath,
      };
    },

    executionItemTurnCount(item: Record<string, any>) {
      const raw = item && typeof item === 'object' ? item.raw : null;
      const extra = raw && raw.extra && typeof raw.extra === 'object' ? raw.extra : {};
      const value = Number(item?.turnCount ?? raw?.turn_count ?? extra?.turn_count ?? 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    },

    bestPromptSourceForExecutionItem(
      item: Record<string, any>,
      indexes: {
        bySessionId: Map<string, Record<string, any>>;
        bySessionCalls: Map<string, Record<string, any>[]>;
        byCyclePhaseAgent: Map<string, Record<string, any>>;
        byCyclePhase: Map<string, Record<string, any>>;
      },
      options: { turnFloor?: number } = {}
    ) {
      const sessionId = String(item.sessionId || '').trim();
      const turnFloor = Math.max(0, Number(options.turnFloor || 0));
      const turnCount = this.executionItemTurnCount(item);
      if (sessionId) {
        const sessionCalls = indexes.bySessionCalls.get(sessionId) || [];
        if (sessionCalls.length) {
          const inRange = sessionCalls.filter((call: any) => {
            const turn = Number(call.turn || 0);
            if (!Number.isFinite(turn) || turn <= 0) return false;
            if (turnCount > 0) return turn > turnFloor && turn <= turnCount;
            return turn > turnFloor;
          });
          const preferred = inRange.find((call: any) => call.promptUserPath || call.promptSystemPath)
            || inRange[0]
            || (turnCount > 0 ? sessionCalls.find((call: any) => Number(call.turn || 0) === turnCount && (call.promptUserPath || call.promptSystemPath)) : null)
            || sessionCalls.find((call: any) => (call.promptUserPath || call.promptSystemPath))
            || sessionCalls[0];
          if (preferred) return preferred;
        }
        if (indexes.bySessionId.has(sessionId)) {
          return indexes.bySessionId.get(sessionId) || null;
        }
      }
      const cycle = Number(item.cycle || 0);
      const phase = String(item.phase || '').trim();
      const agentId = String(item.agentId || '').trim();
      const cyclePhaseAgentKey =`${cycle}::${phase}::${agentId}`;
      if (cycle > 0 && phase && agentId && indexes.byCyclePhaseAgent.has(cyclePhaseAgentKey)) {
        return indexes.byCyclePhaseAgent.get(cyclePhaseAgentKey) || null;
      }
      const cyclePhaseKey =`${cycle}::${phase}`;
      if (cycle > 0 && phase && indexes.byCyclePhase.has(cyclePhaseKey)) {
        return indexes.byCyclePhase.get(cyclePhaseKey) || null;
      }
      return null;
    },

    renderExecutionPromptPreview(item: Record<string, any>, runName = this.currentRun || '') {
      const files = this.promptFilesForExecutionItem(item);
      if (!files.length) {
        return '<div class="execution-prompt-empty">未记录 Prompt</div>';
      }
      const primary = this.primaryPromptFileForExecutionItem(item);
      if (!primary) {
        return '<div class="execution-prompt-empty">未记录 Prompt</div>';
      }
      this.ensurePromptPreview(String(runName || ''), primary.path);
      const state = this.promptPreviewState(String(runName || ''), primary.path);
      const tagsHtml = files.map((file) =>`
        <button type="button" class="execution-prompt-tag ${this.attr(file.kind)}" data-action="open-file" data-run="${this.attr(runName)}" data-path="${this.attr(file.path)}">
          ${this.esc(file.label)}
        </button>`).join('');
      return`
        <div class="execution-step-prompt">
          <div class="execution-prompt-tags">${tagsHtml}</div>
          <button
            type="button"
            class="execution-prompt-preview${state.loading ? ' loading' : ''}${state.error ? ' error' : ''}"
            data-action="open-file"
            data-run="${this.attr(runName)}"
            data-path="${this.attr(primary.path)}"
            data-prompt-preview-button="${this.attr(primary.path)}"
          >
            <span class="execution-prompt-preview-label">${this.esc(primary.label)} 预览</span>
            <span class="execution-prompt-preview-body${state.loading ? ' loading' : ''}${state.error ? ' error' : ''}" data-prompt-preview-path="${this.attr(primary.path)}">${this.esc(state.text)}</span>
          </button>
        </div>`;
    },

    buildExecutionTraceModel(
      sessions: DataflowFileserverRunSession[],
      jsonlSessions: DataflowFileserverRunSession[],
      callSessions: DataflowFileserverRunSession[],
    ) {
      const stepHistory = this.getRunStepHistory();
      const currentStep = this.getRunCurrentStep();
      let checkpointItems = stepHistory.map((step: any, index: number) => this.getCheckpointExecutionMeta(step, index));
      if (currentStep) {
        const currentMeta = this.getCheckpointExecutionMeta(currentStep, checkpointItems.length);
        const currentKey = this.executionTraceItemKey(currentMeta);
        const currentIndex = checkpointItems.findIndex((item: any) => this.executionTraceItemKey(item) === currentKey);
        if (currentIndex >= 0) {
          checkpointItems[currentIndex] = this.mergeExecutionTraceItems(checkpointItems[currentIndex], currentMeta);
        } else {
          checkpointItems.push(currentMeta);
        }
      }
      checkpointItems = this.collapseExecutionTraceItems(checkpointItems);
      let sessionItems = jsonlSessions.map((session: any) => this.getSessionExecutionMeta(session));
      const callItems = callSessions.flatMap((session: any) => {
        const calls = Array.isArray(session.calls) ? session.calls : [];
        const latestTurn = calls.reduce((max: number, call: any) => Math.max(max, Number(call.turn || 0)), 0);
        return calls.map((call: any) =>
          this.getCallExecutionMeta(session, call, { isLatestInSession: Number(call.turn || 0) === latestTurn })
        );
      });

      const callIndexes = {
        bySessionId: new Map<string, Record<string, any>>(),
        bySessionCalls: new Map<string, Record<string, any>[]>(),
        byCyclePhaseAgent: new Map<string, Record<string, any>>(),
        byCyclePhase: new Map<string, Record<string, any>>(),
      };
      const upsertPromptSource = (map: Map<string, Record<string, any>>, key: string, value: Record<string, any>) => {
        if (!key) return;
        const existing = map.get(key);
        if (!existing || Number(value.timestamp || 0) >= Number(existing.timestamp || 0)) {
          map.set(key, value);
        }
      };
      callItems.forEach((item: any) => {
        if (!item) return;
        if (item.sessionId) {
          if (!callIndexes.bySessionCalls.has(String(item.sessionId))) {
            callIndexes.bySessionCalls.set(String(item.sessionId), []);
          }
          callIndexes.bySessionCalls.get(String(item.sessionId))?.push(item);
          upsertPromptSource(callIndexes.bySessionId, String(item.sessionId), item);
        }
        if (item.cycle && item.phase && item.agentId) {
          upsertPromptSource(callIndexes.byCyclePhaseAgent,`${item.cycle}::${item.phase}::${item.agentId}`, item);
        }
        if (item.cycle && item.phase) {
          upsertPromptSource(callIndexes.byCyclePhase,`${item.cycle}::${item.phase}`, item);
        }
      });
      callIndexes.bySessionCalls.forEach((items, key) => {
        items.sort((a: any, b: any) => {
          const turnDelta = Number(a.turn || 0) - Number(b.turn || 0);
          if (turnDelta !== 0) return turnDelta;
          return Number(a.timestamp || 0) - Number(b.timestamp || 0);
        });
        const preferred = items.find((entry: any) => entry.promptUserPath || entry.promptSystemPath) || items[0] || null;
        if (preferred) callIndexes.bySessionId.set(key, preferred);
      });
      const orderedCheckpointItems = checkpointItems.slice().sort((a: any, b: any) => {
        if (a.cycle !== b.cycle) return a.cycle - b.cycle;
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
      const turnFloorBySession = new Map<string, number>();
      const promptSourceByCheckpointId = new Map<string, Record<string, any>>();
      orderedCheckpointItems.forEach((item: any) => {
        const sessionId = String(item.sessionId || '').trim();
        const turnFloor = sessionId ? Number(turnFloorBySession.get(sessionId) || 0) : 0;
        const source = this.bestPromptSourceForExecutionItem(item, callIndexes, { turnFloor });
        if (source) promptSourceByCheckpointId.set(String(item.id), source);
        const turnCount = this.executionItemTurnCount(item);
        if (sessionId && turnCount > turnFloor) {
          turnFloorBySession.set(sessionId, turnCount);
        }
      });
      checkpointItems = checkpointItems.map((item: any) => this.attachPromptInfoToExecutionItem(item, promptSourceByCheckpointId.get(String(item.id)) || null));
      sessionItems = sessionItems.map((item: any) => this.attachPromptInfoToExecutionItem(item, this.bestPromptSourceForExecutionItem(item, callIndexes)));

      const timelineItems = (checkpointItems.length ? checkpointItems : (callItems.length ? callItems : sessionItems))
        .filter((item: any) => item && (item.cycle || item.phase || item.stepLabel));
      const sortedItems = timelineItems.slice().sort((a: any, b: any) => {
        if (a.cycle !== b.cycle) return a.cycle - b.cycle;
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
      const latestByTime = [...checkpointItems, ...callItems, ...sessionItems]
        .filter(Boolean)
        .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
      const currentMetaForLookup = currentStep ? this.getCheckpointExecutionMeta(currentStep, checkpointItems.length + 1) : null;
      const currentBase = currentMetaForLookup
        ? checkpointItems.find((item: any) => this.executionTraceItemKey(item) === this.executionTraceItemKey(currentMetaForLookup))
          || currentMetaForLookup
        : latestByTime;
      const currentSessionId = String(currentBase?.sessionId || '').trim();
      const currentTurnFloor = currentSessionId ? Number(turnFloorBySession.get(currentSessionId) || 0) : 0;
      const current = currentBase
        ? this.attachPromptInfoToExecutionItem(
            currentBase,
            promptSourceByCheckpointId.get(String(currentBase.id))
              || this.bestPromptSourceForExecutionItem(currentBase, callIndexes, { turnFloor: currentTurnFloor })
          )
        : null;
      const groups = new Map<string, any>();
      for (const item of sortedItems) {
        const key = item.cycle > 0 ? String(item.cycle) : 'unknown';
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            cycle: item.cycle || 0,
            cycleLabel: item.cycleLabel,
            phases: new Map<string, any[]>(),
            items: [],
          });
        }
        const group = groups.get(key);
        group.items.push(item);
        const phaseKey = item.phase || 'other';
        if (!group.phases.has(phaseKey)) group.phases.set(phaseKey, []);
        group.phases.get(phaseKey).push(item);
      }
      const cycles = Array.from(groups.values()).sort((a: any, b: any) => {
        if (!a.cycle && b.cycle) return 1;
        if (a.cycle && !b.cycle) return -1;
        return a.cycle - b.cycle;
      });
      cycles.forEach((cycle: any) => {
        cycle.timing = this.getTraceCycleTiming(cycle.cycle, cycle.items);
      });
      if (current) {
        const currentCycle = cycles.find((cycle: any) => Number(cycle.cycle || 0) === Number(current.cycle || 0));
        current.cycleTiming = currentCycle?.timing || this.getTraceCycleTiming(current.cycle, [current]);
      }
      return {
        current,
        cycles,
        items: sortedItems,
        checkpointItems,
        callItems,
        sessionItems,
        hasCheckpoint: checkpointItems.length > 0,
        sessionCount: sessions.length,
      };
    },

    renderExecutionTraceMiniBadges(meta: Record<string, any>, options: Record<string, any> = {}) {
      const compact = !!options.compact;
      const step = compact && meta.stepLabel && meta.stepLabel.length > 28
        ? meta.stepLabel.slice(0, 28) + '...'
        : meta.stepLabel;
      return`
        <span class="trace-mini-badge phase-${this.attr(meta.phaseClass || 'other')}">${this.esc(meta.cycleLabel || '轮次未知')}</span>
        <span class="trace-mini-badge phase-${this.attr(meta.phaseClass || 'other')}">${this.esc(meta.phaseShortLabel || meta.phaseLabel || '阶段未知')}</span>
        ${step ?`<span class="trace-mini-badge trace-step-mini" title="${this.attr(meta.stepLabel)}">${this.esc(step)}</span>` : ''}`;
    },

    renderExecutionTraceOverview(
      sessions: DataflowFileserverRunSession[],
      jsonlSessions: DataflowFileserverRunSession[],
      callSessions: DataflowFileserverRunSession[],
    ) {
      const model = this.buildExecutionTraceModel(sessions, jsonlSessions, callSessions);
      if (!model.current && !model.items.length) return '';
      const current = model.current;
      const sourceLabel = model.hasCheckpoint ? 'Checkpoint 精确定位' : 'Session / Call 推断';
      const currentStatus = current?.status || (this.isRunActive() ? 'running' : 'recorded');
      const currentTone = String(currentStatus || '').replace(/_/g, '-');
      const cycleCards = model.cycles.slice(-4).map((cycle: any) => {
        const phaseEntries = Array.from(cycle.phases.entries()).sort((a: any, b: any) => {
          return this.tracePhaseMeta(a[0]).order - this.tracePhaseMeta(b[0]).order;
        });
        const phasesHtml = phaseEntries.map(([phaseKey, items]: any) => {
          const phaseMeta = this.tracePhaseMeta(phaseKey);
          const visibleItems = items.slice(-5);
          const hiddenCount = Math.max(0, items.length - visibleItems.length);
          const pills = visibleItems.map((item: any) => {
            const isCurrent = current && item.id === current.id;
            const isLiveCurrent = isCurrent && this.isRunActive();
            const statusClass = String(item.status || 'recorded').replace(/_/g, '-');
            const durationLabel = this.traceDurationLabel(item.timing);
            const title = [item.stepLabel, durationLabel, item.detail, item.timestampLabel].filter(Boolean).join(' · ');
            return`
              <div class="execution-step-pill status-${this.attr(statusClass)} ${isCurrent ? 'current' : ''} ${isLiveCurrent ? 'live' : ''}" title="${this.attr(title)}">
                <div class="execution-step-head">
                  <div class="execution-step-main">
                    <span class="execution-step-dot"></span>
                    <span class="execution-step-label">${this.esc(item.stepLabel || phaseMeta.shortLabel)}</span>
                  </div>
                  ${this.renderTraceDuration(item.timing)}
                </div>
                ${this.renderExecutionPromptPreview(item)}
              </div>`;
          }).join('');
          return`
            <div class="execution-phase-lane phase-${this.attr(phaseMeta.cls)}">
              <div class="execution-phase-head">
                <span>${this.esc(phaseMeta.label)}</span>
                <span>${items.length}</span>
              </div>
              <div class="execution-step-list">
                ${pills}
                ${hiddenCount > 0 ?`<span class="execution-step-more">+${hiddenCount}</span>` : ''}
              </div>
            </div>`;
        }).join('');
        return`
          <div class="execution-cycle-card">
            <div class="execution-cycle-head">
              <span class="execution-cycle-title">${this.esc(cycle.cycleLabel)} <span class="execution-cycle-duration-separator">·</span> ${this.renderTraceDuration(cycle.timing, 'execution-cycle-duration')}</span>
              <span>${cycle.items.length} 个节点</span>
            </div>
            <div class="execution-phase-stack">${phasesHtml}</div>
          </div>`;
      }).join('');
      const currentDetailRows = current ? [
        { label: '当前轮次', value: current.cycleLabel || '轮次未知' },
        { label: '当前阶段', value: current.phaseLabel || '阶段未知' },
        { label: '当前步骤', value: current.stepLabel || '-' },
        { label: '节点耗时', html: this.renderTraceDuration(current.timing, 'execution-current-duration') },
        { label: '本轮耗时', html: this.renderTraceDuration(current.cycleTiming, 'execution-current-duration') },
        { label: '最近调用', value: current.callId ?`turn ${current.turn || '-'} · ${current.callId}` : (current.sessionId || '-') },
        { label: 'Agent / 模型', value: [current.agentId, current.model].filter(Boolean).join(' / ') || '-' },
        { label: '最后活动', value: current.timestampLabel || '-' },
      ] : [];
      return`
        <div class="card execution-trace-card">
          <div class="execution-trace-header">
            <div>
              <div class="card-title">调用轨迹</div>
              <div class="execution-trace-title">执行定位</div>
              <div class="execution-trace-subtitle">按 checkpoint、session 与 runtime call 聚合，优先显示当前轮次、Worker/评审阶段、具体 step，并将对应 Prompt 直接展示在节点卡片中。</div>
            </div>
            <div class="execution-trace-badges">
              <span class="badge badge-mode">${this.esc(sourceLabel)}</span>
              <span class="badge badge-${this.attr(String(currentStatus || 'unknown'))}">${this.esc(this.statusLabel(String(currentStatus || 'unknown')))}</span>
            </div>
          </div>
          ${current ?`
            <div class="execution-current-card phase-${this.attr(current.phaseClass || 'other')} status-${this.attr(currentTone)}">
              <div class="execution-current-beacon">${this.isRunActive() ? '当前执行点' : '最近执行点'}</div>
              <div class="execution-current-main">${this.esc(current.cycleLabel || '轮次未知')} · ${this.esc(current.phaseLabel || '阶段未知')}</div>
              <div class="execution-current-step">${this.esc(current.stepLabel || '-')}</div>
              ${current.detail ?`<div class="execution-current-detail">${this.esc(current.detail)}</div>` : ''}
              <div class="execution-current-grid">
                ${currentDetailRows.map((row: any) =>`
                  <div class="execution-current-cell">
                    <span>${this.esc(row.label)}</span>
                    <strong>${row.html || this.esc(row.value)}</strong>
                  </div>`).join('')}
              </div>
            </div>` : ''}
          ${cycleCards ?`
            <div class="execution-cycle-map">
              <div class="execution-map-title">最近轮次阶段图</div>
              <div class="execution-cycle-grid">${cycleCards}</div>
            </div>` : ''}
        </div>`;
    },

    getSelectedSession() {
      const selectedPath = this.sessionBrowser.selectedPath;
      if (!selectedPath) return null;
      return this.getJsonlSessions(this.runSessions).find((session: any) => this.getSessionPath(session) === selectedPath) || null;
    },

    resetSessionBrowser(selectedPath = '') {
      this.closeSessionSocket();
      this.sessionBrowser = {
        selectedRun: this.currentRun || '',
        selectedPath,
        loading: false,
        error: '',
        live: false,
        notice: '',
        data: null,
        events: [],
        warnings: [],
        lineCount: 0,
        sessionMeta: {},
      };
    },

    selectSessionPathForRender(jsonlSessions: DataflowFileserverRunSession[]) {
      if (!jsonlSessions.length) return '';
      const currentPath = this.sessionBrowser.selectedRun === this.currentRun ? this.sessionBrowser.selectedPath : '';
      if (currentPath && jsonlSessions.some((session: any) => this.getSessionPath(session) === currentPath)) {
        return currentPath;
      }
      return this.getSessionPath(jsonlSessions[0]);
    },

    renderSessions(sessions: DataflowFileserverRunSession[]) {
      const el = this.$('sessionsContainer');
      if (!el) return;
      const safeSessions = Array.isArray(sessions) ? sessions : [];
      const jsonlSessions = this.getJsonlSessions(safeSessions);
      const callSessions = safeSessions.filter((s: any) => Array.isArray(s.calls) && s.calls.length > 0);
      const traceHtml = this.renderExecutionTraceOverview(safeSessions, jsonlSessions, callSessions);
      if (!safeSessions.length) {
        this.resetSessionBrowser('');
        el.innerHTML = traceHtml
          ?`<div class="session-content-stack">${traceHtml}<div class="empty-state">暂无会话记录，执行定位会在 checkpoint 或 runtime call 产生后继续更新</div></div>`
          : '<div class="empty-state">暂无会话记录</div>';
        return;
      }

      const selectedPath = this.selectSessionPathForRender(jsonlSessions);
      const selectedChanged = selectedPath !== this.sessionBrowser.selectedPath || this.sessionBrowser.selectedRun !== this.currentRun;
      if (selectedChanged) {
        this.resetSessionBrowser(selectedPath);
      }

      if (jsonlSessions.length) {
        const navHtml = jsonlSessions.map((s: any) => {
          const path = this.getSessionPath(s);
          const selected = path === selectedPath;
          const warnings = Array.isArray(s.warnings) ? s.warnings : [];
          const executionMeta = this.getSessionExecutionMeta(s);
          return`
            <button class="session-nav-item ${selected ? 'active' : ''}" type="button" data-action="select-session" data-path="${this.attr(path)}">
              <div class="session-nav-title">${this.esc(this.getSessionDisplayName(s))}</div>
              <div class="session-nav-path">${this.esc(path)}</div>
              <div class="session-trace-tags">${this.renderExecutionTraceMiniBadges(executionMeta, { compact: true })}</div>
              <div class="session-nav-meta">
                <span>${this.fmtSize(Number(s.size || 0))}</span>
                <span>事件 ${Number(s.event_count || 0)}</span>
                <span>行 ${Number(s.line_count || 0)}</span>
                <span>${this.fmtDate(Number(s.mtime || 0))}</span>
                ${warnings.length ? '<span class="badge badge-sm badge-warning">解析提示</span>' : ''}
              </div>
            </button>`;
        }).join('');
        el.innerHTML =`
          <div class="session-content-stack">
            ${traceHtml}
            <div class="session-browser-shell">
              <div class="card session-browser-nav">
                <div class="session-nav-header">
                  <div>
                    <div class="card-title">智能体会话</div>
                    <div class="text-muted" style="font-size:12px;margin-top:4px">${jsonlSessions.length} 个 JSONL 对话文件</div>
                  </div>
                  <button class="btn btn-sm" type="button" data-action="refresh-sessions">刷新</button>
                </div>
                <div class="session-nav-list">${navHtml}</div>
              </div>
              <div id="sessionViewerPane" class="card session-viewer-pane">${this.renderSessionViewerPane()}</div>
            </div>
          </div>`;
        if (selectedPath && !this.sessionBrowser.loading && !this.sessionBrowser.data) {
          void this.loadSessionIntoBrowser(selectedPath);
        } else if (selectedPath && this.sessionBrowser.data && this.isRunActive()) {
          if (!this._sessionSocket && this.sessionBrowser.notice) {
            void this.loadSessionIntoBrowser(selectedPath, { force: true });
          } else {
            this.startSessionLiveWatch(selectedPath);
          }
        }
        return;
      }

      if (callSessions.length) {
        this.resetSessionBrowser('');
        el.innerHTML = traceHtml
          ?`<div class="session-content-stack">${traceHtml}<div class="empty-state">当前 Run 暂无 JSONL 会话，Prompt 已整合到最近轮次阶段图中。</div></div>`
          : '<div class="empty-state">当前 Run 暂无 JSONL 会话记录</div>';
        return;
      }

      this.resetSessionBrowser('');
      el.innerHTML = traceHtml
        ?`<div class="session-content-stack">${traceHtml}<div class="empty-state">暂无会话记录</div></div>`
        : '<div class="empty-state">暂无会话记录</div>';
    },

    renderCallSessions(callSessions: DataflowFileserverRunSession[]) {
      return callSessions.map((s: any) => {
        const calls = Array.isArray(s.calls) ? s.calls : [];
        const latestTurn = calls.reduce((max: number, c: any) => Math.max(max, Number(c.turn || 0)), 0);
        const callHtml = calls.map((c: any) => {
          const executionMeta = this.getCallExecutionMeta(s, c, { isLatestInSession: Number(c.turn || 0) === latestTurn });
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
          const stdoutLimitText = stdoutTraceLimit > 0 ?`stdout trace ${this.fmtSize(stdoutTraceLimit)}` : 'stdout trace limit';
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
            attemptCount > 1 ?`<span class="badge badge-sm badge-mode" title="${this.attr(attemptTitle)}">attempts ×${attemptCount}</span>` : '',
            restartedAttempts > 0 ?`<span class="badge badge-sm badge-warning">重启 ${restartedAttempts}/${timeoutLimit}</span>` : '',
            timeoutFailures > 0 && restartedAttempts === 0 ?`<span class="badge badge-sm badge-failed">超时 ${timeoutFailures}</span>` : '',
            switchedSession ?`<span class="badge badge-sm badge-mode" title="${this.attr(effectiveSessionId)}">新 session</span>` : '',
            c.stdout_soft_limit_exceeded ?`<span class="badge badge-sm badge-warning" title="${this.attr(stdoutLimitText)}">stdout 截断</span>` : '',
            c.events_truncated_count > 0 ?`<span class="badge badge-sm badge-warning">events 截断</span>` : '',
          ].join('');
          const fileActions = Object.entries({user_prompt:'Prompt', system_prompt:'System', response:'Response', stdout:'Stdout', stderr:'Stderr', request:'Req'}).map(([key,label]) =>
            c.files && c.files[key] ?`<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(c.files[key])}">${label}</span>` : ''
          ).join('') + (c.files && c.files.stdout_events ?`<span class="action-link" data-action="open-file" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(c.files.stdout_events)}">Events</span>` : '');
          return`
            <div class="call-row">
              <div class="call-head">
                <div class="call-head-main">
                  <span class="call-turn">#${this.esc(c.turn || '-')}</span>
                  <span class="call-agent">${this.esc(c.agent_id || '-')}</span>
                </div>
                <div class="call-status">${this.statusBadge(c.status, 'badge-sm')}${retryBadges}</div>
              </div>
              <div class="call-meta">
                <span class="call-size">Prompt ${this.fmtSize(Number(c.user_prompt_len || 0))}</span>
                <span class="call-size">Output ${this.fmtSize(outputBytes)}</span>
                <span class="call-duration">${c.duration_ms ? (Number(c.duration_ms) / 1000).toFixed(1) + 's' : '-'}</span>
              </div>
              <div class="call-stage-row">${this.renderExecutionTraceMiniBadges(executionMeta)}</div>
              <div class="call-files-row">
                <span class="call-files-label">Files</span>
                <div class="file-actions">${fileActions || '<span class="text-muted">无关联文件</span>'}</div>
              </div>
              ${attemptCount > 1 ?`<div class="call-note" title="${this.attr(attemptTitle)}">timeout/process attempts 已聚合在当前 call，避免与业务 turn 错位</div>` : ''}
              ${c.error ?`<div class="call-error">${this.esc(c.error).substring(0, 120)}</div>` : ''}
            </div>`;
        }).join('');
        return`
          <div class="session-group">
            <div class="session-name">${this.esc(s.session_id || 'calls')}</div>
            <div class="session-call-list">${callHtml || '<div class="empty-state">暂无 call 记录</div>'}</div>
          </div>`;
      }).join('');
    },

    async selectSessionInBrowser(path: string) {
      if (!path || !this.currentRun) return;
      if (path === this.sessionBrowser.selectedPath && this.sessionBrowser.selectedRun === this.currentRun) return;
      this.resetSessionBrowser(path);
      this.renderSessions(this.runSessions);
      await this.loadSessionIntoBrowser(path);
    },

    normalizeSessionSnapshot(data: Record<string, any>) {
      const content = typeof data.content === 'string' ? data.content : '';
      const lines = content
        ? content.split(/\r?\n/)
        : Array.isArray(data.lines)
          ? data.lines.map((line: any) => String(line ?? ''))
          : Array.isArray(data.raw_lines)
            ? data.raw_lines.map((line: any) => String(line ?? ''))
            : [];
      if (lines.length) {
        const parsed = parseAgentSessionJsonlDelta(lines, 1);
        const apiWarnings = Array.isArray(data.warnings) ? data.warnings : [];
        const lineCount = Number(data.line_count || (lines[lines.length - 1] === '' ? lines.length - 1 : lines.length) || parsed.lineCount || 0);
        return {
          ...data,
          session_meta: {
            ...(data.session_meta || {}),
            ...(parsed.sessionMeta || {}),
          },
          events: parsed.events,
          warnings: Array.from(new Set(apiWarnings.concat(parsed.warnings))),
          line_count: lineCount,
        };
      }
      return {
        ...data,
        session_meta: data.session_meta || {},
        events: Array.isArray(data.events) ? data.events : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        line_count: Number(data.line_count || this.maxEventLine(Array.isArray(data.events) ? data.events : []) || 0),
      };
    },

    async loadSessionIntoBrowser(path: string, options: { force?: boolean } = {}) {
      if (!this.currentRun || !path) return;
      const runName = this.currentRun;
      const seq = ++this._sessionLoadSeq;
      const runCache = this.getRunCache(runName);
      this.sessionBrowser.loading = true;
      this.sessionBrowser.error = '';
      this.sessionBrowser.notice = '';
      this.renderSessionPaneOnly();
      try {
        if (options.force) delete runCache.sessionViews[path];
        const cached = this.isRunActive() ? null : runCache.sessionViews[path];
        const data = cached || this.normalizeSessionSnapshot(await getDataflowFileserverRunSessionFile(projectId, this.runsRootPath, runName, path));
        runCache.sessionViews[path] = data;
        if (this._destroyed || seq !== this._sessionLoadSeq || this.currentRun !== runName || this.sessionBrowser.selectedPath !== path) return;
        const events = Array.isArray(data.events) ? data.events : [];
        const warnings = Array.isArray(data.warnings) ? data.warnings : [];
        const lineCount = Number(data.line_count || this.maxEventLine(events) || 0);
        this.sessionBrowser = {
          ...this.sessionBrowser,
          selectedRun: runName,
          selectedPath: path,
          loading: false,
          error: '',
          data,
          events,
          warnings,
          lineCount,
          sessionMeta: data.session_meta || {},
        };
        this.renderSessionPaneOnly();
        this.startSessionLiveWatch(path);
      } catch (e: any) {
        if (this._destroyed || seq !== this._sessionLoadSeq || this.currentRun !== runName || this.sessionBrowser.selectedPath !== path) return;
        this.sessionBrowser.loading = false;
        this.sessionBrowser.error = e?.message || '加载会话文件失败';
        this.renderSessionPaneOnly();
      }
    },

    renderSessionPaneOnly() {
      const pane = this.$('sessionViewerPane');
      if (pane) pane.innerHTML = this.renderSessionViewerPane();
    },

    renderSessionViewerPane() {
      const path = this.sessionBrowser.selectedPath;
      const selected = this.getSelectedSession();
      if (!path || !selected) {
        return '<div class="empty-state">请选择左侧 JSONL 会话</div>';
      }
      if (this.sessionBrowser.error) {
        return`
          <div class="session-viewer-header">
            <div>
              <div class="card-title">${this.esc(this.getSessionDisplayName(selected))}</div>
              <div class="text-muted" style="font-size:12px;margin-top:4px">${this.esc(path)}</div>
            </div>
          </div>
          <div class="empty-state text-error">${this.esc(this.sessionBrowser.error)}</div>`;
      }
      if (!this.sessionBrowser.data) {
        return '<div class="empty-state">正在加载会话内容...</div>';
      }
      const data = {
        ...(this.sessionBrowser.data || {}),
        session_meta: this.sessionBrowser.sessionMeta || {},
        events: this.sessionBrowser.events || [],
        warnings: this.sessionBrowser.warnings || [],
        line_count: this.sessionBrowser.lineCount || 0,
      };
      return this.renderSessionConversation(data, {
        inline: true,
        runName: this.currentRun || '',
        selectedPath: path,
        selectedSession: selected,
        live: this.sessionBrowser.live,
        notice: this.sessionBrowser.notice,
      });
    },

    isRunActive() {
      const status = String(this.currentRunData?.status || '').toLowerCase();
      return ['pending', 'queued', 'running', 'cancel_requested'].includes(status);
    },

    maxEventLine(events: Record<string, any>[]) {
      return events.reduce((max: number, event: any) => Math.max(max, Number(event.line || event.event_index || 0)), 0);
    },

    closeSessionSocket() {
      const socket = this._sessionSocket as WebSocket | null;
      this._sessionSocket = null;
      this._sessionSocketKey = '';
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: 'close' }));
        } catch {}
        try { socket.close(); } catch {}
      }
      if (this.sessionBrowser.live) {
        this.sessionBrowser.live = false;
        this.renderSessionPaneOnly();
      }
    },

    resolveSessionWatchPath(session: Record<string, any>, path: string) {
      const explicit = String(session.watch_project_path || '').trim();
      if (explicit) return normalizeProjectPath(explicit);
      const atomic = String(this.currentRunData?.atomic_work_path || '').trim();
      if (!atomic) return '';
      const absolutePath =`${atomic.replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
      const prefix =`/data/files/${projectId}`;
      if (!absolutePath.startsWith(prefix)) return '';
      const rel = absolutePath.slice(prefix.length).replace(/\/+$/, '');
      return rel.startsWith('/') ? rel :`/${rel}`;
    },

    startSessionLiveWatch(path: string) {
      if (!path || this.getActiveTab() !== 'sessions') return;
      const selected = this.getSelectedSession();
      if (!selected) return;
      if (!this.isRunActive()) {
        this.closeSessionSocket();
        this.sessionBrowser.live = false;
        this.sessionBrowser.notice = '';
        this.renderSessionPaneOnly();
        return;
      }
      const watchPath = this.resolveSessionWatchPath(selected as Record<string, any>, path);
      if (!watchPath) {
        this.sessionBrowser.live = false;
        this.sessionBrowser.notice = '无法解析实时监听路径，已降级为自动刷新。';
        this.renderSessionPaneOnly();
        return;
      }
      const socketKey =`${this.currentRun || ''}:${path}:${watchPath}`;
      if (
        this._sessionSocketKey === socketKey &&
        this._sessionSocket &&
        [WebSocket.OPEN, WebSocket.CONNECTING].includes(this._sessionSocket.readyState)
      ) {
        return;
      }
      this.closeSessionSocket();
      this._sessionSocketKey = socketKey;
      let socket: WebSocket;
      try {
        socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
          path_mode: 'project_filesystem',
          read_mode: 'line',
          start_from: 'head',
          start_line: Number(this.sessionBrowser.lineCount || this.maxEventLine(this.sessionBrowser.events || []) || 0),
        });
      } catch (e: any) {
        this.sessionBrowser.live = false;
        this.sessionBrowser.notice = e?.message || '实时监听创建失败，已保留自动刷新。';
        this.renderSessionPaneOnly();
        return;
      }
      this._sessionSocket = socket;
      socket.onopen = () => {
        if (this._sessionSocket !== socket || this._sessionSocketKey !== socketKey) return;
        this.sessionBrowser.live = true;
        this.sessionBrowser.notice = '';
        this.renderSessionPaneOnly();
      };
      socket.onmessage = (event) => this.handleSessionWatchMessage(socket, socketKey, event);
      socket.onerror = () => {
        if (this._sessionSocket !== socket || this._sessionSocketKey !== socketKey) return;
        this.sessionBrowser.live = false;
        this.sessionBrowser.notice = '实时监听暂时不可用，已保留自动刷新。';
        this.renderSessionPaneOnly();
      };
      socket.onclose = () => {
        if (this._sessionSocket !== socket || this._sessionSocketKey !== socketKey) return;
        this.sessionBrowser.live = false;
        this.renderSessionPaneOnly();
      };
    },

    handleSessionWatchMessage(socket: WebSocket, socketKey: string, event: MessageEvent) {
      if (this._sessionSocket !== socket || this._sessionSocketKey !== socketKey) return;
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot' || message.type === 'heartbeat') return;
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (!deltaLines.length) return;
          const parsed = parseAgentSessionJsonlDelta(deltaLines, (message.from_line ?? this.sessionBrowser.lineCount) + 1);
          const existingMaxLine = this.maxEventLine(this.sessionBrowser.events || []);
          const newEvents = parsed.events.filter((evt: any) => !evt.line || Number(evt.line) > existingMaxLine);
          if (newEvents.length) {
            this.sessionBrowser.events = (this.sessionBrowser.events || []).concat(newEvents);
          }
          if (parsed.warnings.length) {
            this.sessionBrowser.warnings = Array.from(new Set((this.sessionBrowser.warnings || []).concat(parsed.warnings)));
          }
          if (parsed.sessionMeta) {
            this.sessionBrowser.sessionMeta = { ...(this.sessionBrowser.sessionMeta || {}), ...parsed.sessionMeta };
          }
          this.sessionBrowser.lineCount = Number(message.to_line || this.sessionBrowser.lineCount || this.maxEventLine(this.sessionBrowser.events || []));
          this.sessionBrowser.live = true;
          this.sessionBrowser.notice = '';
          if (this.sessionBrowser.data) {
            this.sessionBrowser.data = {
              ...this.sessionBrowser.data,
              session_meta: this.sessionBrowser.sessionMeta,
              events: this.sessionBrowser.events,
              warnings: this.sessionBrowser.warnings,
              line_count: this.sessionBrowser.lineCount,
            };
          }
          this.renderSessionPaneOnly();
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            this.sessionBrowser.live = false;
            this.sessionBrowser.notice = '会话文件已重置，正在重新加载。';
            this.renderSessionPaneOnly();
            void this.loadSessionIntoBrowser(this.sessionBrowser.selectedPath, { force: true });
            return;
          }
          if (message.event === 'deleted') {
            this.sessionBrowser.live = false;
            this.sessionBrowser.error = '会话文件已删除';
            this.closeSessionSocket();
            this.renderSessionPaneOnly();
          }
          return;
        }
        if (message.type === 'error') {
          this.sessionBrowser.live = false;
          this.sessionBrowser.notice = message.message || '会话实时订阅失败，已保留自动刷新。';
          this.renderSessionPaneOnly();
        }
      } catch (e: any) {
        this.sessionBrowser.notice = e?.message || '会话实时消息解析失败。';
        this.renderSessionPaneOnly();
      }
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
        const cached = this.isRunActive() ? null : runCache.sessionViews[path];
        const data = cached || this.normalizeSessionSnapshot(await getDataflowFileserverRunSessionFile(projectId, this.runsRootPath, runName, path));
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

    renderSessionConversation(data: Record<string, any>, options: Record<string, any> = {}) {
      const meta = data.session_meta || {};
      const events = Array.isArray(data.events) ? data.events : [];
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const selectedSession = options.selectedSession || {};
      const title = options.inline && selectedSession ? this.getSessionDisplayName(selectedSession) : 'Session';
      const runName = String(options.runName || this.currentRun || '');
      const selectedPath = String(options.selectedPath || data.path || '');
      const sessionModel = String(selectedSession.model || selectedSession.raw_model || meta.model || '').trim();
      const sessionProvider = String(selectedSession.provider || meta.provider || '').trim();
      const sessionThinking = String(selectedSession.thinking || meta.thinking || '').trim();

      let html = '';

      html += '<div class="session-header-card">';
      html += '<div class="session-viewer-header">';
      html +=`<div><h1>${this.esc(title)}</h1>`;
      if (selectedPath) html +=`<div class="text-muted" style="font-size:12px;word-break:break-all">${this.esc(selectedPath)}</div>`;
      html += '</div>';
      html += '<div class="session-inline-actions">';
      if (options.inline) {
        html +=`<span class="badge badge-sm ${options.live ? 'badge-passed' : 'badge-unknown'} session-live-dot ${options.live ? 'live' : ''}">${options.live ? '实时连接中' : '自动刷新'}</span>`;
        html +=`<button class="btn btn-sm" type="button" data-action="open-session" data-run="${this.attr(runName)}" data-path="${this.attr(selectedPath)}">放大查看</button>`;
      }
      html += '</div></div>';
      if (options.notice) {
        html +=`<div class="session-warning-list"><div class="session-warning-item">${this.esc(options.notice)}</div></div>`;
      }
      if (warnings.length) {
        html +=`<div class="session-warning-list">${warnings.slice(0, 5).map((warning: any) =>`<div class="session-warning-item">${this.esc(warning)}</div>`).join('')}</div>`;
      }
      html += '<div class="session-header-info">';
      if (meta.id) html +=`<div class="info-item"><span class="info-label">Session ID</span><span class="info-value">${this.esc(meta.id)}</span></div>`;
      if (meta.timestamp) html +=`<div class="info-item"><span class="info-label">Started</span><span class="info-value">${this.esc(meta.timestamp)}</span></div>`;
      if (meta.cwd) html +=`<div class="info-item"><span class="info-label">Working Dir</span><span class="info-value">${this.esc(meta.cwd)}</span></div>`;
      if (data.line_count) html +=`<div class="info-item"><span class="info-label">Lines</span><span class="info-value">${Number(data.line_count || 0)}</span></div>`;
      html += '</div></div>';

      const msgEvents = events.filter((e: any) => e.type === 'message');
      const userMsgs = msgEvents.filter((e: any) => e.role === 'user');
      const assistantMsgs = msgEvents.filter((e: any) => e.role === 'assistant');
      const toolResultMsgs = msgEvents.filter((e: any) => e.role === 'toolResult');
      const toolCalls = msgEvents.reduce((n: number, e: any) => n + (e.parts || []).filter((p: any) => p.type === 'toolCall').length, 0);

      html += '<div class="session-progress-bar">';
      html +=`<span class="progress-stat"><span class="progress-num">${userMsgs.length}</span>User</span>`;
      html +=`<span class="progress-stat"><span class="progress-num">${assistantMsgs.length}</span>Assistant</span>`;
      html +=`<span class="progress-stat"><span class="progress-num">${toolCalls}</span>Tool Calls</span>`;
      html +=`<span class="progress-stat"><span class="progress-num">${toolResultMsgs.length}</span>Results</span>`;
      html += '</div>';

      const mergedEvents = this._mergeToolResults(events);
      const hasModelEvent = events.some((event: any) => event.type === 'model_change');
      const hasThinkingEvent = events.some((event: any) => event.type === 'thinking_level_change');
      if (!hasModelEvent && (sessionModel || sessionProvider || this.currentRunData?.model || this.currentRunData?.provider)) {
        const modelSource = sessionModel || sessionProvider ? 'Session 配置' : 'Run 配置';
        const modelText = sessionModel
          ? (sessionProvider && !sessionModel.startsWith(`${sessionProvider}/`) ?`${sessionProvider}/${sessionModel}` : sessionModel)
          : [this.currentRunData?.provider, this.currentRunData?.model].filter(Boolean).join('/');
        html +=`<div class="model-change-event">Model: <span class="model-name">${this.esc(modelText)}</span> <span class="text-muted">(${modelSource})</span></div>`;
      }
      if (!hasThinkingEvent && (sessionThinking || this.currentRunData?.thinking)) {
        const thinkingText = sessionThinking || String(this.currentRunData.thinking || '');
        const thinkingSource = sessionThinking ? 'Session 配置' : 'Run 配置';
        const level = thinkingText.toLowerCase();
        const colorCls = 'thinking-' + (({off:'off',minimal:'minimal',low:'low',medium:'medium',high:'high',xhigh:'xhigh','x-high':'xhigh'} as Record<string, string>)[level] || 'off');
        html +=`<div class="thinking-level-event"><span class="thinking-level-label ${colorCls}">Thinking: ${this.esc(thinkingText)}</span> <span class="text-muted">(${thinkingSource})</span></div>`;
      }
      html += '<div class="session-message-list">';

      if (!mergedEvents.length) {
        html += '<div class="empty-state">Empty session</div>';
      }
      for (const event of mergedEvents) {
        if (event.type === 'model_change') {
          html +=`<div class="model-change-event">Model: <span class="model-name">${this.esc(event.provider || '')}/${this.esc(event.modelId || '')}</span></div>`;
          continue;
        }

        if (event.type === 'thinking_level_change') {
          const level = (event.thinkingLevel || '').toLowerCase();
          const colorCls = 'thinking-' + (({off:'off',minimal:'minimal',low:'low',medium:'medium',high:'high','x-high':'xhigh'} as Record<string, string>)[level] || 'off');
          html +=`<div class="thinking-level-event"><span class="thinking-level-label ${colorCls}">Thinking: ${this.esc(event.thinkingLevel || '')}</span></div>`;
          continue;
        }
        if (event.type === 'message') {
          html += this.renderPiMessage(event);
          continue;
        }
        if (event.type !== 'raw') {
          html +=`<div class="model-change-event text-muted" style="font-size:10px">[Line ${event.line}] ${this.esc(event.type)}: ${this.esc(event.summary || '').substring(0, 80)}</div>`;
        } else {
          html +=`<div class="model-change-event text-muted" style="font-size:10px">[Line ${event.line}] ${this.esc(event.summary || event.raw_line || '').substring(0, 120)}</div>`;
        }
      }
      html += '</div>';

      return html || '<div class="empty-state">Empty session</div>';
    },

    _mergeToolResults(events: Record<string, any>[]) {
      return mergeAgentSessionToolResults(events as AppSaSessionEvent[]);
    },

    renderPiMessage(event: Record<string, any>) {
      const role = event.role;
      const parts = event.parts || [];
      const ts = event.timestamp || '';
      const timeStr = ts ? ts.split('T')[1]?.replace(/\.\d+Z$/, '').replace('Z', '') : '';

      if (role === 'user') {
        const texts = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
        return`<div class="user-message">
        ${timeStr ?`<div class="message-timestamp">${timeStr}</div>` : ''}
        <div class="message-text">${this.renderMarkdown(texts)}</div>
      </div>`;
      }

      if (role === 'assistant') {
        let html =`<div class="assistant-message">`;
        if (timeStr) html +=`<div class="message-timestamp">${timeStr}</div>`;

        for (const part of parts) {
          if (part.type === 'thinking') {
            html += this.renderThinkingBlock(part);
          } else if (part.type === 'text') {
            html +=`<div class="assistant-text-content">${this.renderMarkdown(part.text)}</div>`;
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

      return`<div class="model-change-event text-muted">[${role}]</div>`;
    },

    renderThinkingBlock(part: Record<string, any>) {
      const text = part.text || '';
      const uid = 'think_' + Math.random().toString(36).substr(2, 6);
      return`<div class="thinking-block">
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
        headerHtml =`<span class="tool-name">${this.esc(name)}</span> <span class="tool-command">${this.esc(cmd.substring(0, 200))}</span>`;
      } else if (name === 'read' || name === 'cat' || name === 'head') {
        const path = args.path || args.file || '';
        headerHtml =`<span class="tool-name">${this.esc(name)}</span> <span class="tool-path">${this.esc(path)}</span>`;
      } else if (name === 'write' || name === 'edit') {
        const path = args.path || args.file || '';
        headerHtml =`<span class="tool-name">${this.esc(name)}</span> <span class="tool-path">${this.esc(path)}</span>`;
      } else {
        headerHtml =`<span class="tool-name">${this.esc(name)}</span>`;
      }

      const argsStr = JSON.stringify(args, null, 2);
      const maxArgsLen = 600;
      const truncated = argsStr.length > maxArgsLen;
      const displayArgs = truncated ? argsStr.substring(0, maxArgsLen) + '\n...' : argsStr;
      const argsUid = 'args_' + Math.random().toString(36).substr(2, 6);

      return`<div class="tool-execution ${statusCls}">
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

      let html =`<div class="tool-result-message ${statusCls}">`;
      html +=`<div class="tool-result-header">${toolName ? this.esc(toolName) + ' — ' : ''}Output${truncated ?` (${text.length} bytes)` : ''}</div>`;
      html +=`<div class="tool-result-output" id="${uid}">${this.esc(preview)}${truncated ? '\n\n... truncated' : ''}</div>`;
      if (truncated) {
        html +=`<button class="thinking-toggle-btn" data-action="toggle-tool-result" data-result-id="${uid}">▶ show full</button>`;
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

    normalizeFilePath(path: string) {
      return String(path || '').replace(/^\/+/g, '').replace(/\/+/g, '/');
    },

    fileTypeBucket(file: DataflowFileserverRunFile | Record<string, any>) {
      const path = String(file?.path || file?.name || '').toLowerCase();
      const type = String(file?.type || getFileType(path)).toLowerCase();
      if (type === 'jsonl' || path.endsWith('.jsonl')) return 'jsonl';
      if (type === 'json' || path.endsWith('.json')) return 'json';
      if (type === 'markdown' || path.endsWith('.md') || path.endsWith('.markdown')) return 'markdown';
      if (path.endsWith('.log')) return 'log';
      if (path.endsWith('.txt') || type === 'text') return 'text';
      return 'other';
    },

    fileTypeLabel(type: string) {
      return ({
        all: '全部类型',
        markdown: 'Markdown',
        json: 'JSON',
        jsonl: 'JSONL 会话',
        log: 'Log',
        text: 'Text',
        other: 'Other',
      } as Record<string, string>)[String(type || 'other')] || String(type || 'Other');
    },

    categoryLabel(category: string) {
      const c = String(category || 'Workspace');
      return ({
        'Run Root': 'Run 根目录',
        Input: '输入文件',
        Outputs: '输出摘要',
        'Outputs / Results': '漏洞结果',
        'Outputs / Supporting Docs': '支撑文档',
        'Outputs / Removed Results': '撤回结果',
        'Outputs / Final Output': '最终产物',
        Meta: '运行元数据',
        'Meta / Result Manifests': '结果清单',
        'Meta / Checkpoints': '执行检查点',
        'Meta / Reflections': '反思记录',
        'Meta / Review Summaries': '评审汇总',
        'Meta / Cycle Metrics': '轮次指标',
        'Meta / Review Feedback': '评审反馈',
        'Meta / Summary Snapshots': 'Summary 快照',
        'Reviews / Global': '全局评审',
        'Reviews / Results': '结果评审',
        Sessions: '会话记录',
      } as Record<string, string>)[c] || c;
    },

    fmtTimestamp(value: number) {
      const num = Number(value || 0);
      if (!num) return '-';
      const date = new Date(num < 10_000_000_000 ? num * 1000 : num);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('zh-CN', { hour12: false });
    },

    getFileByPath(path: string, files = this.currentFiles) {
      const normalized = this.normalizeFilePath(path);
      return (files || []).find((file: any) => this.normalizeFilePath(file.path) === normalized) || null;
    },

    chooseDefaultFile(files: DataflowFileserverRunFile[]) {
      if (!files.length) return null;
      const priority = [
        (f: any) => f.path === 'summary.md',
        (f: any) => f.path === 'final_output/summary.md',
        (f: any) => f.path === 'run.log',
        (f: any) => String(f.path || '').startsWith('results/') && String(f.path || '').endsWith('.md'),
        (f: any) => String(f.path || '').startsWith('final_output/results/') && String(f.path || '').endsWith('.md'),
      ];
      for (const matcher of priority) {
        const found = files.find((file: any) => matcher(file));
        if (found) return found;
      }
      return files[0];
    },

    filteredFiles(files: DataflowFileserverRunFile[]) {
      const query = String(this.fileBrowser.searchQuery || '').trim().toLowerCase();
      const category = String(this.fileBrowser.categoryFilter || 'all');
      const type = String(this.fileBrowser.typeFilter || 'all');
      return (files || []).filter((file: any) => {
        const haystack = [
          file.path,
          file.name,
          file.category,
          this.categoryLabel(file.category || ''),
          file.type,
          this.fileTypeLabel(this.fileTypeBucket(file)),
        ].join(' ').toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const matchesCategory = category === 'all' || String(file.category || 'Workspace') === category;
        const matchesType = type === 'all' || this.fileTypeBucket(file) === type;
        return matchesQuery && matchesCategory && matchesType;
      });
    },

    quickFileTargets(files: DataflowFileserverRunFile[]) {
      const defs = [
        {
          key: 'summary',
          icon: 'S',
          label: 'Summary',
          hint: '最终摘要',
          match: (file: any) => ['summary.md', 'final_output/summary.md'].includes(String(file.path || '')),
        },
        {
          key: 'results',
          icon: 'R',
          label: 'Results',
          hint: '漏洞结果',
          match: (file: any) => /^results\/.*\.md$/.test(String(file.path || '')) || /^final_output\/results\/.*\.md$/.test(String(file.path || '')),
        },
        {
          key: 'docs',
          icon: 'D',
          label: 'Docs',
          hint: '支撑文档',
          match: (file: any) => String(file.path || '').startsWith('supporting_docs/')
            || String(file.path || '').startsWith('final_output/supporting_docs/'),
        },
        {
          key: 'coverage',
          icon: 'C',
          label: 'Coverage',
          hint: '覆盖账本',
          match: (file: any) => String(file.path || '').endsWith('coverage_ledger.json'),
        },
        {
          key: 'manifest',
          icon: 'M',
          label: 'Manifest',
          hint: '结果清单',
          match: (file: any) => String(file.path || '').endsWith('results_manifest.json'),
        },
        {
          key: 'vuln-list',
          icon: 'V',
          label: 'Vuln List',
          hint: '漏洞状态列表',
          match: (file: any) => String(file.path || '').endsWith('vulnerability_list.json'),
        },
        {
          key: 'log',
          icon: 'L',
          label: 'Run Log',
          hint: '运行日志',
          match: (file: any) => String(file.path || '') === 'run.log',
        },
      ];
      return defs.map((def) => {
        const matches = files.filter((file: any) => def.match(file));
        return { ...def, target: matches[0] || null, count: matches.length };
      });
    },

    buildFileTree(files: DataflowFileserverRunFile[]) {
      const root: any = { name: '', path: '', dirs: {}, files: [] };
      (files || []).forEach((file: any) => {
        const parts = this.normalizeFilePath(file.path).split('/').filter(Boolean);
        let node = root;
        const dirParts: string[] = [];
        parts.slice(0, -1).forEach((part: string) => {
          dirParts.push(part);
          const dirPath = dirParts.join('/');
          if (!node.dirs[part]) node.dirs[part] = { name: part, path: dirPath, dirs: {}, files: [] };
          node = node.dirs[part];
        });
        node.files.push(file);
      });
      return root;
    },

    renderFileTreeNode(node: any, level = 0, searchActive = false) {
      const dirs = Object.values(node.dirs || {}).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      const files = [...(node.files || [])].sort((a: any, b: any) => String(a.path).localeCompare(String(b.path)));
      let html = '';
      dirs.forEach((dir: any) => {
        const explicit = this.fileBrowser.expandedDirs[dir.path];
        const open = searchActive || (explicit !== undefined ? explicit : level < 1);
        html +=`
          <button class="file-dir-row ${open ? 'open' : ''}" type="button" data-action="toggle-file-dir" data-dir="${this.attr(dir.path)}" style="--level:${level}">
            <span class="file-dir-arrow">${open ? '▾' : '▸'}</span>
            <span class="file-dir-icon">folder</span>
            <span class="file-dir-name">${this.esc(dir.name)}</span>
          </button>`;
        if (open) html += this.renderFileTreeNode(dir, level + 1, searchActive);
      });
      files.forEach((file: any) => {
        const selected = this.normalizeFilePath(file.path) === this.normalizeFilePath(this.fileBrowser.selectedPath);
        const bucket = this.fileTypeBucket(file);
        html +=`
          <button class="file-tree-file ${selected ? 'selected' : ''}" type="button" data-action="select-file" data-path="${this.attr(file.path)}" title="${this.attr(file.path)}" style="--level:${level}">
            <span class="file-kind-dot file-kind-${this.attr(bucket)}"></span>
            <span class="file-tree-name">${this.esc(file.name || String(file.path || '').split('/').pop() || file.path)}</span>
            <span class="file-tree-meta">${this.esc(this.fileTypeLabel(bucket))}</span>
            <span class="file-tree-size">${this.fmtSize(Number(file.size || 0))}</span>
          </button>`;
      });
      return html;
    },

    renderFiles(files: DataflowFileserverRunFile[]) {
      const el = this.$('filesContainer');
      if (!el) return;
      if (!files.length) { el.innerHTML = '<div class="empty-state">暂无文件</div>'; return; }

      const categories = uniqueValues(files.map((file: any) => String(file.category || 'Workspace'))).sort();
      const typeOrder = ['markdown', 'json', 'jsonl', 'log', 'text', 'other'];
      const types = typeOrder.filter((type) => files.some((file: any) => this.fileTypeBucket(file) === type));
      const filtered = this.filteredFiles(files);
      const selectedStillVisible = filtered.some((file: any) => this.normalizeFilePath(file.path) === this.normalizeFilePath(this.fileBrowser.selectedPath));
      if (!selectedStillVisible) {
        this.fileBrowser.selectedPath = this.chooseDefaultFile(filtered)?.path || '';
      }
      const selectedFile = this.getFileByPath(this.fileBrowser.selectedPath, files);
      const quickTargets = this.quickFileTargets(files);
      const searchActive = !!String(this.fileBrowser.searchQuery || '').trim();
      const treeHtml = filtered.length
        ? this.renderFileTreeNode(this.buildFileTree(filtered), 0, searchActive)
        : '<div class="file-browser-empty">没有匹配的关键文件</div>';
      const quickHtml = quickTargets.map((item: any) => item.target ?`
        <button class="file-quick-card" type="button" data-action="select-file" data-path="${this.attr(item.target.path)}">
          <span class="file-quick-icon">${this.esc(item.icon)}</span>
          <span class="file-quick-main">${this.esc(item.label)}</span>
          <span class="file-quick-hint">${this.esc(item.hint)}${item.count > 1 ?` · ${item.count}` : ''}</span>
        </button>` :`
        <button class="file-quick-card disabled" type="button" disabled>
          <span class="file-quick-icon">${this.esc(item.icon)}</span>
          <span class="file-quick-main">${this.esc(item.label)}</span>
          <span class="file-quick-hint">未生成</span>
        </button>`).join('');
      const categoryOptions = [`<option value="all">全部分类</option>`,
        ...categories.map((category) =>`<option value="${this.attr(category)}" ${this.fileBrowser.categoryFilter === category ? 'selected' : ''}>${this.esc(this.categoryLabel(category))}</option>`),
      ].join('');
      const typeOptions = [`<option value="all">全部类型</option>`,
        ...types.map((type) =>`<option value="${this.attr(type)}" ${this.fileBrowser.typeFilter === type ? 'selected' : ''}>${this.esc(this.fileTypeLabel(type))}</option>`),
      ].join('');
      el.innerHTML =`
      <div class="file-browser-shell">
        <aside class="file-browser-nav">
          <div class="file-browser-titlebar">
            <div>
              <div class="card-title">Run 关键文件浏览</div>
              <div class="text-muted">后端精选文件索引，不是完整磁盘目录</div>
            </div>
            <span class="file-count-pill">${filtered.length}/${files.length}</span>
          </div>
          <div class="file-toolbar">
            <input id="fileSearchInput" value="${this.attr(this.fileBrowser.searchQuery)}" placeholder="搜索文件路径 / 分类 / 类型...">
            <div class="file-filter-row">
              <select id="fileCategoryFilter">${categoryOptions}</select>
              <select id="fileTypeFilter">${typeOptions}</select>
            </div>
          </div>
          <div class="file-quick-grid">${quickHtml}</div>
          <div class="file-tree-panel">${treeHtml}</div>
        </aside>
        <section class="file-preview-pane" id="filePreviewPane">
          ${this.renderFilePreviewShell(selectedFile)}
        </section>
      </div>`;
      if (selectedFile && (
        this.fileBrowser.previewRun !== this.currentRun ||
        this.normalizeFilePath(this.fileBrowser.previewPath) !== this.normalizeFilePath(selectedFile.path)
      )) {
        void this.loadSelectedFilePreview(selectedFile.path);
      }
    },

    filterFiles(query: string) {
      this.fileBrowser.searchQuery = String(query || '');
      this.renderFiles(this.currentFiles);
      const input = this.$('fileSearchInput') as HTMLInputElement | null;
      if (input) { input.value = query; input.focus(); }
    },

    toggleFileDirectory(dir: string) {
      if (!dir) return;
      const current = this.fileBrowser.expandedDirs[dir];
      this.fileBrowser.expandedDirs[dir] = current === undefined ? false : !current;
      this.renderFiles(this.currentFiles);
    },

    async selectFileInBrowser(path: string) {
      const file = this.getFileByPath(path);
      if (!file) return;
      this.fileBrowser.selectedPath = file.path;
      this.renderFiles(this.currentFiles);
    },

    renderFilePreviewShell(file: DataflowFileserverRunFile | null) {
      if (!file) {
        return`
          <div class="file-preview-empty">
            <div class="file-preview-empty-icon">files</div>
            <div class="card-title">选择一个文件</div>
            <p>使用左侧快速入口、目录树或搜索结果来查看 Run 关键产物。</p>
          </div>`;
      }
      const bucket = this.fileTypeBucket(file);
      const isCurrent = this.fileBrowser.previewRun === this.currentRun && this.normalizeFilePath(this.fileBrowser.previewPath) === this.normalizeFilePath(file.path);
      const loading = this.fileBrowser.previewLoading && isCurrent;
      const error = isCurrent ? this.fileBrowser.previewError : '';
      const content = isCurrent ? this.fileBrowser.previewContent : '';
      return`
        <div class="file-preview-header">
          <div class="file-preview-title">
            <span class="file-kind-dot file-kind-${this.attr(bucket)}"></span>
            <div>
              <div class="file-preview-name">${this.esc(file.name || file.path)}</div>
              <div class="file-preview-path">${this.esc(file.path)}</div>
            </div>
          </div>
          <div class="file-preview-actions">
            ${bucket === 'jsonl' ?`<button class="btn btn-sm" type="button" data-action="open-session" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(file.path)}">查看对话</button>` : ''}
            <button class="btn btn-sm" type="button" data-action="preview-file-modal" data-path="${this.attr(file.path)}">放大查看</button>
          </div>
        </div>
        <div class="file-preview-meta">
          <span>${this.esc(this.categoryLabel(file.category || 'Workspace'))}</span>
          <span>${this.esc(this.fileTypeLabel(bucket))}</span>
          <span>${this.fmtSize(Number(file.size || 0))}</span>
          <span>${this.fmtTimestamp(Number(file.mtime || 0))}</span>
        </div>
        <div class="file-preview-body">
          ${loading ? '<div class="file-browser-empty">正在加载文件内容...</div>' : ''}
          ${error ?`<div class="file-browser-empty text-error">${this.esc(error)}</div>` : ''}
          ${!loading && !error ? this.renderFilePreviewContent(file, content) : ''}
        </div>`;
    },

    renderFilePreviewContent(file: DataflowFileserverRunFile, content: string) {
      const bucket = this.fileTypeBucket(file);
      if (bucket === 'jsonl') {
        return`
          <div class="file-jsonl-hint">
            <div class="file-jsonl-icon">JSONL</div>
            <div>
              <div class="card-title">会话记录文件</div>
              <p>这个文件更适合使用结构化会话查看器阅读，可以直接跳转到格式化对话。</p>
              <button class="btn btn-sm" type="button" data-action="open-session" data-run="${this.attr(this.currentRun)}" data-path="${this.attr(file.path)}">查看格式化对话</button>
            </div>
          </div>`;
      }
      if (bucket === 'markdown') return this.renderMarkdown(content || '(empty)');
      if (bucket === 'json') {
        try {
          return`<pre class="file-preview-code">${this.esc(JSON.stringify(JSON.parse(content || '{}'), null, 2))}</pre>`;
        } catch {
          return`<pre class="file-preview-code">${this.esc(content || '(empty)')}</pre>`;
        }
      }
      return`<pre class="file-preview-code">${this.esc(content || '(empty)')}</pre>`;
    },

    renderFilePreviewPane() {
      const pane = this.$('filePreviewPane');
      if (!pane) return;
      pane.innerHTML = this.renderFilePreviewShell(this.getFileByPath(this.fileBrowser.selectedPath));
    },

    async loadSelectedFilePreview(path: string) {
      if (!this.currentRun || !path) return;
      const file = this.getFileByPath(path);
      if (!file) return;
      const bucket = this.fileTypeBucket(file);
      this.fileBrowser.selectedPath = file.path;
      this.fileBrowser.previewRun = this.currentRun;
      this.fileBrowser.previewPath = file.path;
      this.fileBrowser.previewError = '';
      if (bucket === 'jsonl') {
        this.fileBrowser.previewLoading = false;
        this.fileBrowser.previewContent = '';
        this.renderFilePreviewPane();
        return;
      }
      const runName = this.currentRun;
      this.fileBrowser.previewLoading = true;
      this.renderFilePreviewPane();
      try {
        const content = await this.readRunFileText(runName, file.path);
        if (this.currentRun !== runName || this.normalizeFilePath(this.fileBrowser.selectedPath) !== this.normalizeFilePath(file.path)) return;
        this.fileBrowser.previewContent = content;
        this.fileBrowser.previewError = '';
      } catch (error: any) {
        if (this.currentRun !== runName) return;
        console.error('load file preview failed', error);
        this.fileBrowser.previewContent = '';
        this.fileBrowser.previewError = error?.message || '文件内容加载失败';
      } finally {
        if (this.currentRun === runName && this.normalizeFilePath(this.fileBrowser.selectedPath) === this.normalizeFilePath(file.path)) {
          this.fileBrowser.previewLoading = false;
          this.renderFilePreviewPane();
        }
      }
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
        ?`<button class="btn btn-sm" type="button" data-action="show-log-tail">恢复尾部预览</button>`
        :`<button class="btn btn-sm" type="button" data-action="load-log-full" ${loading === 'full' ? 'disabled' : ''}>${loading === 'full' ? '正在加载全文...' : '加载全文'}</button>`;
      const error = options?.loadError
        ?`<div class="log-toolbar-desc text-error">${this.esc(options.loadError)}</div>`
        : '';
      toolbar.innerHTML =`
        <div class="log-toolbar-copy">
          <div class="log-toolbar-title">运行日志</div>
          <div class="log-toolbar-desc">${this.esc(description)}</div>
          ${error}
        </div>
        <div class="log-toolbar-actions">
          <span class="log-mode-badge ${isFull ? 'full' : ''}">${this.esc(title)}</span>
          ${button}
        </div>`;
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
        if (this.getActiveTab() === 'log') el.scrollTop = el.scrollHeight;
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
        if (this.getActiveTab() === 'log') el.scrollTop = el.scrollHeight;
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
      this.$all('.tab-content').forEach((t: HTMLElement) => t.classList.toggle('active', t.id ===`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`));
      if (tab !== 'sessions') this.closeSessionSocket();
      if (tab === 'cycles' && this.currentRunData) void this.preloadAllCycleDetails(this.currentRunData.name, this.currentRunData, force);
      if (tab === 'task-config' && this.currentRunData) {
        this.renderTaskConfig(this.currentRunData);
        void this.ensureLinkedTaskDetail(this.currentRunData.name, { force });
      }
      if (tab === 'timeline' && this.currentRunData) {
        this.renderTaskTimeline(this.currentRunData);
        void this.loadTaskTimeline(this.currentRunData.name, { force });
      }
      if (tab === 'sessions') this.loadSessions(force);
      if (tab === 'files') this.loadFiles(force);
      if (tab === 'log') this.loadLog(force);
    },

    async openFile(runName: string, path: string) {
      if (!runName || !path) return;
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
          body.innerHTML =`<div style="text-align:center;padding:20px">
          <p>这是一个会话记录文件 (.jsonl)</p>
          <button class="btn" style="margin-top:12px" data-action="open-session" data-run="${this.attr(runName)}" data-path="${this.attr(path)}">查看格式化对话</button>
        </div>`;
        } else if (data.type === 'markdown') {
          body.innerHTML = this.renderMarkdown(data.content);
        } else if (data.type === 'json') {
          try {
            body.innerHTML =`<pre>${this.esc(JSON.stringify(JSON.parse(data.content), null, 2))}</pre>`;
          } catch { body.innerHTML =`<pre>${this.esc(data.content)}</pre>`; }
        } else {
          body.innerHTML =`<pre>${this.esc(data.content)}</pre>`;
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
        this._updateLiveDurationNodes();
      }, 1000);
    },

    _updateLiveDurationNodes() {
      const nowEpoch = Date.now() / 1000;
      this.$all('[data-live-duration-start]').forEach((el) => {
        const startedEpoch = Number(el.dataset.liveDurationStart || 0);
        if (!Number.isFinite(startedEpoch) || startedEpoch <= 0) return;
        const prefix = el.dataset.liveDurationPrefix || '';
        const seconds = Math.max(0, Math.floor(nowEpoch - startedEpoch));
        el.textContent = prefix + this.fmtTraceDuration(seconds);
      });
    },

    fmtDuration(seconds: number) {
      if (!seconds || seconds <= 0) return '-';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return`${h}h ${m}m ${s}s`;
      if (m > 0) return`${m}m ${s}s`;
      return`${s}s`;
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
      const ok = await confirm({ message: `确认取消 Run ${this.currentRun}？`, danger: true });
      if (!ok) return;
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
      try {
        const latest = await inspectDataflowFileserverRunOverview(projectId, this.runsRootPath, this.currentRun, { force: true });
        this.currentRunData = latest;
        this.currentSummary = {
          ...(this.currentSummary || {}),
          ...latest,
        };
        this.renderRunDetail(latest);
      } catch (error: any) {
        alert(error?.message || '刷新 Run 状态失败，暂不能重试');
        return;
      }
      const current = this.currentRunData || this.currentSummary;
      if (!this.canRetryRun(current)) {
        alert(this.retryDisabledReason(current));
        return;
      }
      const extraCyclesText = window.prompt('追加评审轮次', '5');
      if (extraCyclesText === null) return;
      const extraCycles = Number.parseInt(extraCyclesText, 10);
      if (!Number.isFinite(extraCycles) || extraCycles < 1) {
        alert('追加评审轮次必须是大于 0 的整数');
        return;
      }

      let preview: any = null;
      try {
        preview = await previewDataflowFileserverRunRetry(projectId, this.runsRootPath, this.currentRun, { extra_cycles: extraCycles });
      } catch (error: any) {
        alert(error?.message || '生成断点续跑预览失败，暂不能重试');
        return;
      }
      if (!preview?.can_retry) {
        alert(preview?.reason || '后端尚未确认该 Run 可重试，请刷新后再试。');
        return;
      }

      const preflight = preview.resume_preflight && typeof preview.resume_preflight === 'object' ? preview.resume_preflight : {};
      const target = preflight.resume_target_node && typeof preflight.resume_target_node === 'object' ? preflight.resume_target_node : {};
      const checkpoint = preflight.step_checkpoint && typeof preflight.step_checkpoint === 'object' ? preflight.step_checkpoint : {};
      const targetCycle = target.cycle || checkpoint.cycle || '-';
      const targetPhase = target.phase || checkpoint.phase || preflight.resume_state || '-';
      const targetStep = target.step_key || checkpoint.step_key || '-';
      const targetKind = target.node_kind || '-';
      const policy = preflight.node_resume_policy || 'rerun_current_node';
      const commandDisplay = String(preflight.command_display || '').trim();
      const confirmLines = [`确认重试 Run ${this.currentRun}？`,
        '',
        '后端将执行结点级断点续跑，而不是从头开始：',`- 恢复结点：Cycle ${targetCycle} / ${targetPhase} / ${targetStep}`,`- 结点类型：${targetKind}`,`- 策略：${policy === 'rerun_current_node' ? '重跑当前未完成结点，跳过此前已完成结点' : policy}`,`- 已完成轮次：${preflight.completed_cycles ?? '-'}`,`- 追加轮次：${extraCycles}`,`- 总轮次上限：${preflight.resume_total_cycle_limit ?? '-'}`,
        commandDisplay ?`- 命令：${commandDisplay}` : '',
      ].filter(Boolean);
      const ok = await confirm({ message: confirmLines.join('\n'), danger: true });
      if (!ok) return;
      this.setMutationBusy('retry');
      try {
        const result = await retryDataflowFileserverRun(projectId, this.runsRootPath, this.currentRun, { extra_cycles: extraCycles });
        const resultPreflight = result.resume_preflight || preflight;
        const resultTarget = resultPreflight.resume_target_node || target;
        alert(result.message ||`重试已提交，将从 ${resultTarget.phase || targetPhase}/${resultTarget.step_key || targetStep} 继续`);
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

    fmtDate(epochSeconds: number) {
      if (!epochSeconds) return '-';
      return new Date(epochSeconds * 1000).toLocaleString('zh-CN');
    },

    statusLabel(status: string) {
      const s = String(status || 'unknown').toLowerCase();
      return ({
        completed: '完成',
        succeeded: '成功',
        failed: '失败',
        running: '运行中',
        started: '进行中',
        recorded: '已记录',
        retrying: '重试中',
        soft_failed: '软失败',
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
    },

    statusBadge(status: string, extra = '') {
      const s = String(status || 'unknown').toLowerCase();
      const label = this.statusLabel(s);
      return`<span class="badge badge-${s} ${extra}">${label}</span>`;
    },

    reviewProfileLabel(profile: string) {
      const raw = String(profile || '').trim();
      const normalized = raw.toLowerCase();
      const label = ({
        fast: '快速档',
        balanced: '平衡档',
        audit: '审计档',
        strict: '审计档',
      } as Record<string, string>)[normalized];
      return label || (raw ?`档位 ${raw}` : '档位未解析');
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
      return`<span class="badge badge-${m.cls} badge-sm">${m.label}</span>`;
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
      return`<span class="badge badge-${m.cls} badge-sm">${m.label}</span>`;
    },

    lifecycleBadge(result: Record<string, any>) {
      const status = String(result.lifecycle_status || result.role || '').toLowerCase();
      if (!status) return '';
      const cls = result.taskable === false || result.active === false ? 'badge-warning' : 'badge-mode';
      const label = result.role && result.lifecycle_status
        ?`${result.role}/${result.lifecycle_status}`
        : status;
      return`<span class="badge badge-sm ${cls}">${this.esc(label)}</span>`;
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
        return '<tr>' + cells.map((c) =>`<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
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
  const { confirm, feedbackNodes } = useUiFeedback();
  const hostRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef<typeof onBack>(onBack);
  const initialSummaryRef = useRef<DataflowFileserverRunSummary | null | undefined>(initialSummary);
  onBackRef.current = onBack;
  initialSummaryRef.current = initialSummary;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML =`<style>${DATAFLOW_DASHBOARD_STYLES}</style>${DASHBOARD_HTML}`;
    let app: ReturnType<typeof createDashboardApp> | null = null;
    const renderInitError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error || 'unknown error');
      console.error('DataflowFileserverRunDashboardPage init failed', error);
      shadow.innerHTML =`
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
        </div>`;
    };
    try {
      app = createDashboardApp({
        projectId,
        initialRunName,
        initialSummary: initialSummaryRef.current || null,
        onBack: () => onBackRef.current?.(),
        rootPath: rootPath || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
        root: shadow,
        confirm,
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
    <>
      {feedbackNodes}
      <div
        ref={hostRef}
        style={{
          minHeight: 'calc(100vh - 80px)',
          width: '100%',
        }}
      />
    </>
  );
};
