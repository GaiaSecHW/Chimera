import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Plus, RefreshCw, Rocket, Search, Shield, X } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { ScheduleCenterUserTask, ScheduleCenterUserTaskCreatePayload, ScheduleCenterUserTaskListResponse, SecurityProject, ProjectInputUploadRecord, AiGatewayLlmKey } from '../../types/types';

interface Props {
  projectId: string;
  projects: SecurityProject[];
}

const TASK_TYPES = [
  { value: 'binary_firmware_e2e', label: '二进制固件端到端', downstreamView: 'binary-security-detail', inputType: 'software' },
  { value: 'source_scan_e2e', label: '源码扫描端到端', downstreamView: 'source-security-detail', inputType: 'code' },
  { value: 'binary_module_e2e', label: '二进制模块端到端', downstreamView: 'binary-module-security-detail', inputType: 'software' },
] as const;

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

export const TaskCenterPage: React.FC<Props> = ({ projectId, projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const fileserverApi = api.domains.assets.fileserver;
  const aigwApi = api.domains.platform.aigw;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ScheduleCenterUserTask[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [taskKeys, setTaskKeys] = useState<AiGatewayLlmKey[]>([]);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]['value']>('binary_firmware_e2e');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskKeyRef, setTaskKeyRef] = useState('');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [error, setError] = useState('');

  const projectName = useMemo(() => projects.find((item) => item.id === projectId)?.name || projectId, [projectId, projects]);
  const taskTypeMeta = useMemo(() => TASK_TYPES.find((item) => item.value === taskType) || TASK_TYPES[0], [taskType]);
  const filteredInputs = useMemo(() => inputs.filter((item) => item.input_type === taskTypeMeta.inputType), [inputs, taskTypeMeta.inputType]);
  const filteredTasks = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter((item) => [item.name, item.task_type, item.business_status, item.dispatch_status, item.downstream_task_id || ''].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [query, tasks]);
  const availableTaskKeys = useMemo(() => taskKeys.filter((item) => item.key_type === 'task'), [taskKeys]);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [taskResp, inputResp, keyResp] = await Promise.all([
        scheduleApi.listUserTasks(projectId) as Promise<ScheduleCenterUserTaskListResponse>,
        fileserverApi.listProjectInputUploads(projectId, { pageSize: 200 }) as Promise<{ items: ProjectInputUploadRecord[] }>,
        aigwApi.listLlmKeys() as Promise<{ items: AiGatewayLlmKey[] }>,
      ]);
      setTasks(taskResp.items || []);
      setStats(taskResp.stats || {});
      setInputs(inputResp.items || []);
      setTaskKeys(keyResp.items || []);
      setTaskKeyRef((keyResp.items || []).find((item) => item.key_type === 'task')?.id?.toString() || '');
      setSelectedInputId((inputResp.items || [])[0]?.upload_id || '');
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [projectId]);

  const createTask = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: ScheduleCenterUserTaskCreatePayload = {
        task_type: taskType,
        name,
        description,
        input_upload_ids: [selectedInputId],
        policy: {},
        dispatch_policy: {},
        task_key_ref: taskKeyRef,
        module_name: taskType === 'binary_module_e2e' ? moduleName : undefined,
      };
      await scheduleApi.createUserTask(projectId, payload);
      setCreateOpen(false);
      setName('');
      setDescription('');
      setModuleName('');
      await loadData();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const dispatchTask = async (task: ScheduleCenterUserTask) => {
    setDispatchingId(task.id);
    setError('');
    try {
      await scheduleApi.dispatchUserTask(projectId, task.id, {});
      await loadData();
    } catch (err: any) {
      setError(err?.message || '分发失败');
    } finally {
      setDispatchingId(null);
    }
  };

  const openTask = (task: ScheduleCenterUserTask) => {
    const meta = TASK_TYPES.find((item) => item.value === task.task_type);
    if (!meta) return;
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: { view: meta.downstreamView, [meta.downstreamView === 'binary-security-detail' ? 'binarySecurityTaskId' : meta.downstreamView === 'source-security-detail' ? 'sourceSecurityTaskId' : 'binaryModuleSecurityTaskId']: task.downstream_task_id || task.id },
    }));
  };

  const statsCards = [
    { label: '总任务', value: stats.total || tasks.length, icon: Shield },
    { label: '待分发', value: stats.ready_for_dispatch || 0, icon: Rocket },
    { label: '分发中', value: stats.dispatching || 0, icon: Loader2 },
    { label: '运行中', value: stats.running || 0, icon: CheckCircle2 },
    { label: '失败', value: stats.failed || 0, icon: X },
  ];

  return (
    <div className="min-h-full bg-slate-50 p-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">任务中心</h1>
          <div className="text-sm text-slate-500">{projectName}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><RefreshCw size={15} />刷新</button>
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><Plus size={15} />创建任务</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        {statsCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500"><span>{item.label}</span><Icon size={16} /></div>
              <div className="mt-2 text-2xl font-black">{item.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务名、状态、下游任务 ID" className="w-full bg-transparent outline-none" />
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">任务名</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">创建状态</th>
              <th className="px-4 py-3">分发状态</th>
              <th className="px-4 py-3">业务状态</th>
              <th className="px-4 py-3">输入记录数</th>
              <th className="px-4 py-3">work key</th>
              <th className="px-4 py-3">下游任务 ID</th>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>加载中...</td></tr> : null}
            {!loading && filteredTasks.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>暂无任务</td></tr> : null}
            {filteredTasks.map((task) => (
              <tr key={task.id} className="border-t">
                <td className="px-4 py-3 font-semibold">{task.name}</td>
                <td className="px-4 py-3">{TASK_TYPES.find((item) => item.value === task.task_type)?.label || task.task_type}</td>
                <td className="px-4 py-3">{task.create_status}</td>
                <td className="px-4 py-3">{task.dispatch_status}</td>
                <td className="px-4 py-3">{task.business_status}</td>
                <td className="px-4 py-3">{task.input_upload_count}</td>
                <td className="px-4 py-3 font-mono text-xs">{task.active_work_key_prefix || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{task.downstream_task_id || '—'}</td>
                <td className="px-4 py-3">{formatDateTime(task.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openTask(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">查看任务 <ArrowRight size={12} /></button>
                    {task.dispatch_status === 'ready_for_dispatch' || task.dispatch_status === 'dispatch_failed' ? (
                      <button onClick={() => void dispatchTask(task)} disabled={dispatchingId === task.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                        {dispatchingId === task.id ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} 分发
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-black">创建任务</div>
                <div className="text-sm text-slate-500">只选择现有任务输入，不支持上传</div>
              </div>
              <button onClick={() => setCreateOpen(false)}><X size={18} /></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold">任务类型
                <select value={taskType} onChange={(e) => setTaskType(e.target.value as any)} className="mt-1 w-full rounded-xl border px-3 py-2">
                  {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">task key
                <select value={taskKeyRef} onChange={(e) => setTaskKeyRef(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">
                  {availableTaskKeys.map((item) => <option key={item.id} value={String(item.id)}>{item.key_name} / {item.key_prefix}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold md:col-span-2">任务名称
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" />
              </label>
              <label className="block text-sm font-semibold md:col-span-2">描述
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" rows={3} />
              </label>
              <label className="block text-sm font-semibold md:col-span-2">任务输入记录
                <select value={selectedInputId} onChange={(e) => setSelectedInputId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">
                  {filteredInputs.map((item) => <option key={item.upload_id} value={item.upload_id}>{item.target_path} · {item.status}</option>)}
                </select>
                {filteredInputs.length === 0 ? <div className="mt-2 text-xs text-amber-600">没有可用输入，请先到“任务输入”上传 {taskTypeMeta.inputType} 类型记录。</div> : null}
              </label>
              {taskType === 'binary_module_e2e' ? (
                <label className="block text-sm font-semibold md:col-span-2">模块名
                  <input value={moduleName} onChange={(e) => setModuleName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" />
                </label>
              ) : null}
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setCreateOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">取消</button>
              <button onClick={() => void createTask()} disabled={saving || !name || !taskKeyRef || !selectedInputId} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? '创建中...' : '创建任务'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
