import { useEffect, useId, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  // Hành động nguy hiểm (xóa...) — tô đỏ và luôn được đặt cuối menu bởi nơi gọi.
  danger?: boolean;
}

// Menu "⋯" gom các hành động phụ / nguy hiểm, để chúng không đứng sát các nút hay bấm
// (vd. nút Xóa từng nằm ngay cạnh nút Chia sẻ → dễ bấm nhầm).
export default function ActionMenu({
  items,
  label = 'Thêm thao tác',
  triggerClassName = 'btn-icon btn-square',
}: {
  items: ActionMenuItem[];
  label?: string;
  triggerClassName?: string;
}) {
  const menuId = useId();
  const { open, toggle, close, coords, triggerRef, popoverRef } = useAnchoredPopover({
    width: 220,
  });

  // Mở menu → focus mục đầu tiên để dùng phím mũi tên ngay.
  useEffect(() => {
    if (!open) return;
    popoverRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [open, popoverRef]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nodes = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (nodes.length === 0) return;
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = (idx + 1) % nodes.length;
    else if (e.key === 'ArrowUp') next = (idx - 1 + nodes.length) % nodes.length;
    else if (e.key === 'End') next = nodes.length - 1;
    nodes[next]?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="dropdown-menu-pop action-menu"
            style={{ top: coords.top, left: coords.left }}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                className={`dropdown-item${it.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  close(true);
                  it.onSelect();
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
