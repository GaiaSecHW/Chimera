import React, { useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';

import { Button, Card, FormField, Input, Modal, Select } from '../index';

const Row: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-base font-semibold text-theme-text-primary">{title}</h2>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </section>
);

export const DesignSystemDemoPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [sel, setSel] = useState('');

  return (
    <div className="space-y-8 px-6 py-6">
      <h1 className="text-2xl font-semibold text-theme-text-primary">Design System · P0 Primitives</h1>

      <Row title="Button">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost" iconOnly aria-label="搜索" icon={<Search size={16} />} />
        <Button variant="danger" icon={<Trash2 size={14} />}>
          删除
        </Button>
        <Button variant="primary" icon={<Plus size={14} />}>
          新建
        </Button>
        <Button variant="primary" size="sm">
          Small
        </Button>
        <Button variant="primary" loading>
          保存中
        </Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
      </Row>

      <Row title="Input / Select / FormField">
        <div className="w-72 space-y-4">
          <FormField label="名称" required hint="必填">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="请输入名称" />
          </FormField>
          <FormField label="搜索">
            <Input prefix={<Search size={14} />} placeholder="搜索…" />
          </FormField>
          <FormField label="错误态" error="该字段不能为空">
            <Input invalid placeholder="invalid" />
          </FormField>
          <FormField label="类型">
            <Select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              placeholder="请选择"
              options={[
                { label: '选项 A', value: 'a' },
                { label: '选项 B', value: 'b' },
                { label: '禁用项', value: 'c', disabled: true },
              ]}
            />
          </FormField>
        </div>
      </Row>

      <Row title="Card">
        <Card padding="md" className="w-72">
          <p className="text-sm text-theme-text-secondary">默认 Card（bg-surface, rounded-xl, p-5）</p>
        </Card>
        <Card padding="lg" as="section" className="w-72">
          <p className="text-sm text-theme-text-secondary">Section Card padding=lg</p>
        </Card>
      </Row>

      <Row title="Modal">
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          打开弹窗
        </Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="示例弹窗"
          description="ESC / 点击遮罩 / 关闭按钮均可关闭"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                确认
              </Button>
            </>
          }
        >
          <p className="text-sm text-theme-text-secondary">弹窗内容区，支持滚动与 focus trap。</p>
        </Modal>
      </Row>
    </div>
  );
};
