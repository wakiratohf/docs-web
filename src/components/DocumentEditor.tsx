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
  Type,
  ListTree,
  FoldHorizontal,
  UnfoldHorizontal,
} from 'lucide-react';
import type { DocItem, DocumentType } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { collectAuthors } from '../lib/authors';
import { getDriveAccessToken, deleteFileFromDrive } from '../lib/googleDrive';
import { htmlToMarkdown, isMeaningfulHtml } from '../lib/htmlToMarkdown';
import { calculateReadingStats } from '../lib/readingStats';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import NoteEditor from './NoteEditor';
import AuthorInput from './AuthorInput';
import MarkdownPreview from './MarkdownPreview';
import HtmlDocument from './HtmlDocument';
import PdfViewer from './PdfViewer';
import EmbedViewer from './EmbedViewer';
import FullscreenViewer from './FullscreenViewer';
import TableOfContents from './reading/TableOfContents';
import ReadingPreferencesModal from './reading/ReadingPreferencesModal';
import ReadingProgressBar from './reading/ReadingProgressBar';

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
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>(
    doc.content.trim() ? 'preview' : 'edit',
  );
  // Trạng thái auto-save để hiển thị "Đang lưu…" / "Đã lưu".
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Bộ tùy chỉnh đọc công thái học (Font, Giấy ngà, Cỡ chữ, Giãn dòng, Chiều rộng)
  const { prefs, updatePrefs, resetPrefs, containerAttributes } = useReadingPreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [showToc, setShowToc] = useState(false);

  // Thống kê bài viết (tổng số từ & thời gian đọc ước tính)
  const stats = useMemo(() => calculateReadingStats(content), [content]);

  // Mục lục động tự trích xuất từ tiêu đề bài viết
  const tocItems = useMemo(() => {
    if (!content) return [];
    if (type === 'markdown') return extractTocFromMarkdown(content);
    if (type === 'note' || type === 'html') return extractTocFromHtml(content);
    return [];
  }, [content, type]);

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

  // Phím tắt Ctrl+S / Cmd+S để lưu ngay lập tức và lưu nốt thay đổi còn treo khi rời tài liệu.
  useEffect(() => {
    const onSaveKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.clearTimeout(timer.current);
        flush();
        setSaveState('saved');
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2000);
      }
    };
    window.addEventListener('keydown', onSaveKey);
    return () => {
      window.removeEventListener('keydown', onSaveKey);
      window.clearTimeout(timer.current);
      window.clearTimeout(savedTimer.current);
      flush();
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

  const onChangeType = async (v: DocumentType) => {
    if (v === type) return;

    // Chuyển đổi thông minh: từ HTML hoặc Note (rich-text) sang Markdown nếu người dùng đồng ý
    if ((type === 'html' || type === 'note') && v === 'markdown' && content.trim()) {
      const sourceName = type === 'html' ? 'HTML' : 'Note (rich-text)';
      const convert = await confirm({
        title: 'Chuyển đổi sang Markdown',
        message:
          `Bạn đang đổi từ tài liệu ${sourceName} sang Markdown. Bạn có muốn tự động chuyển đổi mã nội dung này thành cú pháp Markdown chuẩn không?`,
        confirmText: 'Chuyển đổi sang Markdown',
        cancelText: 'Giữ nguyên mã thô',
      });
      let nextContent = content;
      if (convert) {
        nextContent = htmlToMarkdown(content);
        setContent(nextContent);
        toastSuccess('Đã chuyển đổi nội dung sang Markdown.');
      }
      setType(v);
      updateDocument(doc.id, { type: v, content: nextContent });
      return;
    }

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

  // Smart Paste: khi dán nội dung từ web (có cấu trúc HTML) vào editor Markdown,
  // tự động chuyển thành Markdown (bảng, link, heading, bold...) thay vì dán text trần.
  const onMarkdownPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (type !== 'markdown') return;

    const html = e.clipboardData.getData('text/html');
    if (!html || !isMeaningfulHtml(html)) return;

    const md = htmlToMarkdown(html);
    if (!md) return;

    e.preventDefault();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    const nextContent = content.slice(0, start) + md + content.slice(end);
    onContent(nextContent);

    // Đưa con trỏ chuột về sau phần markdown vừa chèn
    const nextCursor = start + md.length;
    window.requestAnimationFrame(() => {
      textarea.selectionStart = nextCursor;
      textarea.selectionEnd = nextCursor;
    });
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Xóa tài liệu',
      message: 'Xóa tài liệu này? Hành động không thể hoàn tác.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;

    // Với PDF: content là fileId Drive. Hỏi thêm có xóa luôn file gốc trên Drive
    // không (cần đăng nhập Google). Dù người dùng từ chối/đóng popup hay lỗi, ta
    // VẪN xóa tài liệu khỏi web — chỉ phần dọn file Drive là tùy chọn.
    if (doc.type === 'pdf' && doc.content.trim()) {
      const alsoDrive = await confirm({
        title: 'Xóa file trên Google Drive?',
        message:
          'Xóa luôn file PDF gốc trên Google Drive của bạn? Việc này cần đăng nhập Google. Chọn "Chỉ xóa khỏi web" nếu muốn giữ file trên Drive.',
        confirmText: 'Xóa cả trên Drive',
        cancelText: 'Chỉ xóa khỏi web',
        danger: true,
      });
      if (alsoDrive) {
        try {
          const token = await getDriveAccessToken();
          if (token) {
            await deleteFileFromDrive(doc.content, token);
            toastSuccess('Đã xóa file trên Drive.');
          } else {
            toastError('Không lấy được quyền Drive — file trên Drive chưa bị xóa.');
          }
        } catch {
          toastError('Không xóa được file trên Drive (tài liệu vẫn bị xóa khỏi web).');
        }
      }
    }

    deleteDocument(doc.id);
    navigate(doc.folderId ? `/docs/folder/${doc.folderId}` : '/docs');
  };

  return (
    <div className="doc-editor">
      <div className="doc-editor-bar">
        {/* Nút quay lại gộp vào cùng hàng cho gọn (trước đây chiếm 1 dòng riêng).
            Quay về đúng folder chứa tài liệu (nếu có), không phải luôn về trang chủ. */}
        <Link
          to={doc.folderId ? `/docs/folder/${doc.folderId}` : '/docs'}
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
        // markdown & html dùng chung khung soạn thảo có tab Edit/Preview/Split;
        // chỉ khác placeholder và cách render preview.
        <div
          className="md-editor"
          data-reading-theme={tab !== 'edit' && prefs.theme !== 'app' ? prefs.theme : undefined}
        >
          {tab === 'preview' && <ReadingProgressBar />}
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
            {type === 'markdown' && (
              <button
                type="button"
                className={`btn-split-tab ${tab === 'split' ? 'active' : ''}`}
                onClick={() => setTab('split')}
                title="Soạn thảo và xem trước song song (Split View)"
              >
                Split
              </button>
            )}

            <div className="tabs-actions" style={{ position: 'relative' }}>
              {stats.words > 0 && (
                <span className="reading-stats-badge" title="Ước tính thời gian đọc">
                  {stats.label}
                </span>
              )}
              {tocItems.length > 0 && (
                <button
                  type="button"
                  className={`btn-icon btn-square ${showToc ? 'is-active' : ''}`}
                  onClick={() => setShowToc((v) => !v)}
                  title="Mục lục bài viết"
                  aria-label="Mục lục"
                >
                  <ListTree size={15} aria-hidden="true" />
                </button>
              )}
              {/* Nút bật/tắt nhanh độ rộng: Giãn toàn màn hình (Full width 100%) vs Thu hẹp vừa đọc (720px) */}
              <button
                type="button"
                className="btn-icon btn-square"
                onClick={() =>
                  updatePrefs({ width: prefs.width === 'full' ? 'standard' : 'full' })
                }
                title={
                  prefs.width === 'full'
                    ? 'Thu hẹp vừa đọc (720px)'
                    : 'Giãn toàn màn hình (Full width 100%)'
                }
                aria-label="Đổi chiều rộng đọc"
              >
                {prefs.width === 'full' ? (
                  <FoldHorizontal size={15} aria-hidden="true" />
                ) : (
                  <UnfoldHorizontal size={15} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className={`btn-icon btn-square ${showPrefs ? 'is-active' : ''}`}
                onClick={() => setShowPrefs((v) => !v)}
                title="Tùy chỉnh đọc (Font, Giấy ngà, Cỡ chữ)"
                aria-label="Tùy chỉnh đọc"
              >
                <Type size={15} aria-hidden="true" />
              </button>

              <ReadingPreferencesModal
                open={showPrefs}
                prefs={prefs}
                onUpdate={updatePrefs}
                onReset={resetPrefs}
                onClose={() => setShowPrefs(false)}
              />
            </div>
          </div>

          {tab === 'edit' ? (
            <textarea
              className="md-textarea"
              value={content}
              onChange={(e) => onContent(e.target.value)}
              onPaste={onMarkdownPaste}
              placeholder={
                type === 'html'
                  ? '<h1>Tiêu đề</h1>\n\n<p>Viết HTML thô ở đây…</p>'
                  : '# Tiêu đề\n\nViết Markdown ở đây… (hỗ trợ Smart Paste từ web)'
              }
            />
          ) : tab === 'split' ? (
            <div className="md-split-container">
              <div className="md-split-pane">
                <textarea
                  className="md-textarea"
                  value={content}
                  onChange={(e) => onContent(e.target.value)}
                  onPaste={onMarkdownPaste}
                  placeholder="# Tiêu đề\n\nViết Markdown ở đây…"
                />
              </div>
              <div className="md-split-pane md-split-preview">
                <div className="reading-doc-container" {...containerAttributes}>
                  {showToc && tocItems.length > 0 && (
                    <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
                  )}
                  <MarkdownPreview content={content} />
                </div>
              </div>
            </div>
          ) : type === 'html' ? (
            <FullscreenViewer label="Xem nội dung toàn màn hình">
              <div className="md-preview-viewport">
                <div className="reading-doc-container" {...containerAttributes}>
                  {showToc && tocItems.length > 0 && (
                    <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
                  )}
                  <HtmlDocument value={content} />
                </div>
              </div>
            </FullscreenViewer>
          ) : (
            <FullscreenViewer label="Xem nội dung toàn màn hình">
              <div className="md-preview-viewport">
                <div className="reading-doc-container" {...containerAttributes}>
                  {showToc && tocItems.length > 0 && (
                    <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
                  )}
                  <MarkdownPreview content={content} />
                </div>
              </div>
            </FullscreenViewer>
          )}
        </div>
      )}
    </div>
  );
}
