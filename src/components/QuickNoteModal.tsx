import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import type { StickyColor } from '../types';
import NoteEditor from './NoteEditor';
import AuthorInput from './AuthorInput';

export interface QuickNoteModalProps {
  onCancel: () => void;
  // html: nội dung đã là chuỗi HTML (lấy thẳng từ NoteEditor rich-text).
  onCreate: (title: string, html: string, color: StickyColor, author: string) => void;
  // Tên tác giả gợi ý sẵn (người đang đăng nhập); người dùng sửa lại được.
  defaultAuthor: string;
  // Danh sách tác giả đã từng dùng, nạp sẵn vào dropdown gợi ý.
  authors: string[];
}

// Hộp thoại tạo nhanh một ghi chú ngay trên trang folder kiểu sticky note —
// nhập tiêu đề + soạn nội dung bằng trình soạn thảo rich-text (giống lúc sửa
// note) + chọn màu, không cần mở trang soạn thảo toàn màn hình.
// Component được mount khi mở và unmount khi đóng (cha render có điều kiện) để
// NoteEditor — vốn chỉ nạp nội dung một lần lúc mount — luôn bắt đầu sạch.
export default function QuickNoteModal({
  onCancel,
  onCreate,
  defaultAuthor,
  authors,
}: QuickNoteModalProps) {
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [color, setColor] = useState<StickyColor>(DEFAULT_STICKY_COLOR);
  const [author, setAuthor] = useState(defaultAuthor);
  const titleRef = useRef<HTMLInputElement>(null);

  // Đưa con trỏ vào ô tiêu đề ngay khi mở.
  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const submit = () => onCreate(title.trim(), html, color, author.trim());

  // Escape = hủy; Ctrl/Cmd + Enter = tạo (Enter thường trong editor là xuống dòng).
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
        className="modal modal-wide note-dialog"
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

        <label className="modal-field-label" htmlFor="qn-author">
          Tác giả
        </label>
        <AuthorInput
          id="qn-author"
          className="modal-input"
          value={author}
          authors={authors}
          placeholder="Người viết ghi chú này"
          onChange={setAuthor}
        />

        <span className="modal-field-label">Nội dung</span>
        <div className="note-dialog-editor">
          <NoteEditor value={html} onChange={setHtml} />
        </div>

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
