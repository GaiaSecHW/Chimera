import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

export type UploadTaskStatus = 'queued' | 'uploading' | 'processing' | 'success' | 'failed' | 'canceled';

export interface UploadProgressEvent {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

export interface UploadTask {
  id: string;
  source: string;
  name: string;
  status: UploadTaskStatus;
  size: number;
  uploadedBytes: number;
  totalBytes: number;
  speedBps: number;
  error?: string;
  message?: string;
  startedAt: number;
  updatedAt: number;
}

export interface UploadSnapshot {
  tasks: UploadTask[];
  activeCount: number;
  totalCount: number;
  runningCount: number;
  queuedCount: number;
  processingCount: number;
  totalSpeedBps: number;
  totalUploadedBytes: number;
  totalBytes: number;
  hasBlockingTasks: boolean;
}

interface EnqueueTaskParams<TResult> {
  source: string;
  name: string;
  size?: number;
  run: (ctx: { signal: AbortSignal; onProgress: (event: UploadProgressEvent) => void }) => Promise<TResult>;
  postProcess?: (result: TResult) => Promise<void>;
}

interface InternalJob<TResult> {
  taskId: string;
  run: EnqueueTaskParams<TResult>['run'];
  postProcess?: EnqueueTaskParams<TResult>['postProcess'];
  resolve: (value: TResult) => void;
  reject: (reason?: any) => void;
  controller: AbortController;
}

const ACTIVE_STATUSES: UploadTaskStatus[] = ['queued', 'uploading', 'processing'];

const formatErrorMessage = (error: any): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return '上传失败';
};

