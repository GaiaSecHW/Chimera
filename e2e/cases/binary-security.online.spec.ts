import { expect, test, type Page } from '@playwright/test';
import { bootstrapSession, loginByApi } from '../fixtures/auth';
import { E2E_PROJECT_ID } from '../fixtures/project';

const baseURL = process.env.E2E_BASE_URL || 'https://chimera.ai.icsl.huawei.com';

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
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'source-security-detail', taskId, sourceSecurityTaskId: taskId },
      }),
    );
  }, { taskId });
};

const openBinarySecurityOverview = async (page: Page) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'binary-security' },
      }),
    );
  });
};

const openBinarySecurityConfig = async (page: Page) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'binary-security-config' },
      }),
    );
  });
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
      `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/tasks/${sourceTask.id}/stage-items?stage_name=dataflow_vuln_scan&page=1&per_page=10`,
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

  test('should apply project default pipeline mode to create dialog', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const configUrl = `${baseURL}/api/app/binary-security/projects/${E2E_PROJECT_ID}/config`;

    const originalConfigResp = await fetchJson(page, configUrl, token);
    expect(originalConfigResp.status).toBe(200);
    expect(originalConfigResp.payload?.config).toBeTruthy();
    const originalConfig = originalConfigResp.payload.config;

    const updateConfig = async (pipelineMode: 'barrier' | 'mixed_streaming') => {
      const response = await page.request.put(configUrl, {
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
        data: {
          ...originalConfig,
          pipeline_mode: pipelineMode,
        },
      });
      expect(response.status()).toBe(200);
    };

    try {
      await updateConfig('mixed_streaming');
      await bootstrapSession(page, token);

      await openBinarySecurityConfig(page);
      await expect(page.getByRole('heading', { name: '参数配置' })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('新任务默认推进模式')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByLabel('深度优化（Mixed Streaming）')).toBeChecked({ timeout: 60_000 });

      await openBinarySecurityOverview(page);
      await expect(page.getByRole('heading', { name: '二进制安全' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: '创建任务' }).click();
      await expect(page.getByRole('heading', { name: '创建二进制安全任务' })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('推进模式')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByLabel('深度优化（Mixed Streaming）')).toBeChecked({ timeout: 60_000 });
      await expect(page.getByLabel('广度优先（Barrier）')).not.toBeChecked();
    } finally {
      const response = await page.request.put(configUrl, {
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
        data: originalConfig,
      });
      expect(response.status()).toBe(200);
    }
  });
});
