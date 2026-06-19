import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FolderX, Inbox, Boxes } from 'lucide-react';
import { db } from '../lib/firebase';
import type { DocItem, Folder, SkillItem } from '../types';
import HtmlContent from '../components/HtmlContent';
import HtmlDocument from '../components/HtmlDocument';
import PdfViewer from '../components/PdfViewer';
import EmbedViewer from '../components/EmbedViewer';
import MarkdownPreview from '../components/MarkdownPreview';
import FullscreenViewer from '../components/FullscreenViewer';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import SkillCard from '../components/SkillCard';
import { useFontScale } from '../components/FontSizeControl';
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

const GLYPH: Record<DocItem['type'], string> = { note: '✏️', markdown: '#', html: '<>', pdf: '📄', embed: '🔗' };

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharedFolderPage() {
  // id = folderId; docId (tùy chọn) = tài liệu đang xem bên trong folder.
  const { id, docId } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [payload, setPayload] = useState<SharedFolderPayload | null>(null);
  const { fontPx, control } = useFontScale();

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
  const docs = payload?.documents
    ? Object.values(payload.documents).sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      )
    : [];
  const current = docId ? payload?.documents?.[docId] : undefined;

  const isSkillFolder = payload?.folder.viewType === 'skill';
  const skillList = payload?.skills
    ? Object.values(payload.skills).sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      )
    : [];
  // Trong folder skill, tham số :docId chính là skillId.
  const currentSkill = docId ? payload?.skills?.[docId] : undefined;

  return (
    <div
      className="container share-view"
      style={{ '--share-font-size': `${fontPx}px` } as CSSProperties}
    >
      <header className="share-header">
        <Link to="/" className="brand">📄 Docs Web</Link>
        <div className="share-header-actions">
          {state === 'ready' && current && control}
          {state === 'ready' && current && current.type !== 'pdf' && current.type !== 'embed' && (
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
          <h1 className="share-folder-title">
            📁 {payload.folder.name || '(không tên)'}
          </h1>

          {/* Folder kiểu Skill AI: marketplace skill (chỉ đọc) hoặc chi tiết 1 skill */}
          {isSkillFolder ? (
            docId ? (
              currentSkill ? (
                <article className="skill-detail">
                  <Link to={`/share/f/${id}`} className="muted share-back">
                    ← Quay lại folder
                  </Link>
                  <div className="skill-detail-head">
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
              <article className="share-doc">
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
                  <span className="doc-date" title="Thời gian cập nhật gần nhất">
                    Sửa: {formatDate(current.updatedAt)}
                  </span>
                  <span className="doc-date" title="Thời gian tạo">
                    Tạo: {formatDate(current.createdAt)}
                  </span>
                </p>
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
                      <p className={`sticky-preview${preview ? '' : ' muted'}`}>
                        {preview || '(trống)'}
                      </p>
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
          ) : (
            <ul className="share-folder-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link to={`/share/f/${id}/${d.id}`} className="share-folder-item">
                    <span className="share-folder-glyph">{GLYPH[d.type]}</span>
                    <span className="share-folder-name">
                      {d.title || '(không tiêu đề)'}
                    </span>
                    <span className="doc-dates muted">
                      {d.author && (
                        <span className="doc-date" title="Tác giả">
                          ✍ {d.author}
                        </span>
                      )}
                      <span className="doc-date" title="Thời gian cập nhật gần nhất">
                        Sửa: {formatDate(d.updatedAt)}
                      </span>
                      <span className="doc-date" title="Thời gian tạo">
                        Tạo: {formatDate(d.createdAt)}
                      </span>
                    </span>
                    <span className="share-folder-arrow">→</span>
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
