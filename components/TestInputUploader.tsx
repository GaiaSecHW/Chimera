import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../clients/api';
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
    const [keepOriginal, setKeepOriginal] = useState(false);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFilesToQueue = (files: FileList | null) => {
      if (!files) return;
      const next: UploadQueueItem[] = Array.from(files).map((file) => {
        const allowed = keepOriginal || isAllowedArchiveFileName(file.name || '');
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
    };

    useImperativeHandle(ref, () => ({
      hasFiles: () => uploadQueue.some((item) => item.status !== 'failed'),
      reset: () => {
        setUploadQueue([]);
        setInputType('document');
        setKeepOriginal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      triggerUpload: async () => {
        const readyFiles = uploadQueue.filter((item) => item.status !== 'failed').map((item) => item.file);
        if (!projectId || readyFiles.length === 0) {
          throw new Error('没有可上传的文件');
        }
        onUploadStateChange?.(true);
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
              keep_original: keepOriginal,
              upload_mode: keepOriginal ? 'raw' : 'archive',
              files: readyFiles,
            },
            {
              trackGlobal: false,
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
        }
      },
    }));

    return (
      <div className="space-y-3">
        {/* 输入类型 + 是否解压 */}
        <div className={compact ? 'flex items-center gap-4' : 'space-y-3'}>
          <label className={compact ? 'flex items-center gap-2 text-sm font-semibold' : 'block text-sm font-semibold'} style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            输入类型
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value as InputType)}
              className={compact ? 'rounded-lg px-2 py-1.5 text-sm outline-none' : 'mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none'}
              style={{
                backgroundColor: 'var(--uploader-input-bg, #18233a)',
                color: 'var(--uploader-input-color, #d6def0)',
                border: '1px solid var(--uploader-border, #26324a)',
              }}
            >
              {INPUT_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>{INPUT_TYPE_META[type].label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={(e) => setKeepOriginal(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            保留原始文件，不自动解压
          </label>
        </div>

        {/* 文件选择 */}
        <div className="rounded-xl border border-dashed px-4 py-4 text-center" style={{ borderColor: 'var(--uploader-border, #26324a)' }}>
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: 'var(--uploader-label-color, #d6def0)' }}>
            <Upload size={20} />
          </div>
          <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--uploader-input-color, #d6def0)' }}>
            {keepOriginal ? '上传原始文件' : '上传压缩包'}
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: 'var(--uploader-muted, #72809a)' }}>
            {keepOriginal
              ? '当前保留原始文件模式下，支持上传任意文件，一次可选择多个文件。'
              : '支持 zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz，一次可选择多个文件。'}
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--uploader-btn-bg, #18233a)',
                color: 'var(--uploader-input-color, #d6def0)',
                border: '1px solid var(--uploader-border, #26324a)',
              }}
            >
              选择文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
              className="hidden"
              onChange={(e) => addFilesToQueue(e.target.files)}
            />
          </div>
        </div>

        {/* 上传队列 */}
        <div className="space-y-2">
          {uploadQueue.length === 0 ? (
            <div className="rounded-lg px-3 py-3 text-sm" style={{ color: 'var(--uploader-muted, #72809a)', border: '1px solid var(--uploader-border, #26324a)' }}>
              还没有选择上传文件。
            </div>
          ) : (
            uploadQueue.map((item) => (
              <div key={item.id} className="rounded-lg px-3 py-3" style={{ border: '1px solid var(--uploader-border, #26324a)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" style={{ color: 'var(--uploader-input-color, #d6def0)' }}>{item.file.name}</div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--uploader-muted, #72809a)' }}>
                      {formatUploadBytes(item.file.size)} · {formatSpeed(item.speedBytesPerSec)}
                    </div>
                  </div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--uploader-muted, #72809a)' }}>
                    {item.error || item.status}
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: 'var(--uploader-input-bg, #18233a)' }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${item.progress}%`,
                      backgroundColor: item.status === 'failed' ? '#f15d5d' : 'var(--uploader-accent, #4f73ff)',
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
