import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { bootstrapSession, loginByApi } from '../fixtures/auth';
import {
  E2E_BINARY_SECURITY_PROJECT_ID,
  E2E_BINARY_SECURITY_RETRY_TASK_ID_1,
  E2E_BINARY_SECURITY_RETRY_TASK_ID_2,
} from '../fixtures/project';

const baseURL = process.env.E2E_BASE_URL || 'https://chimera.ai.icsl.huawei.com';
const ENTRY_STAGE = 'entry_analysis';
const RETRY_ACCEPTED_EVENTS = new Set(['task_retry_failed_items_accepted', 'stage_retry_failed_items_accepted']);
const RETRY_OPERATION_TYPES = new Set(['retry_failed_items', 'stage_retry_failed_items']);

type TaskDetail = {
  id: string;
  name?: string;
  status?: string | null;
  current_stage?: string | null;
  runtime_phase?: string | null;
  task_retry_failed_items_supported?: boolean;
  task_retry_failed_items_reason?: string | null;
  manual_operation_state?: {
    can_retry_failed_items?: boolean;
    can_retry_stage_failed_items?: boolean;
    blocking_reason?: string | null;
  } | null;
  stage_summaries?: Array<{
    stage_name?: string;
    retry_failed_supported?: boolean;
    retry_failed_reason?: string | null;
  }>;
};

type StageItem = {
  id: string;
  status?: string | null;
  downstream_task_id?: string | null;
  downstream_status?: string | null;
  sync_status?: string | null;
  result?: {
    sync_observation?: {
      last_result?: string | null;
      recovery_reason?: string | null;
    } | null;
  } | null;
};

type Operation = {
  id: string;
  operation_type?: string | null;
  status?: string | null;
  target_stage?: string | null;
};

type TimelineEvent = {
  id: string;
  event_type?: string | null;
  message?: string | null;
};

type TaskSnapshot = {
  detail: TaskDetail;
  entryItems: StageItem[];
  operations: Operation[];
  timeline: TimelineEvent[];
};

type RetryState = 'blocked_auto_recovery' | 'eligible_retry' | 'unknown';

const fetchJson = async (request: APIRequestContext, url: string, token: string, method: 'GET' | 'POST' = 'GET') => {
  const response = method === 'POST'
    ? await request.post(url, {
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      })
    : await request.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      });
  const body = await response.text();
  let payload: any = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = { raw: body };
  }
  return { status: response.status(), payload };
};

const openBinarySecurityDetail = async (page: Page, taskId: string) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(({ taskId }) => {
    window.dispatchEvent(
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'source-security-detail', taskId, sourceSecurityTaskId: taskId },
      }),
    );
  }, { taskId });
};

const selectEntryAnalysisStage = async (page: Page) => {
  const stageButton = page.getByRole('button', { name: /入口分析/ }).first();
  await expect(stageButton).toBeVisible({ timeout: 60_000 });
  await stageButton.click();
};

const getEntryStageSummary = (detail: TaskDetail) =>
  (detail.stage_summaries || []).find((item) => item.stage_name === ENTRY_STAGE) || null;

const normalizeTimeline = (payload: any): TimelineEvent[] => {
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const normalizeOperations = (payload: any): Operation[] => Array.isArray(payload?.items) ? payload.items : [];

const normalizeStageItems = (payload: any): StageItem[] => Array.isArray(payload?.items) ? payload.items : [];

const fetchTaskSnapshot = async (request: APIRequestContext, token: string, taskId: string): Promise<TaskSnapshot> => {
  const detailResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}`,
    token,
  );
  expect(detailResp.status, `detail endpoint should succeed for ${taskId}`).toBe(200);

  const stageResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}/stage-items?stage_name=${ENTRY_STAGE}&page=1&per_page=200`,
    token,
  );
  expect(stageResp.status, `stage-items endpoint should succeed for ${taskId}`).toBe(200);

  const operationsResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}/operations`,
    token,
  );
  expect(operationsResp.status, `operations endpoint should succeed for ${taskId}`).toBe(200);

  const timelineResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}/timeline?page=1&per_page=200`,
    token,
  );
  expect(timelineResp.status, `timeline endpoint should succeed for ${taskId}`).toBe(200);

  return {
    detail: detailResp.payload as TaskDetail,
    entryItems: normalizeStageItems(stageResp.payload),
    operations: normalizeOperations(operationsResp.payload),
    timeline: normalizeTimeline(timelineResp.payload),
  };
};

const retryBlockingReason = (detail: TaskDetail) =>
  String(detail.manual_operation_state?.blocking_reason || detail.task_retry_failed_items_reason || '').trim();

