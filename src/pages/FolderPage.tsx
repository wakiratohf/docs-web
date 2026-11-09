import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pin,
  Pencil,
  Trash2,
  Upload,
  Search,
  X,
  CornerUpLeft,
  Plus,
  Inbox,
  List,
  LayoutGrid,
  Droplet,
  ArrowLeft,
  Boxes,
  ArrowUpDown,
  FolderPlus,
  FolderInput,
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
import DropdownSelect, { type DropdownOption } from '../components/DropdownSelect';
import NoteEditDialog from '../components/NoteEditDialog';
import SkillCard from '../components/SkillCard';
import SkillEditModal from '../components/SkillEditModal';
import CreateFolderModal from '../components/CreateFolderModal';
import MoveFolderModal from '../components/MoveFolderModal';
import BreadcrumbNav from '../components/BreadcrumbNav';
import SharePopover from '../components/SharePopover';
import { searchDocs, plainTextOf } from '../lib/search';
import { collectAuthors } from '../lib/authors';
import {
  getSubfolders,
  getFolderDescendantIds,
  getFolderDepth,
  getSharedAncestors,
  MAX_FOLDER_DEPTH,
} from '../lib/folderTree';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import type { DocItem, DocumentType, FolderViewType, StickyColor } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

type FolderSortBy = 'manual' | 'name' | 'date';

const FOLDER_SORT_OPTIONS: readonly DropdownOption<FolderSortBy>[] = [
  { value: 'manual', label: 'Thứ tự kéo-thả' },
  { value: 'name', label: 'Tên (A–Z)' },
  { value: 'date', label: 'Ngày tạo (mới nhất)' },
];

const FOLDER_VIEW_OPTIONS: readonly DropdownOption<'list' | 'sticky'>[] = [
  {
    value: 'list',
    label: 'Danh sách',
    triggerLabel: 'List',
    description: 'Hiển thị từng dòng chi tiết',
    icon: <List size={15} />,
  },
  {
    value: 'sticky',
    label: 'Sticky note',
    triggerLabel: 'Sticky',
    description: 'Lưới giấy nhớ nhiều màu',
    icon: <LayoutGrid size={15} />,
  },
];

