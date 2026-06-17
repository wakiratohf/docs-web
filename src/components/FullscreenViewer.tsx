import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Bọc một vùng nội dung (PDF, preview HTML/Markdown, note chỉ đọc…) và thêm
 * nút bật/tắt xem TOÀN MÀN HÌNH ở góc trên phải.
 *
 * Dùng Fullscreen API gốc của trình duyệt (requestFullscreen/exitFullscreen):
 * - Phủ kín màn hình thật, người xem nhấn Esc để thoát.
 * - Trạng thái nút được đồng bộ qua sự kiện 'fullscreenchange' nên dù người dùng
 *   thoát bằng Esc, icon vẫn cập nhật đúng.
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

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = async () => {
    const el = ref.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Trình duyệt từ chối (ví dụ không có cử chỉ người dùng) — bỏ qua êm.
    }
  };

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