const classifyRetryState = (snapshot: TaskSnapshot): RetryState => {
  const detail = snapshot.detail;
  const summary = getEntryStageSummary(detail);
  const reason = retryBlockingReason(detail);
  const blockedByManualState = detail.manual_operation_state?.can_retry_failed_items === false
    || detail.manual_operation_state?.can_retry_stage_failed_items === false;
  const hasAutoRecoveryReason = /(streaming tail|tail_reconciliation|自动推进|自动恢复|继续收敛)/i.test(reason);
  if (
    (String(detail.status || '').toLowerCase() === 'running' || String(detail.runtime_phase || '').trim() !== '')
    && blockedByManualState
    && hasAutoRecoveryReason
  ) {
    return 'blocked_auto_recovery';
  }
  if (
    detail.manual_operation_state?.can_retry_stage_failed_items === true
    && summary?.retry_failed_supported === true
    && !hasAutoRecoveryReason
  ) {
    return 'eligible_retry';
  }
  return 'unknown';
};

const summarizeForFailure = (snapshot: TaskSnapshot) => {
  const summary = getEntryStageSummary(snapshot.detail);
  return JSON.stringify({
    status: snapshot.detail.status,
    current_stage: snapshot.detail.current_stage,
    runtime_phase: snapshot.detail.runtime_phase,
    manual_operation_state: snapshot.detail.manual_operation_state,
    entry_retry_failed_supported: summary?.retry_failed_supported,
    entry_retry_failed_reason: summary?.retry_failed_reason,
    entry_items: snapshot.entryItems.map((item) => ({
      id: item.id,
      status: item.status,
      downstream_task_id: item.downstream_task_id,
      downstream_status: item.downstream_status,
      last_result: item.result?.sync_observation?.last_result,
      recovery_reason: item.result?.sync_observation?.recovery_reason,
    })),
  }, null, 2);
};

const retryRelatedOperations = (operations: Operation[]) =>
  operations
    .filter((item) => RETRY_OPERATION_TYPES.has(String(item.operation_type || '')))
    .map((item) => `${item.id}:${item.operation_type}:${item.status}:${item.target_stage || ''}`)
    .sort();

const retryRelatedTimelineEvents = (events: TimelineEvent[]) =>
  events
    .filter((item) => RETRY_ACCEPTED_EVENTS.has(String(item.event_type || '')))
    .map((item) => `${item.id}:${item.event_type}:${item.message || ''}`)
    .sort();

const retryFailureSignature = (items: StageItem[]) =>
  items
    .filter((item) => {
      const status = String(item.status || '').toLowerCase();
      const downstreamStatus = String(item.downstream_status || '').toLowerCase();
      const lastResult = String(item.result?.sync_observation?.last_result || '').toLowerCase();
      const syncStatus = String(item.result?.sync_observation?.sync_status || '').toLowerCase();
      return ['failed', 'error', 'cancelled'].includes(status)
        || ['failed', 'cancelled', 'downstream_missing'].includes(downstreamStatus)
        || lastResult === 'observation_gap_detected'
        || syncStatus === 'observation_gap_detected';
    })
    .map((item) => `${item.id}:${item.status || ''}:${item.downstream_task_id || ''}:${item.downstream_status || ''}:${item.result?.sync_observation?.last_result || ''}:${item.result?.sync_observation?.sync_status || ''}`)
    .sort();

const assertNoRetrySideEffects = (before: TaskSnapshot, after: TaskSnapshot) => {
  expect(retryRelatedOperations(after.operations)).toEqual(retryRelatedOperations(before.operations));
  expect(retryRelatedTimelineEvents(after.timeline)).toEqual(retryRelatedTimelineEvents(before.timeline));
  expect(retryFailureSignature(after.entryItems)).toEqual(retryFailureSignature(before.entryItems));
};

const bootstrapAndOpenDetail = async (page: Page, token: string, taskId: string) => {
  await bootstrapSession(page, token);
  await openBinarySecurityDetail(page, taskId);
  await expect(page.getByText('Binary Security Detail')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^重试失败项$/ }).first()).toBeVisible({ timeout: 60_000 });
};

