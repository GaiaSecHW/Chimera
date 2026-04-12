import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CirclePlus, Eye, FolderUp, Play, RefreshCw, RotateCcw, Square, Trash2, Upload } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfTriggerTask, AiwfTriggerTaskInput, AiwfWorkflowDefinition } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, formatDateTime } from './AiwfShared';

type MetadataEntry = {
  id: string;
  key: string;
  value: string;
};

type TaskDraft = {
  localId: string;
  title: string;
  task_markdown: string;
  upstream_refs: string;
  metadataEntries: MetadataEntry[];
  uploadedInputs: UploadedInputItem[];
  uploadRootDirectoryId?: number | null;
  uploading: boolean;
};

type UploadedInputItem = {
  file_id: number;
  filename: string;
  storage_key: string;
  relative_path: string;
  size: number;
};

const newMetadataEntry = (): MetadataEntry => ({
  id: `meta-${Math.random().toString(36).slice(2, 10)}`,
  key: '',
  value: '',
});

const newTaskDraft = (index: number): TaskDraft => ({
  localId: `draft-${Date.now()}-${index}`,
  title: '',
  task_markdown: '',
  upstream_refs: '',
  metadataEntries: [newMetadataEntry()],
  uploadedInputs: [],
  uploadRootDirectoryId: null,
  uploading: false,
});

const toMetadataObject = (entries: MetadataEntry[]) =>
  entries.reduce<Record<string, string>>((acc, entry) => {
    const key = entry.key.trim();
    if (key) acc[key] = entry.value;
    return acc;
  }, {});

