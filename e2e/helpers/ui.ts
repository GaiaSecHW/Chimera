import { expect, type Page } from '@playwright/test';

export const uniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const searchAndOpenPvcDetail = async (page: Page, name: string) => {
  await page.getByTestId('pvc-list-search-input').fill(name);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  await page.getByText(name).first().click();
  await page.getByTestId('pvc-detail-back-btn').waitFor({ state: 'visible' });
};