export default function FolderPage() {
  const { folderId } = useParams();
  const {
    documents,
    folders,
    skills,
    loading,
    addDocument,
    addDocuments,
    addFolder,
    renameFolder,
    moveFolder,
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
  const { toastSuccess } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const folder = folders.find((f) => f.id === folderId);
  const isFolderShared = folder
    ? Boolean(folder.isShared || getSharedAncestors(folders, folder.parentId).length > 0)
    : false;
  // Tiêu chí sắp xếp trong folder: 'manual' theo order (kéo-thả), hoặc theo
  // tên/ngày tạo. Ghi chú ghim luôn ở trên, bất kể tiêu chí.
  const [sortBy, setSortBy] = useState<'manual' | 'name' | 'date'>('manual');
  const docs = useMemo(
    () =>
      documents.filter((d) => d.folderId === folderId).sort((a, b) => {
        const pinDiff = Number(b.isPinned ?? false) - Number(a.isPinned ?? false);
        if (pinDiff !== 0) return pinDiff;
        if (sortBy === 'name') return a.title.localeCompare(b.title, 'vi');
        if (sortBy === 'date') return b.createdAt.localeCompare(a.createdAt);
        return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
      }),
    [documents, folderId, sortBy],
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

  // Thư mục con bên trong folder này
  const subfolders = useMemo(
    () => (folder ? getSubfolders(folder.id, folders) : []),
    [folder, folders],
  );
  const currentDepth = useMemo(
    () => (folder ? getFolderDepth(folder.id, folders) : 1),
    [folder, folders],
  );
  const canAddSubfolder = currentDepth < MAX_FOLDER_DEPTH;

  // Hộp thoại tạo thư mục con & di chuyển folder
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [movingFolder, setMovingFolder] = useState(false);
  const [subfolderDragOver, setSubfolderDragOver] = useState<string | null>(null);

  // Tìm kiếm trong phạm vi folder này. Trễ 200ms trước khi lọc thật sự chạy,
  // tránh tính search (DOMParser cho note/html) trên mỗi keystroke khi gõ nhanh.
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const searching = debouncedQuery.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchDocs(docs, debouncedQuery) : []),
    [docs, debouncedQuery, searching],
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
  const skillQ = debouncedQuery.trim().toLowerCase();
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

  const onCreateSubfolder = (name: string, viewType: FolderViewType) => {
    setCreatingSubfolder(false);
    if (!folder) return;
    const created = addFolder(name, viewType, folder.id);
    if (created) {
      toastSuccess(`Đã tạo thư mục con "${created.name}"`);
    }
  };

  const onMoveCurrentFolder = (fId: string, targetParentId: string | undefined) => {
    setMovingFolder(false);
    moveFolder(fId, targetParentId);
    toastSuccess('Đã di chuyển thư mục');
  };

  const allowDropToSubfolder = (e: DragEvent, subId: string) => {
    e.preventDefault();
    const isFile = Array.from(e.dataTransfer.types).includes('Files');
    e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
    if (subfolderDragOver !== subId) setSubfolderDragOver(subId);
  };

  const onDropToSubfolder = (e: DragEvent, subId: string) => {
    e.preventDefault();
    setSubfolderDragOver(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files, subId);
      return;
    }
    const docId = e.dataTransfer.getData('text/plain');
    if (docId) {
      moveDocument(docId, subId);
      toastSuccess('Đã chuyển tài liệu vào thư mục con');
    }
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
          {(d.isShared || isFolderShared) && (
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
  const parentSharedAncestors = getSharedAncestors(folders, folder.parentId);

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

      {/* Đường dẫn Breadcrumb phân cấp */}
      <div className="folder-breadcrumb-bar">
        <BreadcrumbNav folderId={folder.id} folders={folders} />
      </div>

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
            <DropdownSelect<FolderSortBy>
              value={sortBy}
              onChange={setSortBy}
              options={FOLDER_SORT_OPTIONS}
              ariaLabel="Sắp xếp tài liệu"
              align="end"
              minMenuWidth={200}
              triggerIcon={<ArrowUpDown size={15} />}
            />
          )}
          {!isSkill && (
            <DropdownSelect<'list' | 'sticky'>
              value={isSticky ? 'sticky' : 'list'}
              onChange={(v) => setFolderViewType(folder.id, v)}
              options={FOLDER_VIEW_OPTIONS}
              ariaLabel="Kiểu hiển thị"
              align="end"
              minMenuWidth={236}
            />
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={() => setMovingFolder(true)}
            title="Di chuyển thư mục này sang vị trí khác"
          >
            <FolderInput size={16} aria-hidden="true" /> Di chuyển
          </button>
          <button
            type="button"
            className={`btn-icon ${folder.isPinned ? 'primary' : ''}`}
            onClick={() => togglePinFolder(folder.id)}
            title="Bật/tắt ghim folder (ưu tiên hiển thị trên cùng)"
          >
            <Pin size={16} aria-hidden="true" /> {folder.isPinned ? 'Đã ghim' : 'Ghim folder'}
          </button>
          <SharePopover
            kind="folder"
            shareUrl={shareUrl}
            isShared={Boolean(folder.isShared)}
            inherited={parentSharedAncestors.length > 0}
            inheritedFolderName={parentSharedAncestors[parentSharedAncestors.length - 1]?.name}
            onToggle={() => toggleShareFolder(folder.id)}
          />
          <button type="button" className="btn-icon" onClick={startRename}>
            <Pencil size={16} aria-hidden="true" /> Đổi tên
          </button>
          <button type="button" className="btn-icon danger" onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" /> Xóa folder
          </button>
        </div>
      </header>

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
        {canAddSubfolder && !isSkill && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => setCreatingSubfolder(true)}
            title="Tạo thư mục con bên trong folder này"
          >
            <FolderPlus size={16} aria-hidden="true" /> Thư mục con
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
          {/* ----- Danh sách thư mục con (Sub-folders) nếu có ----- */}
          {subfolders.length > 0 && !searching && (
            <div className="subfolders-section">
              <div className="subfolders-header">
                <span className="subfolders-title">
                  📁 Thư mục con ({subfolders.length})
                </span>
              </div>
              <div className="subfolders-grid">
                {subfolders.map((sub) => {
                  const childSubs = getFolderDescendantIds(sub.id, folders).length;
                  const allSubTreeDocCount = [sub.id, ...getFolderDescendantIds(sub.id, folders)].reduce(
                    (sum, fid) => sum + documents.filter((d) => d.folderId === fid).length,
                    0,
                  );
                  const isDropTarget = subfolderDragOver === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className={`subfolder-card${isDropTarget ? ' drop-over' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/docs/folder/${sub.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          navigate(`/docs/folder/${sub.id}`);
                        }
                      }}
                      onDragOver={(e) => allowDropToSubfolder(e, sub.id)}
                      onDragLeave={() =>
                        setSubfolderDragOver((id) => (id === sub.id ? null : id))
                      }
                      onDrop={(e) => onDropToSubfolder(e, sub.id)}
                      title={`Mở thư mục con "${sub.name}" (${childSubs > 0 ? `${childSubs} thư mục con, ` : ''}${allSubTreeDocCount} tài liệu)`}
                    >
                      <span className="subfolder-icon">📁</span>
                      <div className="subfolder-info">
                        <span className="subfolder-name">{sub.name}</span>
                        <span className="subfolder-count muted">
                          {childSubs > 0 ? `${childSubs} thư mục con · ` : ''}
                          {allSubTreeDocCount} tài liệu
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            subfolders.length > 0 ? (
              <div className="empty-state subfolders-empty-direct">
                <p className="muted">
                  Thư mục này hiện chưa có tài liệu trực tiếp (đang chứa {subfolders.length} thư mục con ở trên).
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<Inbox size={40} aria-hidden="true" />}
                title="Folder trống"
                description="Bấm nút phía trên để tạo tài liệu hoặc thư mục con."
              />
            )
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
                {(d.isShared || isFolderShared) && (
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

      {creatingSubfolder && (
        <CreateFolderModal
          open={creatingSubfolder}
          parentFolderName={folder.name}
          onCancel={() => setCreatingSubfolder(false)}
          onCreate={onCreateSubfolder}
        />
      )}

      {movingFolder && (
        <MoveFolderModal
          open={movingFolder}
          folder={folder}
          folders={folders}
          onCancel={() => setMovingFolder(false)}
          onMove={onMoveCurrentFolder}
        />
      )}
    </div>
  );
}
