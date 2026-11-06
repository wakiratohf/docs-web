import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption<T extends string = string> {
  value: T;
  /** Nhãn chính hiển thị trong danh sách xổ xuống. */
  label: string;
  /** Nhãn rút gọn hiển thị trên nút bấm (mặc định dùng `label`). */
  triggerLabel?: string;
  /** Mô tả ngắn một dòng dưới nhãn chính (tùy chọn). */
  description?: string;
  /** Icon đầu dòng của mục chọn (tùy chọn). */
  icon?: ReactNode;
}

export interface DropdownSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly DropdownOption<T>[];
  /** Nhãn trợ năng cho trình đọc màn hình. */
  ariaLabel: string;
  title?: string;
  id?: string;
  /** Icon mặc định trên nút bấm khi mục đang chọn không gắn icon riêng. */
  triggerIcon?: ReactNode;
  /** Căn lề bảng menu theo mép trái ('start') hoặc mép phải ('end') của nút bấm. */
  align?: 'start' | 'end';
  /** Cỡ nút bấm: 'sm' gọn cho thanh công cụ editor, 'md' chuẩn. */
  size?: 'sm' | 'md';
  /** Giãn kín chiều ngang vùng chứa (dùng cho trường nhập trong modal). */
  fullWidth?: boolean;
  /** Bề rộng tối thiểu của bảng menu xổ xuống (px). */
  minMenuWidth?: number;
  className?: string;
}

interface MenuCoords {
  top: number;
  left: number;
  minWidth: number;
}

/**
 * Dropdown chọn một giá trị đồng bộ phong cách kính mờ macOS/iOS:
 * - Render qua Portal + tự kẹp tọa độ trong viewport (không bị cắt bởi overflow hay mép màn hình).
 * - Hỗ trợ đầy đủ bàn phím: ArrowUp/ArrowDown, Home/End, Enter/Space, Escape, Tab.
 */
