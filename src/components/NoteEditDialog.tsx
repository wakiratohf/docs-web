import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Maximize2, X, Loader2, Check } from 'lucide-react';
import type { DocItem } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
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
  const [content, setContent] = useState(doc.content);
  const [remoteContentRev, setRemoteContentRev] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Auto-save có debounce ~600ms (cùng cơ chế với DocumentEditor).
  const timer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const pending = useRef<DocUpdates | null>(null);

  const lastSyncedRef = useRef({
    title: doc.title,
    author: doc.author ?? '',
    content: doc.content,
  });
  const inFlightRef = useRef({
    titles: new Set<string>(),
    authors: new Set<string>(),
    contents: new Set<string>(),
  });

  // Ghi nốt thay đổi còn treo (không đụng UI, dùng cả lúc unmount/phóng to).
  const flush = () => {
    if (pending.current) {
      const updates = pending.current;
      pending.current = null;
      if (updates.title !== undefined) {
        lastSyncedRef.current.title = updates.title;
        inFlightRef.current.titles.add(updates.title);
      }
      if (updates.author !== undefined) {
        lastSyncedRef.current.author = updates.author;
        inFlightRef.current.authors.add(updates.author);
      }
      if (updates.content !== undefined) {
        lastSyncedRef.current.content = updates.content;
        inFlightRef.current.contents.add(updates.content);
      }
      updateDocument(doc.id, updates);
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Đồng bộ ngầm khi ghi chú bị sửa/ghi đè từ tab khác mà không làm nhảy con trỏ khi đang gõ.
  useEffect(() => {
    const incomingAuthor = doc.author ?? '';

    if (doc.title === lastSyncedRef.current.title) {
      inFlightRef.current.titles.clear();
    } else if (inFlightRef.current.titles.has(doc.title)) {
      inFlightRef.current.titles.delete(doc.title);
    } else {
      inFlightRef.current.titles.clear();
      lastSyncedRef.current.title = doc.title;
      if (pending.current?.title === undefined) setTitle(doc.title);
    }

    if (incomingAuthor === lastSyncedRef.current.author) {
      inFlightRef.current.authors.clear();
    } else if (inFlightRef.current.authors.has(incomingAuthor)) {
      inFlightRef.current.authors.delete(incomingAuthor);
    } else {
      inFlightRef.current.authors.clear();
      lastSyncedRef.current.author = incomingAuthor;
      if (pending.current?.author === undefined) setAuthor(incomingAuthor);
    }

    if (doc.content === lastSyncedRef.current.content) {
      inFlightRef.current.contents.clear();
    } else if (inFlightRef.current.contents.has(doc.content)) {
      inFlightRef.current.contents.delete(doc.content);
    } else {
      inFlightRef.current.contents.clear();
      lastSyncedRef.current.content = doc.content;
      if (pending.current?.content === undefined) {
        setContent(doc.content);
        setRemoteContentRev((r) => r + 1);
      }
    }
  }, [doc.title, doc.author, doc.content]);

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
      flushRef.current();
    };
  }, []);

  const onTitle = (v: string) => {
    setTitle(v);
    debounceSave({ title: v });
  };

  const onContent = (v: string) => {
    setContent(v);
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
        ref={trapRef}
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
          <NoteEditor key={remoteContentRev} value={content} onChange={onContent} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
