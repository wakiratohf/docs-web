import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, onValue, ref, update } from 'firebase/database';
import { Download, FileX, Type, ListTree, FoldHorizontal, UnfoldHorizontal, RotateCcw } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import type { DocItem } from '../types';
import HtmlContent from '../components/HtmlContent';
import HtmlDocument from '../components/HtmlDocument';
import PdfViewer from '../components/PdfViewer';
import EmbedViewer from '../components/EmbedViewer';
import MarkdownPreview from '../components/MarkdownPreview';
import FullscreenViewer from '../components/FullscreenViewer';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import ReadingPreferencesModal from '../components/reading/ReadingPreferencesModal';
import TableOfContents from '../components/reading/TableOfContents';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import { getDocReadingStats } from '../lib/readingStats';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { getTasksSummary } from '../lib/taskLists';
import { downloadDocument } from '../lib/downloadHelpers';
import { formatDate } from '../lib/formatDate';
import {
  saveStoredSharedContent,
  clearStoredSharedContent,
  resolveSharedContent,
} from '../lib/sharedContentStorage';

interface SharedPayload {
  document: DocItem;
  ownerId: string;
}

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharePage() {
  const { id } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [doc, setDoc] = useState<DocItem | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [hasLocalHighlights, setHasLocalHighlights] = useState(false);
  const originalContentRef = useRef<string>('');
  const currentUidRef = useRef<string | null>(currentUid);
  currentUidRef.current = currentUid;
  // Lưu snapshot gần nhất từ Firebase để đồng bộ lại nếu trạng thái đăng nhập đổi sau đó
  const latestPayloadRef = useRef<SharedPayload | null | undefined>(undefined);

  const applyServerPayload = useCallback(
    (val: SharedPayload | null, uid: string | null) => {
      if (!id) return;
      if (!val || !val.document) {
        setDoc(null);
        setOwnerId(null);
        setHasLocalHighlights(false);
        setState('notfound');
        return;
      }
      setOwnerId(val.ownerId);
      originalContentRef.current = val.document.content;

      const isUserOwner = Boolean(uid && uid === val.ownerId);

      if (isUserOwner) {
        // Chủ sở hữu xem link share: xóa cache local để ưu tiên 100% bản server
        clearStoredSharedContent(id);
        setHasLocalHighlights(false);
        setDoc(val.document);
      } else {
        // Người xem thông thường: khôi phục highlight cá nhân nếu bản gốc server chưa đổi;
        // nếu file vừa bị ghi đè/sửa trên server thì tự động lấy nội dung mới nhất.
        const resolved = resolveSharedContent(id, val.document.content);
        setHasLocalHighlights(resolved.hasLocalHighlights);
        setDoc({ ...val.document, content: resolved.content });
      }
      setState('ready');
    },
    [id],
  );

  // Lắng nghe trạng thái đăng nhập để xác định chính xác người xem có phải chủ sở hữu không
  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged((user) => {
      const nextUid = user?.uid ?? null;
      currentUidRef.current = nextUid;
      setCurrentUid(nextUid);
      if (latestPayloadRef.current !== undefined) {
        applyServerPayload(latestPayloadRef.current, nextUid);
      }
    });
  }, [applyServerPayload]);

  const isOwner = Boolean(currentUid && ownerId && currentUid === ownerId);

  // Bộ tùy chỉnh đọc công thái học (Font, Giấy ngà, Cỡ chữ, Giãn dòng, Chiều rộng)
  const { prefs, updatePrefs, resetPrefs, containerAttributes } = useReadingPreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [showToc, setShowToc] = useState(false);

  // Lắng nghe realtime (onValue) trên shared/d/{id}: mỗi khi chủ sở hữu ghi đè file
  // hoặc chỉnh sửa nội dung, trang người xem tự động cập nhật ngầm mà không reload trang.
  useEffect(() => {
    latestPayloadRef.current = undefined;
    if (!db || !id) {
      setState('error');
      return;
    }
    setState('loading');
    const sharedRef = ref(db, `shared/d/${id}`);
    const unsub = onValue(
      sharedRef,
      (snap) => {
        const val = snap.val() as SharedPayload | null;
        latestPayloadRef.current = val;
        applyServerPayload(val, currentUidRef.current);
      },
      () => {
        setState('error');
      },
    );
    return () => {
      unsub();
    };
  }, [id, applyServerPayload]);

  // Xử lý cập nhật nội dung khi highlight (Kết hợp Firebase nếu là Chủ sở hữu & LocalStorage nếu là Người đọc)
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!doc || !id) return;

      // Cập nhật state UI ngay lập tức
      setDoc((prev) => (prev ? { ...prev, content: newContent } : null));

      // 1. Nếu là CHỦ SỞ HỮU: Lưu trực tiếp lên Firebase Database (multi-path update đồng bộ)
      if (isOwner && db && currentUid) {
        const database = db;
        const now = new Date().toISOString();
        const updatedDoc: DocItem = {
          ...doc,
          content: newContent,
          updatedAt: now,
        };
        originalContentRef.current = newContent;
        clearStoredSharedContent(id);
        setHasLocalHighlights(false);
        void (async () => {
          const writes: Record<string, unknown> = {
            [`users/${currentUid}/documents/${id}/content`]: newContent,
            [`users/${currentUid}/documents/${id}/updatedAt`]: now,
            [`shared/d/${id}`]: {
              document: updatedDoc,
              ownerId: currentUid,
            },
          };
          if (doc.folderId) {
            try {
              const folderOwnerSnap = await get(
                ref(database, `shared/f/${doc.folderId}/ownerId`),
              );
              if (folderOwnerSnap.val() === currentUid) {
                writes[`shared/f/${doc.folderId}/documents/${id}/content`] = newContent;
                writes[`shared/f/${doc.folderId}/documents/${id}/updatedAt`] = now;
              }
            } catch {
              // Bỏ qua nếu không kiểm tra được folder chia sẻ
            }
          }
          await update(ref(database), writes);
        })();
      } else {
        // 2. Nếu là NGƯỜI ĐỌC THƯỜNG: Lưu vào localStorage của trình duyệt người xem
        if (newContent === originalContentRef.current) {
          clearStoredSharedContent(id);
          setHasLocalHighlights(false);
        } else {
          saveStoredSharedContent(id, newContent, originalContentRef.current);
          setHasLocalHighlights(true);
        }
      }
    },
    [doc, id, isOwner, currentUid],
  );

  // Đặt lại về bản gốc của tác giả (chỉ áp dụng cho người đọc có highlight cá nhân)
  const handleResetToOriginal = () => {
    if (!id || !doc) return;
    clearStoredSharedContent(id);
    setHasLocalHighlights(false);
    setDoc({ ...doc, content: originalContentRef.current });
  };

  // Thống kê bài viết (tổng số từ & thời gian đọc ước tính)
  const stats = useMemo(() => (doc ? getDocReadingStats(doc) : null), [doc]);

  // Mục lục động tự trích xuất từ tiêu đề bài viết
  const tocItems = useMemo(() => {
    if (!doc || !doc.content) return [];
    if (doc.type === 'markdown') return extractTocFromMarkdown(doc.content);
    if (doc.type === 'note' || doc.type === 'html') return extractTocFromHtml(doc.content);
    return [];
  }, [doc]);

  // Thống kê tiến độ checklist
  const tasksSummary = useMemo(() => {
    if (!doc?.content || (doc.type !== 'markdown' && doc.type !== 'html')) {
      return { total: 0, completed: 0, percent: 0 };
    }
    return getTasksSummary(doc.content);
  }, [doc]);

  return (
    <div
      className="container share-view"
      data-reading-theme={prefs.theme !== 'app' ? prefs.theme : undefined}
    >
      <header className="share-header">
        {state === 'ready' && doc ? (
          <div className="share-header-info">
            <h1 className="share-title">{doc.title || '(không tiêu đề)'}</h1>
            <p className="share-doc-dates muted">
              {doc.author && (
                <span className="doc-date" title="Tác giả">
                  ✍ {doc.author}
                </span>
              )}
              {stats && stats.words > 0 && (
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
              <span className="doc-date" title="Thời gian cập nhật gần nhất">
                Sửa: {formatDate(doc.updatedAt)}
              </span>
              <span className="doc-date" title="Thời gian tạo">
                Tạo: {formatDate(doc.createdAt)}
              </span>
            </p>
          </div>
        ) : (
          <Link to="/" className="brand">
            📄 Docs Web
          </Link>
        )}

        <div className="share-header-actions" style={{ position: 'relative' }}>
          {/* Nút bật/tắt mục lục TOC nếu bài viết có heading */}
          {tocItems.length > 0 && (
            <button
              type="button"
              className={`btn-icon btn-square ${showToc ? 'is-active' : ''}`}
              onClick={() => setShowToc((v) => !v)}
              title="Mục lục bài viết"
              aria-label="Mục lục bài viết"
            >
              <ListTree size={16} aria-hidden="true" />
            </button>
          )}

          {/* Nút bật/tắt nhanh độ rộng: Toàn màn hình (Full width) vs Thu hẹp vừa đọc (720px) */}
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
              <FoldHorizontal size={16} aria-hidden="true" />
            ) : (
              <UnfoldHorizontal size={16} aria-hidden="true" />
            )}
          </button>

          {/* Nút mở Popover Tùy chỉnh đọc (Aa) */}
          <button
            type="button"
            className={`btn-icon btn-square ${showPrefs ? 'is-active' : ''}`}
            onClick={() => setShowPrefs((v) => !v)}
            title="Tùy chỉnh trải nghiệm đọc (Phông chữ, Giấy ngà, Cỡ chữ)"
            aria-label="Tùy chỉnh đọc"
          >
            <Type size={16} aria-hidden="true" />
          </button>

          {/* Popover tùy chỉnh đọc */}
          <ReadingPreferencesModal
            open={showPrefs}
            prefs={prefs}
            onUpdate={updatePrefs}
            onReset={resetPrefs}
            onClose={() => setShowPrefs(false)}
          />

          {/* Nút đặt lại bản gốc nếu người đọc thông thường có tô sáng cá nhân */}
          {!isOwner && hasLocalHighlights && (
            <button
              type="button"
              className="btn-icon"
              onClick={handleResetToOriginal}
              title="Xóa các điểm tô sáng cá nhân và quay về bản gốc của tác giả"
              aria-label="Đặt lại bản gốc"
              style={{ fontSize: 13, gap: 4 }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Bản gốc</span>
            </button>
          )}

          {state === 'ready' && doc && doc.type !== 'pdf' && doc.type !== 'embed' && (
            <button
              type="button"
              className="share-download-btn btn-icon"
              onClick={() => downloadDocument(doc)}
              title="Tải tài liệu này về máy"
            >
              <Download size={16} aria-hidden="true" /> Tải về
            </button>
          )}

          <ThemeToggle />
          {isOwner ? (
            <span
              className="badge"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#16a34a',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
              title="Bạn là chủ sở hữu, mọi tô sáng sẽ được tự động lưu và đồng bộ lên server"
            >
              Chủ sở hữu · Đồng bộ tự động
            </span>
          ) : (
            <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
          )}
        </div>
      </header>

      {state === 'loading' && <Spinner />}
      {state === 'error' && (
        <p className="warn">Không tải được tài liệu (cấu hình Firebase hoặc mạng).</p>
      )}
      {state === 'notfound' && (
        <EmptyState
          icon={<FileX size={40} aria-hidden="true" />}
          title="Tài liệu không khả dụng"
          description="Tài liệu không tồn tại hoặc chủ sở hữu đã ngừng chia sẻ."
        />
      )}

      {state === 'ready' && doc && (
        <article className="share-doc reading-doc-container" {...containerAttributes}>
          {/* Mục lục động (hiển thị khi bấm nút mục lục hoặc mặc định trên bài dài) */}
          {showToc && tocItems.length > 0 && (
            <TableOfContents items={tocItems} onClose={() => setShowToc(false)} />
          )}

          <FullscreenViewer label="Xem toàn màn hình">
            {doc.type === 'pdf' ? (
              <PdfViewer fileId={doc.content} />
            ) : doc.type === 'embed' ? (
              <EmbedViewer value={doc.content} />
            ) : doc.type === 'note' ? (
              <HtmlContent
                value={doc.content}
                onContentChange={handleContentChange}
              />
            ) : doc.type === 'html' ? (
              <HtmlDocument value={doc.content} />
            ) : (
              <MarkdownPreview
                content={doc.content}
                onContentChange={handleContentChange}
              />
            )}
          </FullscreenViewer>
        </article>
      )}
    </div>
  );
}
