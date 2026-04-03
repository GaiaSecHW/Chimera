import { expect, test } from '@playwright/test';
import { bootstrapSession, loginByApi, openPvcManagement } from '../fixtures/auth';
import { deleteResourceById } from '../helpers/resource';
import { uniqueName, searchAndOpenPvcDetail } from '../helpers/ui';

const baseURL = process.env.E2E_BASE_URL || 'https://secflow.sothothv2.com';

test.describe('PVC blank flow', () => {
  test('create blank pvc and manage content in detail page', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const createdResourceIds: number[] = [];

    await bootstrapSession(page, token);
    await openPvcManagement(page);

    const pvcName = uniqueName('e2e-blank-pvc');
    await page.getByTestId('pvc-create-blank-btn').click();
    await page.getByTestId('pvc-create-modal').waitFor({ state: 'visible' });
    await page.getByTestId('pvc-create-name-input').fill(pvcName);
    await page.getByTestId('pvc-create-submit-btn').click();
    await expect(page.getByTestId('pvc-create-modal')).toBeHidden({ timeout: 30_000 });

    await searchAndOpenPvcDetail(page, pvcName);
    await expect(page.getByText('当前目录为空。')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('pvc-detail-create-dir-btn').click();
    await page.getByPlaceholder('请输入名称').fill('docs');
    await page.getByRole('button', { name: '确认' }).click();
    await expect(page.getByText('docs').first()).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('pvc-detail-hidden-file-input').setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello pvc detail', 'utf-8'),
    });
    await expect(page.getByText('note.txt').first()).toBeVisible({ timeout: 30_000 });

    const deleteFileBtn = page.locator(`[data-testid="pvc-node-delete-${encodeURIComponent('/note.txt')}"]`).first();
    await deleteFileBtn.click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(page.getByText('note.txt')).toHaveCount(0, { timeout: 30_000 });

    const deleteDirBtn = page.locator(`[data-testid="pvc-node-delete-${encodeURIComponent('/docs')}"]`).first();
    await deleteDirBtn.click();
    await page.getByRole('button', { name: '确认删除' }).click();

    await page.getByTestId('pvc-detail-back-btn').click();
    const pvcRow = page.getByText(pvcName).first();
    await expect(pvcRow).toBeVisible();

    const row = pvcRow.locator('xpath=ancestor::tr[1]');
    const rowTestId = await row.getAttribute('data-testid');
    if (rowTestId) {
      const matched = rowTestId.match(/pvc-list-row-(\d+)/);
      if (matched) createdResourceIds.push(Number(matched[1]));
    }

    for (const resourceId of createdResourceIds) {
      await deleteResourceById(request, baseURL, token, resourceId);
    }
  });
});
