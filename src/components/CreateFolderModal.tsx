import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { List, LayoutGrid } from 'lucide-react';
import type { FolderViewType } from '../types';

export interface CreateFolderModalProps {
  open: boolean;
  onCancel: () => void;
  onCreate: (name: string, viewType: FolderViewType) => void;
}

// Hộp thoại tạo folder: nhập tên + chọn kiểu hiển thị (danh sách / sticky note).
// Tách riêng khỏi ConfirmDialog vì cần thêm bộ chọn kiểu, không chỉ một ô text.
export default function CreateFolderModal({
  open,
  onCancel,
  onCreate,
}: CreateFolderModalProps) {
  const [name, setName] = useState('Folder mới');
  const [viewType, setViewType] = useState<FolderViewType>('list');
  const inputRef = useRef<HTMLInputElement>(null);

  // Mỗi lần mở: đặt lại giá trị mặc định, chọn sẵn toàn bộ tên để gõ đè nhanh.
  useEffect(() => {
    if (!open) return;
    setName('Folder mới');
    setViewType('list');
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const submit = () => onCreate(name.trim() || 'Folder mới', viewType);

  // Enter = tạo; Escape = hủy.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
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
        aria-labelledby="create-folder-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="create-folder-title" className="modal-title">
          Tạo folder mới
        </h2>

        <label className="modal-field-label" htmlFor="create-folder-name">
          Tên folder
        </label>
        <input
          id="create-folder-name"
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <span className="modal-field-label">Kiểu hiển thị</span>
        <div className="view-type-picker">
          <button
            type="button"
            className={`view-type-option${viewType === 'list' ? ' selected' : ''}`}
            aria-pressed={viewType === 'list'}
            onClick={() => setViewType('list')}
          >
            <List size={18} aria-hidden="true" />
            <span className="view-type-name">Danh sách</span>
            <span className="view-type-desc muted">Các tài liệu xếp dọc</span>
          </button>
          <button
            type="button"
            className={`view-type-option${viewType === 'sticky' ? ' selected' : ''}`}
            aria-pressed={viewType === 'sticky'}
            onClick={() => setViewType('sticky')}
          >
            <LayoutGrid size={18} aria-hidden="true" />
            <span className="view-type-name">Sticky note</span>
            <span className="view-type-desc muted">Ô giấy nhớ màu, dạng lưới</span>
          </button>
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
