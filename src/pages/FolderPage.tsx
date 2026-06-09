import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import ThemeToggle from '../components/ThemeToggle';
import type { DocumentType } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function FolderPage() {
  const { folderId } = useParams();
  const {
    documents,
    folders,
    loading,
    addDocument,
    renameFolder,
    deleteFolder,
    toggleShareFolder,
    moveDocument,
  } = useDocuments();
  const navigate = useNavigate();

  const folder = folders.find((f) => f.id === folderId);
  const docs = documents.filter((d) => d.folderId === folderId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [copied, setCopied] = useState(false);

  const backBar = (
    <div className="back-bar">
      <Link to="/docs">← Quay lại danh sách</Link>
    </div>
  );

  if (loading) {
    return (
      <div className="container">
        {backBar}
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (!folder) {
    return (
      <div className="container">
        {backBar}
        <p className="muted">Không tìm thấy folder này.</p>
      </div>
    );
  }

  const create = (type: DocumentType) => {
    const created = addDocument(type, undefined, folder.id);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  const startRename = () => {
    setEditName(folder.name);
    setEditing(true);
  };
  const commitRename = () => {
    const name = editName.trim();
    if (name && name !== folder.name) renameFolder(folder.id, name);
    setEditing(false);
  };

  const onDelete = () => {
    const n = docs.length;
    const msg =
      n > 0
        ? `Xóa folder "${folder.name}" và ${n} tài liệu bên trong? Thao tác không thể hoàn tác.`
        : `Xóa folder "${folder.name}"?`;
    if (window.confirm(msg)) {
      deleteFolder(folder.id);
      navigate('/docs');
    }
  };

  const shareUrl = `${window.location.origin}/share/f/${folder.id}`;
  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="container">
      {backBar}

      <header className="app-header">
        <h1 className="folder-title">
          <span>📁</span>
          {editing ? (
            <input
              className="folder-name-edit"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <span onDoubleClick={startRename} title="Bấm đúp để đổi tên">
              {folder.name}
            </span>
          )}
        </h1>
        <div className="user-box">
          <ThemeToggle />
          <button
            type="button"
            className={folder.isShared ? 'primary' : ''}
            onClick={() => toggleShareFolder(folder.id)}
            title="Bật/tắt chia sẻ công khai cả folder"
          >
            {folder.isShared ? '🔗 Đang chia sẻ' : 'Chia sẻ folder'}
          </button>
          <button type="button" onClick={startRename}>✏️ Đổi tên</button>
          <button type="button" className="danger" onClick={onDelete}>🗑️ Xóa folder</button>
        </div>
      </header>

      {folder.isShared && (
        <div className="share-bar">
          <span className="muted">
            Link công khai (ai có link đều xem được cả folder):
          </span>
          <input
            className="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" onClick={onCopyShare}>
            {copied ? 'Đã copy ✓' : 'Copy'}
          </button>
          <a href={shareUrl} target="_blank" rel="noreferrer">Mở</a>
        </div>
      )}

      <div className="actions">
        <button type="button" className="primary" onClick={() => create('note')}>
          + New note
        </button>
        <button type="button" className="primary" onClick={() => create('markdown')}>
          + New markdown
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="muted empty">
          Folder trống. Bấm nút phía trên để tạo tài liệu, hoặc kéo tài liệu vào folder
          này từ trang chủ.
        </p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id} className="doc-line">
              <Link to={`/docs/view/document/${d.id}`} className="doc-item">
                <span className={`badge badge-${d.type}`}>{d.type}</span>
                <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                {d.isShared && (
                  <span className="share-flag" title="Đang chia sẻ công khai">🔗</span>
                )}
                <span className="doc-dates muted">
                  <span className="doc-date" title="Thời gian cập nhật gần nhất">
                    Sửa: {formatDate(d.updatedAt)}
                  </span>
                  <span className="doc-date" title="Thời gian tạo">
                    Tạo: {formatDate(d.createdAt)}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="doc-remove"
                title="Đưa tài liệu ra khỏi folder"
                onClick={() => moveDocument(d.id, undefined)}
              >
                ⤴
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
