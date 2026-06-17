import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FileX } from 'lucide-react';
import { db } from '../lib/firebase';
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
import { useFontScale } from '../components/FontSizeControl';
import { downloadDocument } from '../lib/downloadHelpers';
import { formatDate } from '../lib/formatDate';

interface SharedPayload {
  document: DocItem;
  ownerId: string;
}

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharePage() {
  const { id } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [doc, setDoc] = useState<DocItem | null>(null);
  const { fontPx, control } = useFontScale();

  useEffect(() => {
    let active = true;
    (async () => {
      if (!db || !id) {
        setState('error');
        return;
      }
      try {
        const snap = await get(ref(db, `shared/d/${id}`));
        if (!active) return;
        const val = snap.val() as SharedPayload | null;
        if (!val || !val.document) {
          setState('notfound');
          return;
        }
        setDoc(val.document);
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div
      className="container share-view"
      style={{ '--share-font-size': `${fontPx}px` } as CSSProperties}
    >
      <header className="share-header">
        <Link to="/" className="brand">📄 Docs Web</Link>
        <div className="share-header-actions">
          {state === 'ready' && doc && control}
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
          <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
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
        <article className="share-doc">
          <h1>{doc.title || '(không tiêu đề)'}</h1>
          <p className="share-doc-dates muted">
            {doc.author && (
              <span className="doc-date" title="Tác giả">
                ✍ {doc.author}
              </span>
            )}
            <span className="doc-date" title="Thời gian cập nhật gần nhất">
              Sửa: {formatDate(doc.updatedAt)}
            </span>
            <span className="doc-date" title="Thời gian tạo">
              Tạo: {formatDate(doc.createdAt)}
            </span>
          </p>
          <FullscreenViewer label="Xem toàn màn hình">
            {doc.type === 'pdf' ? (
              <PdfViewer fileId={doc.content} />
            ) : doc.type === 'embed' ? (
              <EmbedViewer value={doc.content} />
            ) : doc.type === 'note' ? (
              <HtmlContent value={doc.content} />
            ) : doc.type === 'html' ? (
              <HtmlDocument value={doc.content} />
            ) : (
              <MarkdownPreview content={doc.content} />
            )}
          </FullscreenViewer>
        </article>
      )}
    </div>
  );
}
