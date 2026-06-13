import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Maximize2, X, Loader2, Check } from 'lucide-react';
import type { DocItem } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import { collectAuthors } from '../lib/authors';
import NoteEditor from './NoteEditor';
import AuthorInput from './AuthorInput';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'author'>>;

interface Props {
  doc: DocItem;
  onClose: () => void;
}

// Hộp thoại sửa nhanh một ghi chú (folder sticky): chỉnh tiêu đề + nội dung
// rich-text ngay tại trang, tự lưu khi gõ (debounce). Nút phóng to chuyển sang
// trình soạn thảo toàn màn hình. Cha mount component này khi mở và dùng
// key={doc.id} để NoteEditor nạp đúng nội dung ban đầu (NoteEditor chỉ nạp
// một lần lúc mount).
export default function NoteEditDialog({ doc, onClose }: Props) {
  const { documents, updateDocument } = useDocuments();
  const navigate = useNavigate();
  // Tác giả đã từng dùng để nạp sẵn dropdown gợi ý (gõ tên mới vẫn được).
  const authors = useMemo(() => collectAuthors(documents), [documents]);

  const [title, setTitle] = useState(doc.title);
  const [author, setAuthor] = useState(doc.author ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Auto-save có debounce ~600ms (cùng cơ chế với DocumentEditor).
  const timer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const pending = useRef<DocUpdates | null>(null);

  // Ghi nốt thay đổi còn treo (không đụng UI, dùng cả lúc unmount/phóng to).
  const flush = () => {
    if (pending.current) {
      updateDocument(doc.id, pending.current);
      pending.current = null;
    }
  };

  const debounceSave = (updates: DocUpdates) => {
    pending.current = { ...(pending.current ?? {}), ...updates };
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      flush();
      setSaveState('saved');
      window.clearTimeout(savedTimer.current);
      // Giữ chỉ báo "Đã lưu" 2s rồi ẩn.
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }, 600);
  };

  // Lưu nốt thay đổi còn treo khi đóng dialog (chỉ ghi, không setState).
  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(savedTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTitle = (v: string) => {
    setTitle(v);
    debounceSave({ title: v });
  };

  const onContent = (v: string) => {
    debounceSave({ content: v });
  };

  const onAuthor = (v: string) => {
    setAuthor(v);
    debounceSave({ author: v.trim() });
  };

  // Phóng to: lưu nốt rồi mở trình soạn thảo toàn màn hình.
  const onMaximize = () => {
    flush();
    navigate(`/docs/view/document/${doc.id}`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal-wide note-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Sửa ghi chú"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="note-dialog-bar">
          <input
            className="title-input"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Tiêu đề ghi chú"
          />
          {saveState !== 'idle' && (
            <span
              className={`save-indicator ${saveState === 'saved' ? 'is-saved' : ''}`}
              aria-live="polite"
            >
              {saveState === 'saving' ? (
                <>
                  <Loader2 className="spin" size={14} aria-hidden="true" /> Đang lưu…
                </>
              ) : (
                <>
                  <Check size={14} aria-hidden="true" /> Đã lưu
                </>
              )}
            </span>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={onMaximize}
            title="Phóng to — mở trình soạn thảo toàn màn hình"
            aria-label="Phóng to — mở trình soạn thảo toàn màn hình"
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="note-dialog-author">
          <label htmlFor="note-author">✍ Tác giả</label>
          <AuthorInput
            id="note-author"
            className="note-author-input"
            value={author}
            authors={authors}
            placeholder="Người viết ghi chú này"
            onChange={onAuthor}
          />
        </div>

        <div className="note-dialog-editor">
          <NoteEditor value={doc.content} onChange={onContent} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
