import type { APIRequestContext, Page } from '@playwright/test';
import { E2E_PROJECT_ID, E2E_PASSWORD, E2E_USERNAME, requireE2ESecrets } from './project';

export const loginByApi = async (request: APIRequestContext, baseURL: string): Promise<string> => {
  requireE2ESecrets();
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      username: E2E_USERNAME,
      password: E2E_PASSWORD,
    },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${response.statusText()}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload?.access_token) {
    throw new Error('Login response missing access_token');
  }
  return payload.access_token;
};

export const bootstrapSession = async (page: Page, token: string) => {
  await page.addInitScript(
    ({ accessToken, projectId }) => {
      localStorage.setItem('secflow_token', accessToken);
      localStorage.setItem('last_project_id', projectId);
    },
    { accessToken: token, projectId: E2E_PROJECT_ID }
  );
};

export const openPvcManagement = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('secflow-navigate-view', {
        detail: { view: 'public-resource-pvc-management' },
      })
    );
  });
  await page.getByTestId('pvc-page-root').waitFor({ state: 'visible' });
  await page.getByTestId('pvc-list-table-wrap').waitFor({ state: 'visible' });
};
