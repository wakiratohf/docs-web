import { Link, useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import DocumentEditor from '../components/DocumentEditor';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

export default function DocViewerPage() {
  const { id } = useParams();
  const { documents, loading } = useDocuments();
  const doc = documents.find((d) => d.id === id);

  return (
    <div className="doc-page">
      <div className="back-bar">
        <Link to="/docs">← Quay lại danh sách</Link>
      </div>

      {loading ? (
        <Spinner />
      ) : !doc ? (
        <EmptyState
          icon={<FileQuestion size={40} aria-hidden="true" />}
          title="Không tìm thấy tài liệu này"
          description={<Link to="/docs">← Quay lại danh sách</Link>}
        />
      ) : (
        <DocumentEditor key={doc.id} doc={doc} />
      )}
    </div>
  );
}
