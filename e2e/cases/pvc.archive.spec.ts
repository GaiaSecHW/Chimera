import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { bootstrapSession, loginByApi, openPvcManagement } from '../fixtures/auth';
import { buildSampleTarGz, deleteResourceById, listProjectResources, waitTaskSucceeded } from '../helpers/resource';
import { searchAndOpenPvcDetail, uniqueName } from '../helpers/ui';

const baseURL = process.env.E2E_BASE_URL || 'https://secflow.sothothv2.com';

test.describe('PVC archive flow', () => {
  test('upload archive from list page and verify extracted structure in detail page', async ({ page, request }) => {
    const token = await loginByApi(request, baseURL);
    const before = await listProjectResources(request, baseURL, token);
    const beforeIds = new Set(before.map((item) => item.id));

    const archive = buildSampleTarGz();
    const archiveName = `${uniqueName('e2e-archive')}.tar.gz`;

    await bootstrapSession(page, token);
    await openPvcManagement(page);

    await page.getByTestId('pvc-upload-archive-btn').click();
    await page.getByTestId('pvc-archive-upload-modal').waitFor({ state: 'visible' });
    await page.getByTestId('pvc-archive-file-input').setInputFiles({
      name: archiveName,
      mimeType: 'application/gzip',
      buffer: fs.readFileSync(archive.archivePath),
    });
    await page.getByTestId('pvc-archive-submit-btn').click();
    await expect(page.getByTestId('pvc-archive-upload-modal')).toBeHidden({ timeout: 30_000 });

    let createdTaskId: string | null = null;
    const started = Date.now();
    while (!createdTaskId && Date.now() - started < 60_000) {
      const taskResp = await request.get(
        `${baseURL}/api/resource/tasks?project_id=44f9029d00650a10&task_type=upload_extract`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!taskResp.ok()) break;
      const taskPayload = (await taskResp.json()) as { tasks?: Array<{ task_id: string; created_at?: string }> };
      const latest = (taskPayload.tasks || [])[0];
      if (latest?.task_id) createdTaskId = latest.task_id;
      if (!createdTaskId) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (createdTaskId) {
      await waitTaskSucceeded(request, baseURL, token, createdTaskId);
    }

    let createdResourceId: number | null = null;
    let createdResourceName = '';
    const pollStarted = Date.now();
    while (!createdResourceId && Date.now() - pollStarted < 180_000) {
      const now = await listProjectResources(request, baseURL, token);
      const created = now.find((item) => !beforeIds.has(item.id) && !!item.pvc_name && item.name.includes('e2e-archive'));
      if (created) {
        createdResourceId = created.id;
        createdResourceName = created.name;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    expect(createdResourceId).not.toBeNull();
    expect(createdResourceName).toBeTruthy();

    await page.getByTestId('pvc-list-refresh-btn').click();
    await searchAndOpenPvcDetail(page, createdResourceName);

    await expect(page.getByText('sample').first()).toBeVisible({ timeout: 30_000 });
    await page.getByText('sample').first().click();
    await expect(page.getByText('README.txt')).toBeVisible({ timeout: 30_000 });

    if (createdResourceId) {
      await deleteResourceById(request, baseURL, token, createdResourceId);
    }
    archive.cleanup();
  });
});
