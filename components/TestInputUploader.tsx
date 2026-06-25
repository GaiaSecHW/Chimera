import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { api } from '../clients/api';
import { DropdownSelect } from '../design-system';
import { formatUploadBytes, isAllowedArchiveFileName } from '../pages/assets/baseResourcePageModel';

type InputType = 'document' | 'code' | 'software' | 'other';

const INPUT_TYPE_META: Record<InputType, { label: string }> = {
  document: { label: '文档' },
  code: { label: '代码' },
  software: { label: '软件包' },
  other: { label: '其他' },
};

const INPUT_TYPE_ORDER: InputType[] = ['document', 'code', 'software', 'other'];

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  speedBytesPerSec?: number;
  error?: string;
}

export interface TestInputUploaderHandle {
  triggerUpload: () => Promise<{ uploadId: string }>;
  hasFiles: () => boolean;
  reset: () => void;
  cancel: () => void;
}

export interface TestInputUploaderProps {
  projectId: string;
  displayName: string;
  compact?: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
}

const formatSpeed = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let next = bytes;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const TestInputUploader = forwardRef<TestInputUploaderHandle, TestInputUploaderProps>(
  ({ projectId, displayName, compact = false, onUploadStateChange }, ref) => {
    const fileserverApi = api.domains.assets.fileserver;
    const [inputType, setInputType] = useState<InputType>('document');
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const addFilesToQueue = (files: FileList | null) => {
      if (!files) return;
      const next: UploadQueueItem[] = Array.from(files).map((file) => {
        const allowed = isAllowedArchiveFileName(file.name || '');
        return {
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          status: allowed ? 'pending' : 'failed',
          progress: 0,
          speedBytesPerSec: 0,
          error: allowed ? undefined : '仅支持压缩包上传',
        };
      });
      setUploadQueue((current) => [...current, ...next]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (id: string) => {
      setUploadQueue((current) => current.filter((item) => item.id !== id));
    };

    useImperativeHandle(ref, () => ({
      hasFiles: () => uploadQueue.some((item) => item.status !== 'failed'),
      reset: () => {
        setUploadQueue([]);
        setInputType('document');
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      cancel: () => {
        abortControllerRef.current?.abort();
      },
      triggerUpload: async () => {
        const readyFiles = uploadQueue.filter((item) => item.status !== 'failed').map((item) => item.file);
        if (!projectId || readyFiles.length === 0) {
          throw new Error('没有可上传的文件');
        }
        onUploadStateChange?.(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setUploadQueue((current) =>
          current.map((item) =>
            item.status === 'failed' ? item : { ...item, status: 'uploading', progress: 40, speedBytesPerSec: 0 },
          ),
        );
        try {
          const result = await fileserverApi.createProjectInputUpload(
            {
              project_id: projectId,
              input_type: inputType,
              keep_original: false,
              upload_mode: 'archive',
              files: readyFiles,
            },
            {
              signal: controller.signal,
              onProgress: (progress) => {
                setUploadQueue((current) =>
                  current.map((item) =>
                    item.status === 'failed'
                      ? item
                      : {
                          ...item,
                          progress: Math.max(
                            item.progress,
                            progress.total_bytes > 0
                              ? Math.round((progress.loaded_bytes / progress.total_bytes) * 100)
                              : item.progress,
                          ),
                          speedBytesPerSec: progress.speed_bytes_per_sec || 0,
                        },
                  ),
                );
              },
            },
          );
          if (result?.upload_id && displayName.trim()) {
            await fileserverApi.updateProjectInputUploadDisplayName({
              upload_id: result.upload_id,
              project_id: projectId,
              display_name: displayName.trim(),
            });
          }
          // Poll until server finishes processing (extracting/indexing)
          const uploadId = result.upload_id;
          if (uploadId) {
            const maxAttempts = 120;
            for (let i = 0; i < maxAttempts; i++) {
              if (controller.signal.aborted) throw new Error('上传已取消');
              const detail = await fileserverApi.getProjectInputUploadDetail(uploadId);
              if (detail.status === 'succeeded' || detail.status === 'partial_failed') break;
              if (detail.status === 'failed') throw new Error(detail.last_error || '服务器处理上传文件失败');
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
          setUploadQueue((current) =>
            current.map((item) =>
              item.status === 'failed' ? item : { ...item, status: 'completed', progress: 100, speedBytesPerSec: 0 },
            ),
          );
          return { uploadId: result.upload_id };
        } catch (error: any) {
          const message = error?.message || '上传失败';
          setUploadQueue((current) =>
            current.map((item) =>
              item.status === 'failed'
                ? item
                : { ...item, status: 'failed', progress: 0, speedBytesPerSec: 0, error: message },
            ),
          );
          throw error;
        } finally {
          onUploadStateChange?.(false);
          abortControllerRef.current = null;
        }
      },
    }));

    return (
      <div className="space-y-4">
        {/* 输入类型 */}
        <div className="space-y-1.5">
          <label className="form-label">输入类型</label>
          <DropdownSelect
            value={inputType}
            onChange={(v) => setInputType(v as InputType)}
            options={INPUT_TYPE_ORDER.map((type) => ({ value: type, label: INPUT_TYPE_META[type].label }))}
          />
        </div>

        {/* 文件选择 */}
        <div className="rounded-xl border border-dashed border-theme-border px-4 py-4 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-theme-elevated text-theme-text-muted">
            <Upload size={20} />
          </div>
          <div className="mt-2 text-sm font-semibold text-theme-text-primary">
            上传压缩包
          </div>
          <div className="mt-1 text-xs leading-5 text-theme-text-muted">
            支持 zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz，一次可选择多个文件。
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary"
            >
              选择文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept='.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'
              className="hidden"
              onChange={(e) => addFilesToQueue(e.target.files)}
            />
          </div>
        </div>

        {/* 上传队列 */}
        <div className="space-y-2">
          {uploadQueue.length === 0 ? (
            <div className="rounded-xl border border-state-warning-border bg-state-warning-soft px-4 py-2 text-sm text-state-warning">
              还没有选择上传文件。
            </div>
          ) : (
            uploadQueue.map((item) => (
              <div key={item.id} className="rounded-lg border border-theme-border px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-theme-text-primary">{item.file.name}</div>
                    <div className="mt-0.5 text-xs text-theme-text-muted">
                      {formatUploadBytes(item.file.size)} · {formatSpeed(item.speedBytesPerSec)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-theme-text-muted">
                      {item.error || item.status}
                    </span>
                    {(item.status === 'pending' || item.status === 'failed') && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="text-theme-text-muted hover:text-state-danger transition-colors"
                        aria-label="移除"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-theme-elevated">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${item.progress}%`,
                      backgroundColor: item.status === 'failed' ? '#f15d5d' : '#4f73ff',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
);
