import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal, FormField, FormActionBar } from '../../../../design-system';
import { secAssessmentApi } from '../client';
import type { BaselineOption, ChimeraTaskRequest } from '../types';

interface ProjectCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ENV_OPTIONS = [
  { value: '', label: '— 不指定 —' },
  { value: 'dev', label: 'dev' },
  { value: 'staging', label: 'staging' },
  { value: 'production', label: 'production' },
];

export const ProjectCreateModal: React.FC<ProjectCreateModalProps> = ({ open, onClose, onCreated }) => {
  const [baselines, setBaselines] = useState<BaselineOption[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [baselineId, setBaselineId] = useState<number | ''>('');
  const [filePath, setFilePath] = useState('');
  const [key, setKey] = useState('');
  const [executor, setExecutor] = useState('');
  const [environment, setEnvironment] = useState('');
  const [priority, setPriority] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setBaselinesLoading(true);
    secAssessmentApi
      .listBaselineOptions()
      .then((d) => setBaselines(Array.isArray(d) ? d : []))
      .catch(() => setBaselines([]))
      .finally(() => setBaselinesLoading(false));
  }, [open]);

  const reset = () => {
    setProjectId(''); setTaskId(''); setBaselineId(''); setFilePath(''); setKey('');
    setExecutor(''); setEnvironment(''); setPriority(0); setError('');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const fillDemo = () => {
    const ts = Date.now().toString().slice(-6);
    setProjectId(`demo-proj-${ts}`);
    setTaskId(`demo-task-${ts}`);
    setFilePath('/mnt/e/AI4Eva_Chimera_dev/chimera-ai4eva-platform/_runtime/data/sample.apk');
    setKey('demo-gateway-token');
    setExecutor('测试用户');
    setEnvironment('dev');
    setPriority(0);
  };

  const handleSubmit = async () => {
    setError('');
    if (!projectId.trim() || !taskId.trim() || !baselineId || !filePath.trim() || !key.trim()) {
      setError('上游项目 ID、上游任务 ID、基线、输入文件路径、网关密钥 为必填');
      return;
    }
    const payload: ChimeraTaskRequest = {
      project_id: projectId.trim(),
      task_id: taskId.trim(),
      file_path: filePath.trim(),
      key: key.trim(),
      baseline_id: Number(baselineId),
    };
    if (executor.trim()) payload.executor = executor.trim();
    if (environment) payload.environment = environment;
    if (priority) payload.priority = priority;

    setSubmitting(true);
    try {
      await secAssessmentApi.createTask(payload);
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="新建评估任务" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-soft px-3 py-2">
          <span className="text-xs text-brand-primary">对应 POST /api/v1/tasks(M2M):创建项目 + 生成 baseline_execution + 工作区</span>
          <button className="btn btn-ghost text-xs" onClick={fillDemo} disabled={submitting}>
            <Sparkles size={13} /> 填入示例参数
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="上游项目 ID" required>
            <input className="form-input text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="demo-proj-1" disabled={submitting} />
          </FormField>
          <FormField label="上游任务 ID" required>
            <input className="form-input text-sm" value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="demo-task-1" disabled={submitting} />
          </FormField>
          <FormField label="基线" required>
            <select className="form-select text-sm" value={baselineId} onChange={(e) => setBaselineId(e.target.value ? Number(e.target.value) : '')} disabled={submitting || baselinesLoading}>
              <option value="">{baselinesLoading ? '加载中...' : '请选择基线'}</option>
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>{b.baseline_name}{b.version ? ` v${b.version}` : ''}{b.total_items != null ? ` (${b.total_items}项)` : ''}</option>
              ))}
            </select>
          </FormField>
          <FormField label="优先级">
            <input type="number" className="form-input text-sm" value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} min={0} disabled={submitting} />
          </FormField>
          <FormField label="输入文件路径" required>
            <input className="form-input text-sm font-mono" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/mnt/.../sample.apk" disabled={submitting} />
          </FormField>
          <FormField label="网关密钥" required>
            <input type="password" className="form-input text-sm font-mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="gateway_token" disabled={submitting} />
          </FormField>
          <FormField label="评估负责人">
            <input className="form-input text-sm" value={executor} onChange={(e) => setExecutor(e.target.value)} placeholder="负责人姓名" disabled={submitting} />
          </FormField>
          <FormField label="目标环境">
            <select className="form-select text-sm" value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={submitting}>
              {ENV_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
        </div>

        {error && <div className="text-xs text-state-danger rounded-md bg-rose-500/10 px-3 py-2">{error}</div>}
      </div>

      <FormActionBar
        onReset={handleClose}
        onSave={handleSubmit}
        saveText="创建任务"
        resetText="取消"
        saving={submitting}
      />
    </Modal>
  );
};
