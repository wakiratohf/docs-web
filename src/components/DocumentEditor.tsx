import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Link2, Trash2, Copy, ExternalLink, Loader2, Check } from 'lucide-react';
import type { DocItem, DocumentType } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import NoteEditor from './NoteEditor';
import MarkdownPreview from './MarkdownPreview';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type'>>;

export default function DocumentEditor({ doc }: { doc: DocItem }) {
  const {
    updateDocument,
    deleteDocument,
    toggleShareDocument,
    folders,
    moveDocument,
  } = useDocuments();
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [type, setType] = useState<DocumentType>(doc.type);
  // Mặc định mở ở Preview khi tài liệu đã có nội dung; rỗng (vừa tạo) thì mở Edit.
  const [tab, setTab] = useState<'edit' | 'preview'>(
    doc.content.trim() ? 'preview' : 'edit',
  );
  // Trạng thái auto-save để hiển thị "Đang lưu…" / "Đã lưu".
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const shareUrl = `${window.location.origin}/share/d/${doc.id}`;

  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Đã copy link chia sẻ');
    } catch {
      toastError('Không copy được link');
    }
  };

  // Đồng bộ state cục bộ từ props CHỈ khi đổi tài liệu (doc.id), không đồng bộ
  // khi content dội về từ Firebase (tránh nhảy con trỏ khi đang gõ).
  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setType(doc.type);
    setTab(doc.content.trim() ? 'preview' : 'edit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Auto-save có debounce ~600ms.
  const timer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const pending = useRef<DocUpdates | null>(null);

  // Ghi nốt thay đổi còn treo (không đụng tới UI, dùng cả lúc unmount).
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
      // Sau 2s đưa chỉ báo về ẩn.
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }, 600);
  };

  // Lưu nốt thay đổi còn treo khi rời tài liệu (chỉ ghi, không setState).
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
    setContent(v);
    debounceSave({ content: v });
  };

  const onChangeType = async (v: DocumentType) => {
    if (v === type) return;
    // Đổi loại không tự chuyển định dạng → cảnh báo nếu đang có nội dung.
    if (content.trim()) {
      const ok = await confirm({
        title: 'Đổi loại tài liệu',
        message:
          'Đổi loại có thể làm nội dung hiển thị khác đi (định dạng không tự chuyển). Tiếp tục?',
        confirmText: 'Đổi',
      });
      if (!ok) return; // select controlled tự về giá trị cũ
    }
    setType(v);
    updateDocument(doc.id, { type: v });
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Xóa tài liệu',
      message: 'Xóa tài liệu này? Hành động không thể hoàn tác.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    deleteDocument(doc.id);
    navigate('/docs');
  };

  return (
    <div className="doc-editor">
      <div className="doc-editor-bar">
        <input
          className="title-input"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Tiêu đề tài liệu"
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
        <select
          className="type-select"
          value={type}
          onChange={(e) => onChangeType(e.target.value as DocumentType)}
        >
          <option value="note">Note (rich-text)</option>
          <option value="markdown">Markdown</option>
        </select>
        <select
          className="folder-select"
          value={doc.folderId ?? ''}
          onChange={(e) => moveDocument(doc.id, e.target.value || undefined)}
          title="Chọn folder cho tài liệu"
        >
          <option value="">📁 Không có folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              📁 {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`btn-icon ${doc.isShared ? 'primary' : ''}`}
          onClick={() => toggleShareDocument(doc.id)}
          title="Bật/tắt chia sẻ công khai"
        >
          {doc.isShared ? (
            <>
              <Link2 size={16} aria-hidden="true" /> Đang chia sẻ
            </>
          ) : (
            <>
              <Share2 size={16} aria-hidden="true" /> Chia sẻ
            </>
          )}
        </button>
        <button type="button" className="btn-icon danger" onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" /> Xóa
        </button>
      </div>

      {doc.isShared && (
        <div className="share-bar">
          <span className="muted">Link công khai (ai có link đều xem được):</span>
          <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-icon" onClick={onCopyShare}>
            <Copy size={16} aria-hidden="true" /> Copy
          </button>
          <a className="btn-icon" href={shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> Mở
          </a>
        </div>
      )}

      {type === 'note' ? (
        <NoteEditor value={content} onChange={onContent} />
      ) : (
        <div className="md-editor">
          <div className="tabs">
            <button
              type="button"
              className={tab === 'edit' ? 'active' : ''}
              onClick={() => setTab('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className={tab === 'preview' ? 'active' : ''}
              onClick={() => setTab('preview')}
            >
              Preview
            </button>
          </div>
          {tab === 'edit' ? (
            <textarea
              className="md-textarea"
              value={content}
              onChange={(e) => onContent(e.target.value)}
              placeholder="# Tiêu đề&#10;&#10;Viết Markdown ở đây…"
            />
          ) : (
            <MarkdownPreview content={content} />
          )}
        </div>
      )}
    </div>
  );
}
