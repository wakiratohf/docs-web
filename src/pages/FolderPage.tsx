import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pin,
  Link2,
  Share2,
  Pencil,
  Trash2,
  Upload,
  Search,
  X,
  CornerUpLeft,
  Copy,
  ExternalLink,
  Plus,
  Inbox,
  List,
  LayoutGrid,
  Droplet,
  ArrowLeft,
  Boxes,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useAuth } from '../auth/useAuth';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import ThemeToggle from '../components/ThemeToggle';
import SearchResults from '../components/SearchResults';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import QuickNoteModal from '../components/QuickNoteModal';
import NewDocMenu from '../components/NewDocMenu';
import NoteEditDialog from '../components/NoteEditDialog';
import SkillCard from '../components/SkillCard';
import SkillEditModal from '../components/SkillEditModal';
import { searchDocs, plainTextOf } from '../lib/search';
import { collectAuthors } from '../lib/authors';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import type { DocItem, DocumentType, StickyColor } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function FolderPage() {
  const { folderId } = useParams();
  const {
    documents,
    folders,
    skills,
    loading,
    addDocument,
    addDocuments,
    renameFolder,
    deleteFolder,
    toggleShareFolder,
    setFolderViewType,
    setDocumentColor,
    togglePinFolder,
    togglePinDocument,
    deleteDocument,
    moveDocument,
  } = useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const { user } = useAuth();
  // Tác giả gợi ý sẵn khi tạo ghi chú mới = người đang đăng nhập (sửa được).
  const defaultAuthor = user?.displayName ?? user?.email ?? '';
  // Danh sách tác giả đã từng dùng (mọi tài liệu) để nạp sẵn dropdown gợi ý.
  const authors = useMemo(() => collectAuthors(documents), [documents]);
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const folder = folders.find((f) => f.id === folderId);
  const docs = useMemo(
    () =>
      documents
        .filter((d) => d.folderId === folderId)
        // Ghi chú được ghim luôn lên đầu; trong mỗi nhóm vẫn theo order rồi createdAt.
        .sort(
          (a, b) =>
            Number(b.isPinned ?? false) - Number(a.isPinned ?? false) ||
            a.order - b.order ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    [documents, folderId],
  );

  // Skill trong folder này (chỉ dùng khi folder kiểu 'skill'); sắp theo order.
  const folderSkills = useMemo(
    () =>
      skills
        .filter((s) => s.folderId === folderId)
        .sort(
          (a, b) =>
            a.order - b.order || a.createdAt.localeCompare(b.createdAt),
        ),
    [skills, folderId],
  );
  // Mở hộp thoại tạo skill mới (chỉ folder kiểu skill).
  const [creatingSkill, setCreatingSkill] = useState(false);
  // Tag đang lọc trong folder skill ('' = tất cả).
  const [tagFilter, setTagFilter] = useState('');

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  // Đang kéo file từ máy qua trang (để làm nổi vùng thả).
  const [fileDragOver, setFileDragOver] = useState(false);
  // id của sticky note đang mở bảng chọn màu (chỉ một bảng mở tại một thời điểm).
  const [openColorFor, setOpenColorFor] = useState<string | null>(null);
  // Mở hộp thoại tạo nhanh ghi chú (chỉ dùng cho folder kiểu sticky note).
  const [creatingNote, setCreatingNote] = useState(false);
  // id của sticky note đang mở hộp thoại sửa nhanh (null = không mở).
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  // Tài liệu tương ứng đang sửa; nếu bị xóa/đưa khỏi folder thì tự đóng dialog.
  const editingNote = editingNoteId
    ? docs.find((d) => d.id === editingNoteId)
    : undefined;

  // Tìm kiếm trong phạm vi folder này.
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchDocs(docs, query) : []),
    [docs, query, searching],
  );

  // Nút quay lại: dùng trực tiếp trong header (cùng hàng tiêu đề) khi đã có
  // folder, và bọc trong .back-bar cho các trạng thái loading/không-tìm-thấy
  // (lúc đó chưa render header).
  const backLink = (
    <Link
      to="/docs"
      className="btn-icon btn-square back-link"
      title="Quay lại danh sách"
      aria-label="Quay lại danh sách"
    >
      <ArrowLeft size={16} aria-hidden="true" />
    </Link>
  );
  const backBar = <div className="back-bar">{backLink}</div>;

  if (loading) {
    return (
      <div className="container">
        {backBar}
        <Spinner />
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

  const isSticky = folder.viewType === 'sticky';
  const isSkill = folder.viewType === 'skill';

  // Lọc skill theo từ khóa (tên/mô tả/tags) + tag đang chọn.
  const skillQ = query.trim().toLowerCase();
  const allTags = Array.from(
    new Set(folderSkills.flatMap((s) => s.tags ?? [])),
  ).sort();
  const visibleSkills = folderSkills.filter((s) => {
    const matchQ =
      !skillQ ||
      s.title.toLowerCase().includes(skillQ) ||
      s.description.toLowerCase().includes(skillQ) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(skillQ));
    const matchTag = !tagFilter || (s.tags ?? []).includes(tagFilter);
    return matchQ && matchTag;
  });

  const create = (type: DocumentType) => {
    const created = addDocument(type, undefined, folder.id);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  // Tạo nhanh ghi chú từ hộp thoại (folder sticky): tạo ngay tại trang, không
  // mở trang soạn thảo toàn màn hình. Nội dung đã là HTML (rich-text từ editor).
  // Đặt màu nếu khác mặc định.
  const onCreateNote = (
    title: string,
    html: string,
    color: StickyColor,
    author: string,
  ) => {
    setCreatingNote(false);
    const created = addDocuments(
      [{ type: 'note', title, content: html, author }],
      folder.id,
    );
    const doc = created[0];
    if (doc && color !== DEFAULT_STICKY_COLOR) setDocumentColor(doc.id, color);
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

  const onDelete = async () => {
    const n = docs.length;
    const msg =
      n > 0
        ? `Xóa folder "${folder.name}" và ${n} tài liệu bên trong? Thao tác không thể hoàn tác.`
        : `Xóa folder "${folder.name}"?`;
    const ok = await confirm({
      title: 'Xóa folder',
      message: msg,
      confirmText: 'Xóa',
      danger: true,
    });
    if (ok) {
      deleteFolder(folder.id);
      navigate('/docs');
    }
  };

  // ----- Kéo-thả file từ máy vào trang → tải lên thẳng folder này -----
  const onPageDragOver = (e: DragEvent) => {
    // Chỉ phản ứng với file thật từ máy, không phải kéo phần tử trong trang.
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!fileDragOver) setFileDragOver(true);
  };
  const onPageDragLeave = (e: DragEvent) => {
    // Chỉ tắt khi con trỏ rời hẳn vùng container (tránh nhấp nháy khi qua phần tử con).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFileDragOver(false);
    }
  };
  const onPageDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    setFileDragOver(false);
    void uploadFiles(e.dataTransfer.files, folder.id);
  };

  // Xóa hẳn một ghi chú (nút close ở góc thẻ). Hỏi xác nhận vì không hoàn tác được.
  const onDeleteNote = async (d: DocItem) => {
    const ok = await confirm({
      title: 'Xóa ghi chú',
      message: `Xóa ghi chú "${d.title || '(không tiêu đề)'}"? Hành động không thể hoàn tác.`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (ok) deleteDocument(d.id);
  };

  // Một tài liệu hiển thị dạng giấy ghi chú (sticky note): đầu thẻ có nút đổi màu,
  // ghim (hiện khi rê chuột) và xóa; thân thẻ là nút mở sửa nhanh.
  const renderStickyCard = (d: DocItem) => {
    const color = d.color ?? DEFAULT_STICKY_COLOR;
    const preview = plainTextOf(d).trim();
    const colorOpen = openColorFor === d.id;
    const pinned = d.isPinned ?? false;
    return (
      <li
        key={d.id}
        className={`sticky-card sticky-${color}${colorOpen ? ' is-color-open' : ''}${pinned ? ' is-pinned' : ''}`}
      >
        <div className="sticky-head">
          <button
            type="button"
            className="sticky-btn"
            title="Đổi màu giấy nhớ"
            aria-label="Đổi màu giấy nhớ"
            onClick={() => setOpenColorFor(colorOpen ? null : d.id)}
          >
            <Droplet size={15} aria-hidden="true" />
          </button>
          {d.isShared && (
            <span className="share-flag" title="Đang chia sẻ công khai">🔗</span>
          )}
          <span className="sticky-head-spacer" />
          <button
            type="button"
            className={`sticky-btn sticky-btn-reveal sticky-btn-pin${pinned ? ' is-pinned' : ''}`}
            title={pinned ? 'Bỏ ghim ghi chú' : 'Ghim ghi chú lên đầu'}
            aria-label={pinned ? 'Bỏ ghim ghi chú' : 'Ghim ghi chú lên đầu'}
            aria-pressed={pinned}
            onClick={() => togglePinDocument(d.id)}
          >
            <Pin size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sticky-btn sticky-btn-reveal sticky-btn-close"
            title="Xóa ghi chú này"
            aria-label="Xóa ghi chú này"
            onClick={() => onDeleteNote(d)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="sticky-body"
          title="Mở để sửa nhanh"
          onClick={() => setEditingNoteId(d.id)}
        >
          <span className="sticky-title">{d.title || '(không tiêu đề)'}</span>
          <p className={`sticky-preview${preview ? '' : ' muted'}`}>
            {preview || '(trống)'}
          </p>
          {d.author && (
            <span className="sticky-author" title={`Tác giả: ${d.author}`}>
              ✍ {d.author}
            </span>
          )}
        </button>
        {colorOpen && (
          <div className="sticky-color-pop" role="menu">
            {STICKY_COLORS.map((c) => {
              const active = (d.color ?? DEFAULT_STICKY_COLOR) === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`sticky-swatch${active ? ' selected' : ''}`}
                  style={{ background: c.swatch }}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => {
                    setDocumentColor(d.id, c.key);
                    setOpenColorFor(null);
                  }}
                />
              );
            })}
          </div>
        )}
      </li>
    );
  };

  const shareUrl = `${window.location.origin}/share/f/${folder.id}`;
  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Đã copy link chia sẻ');
    } catch {
      toastError('Không copy được link');
    }
  };

  return (
    <div
      className={`container${fileDragOver ? ' file-drag-over' : ''}`}
      onDragOver={onPageDragOver}
      onDragLeave={onPageDragLeave}
      onDrop={onPageDrop}
    >
      {fileDragOver && (
        <div className="file-drop-banner">
          📂 Thả để tải lên vào folder “{folder.name}”
        </div>
      )}

      <header className="app-header">
        <h1 className="folder-title">
          {backLink}
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
          {/* Chuyển kiểu hiển thị tài liệu trong folder: danh sách ↔ sticky note.
              Folder skill có layout marketplace riêng nên ẩn bộ chuyển này. */}
          {!isSkill && (
            <div className="view-toggle" role="group" aria-label="Kiểu hiển thị">
              <button
                type="button"
                className={`btn-icon ${!isSticky ? 'primary' : ''}`}
                onClick={() => setFolderViewType(folder.id, 'list')}
                title="Hiển thị dạng danh sách"
                aria-pressed={!isSticky}
              >
                <List size={16} aria-hidden="true" /> List
              </button>
              <button
                type="button"
                className={`btn-icon ${isSticky ? 'primary' : ''}`}
                onClick={() => setFolderViewType(folder.id, 'sticky')}
                title="Hiển thị dạng sticky note"
                aria-pressed={isSticky}
              >
                <LayoutGrid size={16} aria-hidden="true" /> Sticky
              </button>
            </div>
          )}
          <button
            type="button"
            className={`btn-icon ${folder.isPinned ? 'primary' : ''}`}
            onClick={() => togglePinFolder(folder.id)}
            title="Bật/tắt ghim folder (ưu tiên hiển thị trên cùng)"
          >
            <Pin size={16} aria-hidden="true" /> {folder.isPinned ? 'Đã ghim' : 'Ghim folder'}
          </button>
          <button
            type="button"
            className={`btn-icon ${folder.isShared ? 'primary' : ''}`}
            onClick={() => toggleShareFolder(folder.id)}
            title="Bật/tắt chia sẻ công khai cả folder"
          >
            {folder.isShared ? <Link2 size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}{' '}
            {folder.isShared ? 'Đang chia sẻ' : 'Chia sẻ folder'}
          </button>
          <button type="button" className="btn-icon" onClick={startRename}>
            <Pencil size={16} aria-hidden="true" /> Đổi tên
          </button>
          <button type="button" className="btn-icon danger" onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" /> Xóa folder
          </button>
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
          <button type="button" className="btn-icon" onClick={onCopyShare}>
            <Copy size={16} aria-hidden="true" /> Copy
          </button>
          <a className="btn-icon" href={shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> Mở
          </a>
        </div>
      )}

      <div className="actions">
        {isSkill ? (
          // Folder skill: tạo skill qua hộp thoại (metadata + file nén).
          <button
            type="button"
            className="btn-icon primary"
            onClick={() => setCreatingSkill(true)}
          >
            <Plus size={16} aria-hidden="true" /> New skill
          </button>
        ) : isSticky ? (
          // Folder sticky: tạo ghi chú qua hộp thoại tại chỗ, ẩn nút New markdown.
          <button
            type="button"
            className="btn-icon primary"
            onClick={() => setCreatingNote(true)}
          >
            <Plus size={16} aria-hidden="true" /> New note
          </button>
        ) : (
          <NewDocMenu
            folderId={folder.id}
            onCreate={create}
            onPdfCreated={(id) => navigate(`/docs/view/document/${id}`)}
          />
        )}
        {!isSkill && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => navigate(`/docs/upload?folder=${folder.id}`)}
          >
            <Upload size={16} aria-hidden="true" /> Tải lên hàng loạt
          </button>
        )}
      </div>

      {/* ----- Folder kiểu Skill AI: marketplace card + lọc tag ----- */}
      {isSkill && folderSkills.length > 0 && (
        <>
          <div className="search-bar-wrap">
            <Search className="search-icon" size={16} aria-hidden="true" />
            <input
              type="search"
              className="search-input"
              placeholder={`Tìm skill trong “${folder.name}”…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() && (
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
          {allTags.length > 0 && (
            <div className="skill-tag-filter">
              <button
                type="button"
                className={`skill-tag-chip${!tagFilter ? ' selected' : ''}`}
                onClick={() => setTagFilter('')}
              >
                Tất cả
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`skill-tag-chip${tagFilter === t ? ' selected' : ''}`}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {isSkill ? (
        folderSkills.length === 0 ? (
          <EmptyState
            icon={<Boxes size={40} aria-hidden="true" />}
            title="Chưa có skill nào"
            description="Bấm “New skill” để thêm skill đầu tiên (kèm file nén để tải về)."
          />
        ) : visibleSkills.length === 0 ? (
          <EmptyState
            icon={<Search size={40} aria-hidden="true" />}
            title="Không tìm thấy skill phù hợp"
          />
        ) : (
          <div className="skills-grid">
            {visibleSkills.map((s) => (
              <SkillCard key={s.id} skill={s} to={`/docs/skill/${s.id}`} />
            ))}
          </div>
        )
      ) : (
        <>
          {docs.length > 0 && (
            <div className="search-bar-wrap">
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                type="search"
                className="search-input"
                placeholder={`Tìm trong folder “${folder.name}”…`}
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
          )}

          {searching ? (
            <SearchResults results={results} query={query} />
          ) : docs.length === 0 ? (
            <EmptyState
              icon={<Inbox size={40} aria-hidden="true" />}
              title="Folder trống"
              description="Bấm nút phía trên để tạo tài liệu, hoặc kéo tài liệu vào folder này từ trang chủ."
            />
          ) : isSticky ? (
        <>
          {openColorFor && (
            <div
              className="sticky-pop-backdrop"
              onClick={() => setOpenColorFor(null)}
            />
          )}
          <ul className="sticky-grid">{docs.map(renderStickyCard)}</ul>
        </>
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
                aria-label="Đưa tài liệu ra khỏi folder"
                onClick={() => moveDocument(d.id, undefined)}
              >
                <CornerUpLeft size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
          )}
        </>
      )}

      {creatingSkill && (
        <SkillEditModal
          open={creatingSkill}
          folderId={folder.id}
          onCancel={() => setCreatingSkill(false)}
          onDone={(skillId) => {
            setCreatingSkill(false);
            navigate(`/docs/skill/${skillId}`);
          }}
        />
      )}

      {creatingNote && (
        <QuickNoteModal
          onCancel={() => setCreatingNote(false)}
          onCreate={onCreateNote}
          defaultAuthor={defaultAuthor}
          authors={authors}
        />
      )}

      {editingNote && (
        <NoteEditDialog
          key={editingNote.id}
          doc={editingNote}
          onClose={() => setEditingNoteId(null)}
        />
      )}
    </div>
  );
}
