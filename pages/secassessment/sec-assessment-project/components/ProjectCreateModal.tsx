import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, GitBranch, Box, ShieldCheck, ChevronRight, ChevronDown, Search,
} from 'lucide-react';
import { TestInputUploader, TestInputUploaderHandle } from '../../../../components/TestInputUploader';
import { api } from '../../../../clients/api';
import { Modal, FormField, FormActionBar, DropdownSelect } from '../../../../design-system';
import { secAssessmentApi } from '../client';
import type { BaselineOption, ChimeraTaskRequest } from '../types';
import type { ProjectInputUploadRecord } from '../../../../types/types';

interface ProjectCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projectId: string;
}

function inputDisplayName(r: ProjectInputUploadRecord): string {
  return (r as any).display_name || (r as any).file_name || r.upload_id;
}

// ===== 基线树 =====
type TreeNodeType = 'bg' | 'bu' | 'product' | 'baseline';
interface BaselineTreeNode {
  type: TreeNodeType;
  key: string;
  label: string;
  children?: BaselineTreeNode[];
  baseline?: BaselineOption;
}

function buildBaselineTree(list: BaselineOption[]): BaselineTreeNode[] {
  const bgMap = new Map<string, Map<string, Map<string, BaselineOption[]>>>();
  list.forEach((b) => {
    const bg = b.bg_name || '未分组';
    const bu = b.bu_name || '—';
    const prod = b.product_org_name || '—';
    if (!bgMap.has(bg)) bgMap.set(bg, new Map());
    const buMap = bgMap.get(bg)!;
    if (!buMap.has(bu)) buMap.set(bu, new Map());
    const prodMap = buMap.get(bu)!;
    if (!prodMap.has(prod)) prodMap.set(prod, []);
    prodMap.get(prod)!.push(b);
  });

  return Array.from(bgMap.entries()).map(([bg, buMap]) => ({
    type: 'bg' as const,
    key: `bg::${bg}`,
    label: bg,
    children: Array.from(buMap.entries()).map(([bu, prodMap]) => ({
      type: 'bu' as const,
      key: `bu::${bg}::${bu}`,
      label: bu,
      children: Array.from(prodMap.entries()).map(([prod, bls]) => ({
        type: 'product' as const,
        key: `prod::${bg}::${bu}::${prod}`,
        label: prod,
        children: bls.map((b) => ({
          type: 'baseline' as const,
          key: `bl::${b.id}`,
          label: `${b.baseline_name}${b.version ? ` v${b.version}` : ''}${b.total_items != null ? ` (${b.total_items}项)` : ''}`,
          baseline: b,
        })),
      })),
    })),
  }));
}

// 搜索过滤:仅保留命中基线的分支,返回新树 + 需展开的 key 集合
function filterTree(tree: BaselineTreeNode[], kw: string): { tree: BaselineTreeNode[]; expandKeys: Set<string> } {
  const kwLower = kw.toLowerCase().trim();
  if (!kwLower) return { tree, expandKeys: new Set() };
  const expandKeys = new Set<string>();
  const walk = (nodes: BaselineTreeNode[]): BaselineTreeNode[] => {
    const out: BaselineTreeNode[] = [];
    nodes.forEach((n) => {
      if (n.type === 'baseline') {
        const code = n.baseline?.baseline_code || '';
        if (n.label.toLowerCase().includes(kwLower) || code.toLowerCase().includes(kwLower)) {
          out.push(n);
        }
        return;
      }
      const sub = walk(n.children || []);
      if (sub.length > 0) {
        expandKeys.add(n.key);
        out.push({ ...n, children: sub });
      }
    });
    return out;
  };
  return { tree: walk(tree), expandKeys };
}

