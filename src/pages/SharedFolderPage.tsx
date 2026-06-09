import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FolderX, Inbox } from 'lucide-react';
import { db } from '../lib/firebase';
import type { DocItem, Folder } from '../types';
import HtmlContent from '../components/HtmlContent';
import MarkdownPreview from '../components/MarkdownPreview';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useFontScale } from '../components/FontSizeControl';
import { downloadDocument } from '../lib/downloadHelpers';
import { formatDate } from '../lib/formatDate';

// Bản công khai của một folder: metadata folder + toàn bộ tài liệu bên trong.
interface SharedFolderPayload {
  folder: Folder;
  ownerId: string;
  documents?: Record<string, DocItem>;
}

const GLYPH: Record<DocItem['type'], string> = { note: '✏️', markdown: '#' };

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

  return (
    <div
      className="container share-view"
      style={{ '--share-font-size': `${fontPx}px` } as CSSProperties}
    >
      <header className="share-header">
        <Link to="/" className="brand">📄 Docs Web</Link>
        <div className="share-header-actions">
          {state === 'ready' && current && control}
          {state === 'ready' && current && (
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

          {/* Đang xem một tài liệu cụ thể trong folder */}
          {docId ? (
            current ? (
              <article className="share-doc">
                <Link to={`/share/f/${id}`} className="muted share-back">
                  ← Quay lại folder
                </Link>
                <h2>{current.title || '(không tiêu đề)'}</h2>
                <p className="share-doc-dates muted">
                  <span className="doc-date" title="Thời gian cập nhật gần nhất">
                    Sửa: {formatDate(current.updatedAt)}
                  </span>
                  <span className="doc-date" title="Thời gian tạo">
                    Tạo: {formatDate(current.createdAt)}
                  </span>
                </p>
                {current.type === 'note' ? (
                  <HtmlContent value={current.content} />
                ) : (
                  <MarkdownPreview content={current.content} />
                )}
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
