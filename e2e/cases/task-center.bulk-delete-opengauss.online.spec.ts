import { expect, test, type Page } from '@playwright/test';
import { bootstrapSession, loginByApi } from '../fixtures/auth';
import { E2E_OPENGAUSS_PROJECT_ID } from '../fixtures/project';

const baseURL = process.env.E2E_BASE_URL || 'https://chimera.ai.icsl.huawei.com';

const openTaskCenter = async (page: Page, projectId: string) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(({ projectId }) => {
    localStorage.setItem('last_project_id', projectId);
    window.dispatchEvent(
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'task-list' },
      }),
    );
  }, { projectId });
};

const fetchUserTasks = async (page: Page, token: string, projectId: string) => {
  const response = await page.request.get(
    `${baseURL}/api/chirmera-platform-schedule/projects/${projectId}/user-tasks`,
    {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    },
  );
  return {
    status: response.status(),
    payload: await response.json(),
  };
};

test.describe('Task center bulk delete for openGauss', () => {
  test('should expose delete-all entry and verify downstream deletion workflow for openGauss project', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const initial = await fetchUserTasks(page, token, E2E_OPENGAUSS_PROJECT_ID);
    expect(initial.status).toBe(200);
    expect(Array.isArray(initial.payload?.items)).toBeTruthy();

    await bootstrapSession(page, token);
    await openTaskCenter(page, E2E_OPENGAUSS_PROJECT_ID);

    await expect(page.getByRole('heading', { name: '任务中心' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /删除全部任务/ })).toBeVisible({ timeout: 60_000 });

    const deletableCount = initial.payload.items.filter((item: any) => !['queued', 'running'].includes(String(item?.delete_status || 'none'))).length;
    await expect(page.getByRole('button', { name: new RegExp(`删除全部任务（${deletableCount}）`) })).toBeVisible({ timeout: 60_000 });

    if (deletableCount === 0) {
      await expect(page.getByRole('button', { name: /删除全部任务/ })).toBeDisabled();
      return;
    }

    await page.getByRole('button', { name: /删除全部任务/ }).click();
    await expect(page.getByText('确认删除全部任务')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: new RegExp(`删除全部 ${deletableCount} 项`) }).click();

    await expect(page.getByText(/已加入全部任务删除队列/)).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => {
      const payload = await fetchUserTasks(page, token, E2E_OPENGAUSS_PROJECT_ID);
      const rows = Array.isArray(payload.payload?.items) ? payload.payload.items : [];
      return rows.filter((item: any) => ['queued', 'running', 'failed'].includes(String(item?.delete_status || 'none'))).length;
    }, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBeGreaterThan(0);
  });
});
