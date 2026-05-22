import { expect, test, type Page } from '@playwright/test';
import { bootstrapSession, loginByApi } from '../fixtures/auth';
import { E2E_PROJECT_ID } from '../fixtures/project';

const baseURL = process.env.E2E_BASE_URL || 'https://secflow.ai.icsl.huawei.com';

const fetchJson = async (page: Page, url: string, token: string) => {
  const response = await page.request.get(url, {
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
      new CustomEvent('secflow-navigate-view', {
        detail: { view: 'source-security-detail', taskId, sourceSecurityTaskId: taskId },
      }),
    );
  }, { taskId });
};

test.describe('Binary security online smoke', () => {
  test('should expose binary-security APIs and render source task detail page', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);

    const taskListResp = await fetchJson(
      page,
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/tasks`,
      token,
    );
    expect(taskListResp.status).toBe(200);
    const tasks = Array.isArray(taskListResp.payload?.items) ? taskListResp.payload.items : [];
    const sourceTask = tasks.find((item: any) => item?.task_type === 'source') || tasks[0];
    expect(sourceTask?.id).toBeTruthy();

    const configResp = await fetchJson(
      page,
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/config`,
      token,
    );
    expect(configResp.status).toBe(200);
    expect(configResp.payload?.config).toBeTruthy();

    const detailResp = await fetchJson(
      page,
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/tasks/${sourceTask.id}`,
      token,
    );
    expect(detailResp.status).toBe(200);
    expect(Array.isArray(detailResp.payload?.stage_summaries)).toBeTruthy();

    const observabilityResp = await fetchJson(
      page,
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/tasks/${sourceTask.id}/orchestration-observability`,
      token,
    );
    expect(observabilityResp.status).toBe(200);
    expect(observabilityResp.payload?.state_events).toBeTruthy();

    const stageItemsResp = await fetchJson(
      page,
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/tasks/${sourceTask.id}/stage-items?stage_name=dataflow_analysis&page=1&per_page=5`,
      token,
    );

    await bootstrapSession(page, token);
    await openBinarySecurityDetail(page, sourceTask.id);

    await expect(page.getByText('Binary Security Detail')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: sourceTask.name })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('当前阶段：').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('编排观测').first()).toBeVisible({ timeout: 60_000 });

    expect(configResp.payload?.config?.pipeline_mode, 'online project config should expose pipeline_mode after rollout').toBeTruthy();
    expect(stageItemsResp.status, 'online stage-items endpoint should be available after rollout').toBe(200);
  });
});
