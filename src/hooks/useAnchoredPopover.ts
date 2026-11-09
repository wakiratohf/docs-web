import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PopoverCoords {
  top: number;
  left: number;
}

// Hook dùng chung cho các bảng nổi bám theo một nút (popover chia sẻ, menu "⋯"...).
// Bảng được render qua Portal vào body (tránh bị overflow của header cắt mất), nên
// tọa độ tính theo viewport (position: fixed) và được kẹp trong màn hình.
//
// - align 'end': mép phải bảng thẳng mép phải nút (hợp với nút nằm ở góc phải header).
// - Tự đóng khi bấm/focus ra ngoài, nhấn Escape; tự cập nhật vị trí khi cuộn/đổi cỡ cửa sổ.
export function useAnchoredPopover<
  T extends HTMLElement = HTMLButtonElement,
  P extends HTMLElement = HTMLDivElement,
>({ align = 'end', width = 320 }: { align?: 'start' | 'end'; width?: number } = {}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0 });
  const triggerRef = useRef<T>(null);
  const popoverRef = useRef<P>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const gap = 6;
    const pad = 8;
    const el = popoverRef.current;
    const w = Math.min(el ? el.offsetWidth : width, vw - pad * 2);
    const h = el ? el.offsetHeight : 200;

    let left = align === 'end' ? rect.right - w : rect.left;
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;

    let top = rect.bottom + gap;
    // Không đủ chỗ phía dưới mà phía trên đủ → lật lên trên.
    if (top + h > vh - pad && rect.top - gap - h >= pad) top = rect.top - gap - h;

    setCoords({ top, left });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => {
      const node = target as Node | null;
      return Boolean(
        triggerRef.current?.contains(node) || popoverRef.current?.contains(node),
      );
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!isInside(e.target)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isInside(e.target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    const onViewportChange = () => updatePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, close, updatePosition]);

  return { open, setOpen, toggle, close, coords, triggerRef, popoverRef };
}
