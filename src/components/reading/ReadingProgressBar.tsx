import { useEffect, useState } from 'react';

/**
 * Thanh tiến trình đọc (Reading Progress Bar).
 * Gắn cố định ở đỉnh màn hình, tự động bắt sự kiện cuộn từ window hoặc bất kỳ
 * container nào đang cuộn nội dung (kể cả trong flex layout / overflow-y: auto)
 * nhờ cơ chế event capture.
 */
export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = (e?: Event) => {
      const el = e?.target as HTMLElement | Document | null;
      let scrollTop = 0;
      let maxScroll = 0;

      if (!el || el === document || el === document.documentElement) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        maxScroll =
          document.documentElement.scrollHeight - document.documentElement.clientHeight;
      } else if (el instanceof HTMLElement) {
        scrollTop = el.scrollTop;
        maxScroll = el.scrollHeight - el.clientHeight;
      }

      if (maxScroll > 30) {
        const pct = Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100));
        setProgress(pct);
      } else {
        setProgress(0);
      }
      ticking = false;
    };

    const onScroll = (e: Event) => {
      if (!ticking) {
        window.requestAnimationFrame(() => handleScroll(e));
        ticking = true;
      }
    };

    // { capture: true } cho phép bắt sự kiện scroll từ mọi container con
    // (vì event scroll không bubble lên, nhưng vẫn đi qua capture phase).
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', () => handleScroll(), { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', () => handleScroll());
    };
  }, []);

  if (progress <= 0) return null;

  return (
    <div
      className="reading-progress-track"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tiến trình đọc bài viết"
    >
      <div
        className="reading-progress-fill"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
