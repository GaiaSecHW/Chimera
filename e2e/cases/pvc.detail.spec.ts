import { expect, test } from '@playwright/test';
import { bootstrapSession, loginByApi, openPvcManagement } from '../fixtures/auth';
import { createManualBlankPvc, deleteResourceById } from '../helpers/resource';
import { searchAndOpenPvcDetail, uniqueName } from '../helpers/ui';

const baseURL = process.env.E2E_BASE_URL || 'https://chimera.ai.icsl.huawei.com';

test.describe('PVC detail operations', () => {
  test('rename/move/delete/download and preview should work', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const pvcName = uniqueName('e2e-detail-pvc');
    const created = await createManualBlankPvc(request, baseURL, token, pvcName, 'code');

    await bootstrapSession(page, token);
    await openPvcManagement(page);
    await searchAndOpenPvcDetail(page, pvcName);

    await page.getByTestId('pvc-detail-create-dir-btn').click();
    await page.getByPlaceholder('请输入名称').fill('docs');
    await page.getByRole('button', { name: '确认' }).click();

    await page.getByTestId('pvc-detail-hidden-file-input').setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('detail-operation-content', 'utf-8'),
    });
    await expect(page.getByText('note.txt').first()).toBeVisible({ timeout: 30_000 });

    await page.locator(`[data-testid="pvc-node-rename-${encodeURIComponent('/note.txt')}"]`).first().click();
    await page.getByPlaceholder('请输入名称').fill('note-renamed.txt');
    await page.getByRole('button', { name: '确认' }).click();
    await expect(page.getByText('note-renamed.txt').first()).toBeVisible({ timeout: 30_000 });

    await page.locator(`[data-testid="pvc-node-move-${encodeURIComponent('/note-renamed.txt')}"]`).first().click();
    await page.getByPlaceholder('/target/path').fill('/docs');
    await page.getByRole('button', { name: '确认移动' }).click();

    await page.getByText('docs').first().click();
    await expect(page.getByText('note-renamed.txt').first()).toBeVisible({ timeout: 30_000 });

    await page.getByText('note-renamed.txt').first().click();
    await expect(page.getByTestId('pvc-detail-preview-content')).toContainText('detail-operation-content', { timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator(`[data-testid="pvc-node-download-${encodeURIComponent('/docs/note-renamed.txt')}"]`).first().click();
    const download = await downloadPromise;
    await expect(download.suggestedFilename()).toContain('note-renamed.txt');

    await page.locator(`[data-testid="pvc-node-delete-${encodeURIComponent('/docs/note-renamed.txt')}"]`).first().click();
    await page.getByRole('button', { name: '确认删除' }).click();

    await deleteResourceById(request, baseURL, token, created.resource_id);
  });
});
