import { expect, test } from '@playwright/test';
import { loginByApi } from '../fixtures/auth';
import { createManualBlankPvc, deleteResourceById } from '../helpers/resource';

const baseURL = process.env.E2E_BASE_URL || 'https://secflow.ai.icsl.huawei.com';

test.describe('PVC error and boundary paths', () => {
  test('should reject invalid path operations', async ({ request }) => {
    const token = await loginByApi(request, baseURL);
    const created = await createManualBlankPvc(
      request,
      baseURL,
      token,
      `e2e-error-pvc-${Date.now()}`,
      'other'
    );

    const auth = { Authorization: `Bearer ${token}` };

    const invalidNameResp = await request.post(
      `${baseURL}/api/resource/resources/${created.resource_id}/browser/directories`,
      {
        headers: { ...auth, 'Content-Type': 'application/json' },
        data: { path: '/', name: '../bad' },
      }
    );
    expect(invalidNameResp.status()).toBeGreaterThanOrEqual(400);

    const deleteRootResp = await request.delete(
      `${baseURL}/api/resource/resources/${created.resource_id}/browser/node?path=${encodeURIComponent('/')}`,
      { headers: auth }
    );
    expect(deleteRootResp.status()).toBeGreaterThanOrEqual(400);

    const missingDirUploadResp = await request.post(
      `${baseURL}/api/resource/resources/${created.resource_id}/browser/upload`,
      {
        headers: auth,
        multipart: {
          path: '/not-exists',
          file: {
            name: 'a.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('x', 'utf-8'),
          },
        },
      }
    );
    expect(missingDirUploadResp.status()).toBeGreaterThanOrEqual(400);

    await deleteResourceById(request, baseURL, token, created.resource_id);
  });

  test('duplicate directory creation should return conflict-like error', async ({ request }) => {
    const token = await loginByApi(request, baseURL);
    const created = await createManualBlankPvc(
      request,
      baseURL,
      token,
      `e2e-dup-pvc-${Date.now()}`,
      'other'
    );

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const first = await request.post(
      `${baseURL}/api/resource/resources/${created.resource_id}/browser/directories`,
      {
        headers: authHeaders,
        data: { path: '/', name: 'dup' },
      }
    );
    expect(first.ok()).toBeTruthy();

    const second = await request.post(
      `${baseURL}/api/resource/resources/${created.resource_id}/browser/directories`,
      {
        headers: authHeaders,
        data: { path: '/', name: 'dup' },
      }
    );
    expect(second.status()).toBeGreaterThanOrEqual(400);

    await deleteResourceById(request, baseURL, token, created.resource_id);
  });
});
