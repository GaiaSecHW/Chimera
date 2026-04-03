import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { APIRequestContext } from '@playwright/test';
import { E2E_PROJECT_ID } from '../fixtures/project';

export interface ResourceSummary {
  id: number;
  name: string;
  resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
  pvc_name?: string;
  resource_uuid: string;
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export const listProjectResources = async (
  request: APIRequestContext,
  baseURL: string,
  token: string
): Promise<ResourceSummary[]> => {
  const response = await request.get(
    `${baseURL}/api/resource/resources?project_id=${encodeURIComponent(E2E_PROJECT_ID)}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok()) {
    throw new Error(`listProjectResources failed: ${response.status()} ${response.statusText()}`);
  }
  const payload = (await response.json()) as { resources?: ResourceSummary[] };
  return payload.resources || [];
};

export const createManualBlankPvc = async (
  request: APIRequestContext,
  baseURL: string,
  token: string,
  name: string,
  resourceType: ResourceSummary['resource_type'] = 'other'
): Promise<{ resource_id: number; pvc_name: string }> => {
  const response = await request.post(`${baseURL}/api/resource/resources/pvc-manual`, {
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    data: {
      name,
      description: 'e2e-blank-pvc',
      project_id: E2E_PROJECT_ID,
      pvc_size: 2,
      resource_type: resourceType,
    },
  });
  if (!response.ok()) {
    throw new Error(`createManualBlankPvc failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { resource_id: number; pvc_name: string };
};

export const uploadArchiveResource = async (
  request: APIRequestContext,
  baseURL: string,
  token: string,
  archivePath: string,
  name: string,
  resourceType: ResourceSummary['resource_type'] = 'code'
): Promise<{ task_id: string; resource_uuid: string }> => {
  const response = await request.post(`${baseURL}/api/resource/resources/upload`, {
    headers: authHeaders(token),
    multipart: {
      file: {
        name: path.basename(archivePath),
        mimeType: 'application/gzip',
        buffer: fs.readFileSync(archivePath),
      },
      name,
      resource_type: resourceType,
      project_ids: E2E_PROJECT_ID,
      pvc_size: '2',
    },
  });

  if (!response.ok()) {
    throw new Error(`uploadArchiveResource failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { task_id: string; resource_uuid: string };
};

export const waitTaskSucceeded = async (
  request: APIRequestContext,
  baseURL: string,
  token: string,
  taskId: string,
  timeoutMs = 8 * 60 * 1000
): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await request.get(`${baseURL}/api/resource/tasks/${taskId}`, {
      headers: authHeaders(token),
    });
    if (!response.ok()) {
      throw new Error(`waitTaskSucceeded failed to fetch task: ${response.status()}`);
    }
    const payload = (await response.json()) as { status?: string; error_message?: string };
    if (payload.status === 'succeeded') return;
    if (payload.status === 'failed' || payload.status === 'cancelled') {
      throw new Error(`task ${taskId} ended with status=${payload.status}, error=${payload.error_message || ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`task ${taskId} timeout after ${timeoutMs}ms`);
};

export const deleteResourceById = async (
  request: APIRequestContext,
  baseURL: string,
  token: string,
  resourceId: number
): Promise<void> => {
  await request.delete(`${baseURL}/api/resource/resources/${resourceId}`, {
    headers: authHeaders(token),
  });
};

export const buildSampleTarGz = (): { archivePath: string; cleanup: () => void } => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secflow-e2e-'));
  const sampleRoot = path.join(tmpRoot, 'sample');
  fs.mkdirSync(path.join(sampleRoot, 'dir1', 'dir2'), { recursive: true });
  fs.writeFileSync(path.join(sampleRoot, 'README.txt'), 'sample archive root file\n', 'utf-8');
  fs.writeFileSync(path.join(sampleRoot, 'dir1', 'dir2', 'nested.txt'), 'nested content\n', 'utf-8');

  const archivePath = path.join(tmpRoot, 'sample.tar.gz');
  execFileSync('tar', ['-czf', archivePath, '-C', tmpRoot, 'sample']);

  return {
    archivePath,
    cleanup: () => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
};
