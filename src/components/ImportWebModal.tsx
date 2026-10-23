import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Code2, Loader2, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { fetchAndExtractArticle, extractArticleFromHtml } from '../lib/webExtractor';
import { htmlToMarkdown } from '../lib/htmlToMarkdown';
import MarkdownPreview from './MarkdownPreview';

export interface ImportWebModalProps {
  open: boolean;
  /** folderId của folder đang xem; nếu không có thì tạo tài liệu lẻ ở trang chủ */
  folderId?: string;
  onCancel: () => void;
  onCreated?: (docId: string) => void;
}

type Tab = 'url' | 'html';

export default function ImportWebModal({
  open,
  folderId,
  onCancel,
  onCreated,
}: ImportWebModalProps) {
  const { folders, addDocuments } = useDocuments();
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [rawHtml, setRawHtml] = useState('');
  const [targetFolderId, setTargetFolderId] = useState(folderId ?? '');

  // Trạng thái trích xuất bài viết
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kết quả sau khi trích xuất
  const [extractedTitle, setExtractedTitle] = useState('');
  const [extractedAuthor, setExtractedAuthor] = useState('');
  const [extractedMarkdown, setExtractedMarkdown] = useState('');
  const [previewTab, setPreviewTab] = useState<'preview' | 'edit'>('preview');
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  // Xử lý trích xuất từ URL
  const handleExtractFromUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Vui lòng nhập đường link URL của trang web.');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError('URL không hợp lệ. Vui lòng nhập đầy đủ, vd: https://example.com/bai-viet.');
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setError('Chỉ hỗ trợ URL http:// hoặc https://.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const article = await fetchAndExtractArticle(trimmed, {
        confirmProxyFallback: (proxyHost) =>
          confirm({
            title: 'Gửi URL qua dịch vụ bên thứ ba?',
            message: `Không tải trực tiếp được trang này (có thể do CORS). Để tiếp tục, URL bạn nhập sẽ được gửi qua proxy công khai "${proxyHost}" để lấy nội dung — họ sẽ thấy URL này. Tiếp tục?`,
            confirmText: 'Tiếp tục',
            cancelText: 'Hủy',
          }),
      });
      setExtractedTitle(article.title || 'Tài liệu từ web');
      setExtractedAuthor(article.author || '');
      setExtractedMarkdown(article.markdown);
      setPreviewTab('preview');
      toastSuccess('Đã trích xuất nội dung bài viết thành công!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ImportWeb] Lỗi trích xuất:', msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Xử lý chuyển đổi từ HTML thô được dán vào
  const handleExtractFromHtml = () => {
    const trimmed = rawHtml.trim();
    if (!trimmed) {
      setError('Vui lòng dán mã nguồn hoặc nội dung HTML.');
      return;
    }

    setError(null);
    try {
      // Thử dùng Readability trước nếu là một trang HTML hoàn chỉnh
      const article = extractArticleFromHtml(trimmed);
      if (article && article.markdown.trim()) {
        setExtractedTitle(article.title || 'Tài liệu từ HTML');
        setExtractedAuthor(article.author || '');
        setExtractedMarkdown(article.markdown);
      } else {
        // Nếu là đoạn HTML fragment ngắn, chuyển đổi trực tiếp bằng Turndown
        const md = htmlToMarkdown(trimmed);
        setExtractedTitle('Tài liệu từ HTML');
        setExtractedAuthor('');
        setExtractedMarkdown(md);
      }
      setPreviewTab('preview');
      toastSuccess('Đã chuyển đổi HTML sang Markdown thành công!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ImportWeb] Lỗi chuyển đổi HTML:', msg);
      setError('Không thể chuyển đổi nội dung HTML này sang Markdown.');
    }
  };

  // Nhấn Enter trong ô URL để trích xuất nhanh
  const onUrlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleExtractFromUrl();
    }
  };

  // Tạo tài liệu mới từ nội dung Markdown đã trích xuất
  const handleCreateDocument = () => {
    const title = extractedTitle.trim() || 'Tài liệu từ web';
    const content = extractedMarkdown.trim();

    if (!content) {
      toastError('Nội dung tài liệu đang trống.');
      return;
    }

    const created = addDocuments(
      [
        {
          type: 'markdown',
          title,
          content,
          author: extractedAuthor.trim() || undefined,
        },
      ],
      targetFolderId || undefined,
    );

    if (created.length > 0) {
      toastSuccess('Đã tạo tài liệu Markdown từ web!');
      onCancel();
      onCreated?.(created[0].id);
    } else {
      toastError('Không thể tạo tài liệu. Vui lòng thử lại.');
    }
  };

  const hasResult = Boolean(extractedMarkdown.trim());

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        ref={trapRef}
        className="modal modal-wide import-web-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-web-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <h2 id="import-web-title" className="modal-title">
          Nhập từ Web / HTML → Markdown
        </h2>

        {/* Thanh chuyển đổi 2 chế độ: Nhập URL hoặc Dán mã HTML */}
        <div className="tabs">
          <button
            type="button"
            className={tab === 'url' ? 'active' : ''}
            onClick={() => {
              setTab('url');
              setError(null);
            }}
          >
            <Globe size={15} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />
            Từ đường link (URL)
          </button>
          <button
            type="button"
            className={tab === 'html' ? 'active' : ''}
            onClick={() => {
              setTab('html');
              setError(null);
            }}
          >
            <Code2 size={15} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />
            Dán mã HTML
          </button>
        </div>

        {/* Tab 1: Nhập đường link (URL) */}
        {tab === 'url' && (
          <div className="import-web-section">
            <label className="modal-field-label" htmlFor="import-url">
              Đường link trang web bài viết
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="import-url"
                className="modal-input"
                style={{ flex: 1 }}
                type="url"
                value={url}
                placeholder="https://example.com/bai-viet-hay"
                disabled={busy}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={onUrlKeyDown}
              />
              <button
                type="button"
                className="primary"
                disabled={busy || !url.trim()}
                onClick={() => void handleExtractFromUrl()}
              >
                {busy ? (
                  <>
                    <Loader2 className="spin" size={15} aria-hidden="true" style={{ marginRight: 6 }} />
                    Đang bóc tách…
                  </>
                ) : (
                  <>
                    Trích xuất
                    <ArrowRight size={15} aria-hidden="true" style={{ marginLeft: 6 }} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Dán mã HTML */}
        {tab === 'html' && (
          <div className="import-web-section">
            <label className="modal-field-label" htmlFor="import-raw-html">
              Mã nguồn HTML hoặc nội dung copy từ trang web
            </label>
            <textarea
              id="import-raw-html"
              className="modal-input"
              rows={5}
              value={rawHtml}
              placeholder="Dán mã nguồn HTML (<html>...</html>) hoặc nội dung đã copy vào đây…"
              onChange={(e) => setRawHtml(e.target.value)}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="primary"
                disabled={!rawHtml.trim()}
                onClick={handleExtractFromHtml}
              >
                Chuyển thành Markdown
                <ArrowRight size={15} aria-hidden="true" style={{ marginLeft: 6 }} />
              </button>
            </div>
          </div>
        )}

        {/* Thông báo lỗi (nếu có) */}
        {error && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#ef4444',
              fontSize: '0.875rem',
              marginTop: 12,
              alignItems: 'flex-start',
            }}
          >
            <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div>{error}</div>
              {tab === 'url' && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: 4,
                    fontSize: '0.85rem',
                  }}
                  onClick={() => {
                    setTab('html');
                    setError(null);
                  }}
                >
                  👉 Chuyển sang tab "Dán mã HTML" để nhập thủ công
                </button>
              )}
            </div>
          </div>
        )}

        {/* Kết quả trích xuất & Xem trước */}
        {hasResult && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="modal-field-label" htmlFor="result-title">
                  Tiêu đề
                </label>
                <input
                  id="result-title"
                  className="modal-input"
                  value={extractedTitle}
                  onChange={(e) => setExtractedTitle(e.target.value)}
                  placeholder="Tiêu đề tài liệu"
                />
              </div>
              <div>
                <label className="modal-field-label" htmlFor="result-author">
                  Tác giả
                </label>
                <input
                  id="result-author"
                  className="modal-input"
                  value={extractedAuthor}
                  onChange={(e) => setExtractedAuthor(e.target.value)}
                  placeholder="Tên tác giả"
                />
              </div>
              <div>
                <label className="modal-field-label" htmlFor="result-folder">
                  Thư mục đích
                </label>
                <select
                  id="result-folder"
                  className="modal-input"
                  value={targetFolderId}
                  onChange={(e) => setTargetFolderId(e.target.value)}
                >
                  <option value="">📁 Không có folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chuyển đổi xem trước / sửa nội dung */}
            <div className="tabs" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className={previewTab === 'preview' ? 'active' : ''}
                onClick={() => setPreviewTab('preview')}
              >
                Xem trước Markdown
              </button>
              <button
                type="button"
                className={previewTab === 'edit' ? 'active' : ''}
                onClick={() => setPreviewTab('edit')}
              >
                Sửa Markdown
              </button>
            </div>

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 6,
                padding: previewTab === 'preview' ? '12px 16px' : '0',
                background: 'var(--bg-secondary, #fafafa)',
              }}
            >
              {previewTab === 'preview' ? (
                <MarkdownPreview content={extractedMarkdown} />
              ) : (
                <textarea
                  className="md-textarea"
                  style={{ minHeight: '250px', border: 'none', background: 'transparent' }}
                  value={extractedMarkdown}
                  onChange={(e) => setExtractedMarkdown(e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {/* Nút hành động ở chân modal */}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !hasResult}
            onClick={handleCreateDocument}
          >
            <Check size={16} aria-hidden="true" style={{ marginRight: 6 }} />
            Tạo tài liệu Markdown
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