export const AiwfTriggersPage: React.FC<{
  projectId: string;
  selectedDefinitionId?: string;
  onNavigateToExecutionCenter?: () => void;
}> = ({ projectId, selectedDefinitionId, onNavigateToExecutionCenter }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [definitions, setDefinitions] = useState<AiwfWorkflowDefinition[]>([]);
  const [triggers, setTriggers] = useState<AiwfTriggerTask[]>([]);
  const [selectedDefinitionIdState, setSelectedDefinitionIdState] = useState(selectedDefinitionId || '');
  const [priority, setPriority] = useState<string>('');
  const [taskDrafts, setTaskDrafts] = useState<TaskDraft[]>([newTaskDraft(1)]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewJson, setPreviewJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [subprojectId, setSubprojectId] = useState<number | null>(null);
  const [stagingRootDirectoryId, setStagingRootDirectoryId] = useState<number | null>(null);
  const [activeUploadTaskId, setActiveUploadTaskId] = useState<string | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);
  const folderUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectedDefinitionId) setSelectedDefinitionIdState(selectedDefinitionId);
  }, [selectedDefinitionId]);

  useEffect(() => {
    if (projectId) {
      void Promise.all([loadDefinitions(), loadTriggers()]);
    }
  }, [projectId]);

  const loadDefinitions = async () => {
    try {
      const items = await api.aiAgentFramework.listDefinitions();
      setDefinitions(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载定义失败', 'error');
    }
  };

  const loadTriggers = async () => {
    try {
      setLoading(true);
      const items = await api.aiAgentFramework.listTriggerTasks();
      setTriggers(items.filter((item) => item.project_id === projectId));
    } catch (error: any) {
      notify(error.message || '加载触发任务失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.id === selectedDefinitionIdState) || null,
    [definitions, selectedDefinitionIdState]
  );
  const triggerableDefinitions = useMemo(
    () => definitions.filter((item) => item.definition_valid),
    [definitions]
  );

  const updateTaskDraft = (localId: string, updater: (current: TaskDraft) => TaskDraft) => {
    setTaskDrafts((current) => current.map((item) => (item.localId === localId ? updater(item) : item)));
  };

  const addTaskDraft = () => {
    setTaskDrafts((current) => [...current, newTaskDraft(current.length + 1)]);
  };

  const removeTaskDraft = (localId: string) => {
    setTaskDrafts((current) => (current.length > 1 ? current.filter((item) => item.localId !== localId) : current));
  };

  const buildPayload = (): AiwfTriggerTaskInput[] | null => {
    const payload = taskDrafts.map((draft, index) => {
      if (!draft.title.trim()) {
        notify(`任务 ${index + 1} 缺少标题`, 'warning');
        return null;
      }
      if (!draft.task_markdown.trim()) {
        notify(`任务 ${index + 1} 缺少任务描述`, 'warning');
        return null;
      }
      const metadataObj = toMetadataObject(draft.metadataEntries);
      if (draft.uploadedInputs.length > 0) {
        metadataObj.task_input_uploads = draft.uploadedInputs.map((item) => ({
          filename: item.filename,
          storage_key: item.storage_key,
          relative_path: item.relative_path,
          size: item.size,
        }));
      }
      return {
        title: draft.title.trim(),
        task_markdown: draft.task_markdown,
        metadata: metadataObj,
        upstream_refs: draft.upstream_refs
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      };
    });
    if (payload.some((item) => item === null)) return null;
    return payload as AiwfTriggerTaskInput[];
  };

  const ensureAiwfSubprojectId = async (): Promise<number> => {
    if (subprojectId) return subprojectId;
    const root = await api.fileserver.getRoot(projectId);
    const existed = root.items.find((item) => item.node_type === 'subproject' && item.name === 'AI_AGENT_FRAMEWORK' && item.subproject_id);
    if (existed?.subproject_id) {
      setSubprojectId(existed.subproject_id);
      return existed.subproject_id;
    }
    const created = await api.fileserver.createSubproject({
      project_id: projectId,
      name: 'AI_AGENT_FRAMEWORK',
      description: 'AI工作流任务输入与执行产物',
    });
    setSubprojectId(created.id);
    return created.id;
  };

  const ensureDirectory = async (subId: number, parentId: number | null, name: string): Promise<number> => {
    const payload = parentId === null
      ? await api.fileserver.getSubprojectChildren(projectId, subId)
      : await api.fileserver.getDirectoryChildren(projectId, parentId);
    const existed = payload.directories.find((item) => item.name === name);
    if (existed) return existed.id;
    const created = await api.fileserver.createDirectory({
      project_id: projectId,
      subproject_id: subId,
      parent_id: parentId,
      name,
    });
    return created.id;
  };

  const ensureTaskUploadDirectory = async (task: TaskDraft): Promise<{ subId: number; taskDirId: number }> => {
    const subId = await ensureAiwfSubprojectId();
    let rootId = stagingRootDirectoryId;
    if (!rootId) {
      rootId = await ensureDirectory(subId, null, 'aiwf-trigger-staging');
      setStagingRootDirectoryId(rootId);
    }
    if (task.uploadRootDirectoryId) {
      return { subId, taskDirId: task.uploadRootDirectoryId };
    }
    const taskDirId = await ensureDirectory(subId, rootId, `task-${task.localId}`);
    updateTaskDraft(task.localId, (current) => ({ ...current, uploadRootDirectoryId: taskDirId }));
    return { subId, taskDirId };
  };

  const handleSelectUpload = (taskLocalId: string, mode: 'files' | 'folder') => {
    setActiveUploadTaskId(taskLocalId);
    if (mode === 'files') fileUploadRef.current?.click();
    if (mode === 'folder') folderUploadRef.current?.click();
  };

  const handleUploadFiles = async (files: FileList | null, isFolder: boolean) => {
    if (!files || files.length === 0 || !activeUploadTaskId) return;
    const draft = taskDrafts.find((item) => item.localId === activeUploadTaskId);
    if (!draft) return;
    updateTaskDraft(draft.localId, (current) => ({ ...current, uploading: true }));
    try {
      const { subId, taskDirId } = await ensureTaskUploadDirectory(draft);
      const dirCache = new Map<string, number>();
      dirCache.set('', taskDirId);

      const resolveParentDirectoryId = async (relativePath: string): Promise<number> => {
        const parts = relativePath.split('/').filter(Boolean);
        if (parts.length <= 1) return taskDirId;
        const dirParts = parts.slice(0, -1);
        let currentPath = '';
        let parentId = taskDirId;
        for (const name of dirParts) {
          currentPath = currentPath ? `${currentPath}/${name}` : name;
          const cached = dirCache.get(currentPath);
          if (cached) {
            parentId = cached;
            continue;
          }
          const createdId = await ensureDirectory(subId, parentId, name);
          dirCache.set(currentPath, createdId);
          parentId = createdId;
        }
        return parentId;
      };

      const uploaded: UploadedInputItem[] = [];
      for (const file of Array.from(files)) {
        const relativePath = (isFolder ? (file as any).webkitRelativePath || file.name : file.name).replace(/^\/+/, '');
        const parentDirId = await resolveParentDirectoryId(relativePath);
        const result = await api.fileserver.uploadFile(
          {
            project_id: projectId,
            subproject_id: subId,
            directory_id: parentDirId,
            file,
          },
          { trackGlobal: true, sourceLabel: 'AI工作流任务输入上传' }
        );
        uploaded.push({
          file_id: result.id,
          filename: result.filename,
          storage_key: result.storage_key,
          relative_path: relativePath,
          size: result.size,
        });
      }
      updateTaskDraft(draft.localId, (current) => ({
        ...current,
        uploadedInputs: [...current.uploadedInputs, ...uploaded],
        uploading: false,
      }));
      notify(`上传完成，共 ${uploaded.length} 个文件`, 'success');
    } catch (error: any) {
      updateTaskDraft(draft.localId, (current) => ({ ...current, uploading: false }));
      notify(error.message || '上传文件失败', 'error');
    } finally {
      setActiveUploadTaskId(null);
      if (fileUploadRef.current) fileUploadRef.current.value = '';
      if (folderUploadRef.current) folderUploadRef.current.value = '';
    }
  };

  const handlePreviewJson = () => {
    const payload = buildPayload();
    if (!payload) return;
    setPreviewJson(
      JSON.stringify(
        {
          input_tasks: payload,
          priority: priority.trim() ? Number(priority) : undefined,
          system_injected_task_type: selectedDefinition?.entry_input_task_type || null,
        },
        null,
        2
      )
    );
    setPreviewOpen(true);
  };

  const handleCreateTrigger = async () => {
    if (!selectedDefinitionIdState) {
      notify('请先选择一个工作流定义', 'warning');
      return;
    }
    const input_tasks = buildPayload();
    if (!input_tasks) return;
    try {
      await api.aiAgentFramework.createTriggerTask(selectedDefinitionIdState, {
        input_tasks,
        priority: priority.trim() ? Number(priority) : undefined,
      });
      notify('触发任务已创建，任务输入会自动落盘到项目 AI_AGENT_FRAMEWORK 目录', 'success');
      setTaskDrafts([newTaskDraft(1)]);
      setPriority('');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '创建触发任务失败', 'error');
    }
  };

  const handleCancelTrigger = async (triggerId: string) => {
    try {
      await api.aiAgentFramework.cancelTriggerTask(triggerId);
      notify('已提交取消请求', 'success');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '取消触发任务失败', 'error');
    }
  };

  const handleRetryTrigger = async (triggerId: string) => {
    try {
      await api.aiAgentFramework.retryTriggerTask(triggerId);
      notify('已基于当前触发任务创建重试任务', 'success');
      await loadTriggers();
    } catch (error: any) {
      notify(error.message || '重试触发任务失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流触发任务"
      description=""
      actions={
        <button onClick={() => void loadTriggers()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <div className="space-y-3">
        <AiwfCard className="p-4 space-y-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black tracking-widest uppercase text-slate-500">目标工作流定义</label>
              <select
                value={selectedDefinitionIdState}
                onChange={(e) => setSelectedDefinitionIdState(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
              >
                <option value="">请选择</option>
                {triggerableDefinitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}
                  </option>
                ))}
              </select>
              {selectedDefinition ? (
                <p className="text-xs text-slate-500 mt-2">
                  根工作流：{selectedDefinition.root_workflow_id || '-'}，入口任务类型：{selectedDefinition.entry_input_task_type || '-'}，终态输出类型：{selectedDefinition.final_output_task_type || '-'}
                </p>
              ) : null}
              {definitions.length > triggerableDefinitions.length ? (
                <p className="text-[11px] text-amber-600 mt-2">
                  检测到 {definitions.length - triggerableDefinitions.length} 个旧格式或无效定义，已在触发下拉框中自动隐藏，请先在定义页修复。
                </p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务优先级</label>
              <input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="留空则使用 definition 默认优先级"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>
        </AiwfCard>

          <AiwfCard className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black tracking-widest uppercase text-slate-500">输入任务</div>
                <div className="text-xs text-slate-500 mt-1">逐条填写任务描述，支持上传文件/文件夹到任务输入目录。</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addTaskDraft} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                  <CirclePlus size={14} />
                  新增任务
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {taskDrafts.map((draft, index) => (
                <div key={draft.localId} className="rounded-xl border border-slate-200 p-3 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black text-slate-800">任务 {index + 1}</div>
                    <button
                      onClick={() => removeTaskDraft(draft.localId)}
                      disabled={taskDrafts.length === 1}
                      className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务标题</label>
                      <input
                        value={draft.title}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, title: e.target.value }))}
                        placeholder="如 待分析固件包"
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务描述 Markdown</label>
                    <textarea
                      value={draft.task_markdown}
                      onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, task_markdown: e.target.value }))}
                      className="mt-1 w-full min-h-[140px] px-3 py-2 rounded-xl border border-slate-200 text-sm leading-5"
                      placeholder={'# 任务说明\n\n- 输入对象\n- 目标范围\n- 约束条件'}
                      spellCheck={false}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">上游任务引用</label>
                      <textarea
                        value={draft.upstream_refs}
                        onChange={(e) => updateTaskDraft(draft.localId, (current) => ({ ...current, upstream_refs: e.target.value }))}
                        className="mt-1 w-full min-h-[88px] px-3 py-2 rounded-xl border border-slate-200 text-sm leading-5"
                        placeholder={'每行一个上游 task_id\n如:\npackage-001\nanalysis-002'}
                        spellCheck={false}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-black tracking-widest uppercase text-slate-500">任务元数据</label>
                      <div className="mt-2 space-y-3">
                        {draft.metadataEntries.map((entry) => (
                          <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <input
                              value={entry.key}
                              onChange={(e) =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.map((item) => item.id === entry.id ? { ...item, key: e.target.value } : item),
                                }))
                              }
                              placeholder="键"
                              className="px-3 py-2 rounded-xl border border-slate-200"
                            />
                            <input
                              value={entry.value}
                              onChange={(e) =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.map((item) => item.id === entry.id ? { ...item, value: e.target.value } : item),
                                }))
                              }
                              placeholder="值"
                              className="px-3 py-2 rounded-xl border border-slate-200"
                            />
                            <button
                              onClick={() =>
                                updateTaskDraft(draft.localId, (current) => ({
                                  ...current,
                                  metadataEntries: current.metadataEntries.length > 1
                                    ? current.metadataEntries.filter((item) => item.id !== entry.id)
                                    : current.metadataEntries,
                                }))
                              }
                              className="px-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            updateTaskDraft(draft.localId, (current) => ({
                              ...current,
                              metadataEntries: [...current.metadataEntries, newMetadataEntry()],
                            }))
                          }
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                        >
                          添加元数据
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-300 p-3 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black text-slate-700">任务输入文件</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSelectUpload(draft.localId, 'files')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs hover:bg-slate-50"
                          disabled={draft.uploading}
                        >
                          <Upload size={14} />
                          上传文件
                        </button>
                        <button
                          onClick={() => handleSelectUpload(draft.localId, 'folder')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs hover:bg-slate-50"
                          disabled={draft.uploading}
                        >
                          <FolderUp size={14} />
                          上传文件夹
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">上传文件会复用 fileserver 上传接口，并在触发执行时自动拷贝到该任务输入目录。</div>
                    <div className="mt-2 max-h-28 overflow-auto rounded-lg bg-white border border-slate-200">
                      {draft.uploadedInputs.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">暂无上传文件</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="text-left px-2 py-1">相对路径</th>
                              <th className="text-left px-2 py-1">大小</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.uploadedInputs.map((item, idx) => (
                              <tr key={`${item.file_id}-${idx}`} className="border-t border-slate-100">
                                <td className="px-2 py-1 font-mono">{item.relative_path}</td>
                                <td className="px-2 py-1">{item.size}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={handlePreviewJson} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
                <Eye size={14} />
                任务预览
              </button>
              <button onClick={() => void handleCreateTrigger()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                <Play size={16} />
                创建触发任务
              </button>
            </div>
          </AiwfCard>
          <input
            ref={fileUploadRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleUploadFiles(event.target.files, false)}
          />
          <input
            ref={folderUploadRef}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: 'true', directory: 'true' } as any)}
            onChange={(event) => void handleUploadFiles(event.target.files, true)}
          />
        <AiwfCard className="overflow-hidden">
          {triggers.length === 0 ? (
            <AiwfEmpty title="暂无触发任务" description="从上方创建 trigger task，或从定义页一键跳转过来发起执行。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4">任务 ID</th>
                    <th className="px-6 py-4">Definition</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">优先级</th>
                    <th className="px-6 py-4">提交时间</th>
                    <th className="px-6 py-4">消息</th>
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.map((trigger) => (
                    <tr key={trigger.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800">{trigger.id}</div>
                        <div className="text-xs text-slate-500 mt-1">{trigger.trigger_type}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{trigger.workflow_definition_id}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {trigger.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{trigger.priority}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(trigger.created_at)}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-[280px] truncate">{trigger.message || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => onNavigateToExecutionCenter?.()} className="px-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
                            查看执行
                          </button>
                          <button onClick={() => void handleRetryTrigger(trigger.id)} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
                            <RotateCcw size={16} />
                          </button>
                          <button onClick={() => void handleCancelTrigger(trigger.id)} className="p-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100">
                            <Square size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AiwfCard>
      </div>
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="font-black text-slate-800">触发任务 JSON 预览</div>
              <button className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm" onClick={() => setPreviewOpen(false)}>
                关闭
              </button>
            </div>
            <pre className="p-4 max-h-[65vh] overflow-auto text-xs leading-5 bg-slate-950 text-slate-100 rounded-b-2xl">{previewJson}</pre>
          </div>
        </div>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
