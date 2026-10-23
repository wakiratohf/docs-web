import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bẫy Tab/Shift+Tab bên trong modal khi `active`, để không thể Tab ra ngoài
 * dialog ra phần còn lại của trang (accessibility). Khi đóng, trả focus về
 * phần tử đã focus trước khi mở.
 *
 * Gắn ref trả về vào thẻ gốc của modal (div role="dialog").
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const getFocusables = () =>
      ref.current
        ? Array.from(
            ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
          ).filter((el) => el.offsetParent !== null)
        : [];

    // Nếu component không tự focus gì khi mở (vd NoteEditDialog), đưa focus
    // vào phần tử đầu tiên — nếu không thì Tab-trap vô dụng (document.activeElement
    // vẫn ở ngoài dialog) và phím Escape của dialog cũng không nhận được sự kiện
    // (onKeyDown React chỉ bắt được khi target nằm trong cây DOM của dialog).
    // Chạy sau các effect focus riêng (setTimeout 0) của component, nên không
    // ghi đè nếu component đã tự chọn phần tử focus cụ thể.
    const focusTimer = window.setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      getFocusables()[0]?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [active]);

  return ref;
}
