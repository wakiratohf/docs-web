import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FolderX, Inbox, Boxes, Type, ListTree, FoldHorizontal, UnfoldHorizontal } from 'lucide-react';
import { db } from '../lib/firebase';
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
import ReadingProgressBar from '../components/reading/ReadingProgressBar';
import ReadingPreferencesModal from '../components/reading/ReadingPreferencesModal';
import TableOfContents from '../components/reading/TableOfContents';
import PrevNextDocNav from '../components/reading/PrevNextDocNav';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import { getDocReadingStats } from '../lib/readingStats';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { downloadDocument } from '../lib/downloadHelpers';
import { driveDownloadUrl } from '../lib/googleDrive';
import { formatDate } from '../lib/formatDate';
import { plainTextOf } from '../lib/search';
import { DEFAULT_STICKY_COLOR } from '../lib/stickyColors';

// Bản công khai của một folder: metadata folder + tài liệu (hoặc skill) bên trong.
interface SharedFolderPayload {
  folder: Folder;
  ownerId: string;
  documents?: Record<string, DocItem>;
  /** Chỉ có khi folder kiểu skill: các SkillItem bên trong. */
  skills?: Record<string, SkillItem>;
}

const GLYPH: Record<DocItem['type'], string> = {
  note: '✏️',
  markdown: '#',
  html: '<>',
  pdf: '📄',
  embed: '🔗',
};

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharedFolderPage() {
  // id = folderId; docId (tùy chọn) = tài liệu đang xem bên trong folder.
  const { id, docId } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [payload, setPayload] = useState<SharedFolderPayload | null>(null);

  // Bộ tùy chỉnh đọc công thái học
  const { prefs, updatePrefs, resetPrefs, containerAttributes } = useReadingPreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [showToc, setShowToc] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!db || !id) {
        setState('error');
        return;
      }
      try {
        const snap = await get(ref(db, `shared/f/${id}`));
        if (!active) return;
        const val = snap.val() as SharedFolderPayload | null;
        if (!val || !val.folder) {
          setState('notfound');
          return;
        }
        setPayload(val);
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

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

  // Thống kê tài liệu đang đọc
  const stats = useMemo(() => (current ? getDocReadingStats(current) : null), [current]);

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
      {/* Vạch tiến trình đọc khi đang xem 1 tài liệu cụ thể */}
      {current && <ReadingProgressBar />}

      <header className="share-header">
        <Link to="/" className="brand">
          📄 Docs Web
        </Link>
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
          <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
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
          <div className="shared-folder-hero">
            <h1 className="shared-folder-name">📁 {payload.folder.name}</h1>
            <p className="muted shared-folder-count">
              {isSkillFolder
                ? `${skillList.length} skill AI`
                : `${docs.length} tài liệu`}
            </p>
          </div>

          {isSkillFolder ? (
            /* Folder kiểu skill: marketplace card */
            docId ? (
              currentSkill ? (
                <article className="skill-detail">
                  <Link to={`/share/f/${id}`} className="muted share-back">
                    ← Quay lại danh sách skill
                  </Link>
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
                <Link to={`/share/f/${id}`} className="muted share-back">
                  ← Quay lại folder
                </Link>
                <h2>{current.title || '(không tiêu đề)'}</h2>
                <p className="share-doc-dates muted">
                  {current.author && (
                    <span className="doc-date" title="Tác giả">
                      ✍ {current.author}
                    </span>
                  )}
                  {stats && stats.words > 0 && (
                    <span className="reading-stats-badge" title="Ước tính thời gian đọc">
                      {stats.label}
                    </span>
                  )}
                  <span className="doc-date" title="Thời gian cập nhật gần nhất">
                    Sửa: {formatDate(current.updatedAt)}
                  </span>
                  <span className="doc-date" title="Thời gian tạo">
                    Tạo: {formatDate(current.createdAt)}
                  </span>
                </p>

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
                    <HtmlContent value={current.content} />
                  ) : current.type === 'html' ? (
                    <HtmlDocument value={current.content} />
                  ) : (
                    <MarkdownPreview content={current.content} />
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
          ) : docs.length === 0 ? (
            // Danh sách tài liệu của folder
            <EmptyState
              icon={<Inbox size={40} aria-hidden="true" />}
              title="Folder này chưa có tài liệu nào"
            />
          ) : payload.folder.viewType === 'sticky' ? (
            // Folder kiểu sticky note: lưới ô giấy nhớ màu (chỉ đọc).
            <ul className="sticky-grid">
              {docs.map((d) => {
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            // Folder danh sách chuẩn: bảng/lưới tài liệu
            <ul className="share-doc-list">
              {docs.map((d) => (
                <li key={d.id} className="share-doc-row">
                  <span className="doc-icon" aria-hidden="true">
                    {GLYPH[d.type]}
                  </span>
                  <Link to={`/share/f/${id}/${d.id}`} className="doc-link">
                    <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                    <span className="doc-meta muted">
                      {d.author && <span className="doc-author">✍ {d.author}</span>}
                      <span>{formatDate(d.updatedAt)}</span>
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
