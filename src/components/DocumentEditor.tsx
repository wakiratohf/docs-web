import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trash2,
  Loader2,
  Check,
  ArrowLeft,
  Type,
  ListTree,
  FoldHorizontal,
  UnfoldHorizontal,
  Highlighter,
  FileText,
  Hash,
  Code2,
  Globe,
  FolderOpen,
} from 'lucide-react';
import type { DocItem, DocumentType } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import SharePopover from './SharePopover';
import ActionMenu from './ActionMenu';
import AccountMenu from './AccountMenu';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { collectAuthors } from '../lib/authors';
import { getDriveAccessToken, deleteFileFromDrive } from '../lib/googleDrive';
import { htmlToMarkdown, isMeaningfulHtml } from '../lib/htmlToMarkdown';
import { calculateReadingStats } from '../lib/readingStats';
import { buildFolderTreeOptions, getSharedAncestors } from '../lib/folderTree';
import BreadcrumbNav from './BreadcrumbNav';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { getTasksSummary } from '../lib/taskLists';
import {
  toggleMarkdownTextareaHighlight,
  type HighlightColor,
} from '../lib/textHighlight';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import NoteEditor from './NoteEditor';
import AuthorInput from './AuthorInput';
import DropdownSelect, { type DropdownOption } from './DropdownSelect';
import MarkdownPreview from './MarkdownPreview';
import HtmlContent from './HtmlContent';
import HtmlDocument from './HtmlDocument';
import PdfViewer from './PdfViewer';
import EmbedViewer from './EmbedViewer';
import FullscreenViewer from './FullscreenViewer';
import TableOfContents from './reading/TableOfContents';
import ReadingPreferencesModal from './reading/ReadingPreferencesModal';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type' | 'author'>>;

