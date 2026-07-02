import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { DropdownSelect } from '../design-system';
import { formatUploadBytes, isAllowedArchiveFileName } from '../pages/assets/baseResourcePageModel';
import { createTrackedProjectInputUpload } from '../services/projectInputUploadWorkflows';

export type InputType = 'document' | 'code' | 'software' | 'other';

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
  hideUploadIcon?: boolean;
  defaultInputType?: InputType;
  defaultKeepOriginal?: boolean;
  /** 隐藏「保留原始文件，不自动解压」勾选框（keepOriginal 仍由 defaultKeepOriginal 驱动）。 */
  hideKeepOriginal?: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
  /** 当提供时，输入类型下拉仅展示该范围内的选项（用于按工具 input_types 收窄）。 */
  allowedInputTypes?: InputType[];
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
  ({ projectId, displayName, compact = false, hideUploadIcon = false, defaultInputType = 'document', defaultKeepOriginal = false, hideKeepOriginal = false, onUploadStateChange, allowedInputTypes }, ref) => {
    const [inputType, setInputType] = useState<InputType>(defaultInputType);
    const [keepOriginal, setKeepOriginal] = useState(defaultKeepOriginal);
    useEffect(() => { setKeepOriginal(defaultKeepOriginal); }, [defaultKeepOriginal]);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    /* 输入类型可选范围：未提供 allowedInputTypes 时展示全部。 */
    const visibleInputTypes = useMemo(
      () => (allowedInputTypes && allowedInputTypes.length > 0
        ? INPUT_TYPE_ORDER.filter((t) => allowedInputTypes.includes(t))
        : INPUT_TYPE_ORDER),
      [allowedInputTypes],
    );
    /* 当可选范围变化且当前选择不在范围内时，回退到第一个可选项。 */
    useEffect(() => {
      if (visibleInputTypes.length > 0 && !visibleInputTypes.includes(inputType)) {
        setInputType(visibleInputTypes[0]);
      }
    }, [visibleInputTypes, inputType]);

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
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (id: string) => {
      setUploadQueue((current) => current.filter((item) => item.id !== id));
    };

    useImperativeHandle(ref, () => ({
      hasFiles: () => uploadQueue.some((item) => item.status !== 'failed'),
      reset: () => {
        setUploadQueue([]);
        setInputType(defaultInputType);
        setKeepOriginal(false);
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
          const result = await createTrackedProjectInputUpload({
            projectId,
            inputType,
            keepOriginal,
            uploadMode: keepOriginal ? 'raw' : 'archive',
            files: readyFiles,
            displayName,
            externalSignal: controller.signal,
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
          });
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
        {/* 输入类型 + 是否解压（同一行） */}
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">输入类型</div>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <DropdownSelect
                value={inputType}
                onChange={(v) => setInputType(v as InputType)}
                options={visibleInputTypes.map((type) => ({ value: type, label: INPUT_TYPE_META[type].label }))}
              />
            </div>
            {hideKeepOriginal ? null : (
              <label className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={keepOriginal}
                  onChange={(e) => setKeepOriginal(e.target.checked)}
                  className="h-4 w-4 rounded border-theme-border"
                />
                保留原始文件，不自动解压
              </label>
            )}
          </div>
        </div>

        {/* 文件选择 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="group cursor-pointer rounded-xl border border-dashed border-theme-border bg-theme-elevated/30 p-4 text-center transition-colors hover:border-theme-text-muted hover:bg-theme-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-text-muted"
        >
          {!hideUploadIcon && (
            <UploadCloud
              size={24}
              className="mx-auto text-theme-text-muted transition-colors group-hover:text-theme-text-primary"
            />
          )}
          <div className="mt-1 text-sm font-semibold text-theme-text-primary">
            {keepOriginal ? '点击上传原始文件' : '点击上传压缩包'}
          </div>
          <div className="mt-1 text-xs leading-5 text-theme-text-muted">
            {keepOriginal
              ? '当前保留原始文件模式下，支持上传任意文件，一次可选择多个文件。'
              : '支持 zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz，一次可选择多个文件。'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={keepOriginal ? undefined : '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz'}
            className="hidden"
            onChange={(e) => addFilesToQueue(e.target.files)}
          />
        </div>

        {/* 上传队列 */}
        <div className="space-y-2">
          {uploadQueue.length === 0 ? null : (
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
