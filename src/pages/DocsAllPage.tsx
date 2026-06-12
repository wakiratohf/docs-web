import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, Search, X, Pin, FolderOpen } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useAuth } from '../auth/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import SearchResults from '../components/SearchResults';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import CreateFolderModal from '../components/CreateFolderModal';
import { searchDocs } from '../lib/search';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import type { DocItem, DocumentType, Folder, FolderViewType } from '../types';

// Tra nhanh mã màu swatch theo key để tô ô mini của folder sticky.
const SWATCH_BY_KEY = new Map(STICKY_COLORS.map((c) => [c.key, c.swatch]));

// Biểu tượng hiển thị trên icon tài liệu theo loại.
const GLYPH: Record<DocumentType, string> = { note: '✏️', markdown: '#' };

export default function DocsAllPage() {
  const {
    documents,
    folders,
    loading,
    addDocument,
    addFolder,
    moveDocument,
    togglePinFolder,
  } = useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();

  // Folder đang được kéo qua (làm nổi viền ô folder).
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Mở hộp thoại tạo folder (chọn tên + kiểu hiển thị).
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Từ khóa tìm kiếm toàn cục (trên TẤT CẢ folder + tài liệu lẻ).
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchDocs(documents, query) : []),
    [documents, query, searching],
  );
  // Map id → folder để kết quả tìm kiếm cho biết tài liệu nằm ở folder nào.
  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  const docsOf = (fid: string) => documents.filter((d) => d.folderId === fid);
  const looseDocs = documents.filter((d) => !d.folderId);

  const create = (type: DocumentType) => {
    const created = addDocument(type);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  // Tạo folder từ hộp thoại rồi mở luôn để thấy ngay kiểu vừa chọn.
  const onCreateFolder = (name: string, viewType: FolderViewType) => {
    setCreatingFolder(false);
    const f = addFolder(name, viewType);
    if (f) navigate(`/docs/folder/${f.id}`);
  };

  // ----- Kéo-thả (HTML5 native): kéo tài liệu thả vào ô folder -----
  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const allowDrop = (e: DragEvent, key: string) => {
    e.preventDefault();
    // Kéo file từ máy thì là thao tác "copy" (tải lên); kéo tài liệu nội bộ là "move".
    const isFile = Array.from(e.dataTransfer.types).includes('Files');
    e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
    if (dragOver !== key) setDragOver(key);
  };
  const onDropToFolder = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOver(null);
    // Kéo file thật từ máy → tải lên thẳng vào folder này.
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files, folderId);
      return;
    }
    // Kéo một tài liệu nội bộ → chuyển nó vào folder.
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveDocument(id, folderId);
  };

  const openFolder = (f: Folder) => navigate(`/docs/folder/${f.id}`);

  // Một ô tài liệu (icon + nhãn), có thể kéo.
  const renderDoc = (d: DocItem) => (
    <Link
      key={d.id}
      to={`/docs/view/document/${d.id}`}
      className="tile"
      draggable
      onDragStart={(e) => onDragStart(e, d.id)}
      title={d.title || '(không tiêu đề)'}
    >
      <span className={`tile-icon icon-${d.type}`}>
        <span className="tile-glyph">{GLYPH[d.type]}</span>
        {d.isShared && (
          <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
        )}
      </span>
      <span className="tile-label">{d.title || '(không tiêu đề)'}</span>
    </Link>
  );

  return (
    <div className="container">
      <header className="app-header">
        <h1>📄 Tài liệu của tôi</h1>
        <div className="user-box">
          <ThemeToggle />
          <span className="muted">{user?.email}</span>
          <button type="button" onClick={() => signOutUser()}>Đăng xuất</button>
        </div>
      </header>

      <div className="actions">
        <button type="button" className="btn-icon primary" onClick={() => create('note')}>
          <Plus size={16} aria-hidden="true" /> New note
        </button>
        <button type="button" className="btn-icon primary" onClick={() => create('markdown')}>
          <Plus size={16} aria-hidden="true" /> New markdown
        </button>
        <button type="button" className="btn-icon" onClick={() => navigate('/docs/upload')}>
          <Upload size={16} aria-hidden="true" /> Tải lên hàng loạt
        </button>
      </div>

      <div className="search-bar-wrap">
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          type="search"
          className="search-input"
          placeholder="Tìm tài liệu trên tất cả folder (theo tiêu đề & nội dung)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && (
          <button
            type="button"
            className="search-clear"
            title="Xóa tìm kiếm"
            aria-label="Xóa tìm kiếm"
            onClick={() => setQuery('')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : searching ? (
        <SearchResults
          results={results}
          query={query}
          foldersById={foldersById}
          showFolder
        />
      ) : folders.length === 0 && documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} aria-hidden="true" />}
          title="Chưa có tài liệu nào"
          description="Tạo ghi chú, tài liệu Markdown hoặc folder để bắt đầu."
          action={
            <button type="button" className="btn-icon primary" onClick={() => create('note')}>
              <Plus size={16} aria-hidden="true" /> New note
            </button>
          }
        />
      ) : (
        <div className="home-grid">
          {/* Ô folder — bấm để mở trang chi tiết */}
          {folders.map((f) => (
            <div
              key={f.id}
              className={`tile folder-tile${dragOver === f.id ? ' drop-over' : ''}${
                f.isPinned ? ' is-pinned' : ''
              }`}
              role="button"
              tabIndex={0}
              aria-label={`Mở folder ${f.name}`}
              onClick={() => openFolder(f)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openFolder(f);
              }}
              onDragOver={(e) => allowDrop(e, f.id)}
              onDragLeave={() => setDragOver((k) => (k === f.id ? null : k))}
              onDrop={(e) => onDropToFolder(e, f.id)}
              title={f.name}
            >
              <span className="folder-icon-box">
                {/* Nút ghim: bấm để ghim/bỏ ghim, chặn nổi bọt để không mở folder */}
                <button
                  type="button"
                  className="folder-pin"
                  title={f.isPinned ? 'Bỏ ghim folder' : 'Ghim folder lên đầu'}
                  aria-label={f.isPinned ? 'Bỏ ghim folder' : 'Ghim folder lên đầu'}
                  aria-pressed={f.isPinned ? true : false}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinFolder(f.id);
                  }}
                >
                  <Pin size={14} aria-hidden="true" />
                </button>
                {f.isShared && (
                  <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
                )}
                <span className="folder-mini">
                  {docsOf(f.id)
                    .slice(0, 9)
                    .map((d) =>
                      // Folder sticky: ô mini tô theo màu giấy nhớ của tài liệu.
                      f.viewType === 'sticky' ? (
                        <span
                          key={d.id}
                          className="mini-doc"
                          style={{
                            background: SWATCH_BY_KEY.get(
                              d.color ?? DEFAULT_STICKY_COLOR,
                            ),
                          }}
                        />
                      ) : (
                        <span key={d.id} className={`mini-doc mini-${d.type}`} />
                      ),
                    )}
                </span>
              </span>
              <span className="tile-label">{f.name}</span>
            </div>
          ))}

          {/* Ô placeholder tạo folder: viền nét đứt + dấu cộng ở giữa, nằm ngay trong lưới folder */}
          <button
            type="button"
            className="tile folder-add-tile"
            onClick={() => setCreatingFolder(true)}
            title="Tạo folder mới"
            aria-label="Tạo folder mới"
          >
            <span className="folder-add-box">
              <Plus size={40} aria-hidden="true" />
            </span>
            <span className="tile-label">New folder</span>
          </button>

          {/* Tài liệu không thuộc folder nào — nằm thẳng trên lưới */}
          {looseDocs.map(renderDoc)}
        </div>
      )}

      <CreateFolderModal
        open={creatingFolder}
        onCancel={() => setCreatingFolder(false)}
        onCreate={onCreateFolder}
      />
    </div>
  );
}
