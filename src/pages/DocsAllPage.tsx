import { useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import { useAuth } from '../auth/useAuth';
import type { DocItem, DocumentType, Folder } from '../types';

// Khóa nhận diện vùng thả của section "không có folder".
const NO_FOLDER = '__none__';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DocsAllPage() {
  const {
    documents,
    folders,
    loading,
    addDocument,
    addFolder,
    renameFolder,
    deleteFolder,
    moveDocument,
  } = useDocuments();
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();

  // Folder (theo id) đang được kéo qua — để làm nổi viền vùng thả.
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Folder đang đổi tên tại chỗ.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const create = (type: DocumentType, folderId?: string) => {
    const created = addDocument(type, undefined, folderId);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  // ----- Kéo-thả (HTML5 native) -----
  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const allowDrop = (e: DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== key) setDragOver(key);
  };
  const onDrop = (e: DragEvent, folderId: string | undefined) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragOver(null);
    if (id) moveDocument(id, folderId);
  };

  // ----- Đổi tên folder -----
  const startRename = (f: Folder) => {
    setEditingId(f.id);
    setEditName(f.name);
  };
  const commitRename = () => {
    if (editingId) {
      const name = editName.trim();
      if (name) renameFolder(editingId, name);
    }
    setEditingId(null);
  };

  // ----- Xóa folder (xóa luôn tài liệu bên trong) -----
  const onDeleteFolder = (f: Folder) => {
    const n = documents.filter((d) => d.folderId === f.id).length;
    const msg =
      n > 0
        ? `Xóa folder "${f.name}" và ${n} tài liệu bên trong? Thao tác không thể hoàn tác.`
        : `Xóa folder "${f.name}"?`;
    if (window.confirm(msg)) deleteFolder(f.id);
  };

  const docsOf = (folderId: string) =>
    documents.filter((d) => d.folderId === folderId);
  const noFolderDocs = documents.filter((d) => !d.folderId);

  const renderDoc = (d: DocItem) => (
    <li
      key={d.id}
      className="doc-row"
      draggable
      onDragStart={(e) => onDragStart(e, d.id)}
    >
      <Link
        to={`/docs/view/document/${d.id}`}
        className="doc-item"
        draggable={false}
      >
        <span className="drag-handle" title="Kéo để di chuyển">⠿</span>
        <span className={`badge badge-${d.type}`}>{d.type}</span>
        <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
        {d.isShared && (
          <span className="share-flag" title="Đang chia sẻ công khai">🔗</span>
        )}
        <span className="doc-date muted">{formatDate(d.updatedAt)}</span>
      </Link>
    </li>
  );

  return (
    <div className="container">
      <header className="app-header">
        <h1>📄 Tài liệu của tôi</h1>
        <div className="user-box">
          <span className="muted">{user?.email}</span>
          <button type="button" onClick={() => signOutUser()}>Đăng xuất</button>
        </div>
      </header>

      <div className="actions">
        <button type="button" className="primary" onClick={() => create('note')}>
          + New note
        </button>
        <button type="button" className="primary" onClick={() => create('markdown')}>
          + New markdown
        </button>
        <button type="button" onClick={() => addFolder()}>+ New folder</button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="folders">
          {folders.map((f) => {
            const docs = docsOf(f.id);
            return (
              <section
                key={f.id}
                className={`folder-section${dragOver === f.id ? ' drop-over' : ''}`}
                onDragOver={(e) => allowDrop(e, f.id)}
                onDragLeave={() =>
                  setDragOver((k) => (k === f.id ? null : k))
                }
                onDrop={(e) => onDrop(e, f.id)}
              >
                <div className="folder-header">
                  <span className="folder-icon">📁</span>
                  {editingId === f.id ? (
                    <input
                      className="folder-name-input"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <span
                      className="folder-name"
                      onDoubleClick={() => startRename(f)}
                      title="Bấm đúp hoặc ✏️ để đổi tên"
                    >
                      {f.name}
                    </span>
                  )}
                  <span className="folder-count muted">{docs.length}</span>
                  <div className="folder-actions">
                    <button type="button" className="ghost" onClick={() => startRename(f)} title="Đổi tên">✏️</button>
                    <button type="button" className="ghost" onClick={() => create('note', f.id)}>+ note</button>
                    <button type="button" className="ghost" onClick={() => create('markdown', f.id)}>+ md</button>
                    <button type="button" className="ghost danger" onClick={() => onDeleteFolder(f)} title="Xóa folder">🗑️</button>
                  </div>
                </div>

                {docs.length === 0 ? (
                  <p className="folder-empty muted">Kéo tài liệu vào đây hoặc bấm “+ note”.</p>
                ) : (
                  <ul className="doc-list">{docs.map(renderDoc)}</ul>
                )}
              </section>
            );
          })}

          {/* Section tài liệu không thuộc folder nào */}
          <section
            className={`folder-section no-folder${dragOver === NO_FOLDER ? ' drop-over' : ''}`}
            onDragOver={(e) => allowDrop(e, NO_FOLDER)}
            onDragLeave={() =>
              setDragOver((k) => (k === NO_FOLDER ? null : k))
            }
            onDrop={(e) => onDrop(e, undefined)}
          >
            <div className="folder-header">
              <span className="folder-icon">🗂️</span>
              <span className="folder-name static">Không có folder</span>
              <span className="folder-count muted">{noFolderDocs.length}</span>
            </div>
            {noFolderDocs.length === 0 ? (
              <p className="folder-empty muted">
                {documents.length === 0 && folders.length === 0
                  ? 'Chưa có tài liệu nào. Bấm “+ New note” hoặc “+ New folder” để bắt đầu.'
                  : 'Không có tài liệu nào ngoài folder.'}
              </p>
            ) : (
              <ul className="doc-list">{noFolderDocs.map(renderDoc)}</ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
