import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import type { Folder } from '../types';
import { normalizeText, type SearchResult } from '../lib/search';
import EmptyState from './EmptyState';

// Biểu tượng theo loại tài liệu (đồng bộ với DocsAllPage).
const BADGE: Record<string, string> = { note: 'note', markdown: 'markdown', html: 'html' };

/**
 * Tô đậm phần khớp từ khóa trong một chuỗi. Khớp KHÔNG phân biệt hoa/thường và
 * bỏ dấu — nhưng vẫn hiển thị đúng chữ gốc (có dấu) nhờ `normalizeText` giữ
 * nguyên số ký tự, cho phép cắt chuỗi gốc theo chỉ số tìm trên bản chuẩn hóa.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = normalizeText(query.trim());
  if (!q) return <>{text}</>;

  const norm = normalizeText(text);
  const parts: ReactNode[] = [];
  let i = 0;
  let idx = norm.indexOf(q);
  let key = 0;
  while (idx >= 0) {
    if (idx > i) parts.push(<Fragment key={key++}>{text.slice(i, idx)}</Fragment>);
    parts.push(<mark key={key++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = norm.indexOf(q, i);
  }
  parts.push(<Fragment key={key++}>{text.slice(i)}</Fragment>);
  return <>{parts}</>;
}

interface Props {
  results: SearchResult[];
  query: string;
  /** Map id folder → folder, để hiển thị tài liệu thuộc folder nào (trang chủ). */
  foldersById?: Map<string, Folder>;
  /** Có hiển thị tên folder của mỗi kết quả không (trang chủ: có; trong folder: không). */
  showFolder?: boolean;
}

export default function SearchResults({
  results,
  query,
  foldersById,
  showFolder = false,
}: Props) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon={<SearchX size={40} aria-hidden="true" />}
        title="Không tìm thấy kết quả"
        description={`Không có tài liệu nào khớp “${query.trim()}”.`}
      />
    );
  }

  return (
    <>
      <p className="search-count muted">
        Tìm thấy {results.length} tài liệu khớp “{query.trim()}”
      </p>
      <ul className="doc-list">
        {results.map(({ doc, matchedTitle, snippet }) => {
          const folder = doc.folderId
            ? foldersById?.get(doc.folderId)
            : undefined;
          return (
            <li key={doc.id} className="doc-line">
              <Link to={`/docs/view/document/${doc.id}`} className="doc-item">
                <span className={`badge badge-${BADGE[doc.type] ?? 'note'}`}>
                  {doc.type}
                </span>
                <span className="search-main">
                  <span className="doc-title">
                    {matchedTitle ? (
                      <Highlighted text={doc.title || '(không tiêu đề)'} query={query} />
                    ) : (
                      doc.title || '(không tiêu đề)'
                    )}
                  </span>
                  {snippet && (
                    <span className="search-snippet muted">
                      <Highlighted text={snippet} query={query} />
                    </span>
                  )}
                </span>
                {doc.isShared && (
                  <span className="share-flag" title="Đang chia sẻ công khai">🔗</span>
                )}
                {showFolder && (
                  <span className="search-folder muted" title="Folder chứa tài liệu">
                    {folder ? `📁 ${folder.name}` : 'General'}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
