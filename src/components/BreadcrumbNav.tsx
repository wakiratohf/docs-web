import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import { getFolderAncestors } from '../lib/folderTree';
import type { Folder } from '../types';

export interface BreadcrumbNavProps {
  folderId?: string;
  folders: readonly Folder[];
  /** Tùy chọn tiêu đề tài liệu nếu đang đứng ở trang xem/soạn tài liệu */
  docTitle?: string;
  className?: string;
}

/**
 * Thanh điều hướng Breadcrumb phân cấp thư mục.
 * Ví dụ: [Home] > Dự án A > Kỹ thuật > API Docs > Tài liệu X
 */
export default function BreadcrumbNav({
  folderId,
  folders,
  docTitle,
  className = '',
}: BreadcrumbNavProps) {
  const chain = useMemo(() => {
    if (!folderId) return [];
    const current = folders.find((f) => f.id === folderId);
    if (!current) return [];
    const ancestors = getFolderAncestors(folderId, folders);
    return [...ancestors, current];
  }, [folderId, folders]);

  return (
    <nav aria-label="Đường dẫn thư mục" className={`breadcrumb-nav ${className}`.trim()}>
      <ol className="breadcrumb-list">
        <li className="breadcrumb-item">
          <Link to="/docs" className="breadcrumb-link breadcrumb-home" title="Trang chủ tài liệu">
            <Home size={14} aria-hidden="true" />
            <span className="sr-only">Trang chủ</span>
          </Link>
        </li>

        {chain.map((f, idx) => {
          const isLastFolder = idx === chain.length - 1;
          const isTerminal = isLastFolder && !docTitle;

          return (
            <li key={f.id} className="breadcrumb-item">
              <ChevronRight size={13} className="breadcrumb-separator" aria-hidden="true" />
              {isTerminal ? (
                <span className="breadcrumb-current" aria-current="page" title={f.name}>
                  {f.name}
                </span>
              ) : (
                <Link to={`/docs/folder/${f.id}`} className="breadcrumb-link" title={f.name}>
                  {f.name}
                </Link>
              )}
            </li>
          );
        })}

        {docTitle !== undefined && (
          <li className="breadcrumb-item">
            <ChevronRight size={13} className="breadcrumb-separator" aria-hidden="true" />
            <span className="breadcrumb-current breadcrumb-doc-title" aria-current="page" title={docTitle}>
              {docTitle || '(không tiêu đề)'}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