export default function DropdownSelect<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  title,
  id,
  triggerIcon,
  align = 'start',
  size = 'md',
  fullWidth = false,
  minMenuWidth = 196,
  className = '',
}: DropdownSelectProps<T>) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({
    top: 0,
    left: 0,
    minWidth: minMenuWidth,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Đánh dấu mở bằng bàn phím để tự đưa focus vào mục đang chọn ngay khi mở.
  const openedByKeyboardRef = useRef(false);

  const selectedOption =
    options.find((o) => o.value === value) ?? options[0];

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // Tính vị trí nổi của menu theo nút bấm, tự lật lên trên nếu sát đáy màn hình
  // và tự kẹp ngang để không tràn mép trái/phải trên điện thoại.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const gap = 6;
    const pad = 8;

    const menuEl = menuRef.current;
    const desiredMinWidth = Math.max(minMenuWidth, Math.round(rect.width));
    const menuWidth = Math.max(
      desiredMinWidth,
      menuEl ? menuEl.offsetWidth : desiredMinWidth,
    );
    const menuHeight = menuEl ? menuEl.offsetHeight : Math.min(options.length * 40 + 14, 300);

    let left = align === 'end' ? rect.right - menuWidth : rect.left;
    if (left + menuWidth > vw - pad) left = vw - menuWidth - pad;
    if (left < pad) left = pad;

    let top = rect.bottom + gap;
    if (top + menuHeight > vh - pad && rect.top - gap - menuHeight >= pad) {
      top = rect.top - gap - menuHeight;
    }

    setCoords({ top, left, minWidth: desiredMinWidth });
  }, [align, minMenuWidth, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    // Chỉ chuyển focus vào bên trong menu ngay lúc mở nếu người dùng mở bằng phím;
    // khi bấm chuột thì giữ tự nhiên, cuộn mục đang chọn vào tầm nhìn.
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const selectedIdx = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    const targetItem = items?.[selectedIdx];
    if (openedByKeyboardRef.current) {
      targetItem?.focus({ preventScroll: true });
    }
    targetItem?.scrollIntoView?.({ block: 'nearest' });
  }, [open, updatePosition, options, value]);

  // Lắng nghe click/focus ra ngoài và cập nhật tọa độ khi cuộn/đổi cỡ cửa sổ.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onViewportResize = () => updatePosition();
    const onViewportScroll = (e: Event) => {
      // Bỏ qua sự kiện cuộn bên trong chính danh sách xổ xuống
      if (menuRef.current && e.target === menuRef.current) return;
      updatePosition();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onViewportResize);
    window.addEventListener('scroll', onViewportScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onViewportResize);
      window.removeEventListener('scroll', onViewportScroll, true);
    };
  }, [open, updatePosition]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      (open && (e.key === 'Home' || e.key === 'End'))
    ) {
      e.preventDefault();
      openedByKeyboardRef.current = true;
      if (!open) {
        setOpen(true);
      } else {
        // Nếu đã mở bằng chuột (focus vẫn ở nút bấm), nhấn mũi tên nhảy thẳng vào danh sách
        const items =
          menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
        if (!items || items.length === 0) return;
        const selectedIdx = Math.max(
          0,
          options.findIndex((o) => o.value === value),
        );
        const targetIdx =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : selectedIdx;
        items[targetIdx]?.focus({ preventScroll: true });
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      openedByKeyboardRef.current = true;
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
      return;
    }
    if (e.key === 'Tab') {
      // Trả điểm neo focus về nút bấm trước khi trình duyệt xử lý Tab/Shift+Tab,
      // giúp luồng Tab đi tiếp sang phần tử kế bên (và giữ nguyên focus trap trong modal).
      triggerRef.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (items.length === 0) return;

    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = items.length - 1;
    } else if (current < 0) {
      const selectedIdx = options.findIndex((o) => o.value === value);
      next = selectedIdx >= 0 ? selectedIdx : 0;
    } else {
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      next = (current + delta + items.length) % items.length;
    }
    items[next]?.focus({ preventScroll: true });
    items[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleSelect = (nextValue: T, fromKeyboard: boolean) => {
    onChange(nextValue);
    closeMenu(fromKeyboard);
  };

  const activeIcon = selectedOption?.icon ?? triggerIcon;
  const displayLabel =
    selectedOption?.triggerLabel ?? selectedOption?.label ?? '';
  const hasAnyOptionIcon = options.some((o) => Boolean(o.icon));

  return (
    <div
      className={`dropdown-select${fullWidth ? ' is-full' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`dropdown-trigger dropdown-trigger-${size}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        onKeyDown={onTriggerKeyDown}
        onClick={(e) => {
          // detail === 0 nghĩa là kích hoạt từ bàn phím (Enter/Space)
          openedByKeyboardRef.current = e.detail === 0;
          setOpen((prev) => !prev);
        }}
      >
        {activeIcon && (
          <span className="dropdown-trigger-icon" aria-hidden="true">
            {activeIcon}
          </span>
        )}
        <span className="dropdown-trigger-label">{displayLabel}</span>
        <ChevronDown size={14} className="dropdown-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            className="dropdown-menu-pop"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.minWidth}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`dropdown-item${isSelected ? ' is-selected' : ''}`}
                  onClick={(e) => handleSelect(opt.value, e.detail === 0)}
                >
                  {hasAnyOptionIcon && (
                    <span className="dropdown-item-icon" aria-hidden="true">
                      {opt.icon ?? null}
                    </span>
                  )}
                  <span className="dropdown-item-body">
                    <span className="dropdown-item-label">{opt.label}</span>
                    {opt.description && (
                      <span className="dropdown-item-desc">{opt.description}</span>
                    )}
                  </span>
                  <span className="dropdown-item-check" aria-hidden="true">
                    {isSelected ? <Check size={15} /> : null}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
