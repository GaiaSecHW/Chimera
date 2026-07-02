import React, { useEffect, useState } from 'react';
import { Modal, FormField } from '../../../../design-system';
import { showAlert } from '../../../../components/DialogService';
import { secBaselineApi } from '../client';
import { sourcesToText, textToSources } from '../constants';
import type { NodeOut, NodeType, NodeSources, Priority } from '../types';

export interface NodeEditorModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'add' | 'edit' | 'view';
  baselineId: number;
  node: NodeOut | null;       // edit/view 时传入;add 时为 null
  parent: NodeOut | null;     // add 时的父节点(null=根,决定 childType)
  onSaved: () => void;
}

function inferChildType(parent: NodeOut | null): NodeType {
  if (!parent) return 'level1';
  if (parent.node_type === 'level1') return 'level2';
  return 'item';
}

export const NodeEditorModal: React.FC<NodeEditorModalProps> = ({ open, onClose, mode, baselineId, node, parent, onSaved }) => {
  const readonly = mode === 'view';
  const isAdd = mode === 'add';
  const childType: NodeType = isAdd ? inferChildType(parent) : (node?.node_type || 'item');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [objective, setObjective] = useState('');
  const [priority, setPriority] = useState<Priority>('L3');
  const [isKeyAbility, setIsKeyAbility] = useState(false);
  const [description, setDescription] = useState('');
  const [verification, setVerification] = useState('');
  const [sourcesText, setSourcesText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setCode(''); setName(''); setNameEn(''); setSortOrder(1);
      setObjective(''); setPriority('L3'); setIsKeyAbility(false);
      setDescription(''); setVerification(''); setSourcesText('');
    } else if (node) {
      setCode(node.code || '');
      setName(node.name);
      setNameEn(node.name_en || '');
      setSortOrder(node.sort_order || 1);
      setObjective(node.objective || '');
      setPriority(node.priority || 'L3');
      setIsKeyAbility(!!node.is_key_ability);
      setDescription(node.description || '');
      setVerification(node.verification || '');
      setSourcesText(sourcesToText(node.sources, childType === 'level2' ? 'level2' : 'item'));
    }
  }, [open, isAdd, node, childType]);

  const titleText = isAdd
    ? `新增${childType === 'level1' ? '一级维度' : childType === 'level2' ? '二级维度' : '检查项'}`
    : mode === 'view' ? '查看节点' : '编辑节点';

  const handleSave = async () => {
    if (!name.trim()) { await showAlert({ message: '名称不能为空', tone: 'warning' }); return; }
    const sources: NodeSources = (childType === 'level2' || childType === 'item')
      ? textToSources(sourcesText, childType)
      : null;
    setSaving(true);
    try {
      if (isAdd) {
        await secBaselineApi.createNode(baselineId, {
          node_type: childType,
          parent_id: parent ? parent.id : null,
          code: code.trim() || undefined,
          name: name.trim(),
          name_en: nameEn.trim() || undefined,
          sort_order: sortOrder,
          ...(childType === 'level1' ? { objective } : {}),
          ...(childType === 'item' ? { priority, is_key_ability: isKeyAbility, description, verification } : {}),
          ...(childType === 'level2' || childType === 'item' ? { sources } : {}),
        });
      } else if (node) {
        await secBaselineApi.updateNode(baselineId, node.id, {
          code: code.trim() || undefined,
          name: name.trim(),
          name_en: nameEn.trim() || undefined,
          sort_order: sortOrder,
          ...(childType === 'level1' ? { objective } : {}),
          ...(childType === 'item' ? { priority, is_key_ability: isKeyAbility, description, verification } : {}),
          ...(childType === 'level2' || childType === 'item' ? { sources } : {}),
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      await showAlert({ message: e.message || '保存失败', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={titleText}
      footer={readonly ? undefined : (
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="编码" required={isAdd}>
            <input className="form-input" value={code} disabled={readonly}
              onChange={(e) => setCode(e.target.value)} placeholder="如 D01-01 / AUD-GEN-001" />
          </FormField>
          <FormField label="排序">
            <input type="number" className="form-input" value={sortOrder} disabled={readonly}
              onChange={(e) => setSortOrder(Number(e.target.value) || 1)} />
          </FormField>
          <FormField label="名称" required={isAdd}>
            <input className="form-input" value={name} disabled={readonly}
              onChange={(e) => setName(e.target.value)} placeholder="节点名称" />
          </FormField>
          <FormField label="英文名称">
            <input className="form-input" value={nameEn} disabled={readonly}
              onChange={(e) => setNameEn(e.target.value)} />
          </FormField>
        </div>

        {childType === 'level1' && (
          <FormField label="维度目标(objective)">
            <textarea className="form-input min-h-[80px]" value={objective} disabled={readonly}
              onChange={(e) => setObjective(e.target.value)} />
          </FormField>
        )}

        {childType === 'item' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="优先级">
                <select className="form-select" value={priority} disabled={readonly}
                  onChange={(e) => setPriority(e.target.value as Priority)}>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                  <option value="L5">L5</option>
                </select>
              </FormField>
              <FormField label="核心能力项">
                <label className="flex items-center gap-2 mt-1.5">
                  <input type="checkbox" checked={isKeyAbility} disabled={readonly}
                    onChange={(e) => setIsKeyAbility(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm text-theme-text-secondary">是核心能力项</span>
                </label>
              </FormField>
            </div>
            <FormField label="描述(description)">
              <textarea className="form-input min-h-[80px]" value={description} disabled={readonly}
                onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <FormField label="验证方法(verification)">
              <textarea className="form-input min-h-[80px]" value={verification} disabled={readonly}
                onChange={(e) => setVerification(e.target.value)} />
            </FormField>
          </>
        )}

        {(childType === 'level2' || childType === 'item') && (
          <FormField label={childType === 'level2' ? '来源文档(每行一条)' : '来源文档(每行格式:文档 | 章节)'}>
            <textarea className="form-input min-h-[100px]" value={sourcesText} disabled={readonly}
              onChange={(e) => setSourcesText(e.target.value)}
              placeholder={childType === 'item' ? 'BSI-CC-PP-0088-V2-2017 | 7.1.1.1 FAU_GEN.1' : 'BSI-CC-PP-0088-V2-2017 §7.1.1.1 FAU_GEN.1'} />
          </FormField>
        )}
      </div>
    </Modal>
  );
};
