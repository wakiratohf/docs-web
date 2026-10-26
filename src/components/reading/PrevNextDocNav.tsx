import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { DocItem } from '../../types';

interface PrevNextDocNavProps {
  currentDocId: string;
  docs: DocItem[];
  buildUrl: (docId: string) => string;
}

export default function PrevNextDocNav({
  currentDocId,
  docs,
  buildUrl,
}: PrevNextDocNavProps) {
  if (!docs || docs.length <= 1) return null;

  const currentIndex = docs.findIndex((d) => d.id === currentDocId);
  if (currentIndex === -1) return null;

  const prevDoc = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const nextDoc = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

  if (!prevDoc && !nextDoc) return null;

  return (
    <nav className="prev-next-nav" aria-label="Điều hướng bài đọc trong thư mục">
      <div className="prev-next-col prev-col">
        {prevDoc ? (
          <Link to={buildUrl(prevDoc.id)} className="prev-next-card">
            <span className="prev-next-hint">
              <ArrowLeft size={14} aria-hidden="true" /> Bài trước
            </span>
            <span className="prev-next-title">{prevDoc.title || '(không tiêu đề)'}</span>
          </Link>
        ) : (
          <div className="prev-next-empty" />
        )}
      </div>

      <div className="prev-next-col next-col">
        {nextDoc ? (
          <Link to={buildUrl(nextDoc.id)} className="prev-next-card next-card">
            <span className="prev-next-hint">
              Bài tiếp theo <ArrowRight size={14} aria-hidden="true" />
            </span>
            <span className="prev-next-title">{nextDoc.title || '(không tiêu đề)'}</span>
          </Link>
        ) : (
          <div className="prev-next-empty" />
        )}
      </div>
    </nav>
  );
}
