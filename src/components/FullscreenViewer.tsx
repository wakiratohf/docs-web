import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Bọc một vùng nội dung (PDF, preview HTML/Markdown, note chỉ đọc…) và thêm
 * nút bật/tắt xem TOÀN MÀN HÌNH ở góc trên phải.
 *
 * KHÔNG dùng Fullscreen API của trình duyệt — chỉ phủ kín cửa sổ web bằng CSS
 * (overlay position: fixed). Trình duyệt vẫn giữ nguyên thanh tab/địa chỉ,
 * người xem nhấn Esc hoặc bấm lại nút để thoát.
 */
export default function FullscreenViewer({
  children,
  className = '',
  label = 'Xem toàn màn hình',
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);

  // Khi đang toàn màn hình: nhấn Esc để thoát + khóa cuộn nền phía sau.
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFull(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFull]);

  const toggle = () => setIsFull((v) => !v);

  return (
    <div
      ref={ref}
      className={`fullscreen-viewer ${isFull ? 'is-fullscreen' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="fullscreen-toggle btn-icon"
        onClick={toggle}
        title={isFull ? 'Thoát toàn màn hình (Esc)' : label}
        aria-label={isFull ? 'Thoát toàn màn hình' : label}
      >
        {isFull ? (
          <Minimize2 size={16} aria-hidden="true" />
        ) : (
          <Maximize2 size={16} aria-hidden="true" />
        )}
      </button>
      {children}
    </div>
  );
}
