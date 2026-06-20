import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Pencil, Play, Plus, RefreshCw, Search, Share2, Trash2 } from 'lucide-react';
import { PageHeader } from '../../design-system';
import {
  ExecutionTable,
  ExecutionTableEmptyRow,
  ExecutionTableHead,
  ExecutionTableTd,
  ExecutionTableTh,
  executionTableInteractiveRowClassName,
} from '../../components/execution/ExecutionTable';
import { showConfirm } from '../../components/DialogService';
import { redlineVerificationApi } from '../../clients/redlineVerification';
import type { RedlineProductInfo, RedlineTask } from '../../clients/redlineVerification';
import { ShareDialog } from './components/ShareDialog';
import { ReportHistoryPanel } from './components/ReportHistoryPanel';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const STATUS_MAP: Record<string, { label: string; tone: string }> = {
  CREATED: { label: '待上传', tone: 'bg-theme-elevated text-theme-text-secondary border-theme-border' },
  PARSE_PENDING: { label: '排队中', tone: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  PARSING: { label: '解析中', tone: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  PARSED: { label: '待执行', tone: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  EXECUTING: { label: '执行中', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  COMPLETED: { label: '已完成', tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  FAILED: { label: '失败', tone: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  UPLOAD_FAILED: { label: '上传失败', tone: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

function getStatusDisplay(task: RedlineTask) {
  if (task.status === 'COMPLETED') {
    if (task.execSuccess === true) {
      return { label: '成功', tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    }
    if (task.execSuccess === false) {
      return { label: '失败', tone: 'bg-rose-500/15 text-rose-400 border-rose-500/20' };
    }
  }
  return STATUS_MAP[task.status] || { label: task.status, tone: 'bg-theme-elevated text-theme-text-secondary border-theme-border' };
}

export const RedlineOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const [tasks, setTasks] = useState<RedlineTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<RedlineTask | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formVersion, setFormVersion] = useState('');
  const [products, setProducts] = useState<string[]>([]);
  const [versions, setVersions] = useState<RedlineProductInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Share & History state
  const [shareTaskId, setShareTaskId] = useState('');
  const [historyTaskId, setHistoryTaskId] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await redlineVerificationApi.listTasks();
      if (res.code === 200) {
        setTasks(res.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const fetchProducts = useCallback(async () => {
    const res = await redlineVerificationApi.getProducts();
    if (res.code === 200) {
      setProducts(res.data || []);
    }
  }, []);

  const fetchVersions = useCallback(async (product: string) => {
    if (!product) {
      setVersions([]);
      return;
    }
    const res = await redlineVerificationApi.getProductVersions(product);
    if (res.code === 200) {
      setVersions(res.data || []);
    }
  }, []);

  // Filtered tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter && task.status !== statusFilter) return false;
    if (search && !task.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // --- Dialog handlers ---

  const openCreateDialog = async () => {
    setFormName('');
    setFormProduct('');
    setFormVersion('');
    setVersions([]);
    await fetchProducts();
    setShowCreateDialog(true);
  };

  const openEditDialog = async (task: RedlineTask) => {
    setEditingTask(task);
    setFormName(task.name);
    setFormProduct(task.productName || '');
    setFormVersion(task.versionId || '');
    await fetchProducts();
    if (task.productName) {
      await fetchVersions(task.productName);
    }
    setShowEditDialog(true);
  };

  const closeDialogs = () => {
    setShowCreateDialog(false);
    setShowEditDialog(false);
    setEditingTask(null);
  };

  const handleProductChange = (product: string) => {
    setFormProduct(product);
    setFormVersion('');
    fetchVersions(product);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const selectedVersion = versions.find((v) => v.id === formVersion);
      await redlineVerificationApi.createTask({
        name: formName.trim(),
        productId: selectedVersion?.id || '',
        versionId: formVersion,
      });
      closeDialogs();
      await fetchTasks();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingTask || !formName.trim()) return;
    setSubmitting(true);
    try {
      await redlineVerificationApi.updateTask(editingTask.id, {
        name: formName.trim(),
        productId: versions.find((v) => v.id === formVersion)?.id || '',
        versionId: formVersion,
      });
      closeDialogs();
      await fetchTasks();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (task: RedlineTask) => {
    const confirmed = await showConfirm({
      title: '确认删除',
      message:`确定要删除任务"${task.name}" 吗？`,
      danger: true,
    });
    if (!confirmed) return;
    await redlineVerificationApi.deleteTask(task.id);
    await fetchTasks();
  };

  // --- Unique product names for select ---
  const uniqueProducts = products;

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-theme-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title="红线验证"
        actions={<div className="flex items-center gap-2">
          <button onClick={fetchTasks} className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors" title="刷新"><RefreshCw className="h-4 w-4 text-theme-text-secondary" /></button>
          <button onClick={openCreateDialog} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"><Plus className="h-4 w-4" />新建任务</button>
        </div>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-theme-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务名称..."
            className="w-64 rounded-lg border border-theme-border bg-theme-surface pl-9 pr-3 py-2 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* Table */}
      <ExecutionTable>
        <ExecutionTableHead>
          <tr>
            <ExecutionTableTh>任务名称</ExecutionTableTh>
            <ExecutionTableTh>产品/版本</ExecutionTableTh>
            <ExecutionTableTh>状态</ExecutionTableTh>
            <ExecutionTableTh>更新人</ExecutionTableTh>
            <ExecutionTableTh>更新时间</ExecutionTableTh>
            <ExecutionTableTh>操作</ExecutionTableTh>
          </tr>
        </ExecutionTableHead>
        <tbody>
          {filteredTasks.length === 0 ? (
            <ExecutionTableEmptyRow colSpan={6} message="暂无任务数据" />
          ) : (
            filteredTasks.map((task) => {
              const status = getStatusDisplay(task);
              return (
                <tr key={task.id} className={executionTableInteractiveRowClassName}>
                  <ExecutionTableTd>{task.name}</ExecutionTableTd>
                  <ExecutionTableTd>
                    {task.productName || '-'}
                    {task.versionNo ?` / ${task.versionNo}` : ''}
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                      {status.label}
                    </span>
                  </ExecutionTableTd>
                  <ExecutionTableTd>{task.updatedBy || '-'}</ExecutionTableTd>
                  <ExecutionTableTd>
                    {task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenTask(task.id)}
                        className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors"
                        title="执行/查看"
                      >
                        <Play className="h-4 w-4 text-theme-text-secondary" />
                      </button>
                      <button
                        onClick={() => openEditDialog(task)}
                        className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors"
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4 text-theme-text-secondary" />
                      </button>
                      <button
                        onClick={() => handleDelete(task)}
                        className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4 text-theme-text-secondary" />
                      </button>
                      <button
                        onClick={() => setShareTaskId(task.id)}
                        className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors"
                        title="分享"
                      >
                        <Share2 className="h-4 w-4 text-theme-text-secondary" />
                      </button>
                      <button
                        onClick={() => setHistoryTaskId(task.id)}
                        className="p-1.5 rounded-lg hover:bg-theme-surface-hover transition-colors"
                        title="历史"
                      >
                        <History className="h-4 w-4 text-theme-text-secondary" />
                      </button>
                    </div>
                  </ExecutionTableTd>
                </tr>
              );
            })
          )}
        </tbody>
      </ExecutionTable>

      {/* Create Task Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50" onClick={closeDialogs}>
 <div className="bg-theme-surface rounded-xl p-6 w-[480px] border border-theme-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-theme-text-primary mb-4">新建任务</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">任务名称</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="请输入任务名称"
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">产品</label>
                <select
                  value={formProduct}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
                >
                  <option value="">请选择产品</option>
                  {uniqueProducts.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">版本</label>
                <select
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
                  disabled={!formProduct}
                >
                  <option value="">请选择版本</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeDialogs} className="px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover">取消</button>
              <button onClick={handleCreate} disabled={submitting || !formName.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Dialog */}
      {showEditDialog && editingTask && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50" onClick={closeDialogs}>
 <div className="bg-theme-surface rounded-xl p-6 w-[480px] border border-theme-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-theme-text-primary mb-4">编辑任务</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">任务名称</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="请输入任务名称"
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">产品</label>
                <select
                  value={formProduct}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
                >
                  <option value="">请选择产品</option>
                  {uniqueProducts.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">版本</label>
                <select
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
                  disabled={!formProduct}
                >
                  <option value="">请选择版本</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeDialogs} className="px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-surface-hover">取消</button>
              <button onClick={handleEdit} disabled={submitting || !formName.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dialog */}
      <ShareDialog
        taskId={shareTaskId}
        visible={!!shareTaskId}
        onClose={() => setShareTaskId('')}
      />

      {/* Report History Panel */}
      <ReportHistoryPanel
        taskId={historyTaskId}
        visible={!!historyTaskId}
        onClose={() => setHistoryTaskId('')}
      />
    </div>
  );
};