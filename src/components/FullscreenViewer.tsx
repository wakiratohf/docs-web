import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

const FULLSCREEN_STORAGE_KEY = 'docs-viewer-fullscreen';
const FULLSCREEN_EVENT = 'docs-fullscreen-change';

function readStoredFullscreen(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Bọc một vùng nội dung (PDF, preview HTML/Markdown, note chỉ đọc…) và thêm
 * nút bật/tắt xem TOÀN MÀN HÌNH ở góc trên phải.
 *
 * Lựa chọn toàn màn hình được lưu trong localStorage để người dùng không cần bật lại
 * mỗi lần mở tài liệu khác.
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
  const [isFull, setIsFull] = useState<boolean>(readStoredFullscreen);

  // Đồng bộ trạng thái toàn màn hình khi người dùng chuyển tab hoặc đổi ở viewer khác
  useEffect(() => {
    const onSync = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      if (typeof custom.detail === 'boolean') {
        setIsFull(custom.detail);
      } else {
        setIsFull(readStoredFullscreen());
      }
    };

    window.addEventListener(FULLSCREEN_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(FULLSCREEN_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  // Khi đang toàn màn hình: nhấn Esc để thoát + khóa cuộn nền phía sau.
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFull(false);
        try {
          localStorage.setItem(FULLSCREEN_STORAGE_KEY, 'false');
          window.dispatchEvent(
            new CustomEvent(FULLSCREEN_EVENT, { detail: false })
          );
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFull]);

  const toggle = () => {
    setIsFull((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FULLSCREEN_STORAGE_KEY, String(next));
        window.dispatchEvent(
          new CustomEvent(FULLSCREEN_EVENT, { detail: next })
        );
      } catch {
        // ignore
      }
      return next;
    });
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
        title={isFull ? 'Thu nhỏ — thoát toàn màn hình (Esc)' : `${label} (Phóng to)`}
        aria-label={isFull ? 'Thu nhỏ — thoát toàn màn hình' : `${label} (Phóng to)`}
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
