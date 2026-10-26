import { useEffect, useState } from 'react';
import { ListTree, X } from 'lucide-react';
import type { TocItem } from '../../lib/toc';

interface TableOfContentsProps {
  items: TocItem[];
  /** Cho phép đóng khi hiển thị dạng modal/drawer nổi */
  onClose?: () => void;
  /** Tiêu đề hiển thị ở đầu mục lục */
  title?: string;
}

export default function TableOfContents({
  items,
  onClose,
  title = 'Mục lục bài viết',
}: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  // Lắng nghe các heading trên trang để highlight mục đang đọc
  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      },
    );

    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      onClose?.();
    }
  };

  return (
    <nav className="toc-container" aria-label="Mục lục bài viết">
      <div className="toc-header">
        <span className="toc-title">
          <ListTree size={16} aria-hidden="true" />
          {title}
        </span>
        {onClose && (
          <button
            type="button"
            className="btn-icon btn-square"
            onClick={onClose}
            aria-label="Đóng mục lục"
            title="Đóng"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <ul className="toc-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`toc-item toc-level-${item.level} ${
              activeId === item.id ? 'is-active' : ''
            }`}
          >
            <button
              type="button"
              className="toc-link"
              onClick={() => scrollToHeading(item.id)}
              title={item.text}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
