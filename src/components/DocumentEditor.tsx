import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Share2,
  Link2,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  Check,
  ArrowLeft,
} from 'lucide-react';
import type { DocItem, DocumentType } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { collectAuthors } from '../lib/authors';
import NoteEditor from './NoteEditor';
import AuthorInput from './AuthorInput';
import MarkdownPreview from './MarkdownPreview';
import HtmlDocument from './HtmlDocument';
import PdfViewer from './PdfViewer';
import EmbedViewer from './EmbedViewer';
import FullscreenViewer from './FullscreenViewer';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type' | 'author'>>;

export default function DocumentEditor({ doc }: { doc: DocItem }) {
  const {
    documents,
    updateDocument,
    deleteDocument,
    toggleShareDocument,
    folders,
    moveDocument,
  } = useDocuments();
  // Danh sách tác giả đã từng dùng (mọi tài liệu) để nạp sẵn vào dropdown gợi ý.
  const authors = useMemo(() => collectAuthors(documents), [documents]);
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [title, setTitle] = useState(doc.title);
  const [author, setAuthor] = useState(doc.author ?? '');
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
    setAuthor(doc.author ?? '');
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

  const onAuthor = (v: string) => {
    setAuthor(v);
    debounceSave({ author: v.trim() });
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
        {/* Nút quay lại gộp vào cùng hàng cho gọn (trước đây chiếm 1 dòng riêng) */}
        <Link
          to="/docs"
          className="btn-icon btn-square back-link"
          title="Quay lại danh sách"
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <input
          className="title-input"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Tiêu đề tài liệu"
        />
        {/* Tác giả gộp luôn vào thanh công cụ cho gọn (trước đây chiếm 1 hàng riêng) */}
        <label htmlFor="doc-author" className="sr-only">
          Tác giả
        </label>
        <AuthorInput
          id="doc-author"
          className="doc-author-input"
          value={author}
          authors={authors}
          placeholder="✍ Tác giả"
          onChange={onAuthor}
        />
        {/* PDF không đổi loại được (nội dung là fileId Drive, không phải text) */}
        {type === 'pdf' ? (
          <span className="badge badge-pdf">PDF</span>
        ) : (
          <select
            className="type-select"
            value={type}
            onChange={(e) => onChangeType(e.target.value as DocumentType)}
            title="Loại tài liệu"
          >
            <option value="note">Note (rich-text)</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML (mã thô)</option>
            <option value="embed">Embed (nhúng link)</option>
          </select>
        )}
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
        {/* Nút chia sẻ/xóa gọn lại còn icon (chữ chỉ hiện qua tooltip) */}
        <button
          type="button"
          className={`btn-icon btn-square ${doc.isShared ? 'primary' : ''}`}
          onClick={() => toggleShareDocument(doc.id)}
          title={doc.isShared ? 'Đang chia sẻ — bấm để tắt' : 'Chia sẻ công khai'}
          aria-label={doc.isShared ? 'Đang chia sẻ' : 'Chia sẻ'}
        >
          {doc.isShared ? (
            <Link2 size={16} aria-hidden="true" />
          ) : (
            <Share2 size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="btn-icon btn-square danger"
          onClick={onDelete}
          title="Xóa tài liệu"
          aria-label="Xóa tài liệu"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
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
      </div>

      {doc.isShared && (
        <div className="share-bar">
          <Link2 size={15} aria-hidden="true" className="share-bar-icon" />
          <input
            className="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            title="Link công khai — ai có link đều xem được"
          />
          <button
            type="button"
            className="btn-icon btn-square"
            onClick={onCopyShare}
            title="Copy link"
            aria-label="Copy link"
          >
            <Copy size={16} aria-hidden="true" />
          </button>
          <a
            className="btn-icon btn-square"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            title="Mở link trong tab mới"
            aria-label="Mở link"
          >
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
      )}

      {type === 'pdf' ? (
        // PDF chỉ xem (content là fileId Drive); vẫn sửa được tiêu đề/tác giả ở trên.
        <FullscreenViewer label="Xem PDF toàn màn hình">
          <PdfViewer fileId={content} />
        </FullscreenViewer>
      ) : type === 'embed' ? (
        // Embed: content chỉ là MỘT link → ô nhập 1 dòng + preview nhúng ngay dưới.
        <div className="embed-editor">
          <input
            className="embed-url-input"
            value={content}
            onChange={(e) => onContent(e.target.value)}
            placeholder="Dán link YouTube, Google Slides/Docs/Drive, Figma, CodePen, Vimeo…"
          />
          <FullscreenViewer label="Xem toàn màn hình">
            <EmbedViewer value={content} />
          </FullscreenViewer>
        </div>
      ) : type === 'note' ? (
        <NoteEditor value={content} onChange={onContent} />
      ) : (
        // markdown & html dùng chung khung soạn thảo có tab Edit/Preview;
        // chỉ khác placeholder và cách render preview.
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
              placeholder={
                type === 'html'
                  ? '<h1>Tiêu đề</h1>&#10;&#10;<p>Viết HTML thô ở đây…</p>'
                  : '# Tiêu đề&#10;&#10;Viết Markdown ở đây…'
              }
            />
          ) : type === 'html' ? (
            <FullscreenViewer label="Xem nội dung toàn màn hình">
              <HtmlDocument value={content} />
            </FullscreenViewer>
          ) : (
            <FullscreenViewer label="Xem nội dung toàn màn hình">
              <MarkdownPreview content={content} />
            </FullscreenViewer>
          )}
        </div>
      )}
    </div>
  );
}
