import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  ChevronDown,
  FilePlus2,
  Hash,
  Code2,
  Link2,
  FileUp,
  Globe,
} from 'lucide-react';
import AddPdfModal from './AddPdfModal';
import ImportWebModal from './ImportWebModal';
import type { DocumentType } from '../types';

interface MenuCoords {
  top: number;
  left: number;
  minWidth: number;
}

// Gộp các nút "New note / New markdown / New HTML / New PDF / Import từ Web" thành MỘT nút "New"
// có dropdown kính mờ đồng bộ với hệ thống DropdownSelect. Tái dùng ở trang chủ và trong folder.
//
// - note/markdown/html/embed: gọi onCreate(type) (trang tự điều hướng tới trang soạn thảo).
// - pdf: mở AddPdfModal cho người dùng chọn hình thức (dán link Drive / upload file).
// - web/html: mở ImportWebModal để bóc tách bài viết từ URL hoặc chuyển đổi mã HTML sang Markdown.
export default function NewDocMenu({
  folderId,
  onCreate,
  onPdfCreated,
  onDocCreated,
}: {
  // folderId của folder đang xem; bỏ trống = tạo tài liệu lẻ ở trang chủ.
  folderId?: string;
  onCreate: (type: DocumentType) => void;
  onPdfCreated?: (id: string) => void;
  onDocCreated?: (id: string) => void;
}) {
  const triggerId = useId();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [importWebOpen, setImportWebOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({
    top: 0,
    left: 0,
    minWidth: 244,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedByKeyboardRef = useRef(false);
  const initialFocusEndRef = useRef(false);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const gap = 6;
    const pad = 8;
    const desiredMinWidth = 244;

    const menuEl = menuRef.current;
    const menuWidth = Math.max(
      desiredMinWidth,
      menuEl ? menuEl.offsetWidth : desiredMinWidth,
    );
    const menuHeight = menuEl ? menuEl.offsetHeight : 310;

    let left = rect.left;
    if (left + menuWidth > vw - pad) left = vw - menuWidth - pad;
    if (left < pad) left = pad;

    let top = rect.bottom + gap;
    if (top + menuHeight > vh - pad && rect.top - gap - menuHeight >= pad) {
      top = rect.top - gap - menuHeight;
    }

    setCoords({ top, left, minWidth: desiredMinWidth });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    if (openedByKeyboardRef.current) {
      const items =
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      if (items && items.length > 0) {
        const idx = initialFocusEndRef.current ? items.length - 1 : 0;
        items[idx]?.focus({ preventScroll: true });
      }
    }
  }, [open, updatePosition]);

  // Bấm/focus ra ngoài thì đóng menu; tự cập nhật tọa độ khi cuộn hoặc đổi cỡ cửa sổ.
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
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      e.preventDefault();
      const focusLast = e.key === 'ArrowUp' || e.key === 'End';
      openedByKeyboardRef.current = true;
      initialFocusEndRef.current = focusLast;
      if (!open) {
        setOpen(true);
      } else {
        const items =
          menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
        if (!items || items.length === 0) return;
        items[focusLast ? items.length - 1 : 0]?.focus({ preventScroll: true });
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      openedByKeyboardRef.current = true;
      initialFocusEndRef.current = false;
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
      triggerRef.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
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
      next = e.key === 'ArrowUp' ? items.length - 1 : 0;
    } else {
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      next = (current + delta + items.length) % items.length;
    }
    items[next]?.focus({ preventScroll: true });
    items[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  // Chọn một loại trong menu rồi đóng lại.
  const pick = (type: DocumentType) => {
    setOpen(false);
    onCreate(type);
  };

  return (
    <div className="new-menu">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="btn-icon primary new-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={onTriggerKeyDown}
        onClick={(e) => {
          openedByKeyboardRef.current = e.detail === 0;
          initialFocusEndRef.current = false;
          setOpen((v) => !v);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        <span>New</span>
        <ChevronDown size={14} className="dropdown-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="dropdown-menu-pop new-doc-menu-pop"
            role="menu"
            aria-labelledby={triggerId}
            tabIndex={-1}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.minWidth}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => pick('note')}
            >
              <span className="dropdown-item-icon icon-tint-note" aria-hidden="true">
                <FilePlus2 size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">New note</span>
                <span className="dropdown-item-desc">Văn bản giàu định dạng</span>
              </span>
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => pick('markdown')}
            >
              <span className="dropdown-item-icon icon-tint-markdown" aria-hidden="true">
                <Hash size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">New markdown</span>
                <span className="dropdown-item-desc">Cú pháp Markdown chuẩn</span>
              </span>
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => pick('html')}
            >
              <span className="dropdown-item-icon icon-tint-html" aria-hidden="true">
                <Code2 size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">New HTML</span>
                <span className="dropdown-item-desc">Trang HTML độc lập</span>
              </span>
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => pick('embed')}
            >
              <span className="dropdown-item-icon icon-tint-embed" aria-hidden="true">
                <Link2 size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">New embed</span>
                <span className="dropdown-item-desc">Nhúng link hoặc ứng dụng</span>
              </span>
            </button>

            <hr className="dropdown-sep" />

            {/* PDF mở modal chọn hình thức (link Drive / upload). Đóng dropdown
                trước, modal tự là một lớp portal riêng. */}
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPdfOpen(true);
              }}
            >
              <span className="dropdown-item-icon icon-tint-pdf" aria-hidden="true">
                <FileUp size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">New PDF</span>
                <span className="dropdown-item-desc">Tải file lên hoặc gắn Drive</span>
              </span>
            </button>
            {/* Nhập từ Web / HTML mở ImportWebModal để trích xuất bài viết Markdown */}
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setImportWebOpen(true);
              }}
            >
              <span className="dropdown-item-icon icon-tint-web" aria-hidden="true">
                <Globe size={15} />
              </span>
              <span className="dropdown-item-body">
                <span className="dropdown-item-label">Import từ Web / HTML</span>
                <span className="dropdown-item-desc">Trích xuất sang Markdown</span>
              </span>
            </button>
          </div>,
          document.body,
        )}

      <AddPdfModal
        open={pdfOpen}
        folderId={folderId}
        onCancel={() => setPdfOpen(false)}
        onCreated={(id) => {
          setPdfOpen(false);
          onDocCreated ? onDocCreated(id) : onPdfCreated?.(id);
        }}
      />

      <ImportWebModal
        open={importWebOpen}
        folderId={folderId}
        onCancel={() => setImportWebOpen(false)}
        onCreated={(id) => {
          setImportWebOpen(false);
          onDocCreated ? onDocCreated(id) : onPdfCreated?.(id);
        }}
      />
    </div>
  );
}
