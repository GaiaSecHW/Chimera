import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Edit3,
  FolderTree,
  GitBranch,
  Layers,
  Loader2,
  Package,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../../clients/api';
import { ProductTreeNode, ProductVersionNode } from '../../types/types';

interface ProductFormState {
  name: string;
  code: string;
  description: string;
  sort_order: string;
}

interface VersionFormState {
  version: string;
  name: string;
  description: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: '',
  code: '',
  description: '',
  sort_order: '0',
};

const EMPTY_VERSION_FORM: VersionFormState = {
  version: '',
  name: '',
  description: '',
};

const flattenProducts = (nodes: ProductTreeNode[]): ProductTreeNode[] =>
  nodes.flatMap((node) => [node, ...flattenProducts(node.children)]);

export const ProductMgmtPage: React.FC = () => {
  const productApi = api.domains.project.products;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<ProductTreeNode[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [versionForm, setVersionForm] = useState<VersionFormState>(EMPTY_VERSION_FORM);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [createChildForId, setCreateChildForId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await productApi.getTree();
      setTree(response.products || []);
    } catch (fetchError: any) {
      setError(fetchError?.message || '加载产品目录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTree();
  }, []);

  const flatProducts = useMemo(() => flattenProducts(tree), [tree]);
  const selectedProduct = useMemo(
    () => flatProducts.find((product) => product.id === selectedProductId) || null,
    [flatProducts, selectedProductId]
  );

  const selectedVersions = selectedProduct?.versions || [];

  const resetProductForm = () => {
    setProductForm(EMPTY_PRODUCT_FORM);
    setEditingProductId(null);
    setCreateChildForId(null);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const resetVersionForm = () => {
    setVersionForm(EMPTY_VERSION_FORM);
    setEditingVersionId(null);
  };

  const openEditProduct = (product: ProductTreeNode) => {
    setEditingProductId(product.id);
    setCreateChildForId(null);
    setProductForm({
      name: product.name,
      code: product.code,
      description: product.description || '',
      sort_order: String(product.sort_order ?? 0),
    });
  };

  const openCreateChild = (productId: string) => {
    setCreateChildForId(productId);
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
  };

  const openEditVersion = (version: ProductVersionNode) => {
    setEditingVersionId(version.id);
    setVersionForm({
      version: version.version,
      name: version.name || '',
      description: version.description || '',
    });
  };

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: productForm.name.trim(),
        code: productForm.code.trim(),
        description: productForm.description.trim() || undefined,
        sort_order: Number(productForm.sort_order || '0'),
      };
      if (editingProductId) {
        await productApi.update(editingProductId, payload);
      } else {
        await productApi.create({
          ...payload,
          parent_id: createChildForId || undefined,
        });
      }
      resetProductForm();
      setSuccessMsg(editingProductId ? '产品更新成功' : createChildForId ? '子产品创建成功' : '根产品创建成功');
      await loadTree();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (submitError: any) {
      setError(submitError?.message || '保存产品失败');
    } finally {
      setSaving(false);
    }
  };

  const submitVersion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        version: versionForm.version.trim(),
        name: versionForm.name.trim() || undefined,
        description: versionForm.description.trim() || undefined,
      };
      if (editingVersionId) {
        await productApi.updateVersion(editingVersionId, payload);
      } else {
        await productApi.createVersion(selectedProduct.id, payload);
      }
      resetVersionForm();
      setSuccessMsg(editingVersionId ? '版本更新成功' : '版本创建成功');
      await loadTree();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (submitError: any) {
      setError(submitError?.message || '保存产品版本失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product: ProductTreeNode) => {
    const confirmed = window.confirm(`确认删除产品“${product.name}”吗？`);
    if (!confirmed) return;
    try {
      await productApi.delete(product.id);
      if (selectedProductId === product.id) {
        setSelectedProductId('');
      }
      setSuccessMsg('产品删除成功');
      await loadTree();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (deleteError: any) {
      setError(deleteError?.message || '删除产品失败');
    }
  };

  const deleteVersion = async (version: ProductVersionNode) => {
    const confirmed = window.confirm(`确认删除版本“${version.version}”吗？`);
    if (!confirmed) return;
    try {
      await productApi.deleteVersion(version.id);
      setSuccessMsg('版本删除成功');
      await loadTree();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (deleteError: any) {
      setError(deleteError?.message || '删除产品版本失败');
    }
  };

  const renderTreeNode = (node: ProductTreeNode, depth = 0): React.ReactNode => (
    <div key={node.id} className="space-y-2">
      <button
        onClick={() => setSelectedProductId(node.id)}
        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
          selectedProductId === node.id
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FolderTree size={16} className="text-slate-400" />
              <span className="truncate text-sm font-black">{node.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-slate-500">
              <span>{node.code}</span>
              <span>{node.project_count} 项目</span>
              <span>{node.is_leaf ? '叶子产品' : '目录节点'}</span>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-slate-300" />
        </div>
      </button>
      {node.children.map((child) => renderTreeNode(child, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-8 p-10 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <Package size={22} />
            </div>
            <h2 className="text-3xl font-black text-slate-800">产品管理</h2>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">维护全局产品树与产品版本，项目创建时绑定到具体版本。</p>
        </div>
        <button
          onClick={() => {
            resetProductForm();
            resetVersionForm();
            void loadTree();
          }}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50"
        >
          刷新目录
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-600">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-600">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">产品树</h3>
              <p className="mt-1 text-sm text-slate-500">支持多级目录，只有叶子产品可维护版本。</p>
            </div>
            <button
              onClick={() => {
                resetProductForm();
                resetVersionForm();
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={14} />
                新增根产品
              </span>
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {tree.length > 0 ? tree.map((node) => renderTreeNode(node)) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center text-sm font-semibold text-slate-400">
                  还没有产品目录，先创建根产品。
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">版本与编辑</h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedProduct ? `当前产品：${selectedProduct.name}` : '先从左侧选择一个产品节点'}
              </p>
            </div>
            {selectedProduct && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openCreateChild(selectedProduct.id)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
                >
                  新增子产品
                </button>
                <button
                  onClick={() => openEditProduct(selectedProduct)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
                >
                  编辑产品
                </button>
                <button
                  onClick={() => void deleteProduct(selectedProduct)}
                  className="rounded-xl border border-red-100 px-3 py-2 text-xs font-black text-red-600"
                >
                  删除产品
                </button>
              </div>
            )}
          </div>

          <form onSubmit={submitProduct} className="space-y-4 rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-slate-700">
              <FolderTree size={16} />
              {editingProductId ? '编辑产品' : createChildForId ? '新增子产品' : '新增根产品'}
            </div>
            <input
              ref={nameInputRef}
              required
              value={productForm.name}
              onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="产品名称"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
            />
            <input
              required
              value={productForm.code}
              onChange={(event) => setProductForm((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="产品编码"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
            />
            <input
              value={productForm.sort_order}
              onChange={(event) => setProductForm((prev) => ({ ...prev, sort_order: event.target.value }))}
              placeholder="排序"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
            />
            <textarea
              value={productForm.description}
              onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="产品说明"
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
              >
                {saving ? '提交中...' : '保存产品'}
              </button>
              <button type="button" onClick={resetProductForm} className="rounded-xl px-4 py-2 text-xs font-black text-slate-500">
                重置
              </button>
            </div>
          </form>

          <div className="space-y-4 rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-slate-700">
              <GitBranch size={16} />
              产品版本
            </div>

            {selectedProduct ? (
              selectedProduct.is_leaf ? (
                <>
                  <form onSubmit={submitVersion} className="space-y-4">
                    <input
                      required
                      value={versionForm.version}
                      onChange={(event) => setVersionForm((prev) => ({ ...prev, version: event.target.value }))}
                      placeholder="版本号，例如 1.0.0"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
                    />
                    <input
                      value={versionForm.name}
                      onChange={(event) => setVersionForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="版本名称"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
                    />
                    <textarea
                      value={versionForm.description}
                      onChange={(event) => setVersionForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="版本说明"
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white">
                        {saving ? '提交中...' : editingVersionId ? '更新版本' : '新增版本'}
                      </button>
                      <button type="button" onClick={resetVersionForm} className="rounded-xl px-4 py-2 text-xs font-black text-slate-500">
                        重置
                      </button>
                    </div>
                  </form>

                  <div className="space-y-3">
                    {selectedVersions.length > 0 ? selectedVersions.map((version) => (
                      <div key={version.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">{version.version}</span>
                              {version.name ? <span className="text-xs font-semibold text-slate-500">{version.name}</span> : null}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              关联项目 {version.project_count} 个
                            </div>
                            {version.description ? (
                              <div className="mt-2 text-sm text-slate-600">{version.description}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditVersion(version)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-blue-600">
                              <Edit3 size={16} />
                            </button>
                            <button onClick={() => void deleteVersion(version)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-400">
                        当前叶子产品还没有版本。
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-400">
                  请选择叶子产品后再维护版本。
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-400">
                从左侧选择产品节点以查看和维护版本。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