// 递归渲染基线树
function renderBaselineTree(
  nodes: BaselineTreeNode[],
  depth: number,
  expanded: Set<string>,
  toggle: (k: string) => void,
  selectedId: number | '',
  onSelect: (id: number) => void,
  disabled: boolean,
): React.ReactNode {
  return (
    <div>
      {nodes.map((n) => {
        const hasChildren = n.children && n.children.length > 0;
        const isOpen = expanded.has(n.key);
        const isSelected = n.type === 'baseline' && n.baseline?.id === selectedId;
        const icon = n.type === 'bg' ? <Building2 size={13} className="text-violet-400" />
          : n.type === 'bu' ? <GitBranch size={13} className="text-sky-400" />
          : n.type === 'product' ? <Box size={13} className="text-amber-400" />
          : <ShieldCheck size={13} className="text-emerald-400" />;
        return (
          <div key={n.key}>
            <div
              className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-sm transition-colors ${
                isSelected
                  ? 'bg-brand-soft text-brand-primary font-medium'
                  : n.type === 'baseline'
                    ? 'text-theme-text-primary hover:bg-theme-elevated'
                    : 'text-theme-text-secondary hover:bg-theme-elevated'
              } ${disabled && n.type === 'baseline' ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={() => {
                if (n.type === 'baseline' && n.baseline && !disabled) onSelect(n.baseline.id);
                else if (hasChildren) toggle(n.key);
              }}
            >
              {hasChildren ? (
                <span className="text-theme-text-faint shrink-0 w-3">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              ) : <span className="w-3 shrink-0" />}
              {icon}
              <span className="truncate">{n.label}</span>
            </div>
            {hasChildren && isOpen && renderBaselineTree(n.children!, depth + 1, expanded, toggle, selectedId, onSelect, disabled)}
          </div>
        );
      })}
    </div>
  );
}

export const ProjectCreateModal: React.FC<ProjectCreateModalProps> = ({ open, onClose, onCreated, projectId }) => {
  const [baselines, setBaselines] = useState<BaselineOption[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [baselinesError, setBaselinesError] = useState('');
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [inputsLoading, setInputsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [baselineId, setBaselineId] = useState<number | ''>('');
  const [key, setKey] = useState('');
  const [inputSource, setInputSource] = useState<'upload' | 'existing'>('upload');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [error, setError] = useState('');
  const [blSearch, setBlSearch] = useState('');
  const [blExpanded, setBlExpanded] = useState<Set<string>>(new Set());
  const [blPickerOpen, setBlPickerOpen] = useState(false);

  const uploaderRef = useRef<TestInputUploaderHandle>(null);

  // 全量树(基线列表不变时不重算)
  const fullTree = useMemo(() => buildBaselineTree(baselines), [baselines]);
  // 搜索过滤后的树 + 需展开的 key
  const filteredTreeData = useMemo(() => filterTree(fullTree, blSearch), [fullTree, blSearch]);
  const filteredTree = filteredTreeData.tree;

  // 搜索时自动展开命中分支;无搜索时默认全展开
  const effectiveExpanded = useMemo(() => {
    if (blSearch.trim()) return filteredTreeData.expandKeys;
    if (blExpanded.size === 0 && fullTree.length > 0) {
      // 首次:全展开所有 bg/bu/product
      const all = new Set<string>();
      const walk = (nodes: BaselineTreeNode[]) => {
        nodes.forEach((n) => {
          if (n.type !== 'baseline') { all.add(n.key); walk(n.children || []); }
        });
      };
      walk(fullTree);
      return all;
    }
    return blExpanded;
  }, [blSearch, filteredTreeData, blExpanded, fullTree]);

  const toggleNode = (k: string) => {
    setBlExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const selectedBaseline = useMemo(
    () => baselines.find((b) => b.id === baselineId) || null,
    [baselines, baselineId],
  );

  useEffect(() => {
    if (!open) return;
    setBaselinesLoading(true);
    setBaselinesError('');
    secAssessmentApi
      .listBaselineOptions()
      .then((d) => setBaselines(Array.isArray(d) ? d : []))
      .catch((e: any) => { setBaselines([]); setBaselinesError(e?.message || '基线列表加载失败'); })
      .finally(() => setBaselinesLoading(false));

    if (projectId) {
      setInputsLoading(true);
      api.domains.assets.fileserver
        .listProjectInputUploads(projectId, { pageSize: 200 })
        .then((resp: any) => setInputs(resp?.items || []))
        .catch(() => setInputs([]))
        .finally(() => setInputsLoading(false));
    }
  }, [open, projectId]);

  const reset = () => {
    setName(''); setBaselineId(''); setKey(''); setSelectedInputId(''); setError('');
    setInputSource('upload');
    setBlSearch(''); setBlExpanded(new Set()); setBlPickerOpen(false);
    uploaderRef.current?.reset();
  };

  const handleClose = () => {
    if (submitting || uploading) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (!projectId) { setError('无当前项目,请在顶部导航右上角切换项目空间'); return; }
    if (!name.trim()) { setError('请输入任务名称'); return; }
    if (!baselineId) { setError('请选择基线'); return; }

    setSubmitting(true);
    try {
      let uploadId: string;
      if (inputSource === 'upload') {
        if (!uploaderRef.current?.hasFiles()) {
          setError('请先选择要上传的文件'); setSubmitting(false); return;
        }
        const uploadResult = await uploaderRef.current.triggerUpload();
        uploadId = uploadResult.uploadId;
      } else {
        if (!selectedInputId) { setError('请选择已有测试对象'); setSubmitting(false); return; }
        uploadId = selectedInputId;
      }

      const resolved: any = await api.domains.assets.fileserver.resolveProjectInputUpload(projectId, uploadId, '');
      const filePath = resolved?.absolute_path || '';

      const payload: ChimeraTaskRequest = {
        project_id: projectId,
        task_id: name.trim(),
        task_name: name.trim(),
        file_path: filePath,
        key: key.trim(),
        baseline_id: Number(baselineId),
      };

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

  const canSubmit = name.trim().length > 0 && !!baselineId && !uploading;

  return (
    <Modal open={open} onClose={handleClose} title="新建评估任务" size="xl">
      <div className="space-y-4">
        {/* 当前项目 */}
        <div className="rounded-lg border border-brand-border bg-brand-soft px-3 py-2">
          <span className="text-xs text-brand-primary">
            当前项目为<span className="font-semibold">「{projectId || '—'}」</span>,如需为其他项目创建任务,请在顶部导航右上角切换项目空间。
          </span>
        </div>

        {/* 任务名称 */}
        <FormField label="任务名称" required>
          <input
            className="form-input text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入任务名称"
            disabled={submitting}
          />
        </FormField>

        {/* 基线(弹窗选择) */}
        <div>
          <span className="form-label">基线 <span className="required">*</span></span>
          <button
            type="button"
            className="form-input text-sm text-left flex items-center justify-between mt-1 hover:border-brand-primary transition-colors"
            onClick={() => setBlPickerOpen(true)}
            disabled={submitting || baselinesLoading}
          >
            <span className={selectedBaseline ? 'text-theme-text-primary truncate' : 'text-theme-text-faint'}>
              {baselinesLoading ? '加载中...' : selectedBaseline
                ? `${selectedBaseline.baseline_name}${selectedBaseline.version ? ` v${selectedBaseline.version}` : ''}${selectedBaseline.total_items != null ? ` (${selectedBaseline.total_items}项)` : ''}`
                : '请选择基线'}
            </span>
            <Search size={14} className="text-theme-text-faint shrink-0 ml-2" />
          </button>
          {baselinesError && (
            <div className="mt-1 text-xs text-state-danger rounded-md bg-rose-500/10 px-2 py-1.5">{baselinesError}</div>
          )}
        </div>

        {/* 基线选择弹窗 */}
        {blPickerOpen && (
          <Modal open={blPickerOpen} onClose={() => setBlPickerOpen(false)} title="选择基线" size="md">
            <div className="space-y-3">
              {/* 搜索 */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={14} />
                <input
                  autoFocus
                  value={blSearch}
                  onChange={(e) => setBlSearch(e.target.value)}
                  placeholder="搜索基线名称 / 编码..."
                  className="form-input text-sm pl-8"
                />
              </div>

              {/* 树 */}
              <div className="rounded-lg border border-theme-border bg-theme-surface overflow-hidden">
                <div className="overflow-y-auto custom-scrollbar py-1 max-h-[360px]">
                  {filteredTree.length === 0 ? (
                    <div className="text-xs text-theme-text-faint py-6 text-center">
                      {baselines.length === 0 ? '暂无可用基线' : '无匹配基线'}
                    </div>
                  ) : (
                    renderBaselineTree(
                      filteredTree, 0, effectiveExpanded, toggleNode, baselineId,
                      (id) => { setBaselineId(id); setBlPickerOpen(false); },
                      false,
                    )
                  )}
                </div>
              </div>

              {selectedBaseline && (
                <div className="text-xs text-theme-text-muted">
                  已选:<span className="text-brand-primary font-medium ml-1">{selectedBaseline.baseline_name}</span>
                </div>
              )}
            </div>

            <FormActionBar
              onSave={() => setBlPickerOpen(false)}
              saveText="确定"
              disabled={!baselineId}
            />
          </Modal>
        )}

        {/* 网关密钥 */}
        <FormField label="网关密钥" hint="非必填">
          <input
            type="password"
            className="form-input text-sm font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="gateway_token"
            disabled={submitting}
          />
        </FormField>

        {/* 测试对象 */}
        <div>
          <div className="mb-2 flex w-full gap-1 border-b border-theme-border">
            {(['upload', 'existing'] as const).map((src) => {
              const active = inputSource === src;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setInputSource(src)}
                  className={`relative px-4 py-2 text-sm transition-colors ${active ? 'font-semibold text-brand-primary' : 'font-medium text-theme-text-muted'}`}
                >
                  {src === 'upload' ? '直接上传' : '选择已有'}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-primary" />}
                </button>
              );
            })}
          </div>

          {inputSource === 'upload' ? (
            projectId ? (
              <TestInputUploader
                ref={uploaderRef}
                projectId={projectId}
                displayName={name}
                compact
                hideUploadIcon
                defaultInputType="code"
                defaultKeepOriginal
                onUploadStateChange={setUploading}
              />
            ) : (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                无当前项目,无法上传文件
              </div>
            )
          ) : (
            <div className="space-y-2">
              {inputsLoading ? (
                <div className="text-xs text-theme-text-faint">加载已有记录中...</div>
              ) : inputs.length === 0 ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                  暂无已有上传记录,请切换到"直接上传"
                </div>
              ) : (
                <FormField label="测试对象记录">
                  <DropdownSelect
                    value={selectedInputId}
                    onChange={setSelectedInputId}
                    options={inputs.map((r) => ({ value: r.upload_id, label: inputDisplayName(r) }))}
                    placeholder="请选择测试对象记录"
                    emptyText="暂无可用记录"
                    containerClassName="mt-1"
                  />
                </FormField>
              )}
            </div>
          )}
        </div>

        {error && <div className="text-xs text-state-danger rounded-md bg-rose-500/10 px-3 py-2">{error}</div>}
      </div>

      <FormActionBar
        onReset={handleClose}
        onSave={handleSubmit}
        saveText={submitting ? '创建中...' : uploading ? '上传中...' : '创建任务'}
        resetText="取消"
        saving={submitting || uploading}
        disabled={!canSubmit}
      />
    </Modal>
  );
};
