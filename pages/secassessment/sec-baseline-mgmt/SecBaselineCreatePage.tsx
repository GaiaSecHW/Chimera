import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, FileText,
  Folder, GitBranch, UploadCloud,
} from 'lucide-react';
import { PageHeader, FormField, FormActionBar } from '../../../design-system';
import { showAlert } from '../../../components/DialogService';
import { secBaselineApi } from './client';
import { ProductPicker } from './components/ProductPicker';
import type { BaselinePreview, OrgTreeNode } from './types';

interface SecBaselineCreatePageProps {
  onNavigateToView?: (view: string) => void;
}

function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const STEPS = [
  { key: 1, label: '基本信息' },
  { key: 2, label: '基线来源' },
  { key: 3, label: '预览' },
  { key: 4, label: '确认创建' },
];

export const SecBaselineCreatePage: React.FC<SecBaselineCreatePageProps> = ({ onNavigateToView }) => {
  const [step, setStep] = useState(1);
  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState('');
  const [version, setVersion] = useState(nowStamp());
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BaselinePreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    secBaselineApi.getOrgTree().then((t) => setTree(Array.isArray(t) ? t : [])).catch(() => setTree([]));
  }, []);

  const updateStepper = (s: number) => setStep(s);

  const validateStep1 = async () => {
    if (!name.trim()) { await showAlert({ message: '请输入基线名称', tone: 'warning' }); return false; }
    if (!code.trim()) { await showAlert({ message: '请输入基线编码', tone: 'warning' }); return false; }
    if (!product) { await showAlert({ message: '请选择所属产品', tone: 'warning' }); return false; }
    return true;
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setParsing(true);
    try {
      const p = await secBaselineApi.previewBaseline(f);
      setPreview(p);
    } catch (e: any) {
      await showAlert({ message: `解析失败:${e.message || '未知错误'}`, tone: 'error' });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const downloadTemplate = async () => {
    try {
      const blob = await secBaselineApi.downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'baseline_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      await showAlert({ message: `下载失败:${e.message || ''}`, tone: 'error' });
    }
  };

  const next = async () => {
    if (step === 1 && !(await validateStep1())) return;
    if (step === 2 && !preview) { await showAlert({ message: '请先上传并解析文件', tone: 'warning' }); return; }
    if (step < 4) updateStepper(step + 1);
  };
  const prev = () => { if (step > 1) updateStepper(step - 1); };

  const submit = async () => {
    if (!file || !product) return;
    setSubmitting(true);
    try {
      const d = await secBaselineApi.createBaseline({
        file,
        baseline_name: name.trim(),
        baseline_name_en: nameEn.trim() || undefined,
        baseline_code: code.trim(),
        category: category.trim() || undefined,
        version: version.trim() || undefined,
        product_org_id: product.id,
      });
      await showAlert({ title: '创建成功', message: `基线「${d.baseline_name}」已创建`, tone: 'success' });
      onNavigateToView?.(`sec-baseline-detail-${d.id}`);
    } catch (e: any) {
      await showAlert({ message: `创建失败:${e.message || ''}`, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const previewRoots = useMemo(() => {
    if (!preview) return [];
    return preview.nodes.filter((n) => !n.parent_code);
  }, [preview]);

  const renderPreviewNode = (n: BaselinePreview['nodes'][number], depth: number): React.ReactNode => {
    const kids = preview!.nodes.filter((c) => c.parent_code === n.code);
    const icon = n.node_type === 'level1' ? <Folder size={13} className="text-violet-400" /> : n.node_type === 'level2' ? <GitBranch size={13} className="text-sky-400" /> : <FileText size={13} className="text-emerald-400" />;
    return (
      <div key={`${n.code || n.name}-${depth}`}>
        <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * 14 }}>
          {icon}
          <span className={`text-xs ${n.node_type === 'item' ? 'text-theme-text-secondary' : 'text-theme-text-primary font-medium'}`}>{n.name}</span>
          {n.code && <span className="text-[10px] font-mono text-theme-text-faint ml-auto">{n.code}</span>}
        </div>
        {kids.map((c) => renderPreviewNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="px-5 md:px-6 2xl:px-8 pt-5 pb-4 border-b border-theme-border">
        <PageHeader
          back={{ label: '返回基线列表', onClick: () => onNavigateToView?.('sec-baseline-mgmt') }}
          title="新增基线"
          description="通过向导创建安全功能基线,通过文件导入生成节点"
        />
      </div>

      <div className="px-5 md:px-6 2xl:px-8 py-5">
        <div className="flex items-center gap-3 max-w-3xl">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-2.5 ${step === s.key ? '' : step > s.key ? '' : 'opacity-60'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border ${step === s.key ? 'bg-brand-primary text-white border-brand-primary' : step > s.key ? 'bg-state-success text-white border-state-success' : 'bg-theme-elevated text-theme-text-muted border-theme-border'}`}>{step > s.key ? <Check size={12} /> : s.key}</div>
                <span className={`text-sm font-medium ${step === s.key ? 'text-theme-text-primary' : 'text-theme-text-muted'}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-theme-border-subtle" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-5 md:px-6 2xl:px-8 pb-6 max-w-4xl">
          {step === 1 && (
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <h2 className="text-base font-semibold text-theme-text-primary">基本信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="基线名称" required><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 openGauss数据库管理系统" /></FormField>
                <FormField label="基线编码" required><input className="form-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 OG-SEC-BL-V1" /></FormField>
                <FormField label="英文名称"><input className="form-input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="openGauss Database Management System" /></FormField>
                <FormField label="分类"><input className="form-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如 数据库管理系统" /></FormField>
                <FormField label="版本号" hint="默认以当前时间生成,可手动覆盖"><input className="form-input" value={version} onChange={(e) => setVersion(e.target.value)} /></FormField>
                <FormField label="所属产品" required>
                  <button type="button" className="form-input text-left flex items-center justify-between" onClick={() => setPickerOpen(true)}>
                    <span className={product ? 'text-theme-text-primary' : 'text-theme-text-faint'}>{product ? product.name : '请选择所属产品...'}</span>
                    <ChevronRight size={14} className="text-theme-text-faint" />
                  </button>
                </FormField>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <h2 className="text-base font-semibold text-theme-text-primary">基线来源</h2>
              <div
                className="border border-dashed border-theme-border rounded-xl bg-theme-elevated p-8 text-center transition-colors cursor-pointer hover:border-brand-primary hover:bg-brand-soft"
                onClick={() => document.getElementById('baseline-file-input')?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                <UploadCloud size={32} className="text-brand-primary mx-auto" />
                <div className="text-sm text-theme-text-secondary mt-2">点击或拖拽文件到此区域上传</div>
                <div className="text-xs text-theme-text-faint mt-1">支持 .xlsx 格式,文件大小 ≤ 10MB</div>
                <input id="baseline-file-input" type="file" accept=".xlsx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>
              <div className="flex items-center justify-between">
                <button className="text-xs text-brand-primary hover:underline flex items-center gap-1" onClick={downloadTemplate}><Download size={12} /> 下载导入模板</button>
                <span className="text-xs text-theme-text-faint">{parsing ? '解析中...' : file ? `已选择:${file.name}` : ''}</span>
              </div>
              {preview && (
                <div className="p-3 rounded-lg bg-state-success-soft border border-state-success-border flex items-center gap-3">
                  <Check size={18} className="text-state-success" />
                  <div>
                    <div className="text-sm text-theme-text-primary font-medium">{file?.name}</div>
                    <div className="text-xs text-state-success mt-0.5">解析成功:{preview.stats.total_level1_dimensions ?? 0} 个一级维度 / {preview.stats.total_level2_dimensions ?? 0} 个二级维度 / {preview.stats.total_items ?? 0} 个检查项</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && preview && (
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-theme-text-primary">节点预览</h2>
                <span className="text-xs text-theme-text-faint">来源:文件导入({file?.name})</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[['一级维度', preview.stats.total_level1_dimensions, 'text-violet-400'], ['二级维度', preview.stats.total_level2_dimensions, 'text-sky-400'], ['检查项', preview.stats.total_items, 'text-emerald-400']].map(([k, v, c]) => (
                  <div key={k as string} className="rounded-lg bg-theme-elevated border border-theme-border-subtle p-3">
                    <div className="text-xs uppercase tracking-wider text-theme-text-faint font-medium">{k}</div>
                    <div className={`text-2xl font-semibold tabular-nums mt-1 ${c}`}>{v as React.ReactNode}</div>
                  </div>
                ))}
              </div>
              <div className="border border-theme-border-subtle rounded-lg p-3 max-h-80 overflow-y-auto custom-scrollbar bg-theme-elevated">
                {previewRoots.map((n) => renderPreviewNode(n, 0))}
              </div>
              <div className="rounded-lg bg-state-warning-soft border border-state-warning-border p-3 text-xs text-state-warning flex items-center gap-2">
                预览仅作确认,基线将在第 4 步提交后正式入库。
              </div>
            </div>
          )}

          {step === 4 && preview && (
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <h2 className="text-base font-semibold text-theme-text-primary">确认创建</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[['基线名称', name], ['基线编码', code], ['英文名称', nameEn || '—'], ['分类', category || '—'], ['版本号', version], ['所属产品', product?.name || '—'], ['基线来源', `文件导入(${file?.name})`], ['节点统计', `${preview.stats.total_level1_dimensions ?? 0} 维度 / ${preview.stats.total_level2_dimensions ?? 0} 子维度 / ${preview.stats.total_items ?? 0} 检查项`]].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="text-xs text-theme-text-faint mb-1">{k}</div>
                    <div className={`text-sm text-theme-text-secondary ${(k as string).includes('版本') || (k as string).includes('编码') ? 'font-mono' : ''}`}>{v as React.ReactNode}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-state-warning-soft border border-state-warning-border p-3 text-xs text-state-warning flex items-center gap-2">
                提交后基线状态为"未同步",可在详情页手动触发同步。
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-6 2xl:px-8 py-4 border-t border-theme-border flex items-center justify-between bg-theme-surface">
        <button className="btn btn-secondary" onClick={prev} disabled={step === 1}><ArrowLeft size={14} /> 上一步</button>
        <div className="text-xs text-theme-text-faint">步骤 {step} / 4</div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary" onClick={() => onNavigateToView?.('sec-baseline-mgmt')}>取消</button>
          {step < 4 ? (
            <button className="btn btn-primary" onClick={next}>下一步 <ArrowRight size={14} /></button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? '创建中...' : <><Check size={14} /> 提交创建</>}</button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <ProductPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          tree={tree}
          initialSelectedId={product?.id}
          onConfirm={(p) => setProduct(p)}
        />
      )}
    </div>
  );
};

export default SecBaselineCreatePage;