const EDITOR_TYPE_OPTIONS: readonly DropdownOption<DocumentType>[] = [
  {
    value: 'note',
    label: 'Note (rich-text)',
    triggerLabel: 'Note',
    icon: <FileText size={14} />,
  },
  {
    value: 'markdown',
    label: 'Markdown',
    triggerLabel: 'Markdown',
    icon: <Hash size={14} />,
  },
  {
    value: 'html',
    label: 'HTML (mã thô)',
    triggerLabel: 'HTML',
    icon: <Code2 size={14} />,
  },
  {
    value: 'embed',
    label: 'Embed (nhúng link)',
    triggerLabel: 'Embed',
    icon: <Globe size={14} />,
  },
];

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
  const folderOptions = useMemo<DropdownOption<string>[]>(
    () => [
      { value: '', label: 'Không có folder' },
      ...buildFolderTreeOptions(folders).map((f) => ({
        value: f.value,
        label: f.label,
      })),
    ],
    [folders],
  );
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [title, setTitle] = useState(doc.title);
  const [author, setAuthor] = useState(doc.author ?? '');
  const [content, setContent] = useState(doc.content);
  const [type, setType] = useState<DocumentType>(doc.type);
  // Bộ đếm tăng mỗi khi nhận nội dung mới TỪ BÊN NGOÀI (tab khác / ghi đè file),
  // dùng làm key cho NoteEditor để nạp lại innerHTML mà không nhảy con trỏ khi đang tự gõ.
  const [remoteContentRev, setRemoteContentRev] = useState(0);
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

  // Thống kê tiến độ công việc nếu tài liệu chứa checklist GFM
  const tasksSummary = useMemo(() => {
    if (type !== 'markdown' && type !== 'html') return { total: 0, completed: 0, percent: 0 };
    return getTasksSummary(content);
  }, [content, type]);

  // Mục lục động tự trích xuất từ tiêu đề bài viết
  const tocItems = useMemo(() => {
    if (!content) return [];
    if (type === 'markdown') return extractTocFromMarkdown(content);
    if (type === 'note' || type === 'html') return extractTocFromHtml(content);
    return [];
  }, [content, type]);

  const shareUrl = `${window.location.origin}/share/d/${doc.id}`;
  const sharedAncestors = getSharedAncestors(folders, doc.folderId);
  const isFolderShared = sharedAncestors.length > 0;

  // Auto-save có debounce ~600ms.
  const timer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const pending = useRef<DocUpdates | null>(null);

  // Theo dõi giá trị đã đồng bộ & các bản ghi do chính editor này vừa đẩy lên Firebase,
  // giúp phân biệt chính xác:
  //  - Echo từ chính mình đang gõ ⇒ BỎ QUA (không nhảy con trỏ).
  //  - Thay đổi / ghi đè file từ bên ngoài (tab khác, tải lên đè…) ⇒ CẬP NHẬT NGẦM.
  const lastSyncedRef = useRef({
    id: doc.id,
    title: doc.title,
    author: doc.author ?? '',
    content: doc.content,
    type: doc.type,
  });
  const inFlightRef = useRef({
    titles: new Set<string>(),
    authors: new Set<string>(),
    contents: new Set<string>(),
    types: new Set<DocumentType>(),
  });

  const commitLocalUpdates = (updates: DocUpdates) => {
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
    if (updates.type !== undefined) {
      lastSyncedRef.current.type = updates.type;
      inFlightRef.current.types.add(updates.type);
    }
    updateDocument(doc.id, updates);
  };

  // Ghi nốt thay đổi còn treo (không đụng tới UI, dùng cả lúc unmount).
  const flush = () => {
    if (pending.current) {
      const updates = pending.current;
      pending.current = null;
      commitLocalUpdates(updates);
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Đồng bộ state cục bộ khi đổi tài liệu (doc.id) HOẶC khi file bị ghi đè / sửa từ bên ngoài,
  // nhưng bỏ qua echo do chính trình soạn thảo này gửi đi để không làm nhảy con trỏ.
  useEffect(() => {
    const incomingAuthor = doc.author ?? '';
    if (doc.id !== lastSyncedRef.current.id) {
      lastSyncedRef.current = {
        id: doc.id,
        title: doc.title,
        author: incomingAuthor,
        content: doc.content,
        type: doc.type,
      };
      inFlightRef.current.titles.clear();
      inFlightRef.current.authors.clear();
      inFlightRef.current.contents.clear();
      inFlightRef.current.types.clear();
      setTitle(doc.title);
      setAuthor(incomingAuthor);
      setContent(doc.content);
      setType(doc.type);
      setTab(doc.content.trim() ? 'preview' : 'edit');
      setRemoteContentRev((r) => r + 1);
      return;
    }

    // 1. Title
    if (doc.title === lastSyncedRef.current.title) {
      inFlightRef.current.titles.clear();
    } else if (inFlightRef.current.titles.has(doc.title)) {
      inFlightRef.current.titles.delete(doc.title);
    } else {
      inFlightRef.current.titles.clear();
      lastSyncedRef.current.title = doc.title;
      if (pending.current?.title === undefined) {
        setTitle(doc.title);
      }
    }

    // 2. Author
    if (incomingAuthor === lastSyncedRef.current.author) {
      inFlightRef.current.authors.clear();
    } else if (inFlightRef.current.authors.has(incomingAuthor)) {
      inFlightRef.current.authors.delete(incomingAuthor);
    } else {
      inFlightRef.current.authors.clear();
      lastSyncedRef.current.author = incomingAuthor;
      if (pending.current?.author === undefined) {
        setAuthor(incomingAuthor);
      }
    }

    // 3. Type
    if (doc.type === lastSyncedRef.current.type) {
      inFlightRef.current.types.clear();
    } else if (inFlightRef.current.types.has(doc.type)) {
      inFlightRef.current.types.delete(doc.type);
    } else {
      inFlightRef.current.types.clear();
      lastSyncedRef.current.type = doc.type;
      if (pending.current?.type === undefined) {
        setType(doc.type);
        if (doc.type !== 'markdown') {
          setTab((prev) => (prev === 'split' ? 'preview' : prev));
        }
      }
    }

    // 4. Content
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
  }, [doc.id, doc.title, doc.author, doc.content, doc.type]);

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
        flushRef.current();
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
      window.clearTimeout(timer.current);
      flush();
      let nextContent = content;
      if (convert) {
        nextContent = htmlToMarkdown(content);
        setContent(nextContent);
        toastSuccess('Đã chuyển đổi nội dung sang Markdown.');
      }
      setType(v);
      commitLocalUpdates({ type: v, content: nextContent });
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
    window.clearTimeout(timer.current);
    flush();
    setType(v);
    commitLocalUpdates({ type: v });
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onToggleMarkdownHighlight = (color: HighlightColor = 'yellow') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const { newContent, newStart, newEnd } = toggleMarkdownTextareaHighlight(
      content,
      start,
      end,
      color,
    );
    onContent(newContent);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = newStart;
      textarea.selectionEnd = newEnd;
    });
  };

  const onMarkdownKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      onToggleMarkdownHighlight();
    }
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
      {doc.folderId && (
        <div className="doc-breadcrumb-bar">
          <BreadcrumbNav folderId={doc.folderId} folders={folders} docTitle={title} />
        </div>
      )}
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
          <DropdownSelect<DocumentType>
            size="sm"
            value={type}
            onChange={onChangeType}
            options={EDITOR_TYPE_OPTIONS}
            ariaLabel="Loại tài liệu"
            minMenuWidth={210}
          />
        )}
        <DropdownSelect<string>
          size="sm"
          className="folder-dropdown"
          value={doc.folderId ?? ''}
          onChange={(val) => {
            window.clearTimeout(timer.current);
            flush();
            moveDocument(doc.id, val || undefined);
          }}
          options={folderOptions}
          ariaLabel="Chọn folder cho tài liệu"
          minMenuWidth={220}
          triggerIcon={<FolderOpen size={14} />}
        />
        {/* Bấm nút chia sẻ chỉ MỞ bảng chia sẻ; bật công khai phải bấm rõ trong bảng.
            Flush auto-save trước để bản công khai nhận nội dung mới nhất. */}
        <SharePopover
          kind="document"
          variant="icon"
          shareUrl={shareUrl}
          isShared={Boolean(doc.isShared)}
          inherited={isFolderShared}
          inheritedFolderName={sharedAncestors[sharedAncestors.length - 1]?.name}
          onToggle={() => {
            window.clearTimeout(timer.current);
            flush();
            toggleShareDocument(doc.id);
          }}
        />
        {/* Xóa nằm trong menu "⋯" để không đứng sát nút chia sẻ (tránh bấm nhầm) */}
        <ActionMenu
          label="Thêm thao tác cho tài liệu"
          items={[
            {
              key: 'delete',
              label: 'Xóa tài liệu',
              icon: <Trash2 size={16} aria-hidden="true" />,
              onSelect: onDelete,
              danger: true,
            },
          ]}
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
        {/* Tài khoản + đổi giao diện: đặt cuối thanh, thống nhất với các trang khác */}
        <AccountMenu />
      </div>

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
      ) : (
        // note, markdown & html dùng chung khung soạn thảo có tab Edit/Preview/Split;
        // hỗ trợ tùy chỉnh công thái học và tô sáng ở cả chế độ đọc và sửa.
        <div
          className="md-editor"
          data-reading-theme={tab !== 'edit' && prefs.theme !== 'app' ? prefs.theme : undefined}
        >
          <div className="tabs">
            <button
              type="button"
              className={tab === 'edit' ? 'active' : ''}
              onClick={() => {
                flush();
                setTab('edit');
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className={tab === 'preview' ? 'active' : ''}
              onClick={() => {
                flush();
                setTab('preview');
              }}
            >
              Preview
            </button>
            {type === 'markdown' && (
              <button
                type="button"
                className={`btn-split-tab ${tab === 'split' ? 'active' : ''}`}
                onClick={() => {
                  flush();
                  setTab('split');
                }}
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
              {tasksSummary.total > 0 && (
                <span
                  className="reading-stats-badge"
                  title="Tiến độ công việc hoàn thành"
                >
                  ✓ {tasksSummary.completed}/{tasksSummary.total} ({tasksSummary.percent}%)
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
              {/* Nút tô sáng nhanh khi soạn thảo Markdown */}
              {type === 'markdown' && tab !== 'preview' && (
                <button
                  type="button"
                  className="btn-icon btn-square"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onToggleMarkdownHighlight()}
                  title="Tô sáng vùng chọn (Ctrl+Shift+H)"
                  aria-label="Tô sáng"
                >
                  <Highlighter size={15} aria-hidden="true" />
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
            type === 'note' ? (
              <NoteEditor key={remoteContentRev} value={content} onChange={onContent} />
            ) : (
              <textarea
                ref={textareaRef}
                className="md-textarea"
                value={content}
                onChange={(e) => onContent(e.target.value)}
                onPaste={onMarkdownPaste}
                onKeyDown={onMarkdownKeyDown}
                placeholder={
                  type === 'html'
                    ? '<h1>Tiêu đề</h1>\n\n<p>Viết HTML thô ở đây…</p>'
                    : '# Tiêu đề\n\nViết Markdown ở đây… (hỗ trợ Smart Paste từ web)'
                }
              />
            )
          ) : tab === 'split' ? (
            <div className="md-split-container">
              <div className="md-split-pane">
                <textarea
                  ref={textareaRef}
                  className="md-textarea"
                  value={content}
                  onChange={(e) => onContent(e.target.value)}
                  onPaste={onMarkdownPaste}
                  onKeyDown={onMarkdownKeyDown}
                  placeholder="# Tiêu đề\n\nViết Markdown ở đây…"
                />
              </div>
              <div className="md-split-pane md-split-preview">
                <div className="reading-doc-container" {...containerAttributes}>
                  {showToc && tocItems.length > 0 && (
                    <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
                  )}
                  <MarkdownPreview content={content} onContentChange={onContent} />
                </div>
              </div>
            </div>
          ) : type === 'note' ? (
            <FullscreenViewer label="Xem nội dung toàn màn hình">
              <div className="md-preview-viewport">
                <div className="reading-doc-container" {...containerAttributes}>
                  {showToc && tocItems.length > 0 && (
                    <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
                  )}
                  <HtmlContent value={content} onContentChange={onContent} />
                </div>
              </div>
            </FullscreenViewer>
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
                  <MarkdownPreview content={content} onContentChange={onContent} />
                </div>
              </div>
            </FullscreenViewer>
          )}
        </div>
      )}
    </div>
  );
}