class UploadCenterStore {
  private readonly listeners = new Set<() => void>();
  private readonly tasks = new Map<string, UploadTask>();
  private readonly queuedJobs: InternalJob<any>[] = [];
  private readonly runningJobs = new Map<string, InternalJob<any>>();
  private maxConcurrent = 3;
  private snapshot: UploadSnapshot = {
    tasks: [],
    activeCount: 0,
    totalCount: 0,
    runningCount: 0,
    queuedCount: 0,
    processingCount: 0,
    totalSpeedBps: 0,
    totalUploadedBytes: 0,
    totalBytes: 0,
    hasBlockingTasks: false,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private rebuildSnapshot = () => {
    this.listeners.forEach((listener) => listener());
  };

  setMaxConcurrent = (value: number) => {
    if (!Number.isFinite(value) || value < 1) return;
    this.maxConcurrent = Math.floor(value);
    this.pumpQueue();
  };

  private computeSnapshot = (): UploadSnapshot => {
    const tasks = Array.from(this.tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    const active = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
    const running = tasks.filter((task) => task.status === 'uploading');
    const queued = tasks.filter((task) => task.status === 'queued');
    const processing = tasks.filter((task) => task.status === 'processing');
    const totalUploadedBytes = tasks.reduce((sum, task) => sum + Math.max(0, task.uploadedBytes || 0), 0);
    const totalBytes = tasks.reduce((sum, task) => sum + Math.max(0, task.totalBytes || task.size || 0), 0);
    const totalSpeedBps = running.reduce((sum, task) => sum + Math.max(0, task.speedBps || 0), 0);
    return {
      tasks,
      activeCount: active.length,
      totalCount: tasks.length,
      runningCount: running.length,
      queuedCount: queued.length,
      processingCount: processing.length,
      totalSpeedBps,
      totalUploadedBytes,
      totalBytes,
      hasBlockingTasks: active.length > 0,
    };
  };

  private emit = () => {
    this.snapshot = this.computeSnapshot();
    this.listeners.forEach((listener) => listener());
  };

  getSnapshot = (): UploadSnapshot => this.snapshot;

  private updateTask = (taskId: string, patch: Partial<UploadTask>) => {
    const current = this.tasks.get(taskId);
    if (!current) return;
    this.tasks.set(taskId, {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });
    this.emit();
  };

  private markTaskFailed = (taskId: string, error: any) => {
    this.updateTask(taskId, {
      status: 'failed',
      error: formatErrorMessage(error),
      speedBps: 0,
    });
  };

  private runPostProcess = async <TResult,>(taskId: string, postProcess: ((result: TResult) => Promise<void>) | undefined, result: TResult) => {
    if (!postProcess) {
      this.updateTask(taskId, { status: 'success', speedBps: 0, message: '上传完成' });
      return;
    }

    this.updateTask(taskId, {
      status: 'processing',
      speedBps: 0,
      message: '服务器处理中',
    });

    try {
      await postProcess(result);
      this.updateTask(taskId, {
        status: 'success',
        speedBps: 0,
        message: '上传并处理完成',
      });
    } catch (error) {
      this.markTaskFailed(taskId, error);
    }
  };

  private pumpQueue = () => {
    while (this.runningJobs.size < this.maxConcurrent && this.queuedJobs.length > 0) {
      const next = this.queuedJobs.shift();
      if (!next) break;

      const task = this.tasks.get(next.taskId);
      if (!task) continue;
      if (task.status === 'canceled') {
        next.reject(new Error('上传已取消'));
        continue;
      }

      this.runningJobs.set(next.taskId, next);
      this.updateTask(next.taskId, { status: 'uploading', message: '上传中' });

      next
        .run({
          signal: next.controller.signal,
          onProgress: (event) => {
            const loaded = Math.max(0, event.loaded_bytes || 0);
            const total = Math.max(0, event.total_bytes || task.totalBytes || task.size || 0);
            this.updateTask(next.taskId, {
              uploadedBytes: loaded,
              totalBytes: total,
              speedBps: Math.max(0, event.speed_bytes_per_sec || 0),
              message: '上传中',
            });
          },
        })
        .then((result) => {
          next.resolve(result);
          this.runningJobs.delete(next.taskId);
          void this.runPostProcess(next.taskId, next.postProcess, result);
          this.pumpQueue();
        })
        .catch((error) => {
          this.runningJobs.delete(next.taskId);
          if (next.controller.signal.aborted) {
            this.updateTask(next.taskId, { status: 'canceled', speedBps: 0, message: '上传已取消' });
            next.reject(new Error('上传已取消'));
          } else {
            this.markTaskFailed(next.taskId, error);
            next.reject(error);
          }
          this.pumpQueue();
        });
    }
  };

  enqueue = <TResult,>(params: EnqueueTaskParams<TResult>): Promise<TResult> => {
    const taskId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();
    const initialSize = Math.max(0, params.size || 0);
    this.tasks.set(taskId, {
      id: taskId,
      source: params.source,
      name: params.name,
      status: 'queued',
      size: initialSize,
      uploadedBytes: 0,
      totalBytes: initialSize,
      speedBps: 0,
      startedAt: now,
      updatedAt: now,
      message: '排队中',
    });
    this.emit();

    const controller = new AbortController();

    const promise = new Promise<TResult>((resolve, reject) => {
      this.queuedJobs.push({
        taskId,
        run: params.run,
        postProcess: params.postProcess,
        resolve,
        reject,
        controller,
      });
    });

    this.pumpQueue();
    return promise;
  };

  cancelUpload = (taskId: string) => {
    const running = this.runningJobs.get(taskId);
    if (running) {
      running.controller.abort();
      return;
    }

    const idx = this.queuedJobs.findIndex((job) => job.taskId === taskId);
    if (idx >= 0) {
      const [job] = this.queuedJobs.splice(idx, 1);
      this.updateTask(taskId, { status: 'canceled', speedBps: 0, message: '上传已取消' });
      job.reject(new Error('上传已取消'));
      return;
    }

    const task = this.tasks.get(taskId);
    if (task && ACTIVE_STATUSES.includes(task.status)) {
      this.updateTask(taskId, { status: 'canceled', speedBps: 0, message: '上传已取消' });
    }
  };

  clearFinished = () => {
    let changed = false;
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'success' || task.status === 'failed' || task.status === 'canceled') {
        this.tasks.delete(taskId);
        changed = true;
      }
    }
    if (changed) this.emit();
  };
}

const uploadCenterStore = new UploadCenterStore();

export const uploadCenter = {
  subscribe: uploadCenterStore.subscribe,
  getSnapshot: uploadCenterStore.getSnapshot,
  enqueue: uploadCenterStore.enqueue,
  cancelUpload: uploadCenterStore.cancelUpload,
  clearFinished: uploadCenterStore.clearFinished,
  setMaxConcurrent: uploadCenterStore.setMaxConcurrent,
};

const UploadCenterContext = createContext(uploadCenter);

export const UploadCenterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo(() => uploadCenter, []);
  const snapshot = useSyncExternalStore(value.subscribe, value.getSnapshot, value.getSnapshot);

  useEffect(() => {
    if (!snapshot.hasBlockingTasks) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '当前仍有文件上传进行中，刷新或关闭页面可能导致上传失败。';
      return event.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [snapshot.hasBlockingTasks]);

  return <UploadCenterContext.Provider value={value}>{children}</UploadCenterContext.Provider>;
};

export const useUploadCenterStore = (): UploadSnapshot => {
  return useSyncExternalStore(uploadCenter.subscribe, uploadCenter.getSnapshot, uploadCenter.getSnapshot);
};

export const useUploadCenter = () => useContext(UploadCenterContext);

export const trackUploadTask = <TResult,>(params: EnqueueTaskParams<TResult>): Promise<TResult> => {
  return uploadCenter.enqueue(params);
};
