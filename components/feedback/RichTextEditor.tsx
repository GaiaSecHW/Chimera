import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { useEffect, useCallback } from 'react';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder = '请输入...' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] p-3 focus:outline-none',
      },
      handlePaste: (view, event) => {
        // Support pasting images directly from clipboard (e.g. screenshots)
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;
        const items = clipboardData.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            if (file.size > MAX_IMAGE_SIZE) {
              alert('图片大小不能超过5MB');
              return true;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              const imageType = view.state.schema.nodes.image;
              if (!imageType) return;
              const node = imageType.create({ src });
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const addImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_SIZE) {
        alert('图片大小不能超过5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor?.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
    } else {
      const url = window.prompt('请输入链接地址（含 http:// 或 https://）');
      if (!url) return;
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const ToolbarBtn = ({
    label,
    onClick,
    active,
    title,
  }: {
    label: string;
    onClick: () => void;
    active: boolean;
    title: string;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'hover:bg-theme-surface text-theme-text-primary'
      }`}
    >
      {label}
    </button>
  );

  const Divider = () => <div className="border-l border-theme-border h-5 mx-1" />;

  return (
    <div className="border border-theme-border rounded-lg overflow-hidden bg-theme-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-theme-border bg-theme-elevated">
        <ToolbarBtn label="B" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗" />
        <ToolbarBtn label="I" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体" />
        <ToolbarBtn label="U" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线" />
        <ToolbarBtn label="S" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线" />
        <ToolbarBtn label="</>" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码" />
        <Divider />
        <ToolbarBtn label="H1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="一级标题" />
        <ToolbarBtn label="H2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="二级标题" />
        <ToolbarBtn label="H3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="三级标题" />
        <Divider />
        <ToolbarBtn label="• 列表" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表" />
        <ToolbarBtn label="1. 列表" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表" />
        <Divider />
        <ToolbarBtn label="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用块" />
        <ToolbarBtn label="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块" />
        <ToolbarBtn label="─" onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="水平分割线" />
        <Divider />
        <ToolbarBtn label="🔗" onClick={addLink} active={editor.isActive('link')} title="链接" />
        <ToolbarBtn label="📷 图片" onClick={addImage} active={false} title="插入图片" />
        <Divider />
        <ToolbarBtn label="↶" onClick={() => editor.chain().focus().undo().run()} active={false} title="撤销" />
        <ToolbarBtn label="↷" onClick={() => editor.chain().focus().redo().run()} active={false} title="重做" />
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
