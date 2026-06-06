import { expect, test, type Page } from '@playwright/test';
import { bootstrapSession, loginByApi } from '../fixtures/auth';
import { E2E_PROJECT_ID } from '../fixtures/project';

const baseURL = process.env.E2E_BASE_URL || 'https://chimera.ai.icsl.huawei.com';

const openVulnParameterConfigPage = async (page: Page) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('chimera-navigate-view', {
        detail: { view: 'vuln-parameter-config' },
      })
    );
  });
  await page.getByRole('heading', { name: '漏洞引擎参数配置' }).waitFor({ state: 'visible', timeout: 60_000 });
};

test.describe('Vulnerability parameter config', () => {
  test('should render staged tabs and save validation retry limit', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const apiHeaders = { Authorization: `Bearer ${token}` };

    await bootstrapSession(page, token);
    await openVulnParameterConfigPage(page);

    await expect(page.getByRole('button', { name: '参数配置' }).first()).toBeVisible();

    const stageTabs = [
      { name: '全局策略', helper: '单案例最大并行动作数' },
      { name: '接收阶段', helper: '自动接收鉴权上报' },
      { name: '研判阶段', helper: '自动派发研判动作' },
      { name: '验证阶段', helper: '验证重试次数' },
      { name: '已结束', helper: '通知原始来源服务' },
    ];

    for (const tab of stageTabs) {
      await page.locator('button', { hasText: tab.name }).last().click();
      await expect(page.getByText(tab.helper).first()).toBeVisible();
    }

    await page.locator('button', { hasText: '验证阶段' }).last().click();
    const validationInput = page.locator('label', { hasText: '验证重试次数' }).locator('input');
    await expect(validationInput).toBeVisible();

    const originalValue = await validationInput.inputValue();
    const tempValue = originalValue === '4' ? '5' : '4';

    try {
      await validationInput.fill(tempValue);
      await page.getByRole('button', { name: '保存全部参数' }).click();
      await expect(page.getByText('漏洞引擎动态参数已保存')).toBeVisible({ timeout: 60_000 });

      const response = await request.get(`${baseURL}/api/vuln/config?project_id=${E2E_PROJECT_ID}`, {
        headers: apiHeaders,
      });
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      expect(String(payload?.config?.validation?.validation_retry_limit)).toBe(tempValue);
    } finally {
      const restoreResponse = await request.put(`${baseURL}/api/vuln/config`, {
        headers: {
          ...apiHeaders,
          'Content-Type': 'application/json',
        },
        data: {
          project_id: E2E_PROJECT_ID,
          config: {
            validation: {
              validation_retry_limit: Number(originalValue),
            },
          },
        },
      });
      expect(restoreResponse.ok()).toBeTruthy();
    }
  });
});
