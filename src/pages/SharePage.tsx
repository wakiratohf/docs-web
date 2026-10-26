import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FileX, Type, ListTree, FoldHorizontal, UnfoldHorizontal } from 'lucide-react';
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
import ReadingProgressBar from '../components/reading/ReadingProgressBar';
import ReadingPreferencesModal from '../components/reading/ReadingPreferencesModal';
import TableOfContents from '../components/reading/TableOfContents';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import { getDocReadingStats } from '../lib/readingStats';
import { extractTocFromHtml, extractTocFromMarkdown } from '../lib/toc';
import { getTasksSummary } from '../lib/taskLists';
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

  // Bộ tùy chỉnh đọc công thái học (Font, Giấy ngà, Cỡ chữ, Giãn dòng, Chiều rộng)
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
      {/* Vạch tiến trình đọc 0-100% gắn cố định đỉnh màn hình */}
      <ReadingProgressBar />

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
