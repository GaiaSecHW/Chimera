import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

interface RichTextViewerProps {
  html: string;
  className?: string;
}

export function RichTextViewer({ html, className = '' }: RichTextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'img', 'a', 'span', 'div'],
    ALLOWED_ATTR: ['src', 'alt', 'href', 'target', 'style', 'class'],
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        setLightboxSrc((target as HTMLImageElement).src);
      }
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className={`prose prose-sm max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="preview"
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
        </div>
      )}
    </>
  );
}