const assertBlockedRetryApi = async (request: APIRequestContext, token: string, taskId: string, before: TaskSnapshot) => {
  const taskRetryResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}/retry-failed-items`,
    token,
    'POST',
  );
  const stageRetryResp = await fetchJson(
    request,
    `${baseURL}/api/app/binary-security/projects/${E2E_BINARY_SECURITY_PROJECT_ID}/tasks/${taskId}/stages/${ENTRY_STAGE}/retry-failed-items`,
    token,
    'POST',
  );
  expect([200, 400, 409, 422]).toContain(taskRetryResp.status);
  expect([200, 400, 409, 422]).toContain(stageRetryResp.status);

  const after = await fetchTaskSnapshot(request, token, taskId);
  assertNoRetrySideEffects(before, after);
};

const assertBlockedTask = async (page: Page, request: APIRequestContext, token: string, taskId: string, snapshot: TaskSnapshot) => {
  expect(snapshot.detail.status).toBe('running');
  expect(snapshot.detail.current_stage).toBe(ENTRY_STAGE);
  expect(snapshot.detail.manual_operation_state?.can_retry_failed_items).toBe(false);
  expect(snapshot.detail.manual_operation_state?.can_retry_stage_failed_items).toBe(false);
  const blockingReason = retryBlockingReason(snapshot.detail);
  expect(blockingReason).toMatch(/streaming tail|自动推进|自动恢复|收敛/i);
  expect(
    snapshot.entryItems.some((item) =>
      String(item.status || '').toLowerCase() === 'cancelled'
      && (
        String(item.result?.sync_observation?.last_result || '').toLowerCase() === 'observation_gap_detected'
        || String(item.result?.sync_observation?.sync_status || '').toLowerCase() === 'observation_gap_detected'
      )),
  ).toBeTruthy();

  await bootstrapAndOpenDetail(page, token, taskId);
  await selectEntryAnalysisStage(page);
  await expect(page.getByText(blockingReason).first()).toBeVisible({ timeout: 60_000 });
  const retryButtons = page.getByRole('button', { name: /^重试失败项$/ });
  await expect(retryButtons).toHaveCount(2, { timeout: 60_000 });
  await expect(retryButtons.first()).toBeDisabled();
  await expect(retryButtons.nth(1)).toBeDisabled();
  await expect(retryButtons.first()).toHaveAttribute('title', blockingReason);
  await expect(retryButtons.nth(1)).toHaveAttribute('title', blockingReason);

  await assertBlockedRetryApi(request, token, taskId, snapshot);
};

const runEligibleRetryFlow = async (page: Page, request: APIRequestContext, token: string, taskId: string, before: TaskSnapshot) => {
  const summary = getEntryStageSummary(before.detail);
  expect(before.detail.manual_operation_state?.can_retry_stage_failed_items).toBe(true);
  expect(summary?.retry_failed_supported).toBe(true);
  const beforeSuccessSignatures = before.entryItems
    .filter((item) => String(item.status || '').toLowerCase() === 'success')
    .map((item) => `${item.id}:${item.status || ''}:${item.downstream_task_id || ''}`)
    .sort();

  await bootstrapAndOpenDetail(page, token, taskId);
  await selectEntryAnalysisStage(page);
  const retryButtons = page.getByRole('button', { name: /^重试失败项$/ });
  await expect(retryButtons.nth(1)).toBeEnabled();
  await retryButtons.nth(1).click();
  await expect(page.getByText('确认重试失败项')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '确认重试失败项' }).click();

  const beforeRetryOperationCount = retryRelatedOperations(before.operations).length;
  await expect.poll(async () => {
    const snapshot = await fetchTaskSnapshot(request, token, taskId);
    return retryRelatedOperations(snapshot.operations).filter((item) => item.includes(':stage_retry_failed_items:')).length;
  }, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBeGreaterThan(0);

  const finalSnapshot = await fetchTaskSnapshot(request, token, taskId);
  expect(retryRelatedTimelineEvents(finalSnapshot.timeline).length).toBeGreaterThan(retryRelatedTimelineEvents(before.timeline).length);
  expect(retryRelatedOperations(finalSnapshot.operations).length).toBeGreaterThan(beforeRetryOperationCount);

  const afterSuccessSignatures = finalSnapshot.entryItems
    .filter((item) => String(item.status || '').toLowerCase() === 'success')
    .map((item) => `${item.id}:${item.status || ''}:${item.downstream_task_id || ''}`)
    .sort();
  expect(afterSuccessSignatures).toEqual(expect.arrayContaining(beforeSuccessSignatures));
};

test.describe('Binary security retry failed items online', () => {
  test('should enforce blocked retry semantics for current auto-recovery source task and classify second source sample correctly', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);

    const primarySnapshot = await fetchTaskSnapshot(request, token, E2E_BINARY_SECURITY_RETRY_TASK_ID_1);
    const primaryState = classifyRetryState(primarySnapshot);
    expect(primaryState, summarizeForFailure(primarySnapshot)).toBe('blocked_auto_recovery');
    await assertBlockedTask(page, request, token, E2E_BINARY_SECURITY_RETRY_TASK_ID_1, primarySnapshot);

    const secondarySnapshot = await fetchTaskSnapshot(request, token, E2E_BINARY_SECURITY_RETRY_TASK_ID_2);
    const secondaryState = classifyRetryState(secondarySnapshot);
    if (secondaryState === 'blocked_auto_recovery') {
      await assertBlockedTask(page, request, token, E2E_BINARY_SECURITY_RETRY_TASK_ID_2, secondarySnapshot);
      return;
    }
    if (secondaryState === 'eligible_retry') {
      await runEligibleRetryFlow(page, request, token, E2E_BINARY_SECURITY_RETRY_TASK_ID_2, secondarySnapshot);
      return;
    }
    throw new Error(`Unexpected retry state for ${E2E_BINARY_SECURITY_RETRY_TASK_ID_2}\n${summarizeForFailure(secondarySnapshot)}`);
  });
});
