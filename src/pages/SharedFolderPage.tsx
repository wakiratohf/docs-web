import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { onValue, ref, update } from 'firebase/database';
import {
  Download,
  FolderX,
  Inbox,
  Boxes,
  Type,
  ListTree,
  FoldHorizontal,
  UnfoldHorizontal,
  RotateCcw,
  Search,
  X,
  FolderOpen,
  Pencil,
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import type { DocItem, Folder, SkillItem } from '../types';
import HtmlContent from '../components/HtmlContent';
import HtmlDocument from '../components/HtmlDocument';
import PdfViewer from '../components/PdfViewer';
import EmbedViewer from '../components/EmbedViewer';
import MarkdownPreview from '../components/MarkdownPreview';
import SkillPrompts from '../components/SkillPrompts';
import FullscreenViewer from '../components/FullscreenViewer';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import SkillCard from '../components/SkillCard';
import ReadingPreferencesModal from '../components/reading/ReadingPreferencesModal';
import TableOfContents from '../components/reading/TableOfContents';
import PrevNextDocNav from '../components/reading/PrevNextDocNav';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { downloadDocument } from '../lib/downloadHelpers';
import { driveDownloadUrl } from '../lib/googleDrive';
import { formatDate } from '../lib/formatDate';
import { plainTextOf, searchDocs } from '../lib/search';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import {
  saveStoredSharedContent,
  clearStoredSharedContent,
  resolveSharedContent,
} from '../lib/sharedContentStorage';
import { sharedFolderContentWrites } from '../lib/sharedOwnerWrites';
import { useOwnerFolders } from '../hooks/useOwnerFolders';
import { useToast } from '../context/ToastContext';

// Bản công khai của một folder: metadata folder + tài liệu (hoặc skill) bên trong.
interface SharedFolderPayload {
  folder: Folder;
  ownerId: string;
  documents?: Record<string, DocItem>;
  /** Chỉ có khi folder kiểu skill: các SkillItem bên trong. */
  skills?: Record<string, SkillItem>;
  /** Các thư mục con bên trong folder này (khi chia sẻ cả cây dự án) */
  subfolders?: Record<string, Folder>;
}

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharedFolderPage() {
  // id = folderId; docId (tùy chọn) = tài liệu đang xem bên trong folder.
  const { id, docId } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [payload, setPayload] = useState<SharedFolderPayload | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const originalDocsRef = useRef<Record<string, string>>({});
  const currentUidRef = useRef<string | null>(currentUid);
  currentUidRef.current = currentUid;
  const latestPayloadRef = useRef<SharedFolderPayload | null | undefined>(undefined);
  const getOwnerFolders = useOwnerFolders();
  const { toastError } = useToast();

  const applyServerPayload = useCallback(
    (val: SharedFolderPayload | null, uid: string | null) => {
      if (!val || !val.folder) {
        originalDocsRef.current = {};
        setPayload(null);
        setState('notfound');
        return;
      }

      const isUserOwner = Boolean(uid && uid === val.ownerId);

      // Lưu bản gốc từ server của từng tài liệu trong folder
      const orig: Record<string, string> = {};
      if (val.documents) {
        for (const [k, d] of Object.entries(val.documents)) {
          orig[k] = d.content;
        }
      }
      originalDocsRef.current = orig;

      if (isUserOwner) {
        // Chủ sở hữu xem folder share: xóa cache local và ưu tiên 100% dữ liệu server
        for (const k of Object.keys(orig)) {
          clearStoredSharedContent(k);
        }
        setPayload(val);
      } else if (val.documents) {
        // Người đọc thông thường: khôi phục highlight cá nhân nếu bản gốc chưa đổi;
        // nếu file vừa bị ghi đè/sửa trên server thì tự động lấy nội dung mới nhất.
        const mergedDocs: Record<string, DocItem> = { ...val.documents };
        for (const [k, d] of Object.entries(val.documents)) {
          const resolved = resolveSharedContent(k, d.content);
          mergedDocs[k] = { ...d, content: resolved.content };
        }
        setPayload({ ...val, documents: mergedDocs });
      } else {
        setPayload(val);
      }

      setState('ready');
    },
    [],
  );

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

  const isOwner = Boolean(currentUid && payload?.ownerId && currentUid === payload.ownerId);

  // Bộ tùy chỉnh đọc công thái học
  const { prefs, updatePrefs, resetPrefs, containerAttributes } = useReadingPreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [showToc, setShowToc] = useState(false);

  // Lắng nghe realtime (onValue) trên shared/f/{id}: mỗi khi chủ sở hữu ghi đè file,
  // thêm/xóa/sửa tài liệu hoặc skill trong folder, trang người xem tự cập nhật ngầm.
  useEffect(() => {
    latestPayloadRef.current = undefined;
    if (!db || !id) {
      setState('error');
      return;
    }
    setState('loading');
    const sharedRef = ref(db, `shared/f/${id}`);
    const unsub = onValue(
      sharedRef,
      (snap) => {
        const val = snap.val() as SharedFolderPayload | null;
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
  const handleDocContentChange = useCallback(
    (currentDoc: DocItem, newContent: string) => {
      if (!payload || !id) return;

      // Cập nhật state UI ngay lập tức
      setPayload((prev) => {
        if (!prev?.documents?.[currentDoc.id]) return prev;
        return {
          ...prev,
          documents: {
            ...prev.documents,
            [currentDoc.id]: {
              ...prev.documents[currentDoc.id],
              content: newContent,
            },
          },
        };
      });

      // 1. Nếu là CHỦ SỞ HỮU: Lưu trực tiếp lên Firebase Database
      if (isOwner && db && currentUid) {
        const database = db;
        const uid = currentUid;
        const now = new Date().toISOString();
        originalDocsRef.current[currentDoc.id] = newContent;
        clearStoredSharedContent(currentDoc.id);
        void (async () => {
          // Đồng bộ MỌI folder tổ tiên đang chia sẻ chứa tài liệu (không chỉ folder đang xem).
          const folders = await getOwnerFolders(database, uid);
          const writes: Record<string, unknown> = {
            [`users/${uid}/documents/${currentDoc.id}/content`]: newContent,
            [`users/${uid}/documents/${currentDoc.id}/updatedAt`]: now,
            ...sharedFolderContentWrites(
              folders,
              currentDoc.folderId,
              currentDoc.id,
              newContent,
              now,
              [id],
            ),
          };
          if (currentDoc.isShared) {
            writes[`shared/d/${currentDoc.id}/document/content`] = newContent;
            writes[`shared/d/${currentDoc.id}/document/updatedAt`] = now;
          }
          await update(ref(database), writes);
        })().catch(() => toastError('Lưu thất bại — kiểm tra kết nối mạng.'));
      } else {
        // 2. Nếu là NGƯỜI ĐỌC THƯỜNG: Lưu vào localStorage kèm bản gốc để nhận biết khi file bị ghi đè
        const original = originalDocsRef.current[currentDoc.id] ?? currentDoc.content;
        if (newContent === original) {
          clearStoredSharedContent(currentDoc.id);
        } else {
          saveStoredSharedContent(currentDoc.id, newContent, original);
        }
      }
    },
    [payload, id, isOwner, currentUid, getOwnerFolders, toastError],
  );

  const handleResetCurrentDoc = (currentDoc: DocItem) => {
    clearStoredSharedContent(currentDoc.id);
    const orig = originalDocsRef.current[currentDoc.id] ?? currentDoc.content;
    setPayload((prev) => {
      if (!prev?.documents?.[currentDoc.id]) return prev;
      return {
        ...prev,
        documents: {
          ...prev.documents,
          [currentDoc.id]: {
            ...prev.documents[currentDoc.id],
            content: orig,
          },
        },
      };
    });
  };

  // Danh sách tài liệu trong folder, sắp theo thứ tự hiển thị.
  const docs = useMemo(
    () =>
      payload?.documents
        ? Object.values(payload.documents).sort(
            (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [payload?.documents],
  );
  const current = docId ? payload?.documents?.[docId] : undefined;

  const subfolders = useMemo(
    () =>
      payload?.subfolders
        ? Object.values(payload.subfolders).sort(
            (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [payload?.subfolders],
  );

  // Tìm kiếm tài liệu trong folder
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const searching = debouncedQuery.trim().length > 0;
  const filteredDocs = useMemo<DocItem[]>(
    () =>
      searching
        ? searchDocs(docs, debouncedQuery).map((r) => r.doc)
        : docs,
    [docs, debouncedQuery, searching],
  );

  const isSkillFolder = payload?.folder.viewType === 'skill';
  const skillList = useMemo(
    () =>
      payload?.skills
        ? Object.values(payload.skills).sort(
            (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [payload?.skills],
  );
  // Trong folder skill, tham số :docId chính là skillId.
  const currentSkill = docId ? payload?.skills?.[docId] : undefined;

  // Trích xuất mục lục TOC cho bài đọc hiện tại
  const tocItems = useMemo(() => {
    if (!current || !current.content) return [];
    if (current.type === 'markdown') return extractTocFromMarkdown(current.content);
    if (current.type === 'note' || current.type === 'html')
      return extractTocFromHtml(current.content);
    return [];
  }, [current]);

  return (
    <div
      className="container share-view"
      data-reading-theme={current && prefs.theme !== 'app' ? prefs.theme : undefined}
    >
      <header className="share-header">
        {state === 'ready' && current && payload ? (
          <div className="share-header-info">
            <div className="share-breadcrumb">
              <Link
                to={`/share/f/${id}`}
                className="share-breadcrumb-back"
                title={`Quay lại thư mục ${payload.folder.name}`}
              >
                ← 📁 {payload.folder.name}
              </Link>
              <span className="share-breadcrumb-sep">/</span>
              <h1 className="share-title">{current.title || '(không tiêu đề)'}</h1>
            </div>
            <p className="share-doc-dates muted">
              {current.author && (
                <span className="doc-date" title="Tác giả">
                  ✍ {current.author}
                </span>
              )}
              <span className="doc-date" title="Thời gian cập nhật gần nhất">
                Sửa: {formatDate(current.updatedAt)}
              </span>
              <span className="doc-date" title="Thời gian tạo">
                Tạo: {formatDate(current.createdAt)}
              </span>
            </p>
          </div>
        ) : state === 'ready' && isSkillFolder && currentSkill && payload ? (
          <div className="share-header-info">
            <div className="share-breadcrumb">
              <Link
                to={`/share/f/${id}`}
                className="share-breadcrumb-back"
                title={`Quay lại thư mục ${payload.folder.name}`}
              >
                ← 📁 {payload.folder.name}
              </Link>
              <span className="share-breadcrumb-sep">/</span>
              <h1 className="share-title">{currentSkill.title || '(không tiêu đề)'}</h1>
            </div>
            <p className="share-doc-dates muted">
              {currentSkill.author && (
                <span className="doc-date" title="Tác giả">
                  ✍ {currentSkill.author}
                </span>
              )}
              <span className="doc-date" title="Thời gian cập nhật gần nhất">
                Sửa: {formatDate(currentSkill.updatedAt)}
              </span>
            </p>
          </div>
        ) : (
          <Link to="/" className="brand">
            📄 Docs Web
          </Link>
        )}
        <div className="share-header-actions" style={{ position: 'relative' }}>
          {/* Nút mục lục TOC khi bài có heading */}
          {current && tocItems.length > 0 && (
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
          {current && (
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
          )}

          {/* Nút mở popover tùy chỉnh đọc (Aa) */}
          {current && (
            <button
              type="button"
              className={`btn-icon btn-square ${showPrefs ? 'is-active' : ''}`}
              onClick={() => setShowPrefs((v) => !v)}
              title="Tùy chỉnh trải nghiệm đọc (Phông chữ, Giấy ngà, Cỡ chữ)"
              aria-label="Tùy chỉnh đọc"
            >
              <Type size={16} aria-hidden="true" />
            </button>
          )}

          {/* Popover tùy chỉnh đọc */}
          <ReadingPreferencesModal
            open={showPrefs}
            prefs={prefs}
            onUpdate={updatePrefs}
            onReset={resetPrefs}
            onClose={() => setShowPrefs(false)}
          />

          {/* Nút đặt lại bản gốc nếu người đọc có tô sáng cá nhân */}
          {!isOwner &&
            current &&
            current.content !== (originalDocsRef.current[current.id] ?? current.content) && (
              <button
                type="button"
                className="btn-icon"
                onClick={() => handleResetCurrentDoc(current)}
                title="Xóa các điểm tô sáng cá nhân và quay về bản gốc của tác giả"
                aria-label="Đặt lại bản gốc"
                style={{ fontSize: 13, gap: 4 }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Bản gốc</span>
              </button>
            )}

          {state === 'ready' &&
            current &&
            current.type !== 'pdf' &&
            current.type !== 'embed' && (
              <button
                type="button"
                className="share-download-btn btn-icon"
                onClick={() => downloadDocument(current)}
                title="Tải tài liệu này về máy"
              >
                <Download size={16} aria-hidden="true" /> Tải về
              </button>
            )}
          <ThemeToggle />
          {isOwner ? (
            <>
              {current && (
                <Link
                  to={`/docs/view/document/${current.id}`}
                  className="btn-icon"
                  title="Mở tài liệu này trong Dashboard để chỉnh sửa"
                >
                  <Pencil size={15} aria-hidden="true" />
                  <span>Sửa tài liệu</span>
                </Link>
              )}
              <Link
                to={`/docs/folder/${id}`}
                className="btn-icon"
                title="Mở thư mục này trong trang quản lý cá nhân"
              >
                <FolderOpen size={15} aria-hidden="true" />
                <span>Quản lý</span>
              </Link>
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
            </>
          ) : (
            <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
          )}
        </div>
      </header>

      {state === 'loading' && <Spinner />}
      {state === 'error' && (
        <p className="warn">Không tải được folder (cấu hình Firebase hoặc mạng).</p>
      )}
      {state === 'notfound' && (
        <EmptyState
          icon={<FolderX size={40} aria-hidden="true" />}
          title="Folder không khả dụng"
          description="Folder không tồn tại hoặc chủ sở hữu đã ngừng chia sẻ."
        />
      )}

      {state === 'ready' && payload && (
        <>
          {/* Header hero chỉ hiện ở chế độ xem danh sách thư mục (khi không mở tài liệu lẻ) */}
          {!docId && (
            <div className="shared-folder-hero">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h1 className="shared-folder-name">📁 {payload.folder.name}</h1>
                  <p className="muted shared-folder-count">
                    {isSkillFolder
                      ? `${skillList.length} skill AI`
                      : `${docs.length} tài liệu`}
                  </p>
                </div>
                {isOwner && (
                  <Link
                    to={`/docs/folder/${id}`}
                    className="btn-icon primary"
                    title="Mở thư mục này trong trang quản lý cá nhân"
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    <span>Mở trong Quản lý</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Thanh tìm kiếm tài liệu trong folder chia sẻ */}
          {docs.length > 0 && !docId && (
            <div className="search-bar-wrap" style={{ maxWidth: 600, margin: '0 0 20px 0' }}>
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                type="search"
                className="search-input"
                placeholder={`Tìm tài liệu trong “${payload.folder.name}”…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {searching && (
                <button
                  type="button"
                  className="search-clear"
                  title="Xóa tìm kiếm"
                  aria-label="Xóa tìm kiếm"
                  onClick={() => setQuery('')}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {isSkillFolder ? (
            /* Folder kiểu skill: marketplace card */
            docId ? (
              currentSkill ? (
                <article className="skill-detail">
                  <div className="skill-detail-header">
                    <span className="skill-detail-icon" aria-hidden="true">
                      {currentSkill.icon || '🧩'}
                    </span>
                    <div className="skill-detail-meta">
                      <h2 className="skill-detail-title">{currentSkill.title}</h2>
                      {currentSkill.description && (
                        <p className="skill-detail-desc">
                          {currentSkill.description}
                        </p>
                      )}
                      {currentSkill.tags && currentSkill.tags.length > 0 && (
                        <div className="skill-tags">
                          {currentSkill.tags.map((t) => (
                            <span key={t} className="skill-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="skill-detail-dates muted">
                        {currentSkill.author && (
                          <span className="doc-date" title="Tác giả">
                            ✍ {currentSkill.author}
                          </span>
                        )}
                        <span className="doc-date" title="Cập nhật gần nhất">
                          Sửa: {formatDate(currentSkill.updatedAt)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <a
                    className="btn-icon primary skill-download"
                    href={driveDownloadUrl(currentSkill.fileId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} aria-hidden="true" /> Tải file nén
                  </a>
                  <SkillPrompts prompts={currentSkill.prompts} />
                  {currentSkill.content.trim() && (
                    <div className="skill-detail-content">
                      <MarkdownPreview content={currentSkill.content} />
                    </div>
                  )}
                </article>
              ) : (
                <p className="muted empty">
                  Skill không tồn tại trong folder này.{' '}
                  <Link to={`/share/f/${id}`}>← Quay lại folder</Link>
                </p>
              )
            ) : skillList.length === 0 ? (
              <EmptyState
                icon={<Boxes size={40} aria-hidden="true" />}
                title="Folder này chưa có skill nào"
              />
            ) : (
              <div className="skills-grid">
                {skillList.map((s) => (
                  <SkillCard key={s.id} skill={s} to={`/share/f/${id}/${s.id}`} />
                ))}
              </div>
            )
          ) : /* Đang xem một tài liệu cụ thể trong folder */ docId ? (
            current ? (
              <article className="share-doc reading-doc-container" {...containerAttributes}>
                {/* Mục lục động cho bài đang xem */}
                {showToc && tocItems.length > 0 && (
                  <TableOfContents
                    items={tocItems}
                    onClose={() => setShowToc(false)}
                  />
                )}

                <FullscreenViewer label="Xem toàn màn hình">
                  {current.type === 'pdf' ? (
                    <PdfViewer fileId={current.content} />
                  ) : current.type === 'embed' ? (
                    <EmbedViewer value={current.content} />
                  ) : current.type === 'note' ? (
                    <HtmlContent
                      value={current.content}
                      onContentChange={(newContent) =>
                        handleDocContentChange(current, newContent)
                      }
                    />
                  ) : current.type === 'html' ? (
                    <HtmlDocument value={current.content} />
                  ) : (
                    <MarkdownPreview
                      content={current.content}
                      onContentChange={(newContent) =>
                        handleDocContentChange(current, newContent)
                      }
                    />
                  )}
                </FullscreenViewer>

                {/* Cụm điều hướng Bài trước / Bài tiếp theo trong cùng thư mục */}
                <PrevNextDocNav
                  currentDocId={current.id}
                  docs={docs}
                  buildUrl={(docKey) => `/share/f/${id}/${docKey}`}
                />
              </article>
            ) : (
              <p className="muted empty">
                Tài liệu không tồn tại trong folder này.{' '}
                <Link to={`/share/f/${id}`}>← Quay lại folder</Link>
              </p>
            )
          ) : filteredDocs.length === 0 ? (
            searching ? (
              <EmptyState
                icon={<Search size={40} aria-hidden="true" />}
                title="Không tìm thấy tài liệu phù hợp"
                description="Thử tìm với từ khóa khác."
              />
            ) : (
              <EmptyState
                icon={<Inbox size={40} aria-hidden="true" />}
                title="Folder này chưa có tài liệu nào"
              />
            )
          ) : payload.folder.viewType === 'sticky' ? (
            // Folder kiểu sticky note: lưới ô giấy nhớ màu (chỉ đọc)
            <ul className="sticky-grid">
              {filteredDocs.map((d) => {
                const color = d.color ?? DEFAULT_STICKY_COLOR;
                const preview = plainTextOf(d).trim();
                return (
                  <li key={d.id} className={`sticky-card sticky-${color}`}>
                    <div className="sticky-head" aria-hidden="true" />
                    <Link to={`/share/f/${id}/${d.id}`} className="sticky-body">
                      <span className="sticky-title">
                        {d.title || '(không tiêu đề)'}
                      </span>
                      {preview && <p className="sticky-preview">{preview}</p>}
                      {d.author && (
                        <span className="sticky-author" title={`Tác giả: ${d.author}`}>
                          ✍ {d.author}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : subfolders.length > 0 && !searching ? (
            // Có thư mục con: gom nhóm hiển thị theo từng thư mục con
            <div className="shared-subfolder-groups">
              {(() => {
                const directDocs = filteredDocs.filter(
                  (d) => !d.folderId || d.folderId === payload.folder.id,
                );
                return (
                  <>
                    {directDocs.length > 0 && (
                      <div className="shared-group-block">
                        <h2 className="shared-group-title">📄 Tài liệu chung</h2>
                        <ul className="doc-list">
                          {directDocs.map((d) => (
                            <li key={d.id} className="doc-line">
                              <Link to={`/share/f/${id}/${d.id}`} className="doc-item">
                                <span className={`badge badge-${d.type}`}>{d.type}</span>
                                <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                                <span className="doc-dates">
                                  {d.author && (
                                    <span className="doc-date" title={`Tác giả: ${d.author}`}>
                                      ✍ {d.author}
                                    </span>
                                  )}
                                  <span className="doc-date muted">
                                    Sửa: {formatDate(d.updatedAt)}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {subfolders.map((sub) => {
                      const subDocs = filteredDocs.filter((d) => d.folderId === sub.id);
                      return (
                        <div key={sub.id} className="shared-group-block">
                          <h2 className="shared-group-title">
                            📁 {sub.name}{' '}
                            <span className="muted font-normal">({subDocs.length})</span>
                          </h2>
                          {subDocs.length === 0 ? (
                            <p className="muted empty-sub-text">Chưa có tài liệu trong thư mục này.</p>
                          ) : (
                            <ul className="doc-list">
                              {subDocs.map((d) => (
                                <li key={d.id} className="doc-line">
                                  <Link to={`/share/f/${id}/${d.id}`} className="doc-item">
                                    <span className={`badge badge-${d.type}`}>{d.type}</span>
                                    <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                                    <span className="doc-dates">
                                      {d.author && (
                                        <span className="doc-date" title={`Tác giả: ${d.author}`}>
                                          ✍ {d.author}
                                        </span>
                                      )}
                                      <span className="doc-date muted">
                                        Sửa: {formatDate(d.updatedAt)}
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          ) : (
            // Folder chuẩn: danh sách thẻ card đẹp mắt như chế độ owner
            <ul className="doc-list">
              {filteredDocs.map((d) => (
                <li key={d.id} className="doc-line">
                  <Link to={`/share/f/${id}/${d.id}`} className="doc-item">
                    <span className={`badge badge-${d.type}`}>{d.type}</span>
                    <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                    <span className="doc-dates">
                      {d.author && (
                        <span className="doc-date" title={`Tác giả: ${d.author}`}>
                          ✍ {d.author}
                        </span>
                      )}
                      <span className="doc-date muted">
                        Sửa: {formatDate(d.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
