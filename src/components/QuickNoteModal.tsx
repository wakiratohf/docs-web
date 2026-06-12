import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import type { StickyColor } from '../types';

export interface QuickNoteModalProps {
  open: boolean;
  onCancel: () => void;
  // text: nội dung dạng chữ thuần (component cha tự chuyển sang HTML khi lưu).
  onCreate: (title: string, text: string, color: StickyColor) => void;
}

// Hộp thoại tạo nhanh một ghi chú ngay trên trang folder kiểu sticky note —
// nhập tiêu đề + nội dung + chọn màu, không cần mở trang soạn thảo toàn màn hình.
export default function QuickNoteModal({
  open,
  onCancel,
  onCreate,
}: QuickNoteModalProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [color, setColor] = useState<StickyColor>(DEFAULT_STICKY_COLOR);
  const titleRef = useRef<HTMLInputElement>(null);

  // Mỗi lần mở: xóa trắng các ô và đưa con trỏ vào ô tiêu đề.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setText('');
    setColor(DEFAULT_STICKY_COLOR);
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const submit = () => onCreate(title.trim(), text, color);

  // Escape = hủy; Ctrl/Cmd + Enter = tạo (Enter thường trong textarea là xuống dòng).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-note-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="quick-note-title" className="modal-title">
          Ghi chú mới
        </h2>

        <label className="modal-field-label" htmlFor="qn-title">
          Tiêu đề
        </label>
        <input
          id="qn-title"
          ref={titleRef}
          className="modal-input"
          value={title}
          placeholder="Tiêu đề ghi chú"
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="modal-field-label" htmlFor="qn-content">
          Nội dung
        </label>
        <textarea
          id="qn-content"
          className="quick-note-textarea"
          value={text}
          rows={5}
          placeholder="Nhập nội dung ghi chú…"
          onChange={(e) => setText(e.target.value)}
        />

        <span className="modal-field-label">Màu</span>
        <div className="qn-colors">
          {STICKY_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`sticky-swatch${color === c.key ? ' selected' : ''}`}
              style={{ background: c.swatch }}
              title={c.label}
              aria-label={c.label}
              aria-pressed={color === c.key}
              onClick={() => setColor(c.key)}
            />
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Hủy
          </button>
          <button type="button" className="primary" onClick={submit}>
            Tạo
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
