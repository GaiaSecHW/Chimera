import React, { useMemo, useState } from 'react';
import { Box, Search } from 'lucide-react';
import { Modal } from '../../../../design-system';
import type { OrgTreeNode } from '../types';

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (product: { id: number; name: string }) => void;
  tree: OrgTreeNode[];
  initialSelectedId?: number | null;
}

interface FlatProduct { id: number; name: string; bg?: string; bu?: string; groupKey: string }

export const ProductPicker: React.FC<ProductPickerProps> = ({ open, onClose, onConfirm, tree, initialSelectedId }) => {
  const [kw, setKw] = useState('');
  const [selected, setSelected] = useState<number | null>(initialSelectedId ?? null);

  const products = useMemo<FlatProduct[]>(() => {
    const out: FlatProduct[] = [];
    const walk = (nodes: OrgTreeNode[], bg?: string, bu?: string) => {
      nodes.forEach((n) => {
        if (n.node_type === 'bg') walk(n.children || [], n.name, bu);
        else if (n.node_type === 'bu') walk(n.children || [], bg, n.name);
        else if (n.node_type === 'product') {
          out.push({
            id: n.id, name: n.name, bg, bu,
            groupKey: `${bg || '—'} / ${bu || '—'}`,
          });
        }
      });
    };
    walk(tree);
    return out;
  }, [tree]);

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return products;
    return products.filter((p) => p.name.toLowerCase().includes(k) || (p.bg || '').toLowerCase().includes(k) || (p.bu || '').toLowerCase().includes(k));
  }, [products, kw]);

  const grouped = useMemo(() => {
    const m = new Map<string, FlatProduct[]>();
    filtered.forEach((p) => {
      const arr = m.get(p.groupKey) || [];
      arr.push(p);
      m.set(p.groupKey, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const confirm = () => {
    const p = products.find((x) => x.id === selected);
    if (p) onConfirm({ id: p.id, name: p.name });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md" title="选择所属产品" footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={confirm} disabled={selected == null}>确认</button>
      </>
    }>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={13} />
        <input
          autoFocus
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="搜索产品..."
          className="form-input text-sm pl-8 w-full"
        />
      </div>
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        {grouped.length === 0 && <div className="text-center text-theme-text-faint py-4 text-xs">无匹配产品</div>}
        {grouped.map(([key, ps]) => (
          <div key={key}>
            <div className="text-[10px] font-medium uppercase tracking-wider text-theme-text-faint px-1 mb-1 mt-2">{key}</div>
            {ps.map((p) => {
              const sel = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    sel ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-secondary hover:bg-theme-elevated'
                  }`}
                >
                  <Box size={13} className="text-emerald-400" />
                  <span className="flex-1 truncate">{p.name}</span>
                  {sel && <span className="text-brand-primary">✓</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
};
