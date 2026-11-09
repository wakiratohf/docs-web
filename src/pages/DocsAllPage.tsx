import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Upload,
  Search,
  X,
  Pin,
  FolderOpen,
  LayoutGrid,
  Clock,
  FolderPlus,
  ArrowUpDown,
  User,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useDebouncedSearch } from '../hooks/useDebouncedValue';
import { useHomeViewPreferences } from '../hooks/useHomeViewPreferences';
import AccountMenu from '../components/AccountMenu';
import BottomNav from '../components/BottomNav';
import SearchResults from '../components/SearchResults';
import EmptyState from '../components/EmptyState';
import CreateFolderModal from '../components/CreateFolderModal';
import NewDocMenu from '../components/NewDocMenu';
import DropdownSelect, { type DropdownOption } from '../components/DropdownSelect';
import { searchDocs, collectAuthors, ALL_AUTHORS } from '../lib/search';
import { formatDate } from '../lib/formatDate';
import {
  sortFoldersForHome,
  sortLooseDocsForHome,
  buildRecentFeed,
  type HomeFeedItem,
  type HomeSortBy,
  type HomeViewMode,
} from '../lib/homeView';
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '../lib/stickyColors';
import {
  getRootFolders,
  getFolderDescendantIds,
  getSharedAncestors,
  countAllDocsInTree,
} from '../lib/folderTree';
import type { DocItem, DocumentType, Folder, FolderViewType, SkillItem } from '../types';

// Tra nhanh mã màu swatch theo key để tô ô mini của folder sticky.
const SWATCH_BY_KEY = new Map(STICKY_COLORS.map((c) => [c.key, c.swatch]));

// Biểu tượng hiển thị trên icon tài liệu theo loại.
const GLYPH: Record<DocumentType, string> = {
  note: '✏️',
  markdown: '#',
  html: '<>',
  pdf: '📄',
  embed: '🔗',
};

const HOME_SORT_OPTIONS: readonly DropdownOption<HomeSortBy>[] = [
  { value: 'default', label: 'Mặc định' },
  { value: 'updated', label: 'Ngày sửa mới nhất' },
  { value: 'created', label: 'Ngày tạo mới nhất' },
  { value: 'name', label: 'Tên (A–Z)' },
];

const HOME_VIEW_OPTIONS: readonly DropdownOption<HomeViewMode>[] = [
  {
    value: 'folders',
    label: 'Dạng Folder',
    triggerLabel: 'Folder',
    description: 'Lưới thư mục & tài liệu lẻ',
    icon: <LayoutGrid size={15} />,
  },
  {
    value: 'recent',
    label: 'Gần đây',
    triggerLabel: 'Gần đây',
    description: 'Danh sách phẳng mọi tài liệu',
    icon: <Clock size={15} />,
  },
];

export default function DocsAllPage() {
  const {
    documents,
    folders,
    skills,
    loading,
    addDocument,
    addFolder,
    moveDocument,
    togglePinFolder,
  } = useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const navigate = useNavigate();

  const { viewMode, sortBy, setViewMode, setSortBy } = useHomeViewPreferences();

  // Folder đang được kéo qua (làm nổi viền ô folder ở chế độ lưới).
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Đang kéo file từ máy tính qua toàn trang (chỉ bật ở chế độ 'recent').
  const [fileDragOver, setFileDragOver] = useState(false);
  // Mở hộp thoại tạo folder (chọn tên + kiểu hiển thị).
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (viewMode !== 'recent') setFileDragOver(false);
  }, [viewMode]);

  // Từ khóa tìm kiếm toàn cục (trên TẤT CẢ folder + tài liệu lẻ).
  const [query, setQuery] = useState('');
  // Tác giả đang lọc; ALL_AUTHORS ('') = Tất cả (không lọc theo tác giả).
  const [author, setAuthor] = useState<string>(ALL_AUTHORS);
  // Danh sách tác giả load động từ dữ liệu để đổ vào dropdown.
  const authors = useMemo(() => collectAuthors(documents), [documents]);
  const authorOptions = useMemo<DropdownOption<string>[]>(
    () => [
      { value: ALL_AUTHORS, label: 'Tất cả tác giả' },
      ...authors.map((a) => ({ value: a, label: a })),
    ],
    [authors],
  );
  // Trễ 200ms trước khi search thật sự chạy, tránh tính search (DOMParser cho
  // note/html) trên mỗi keystroke khi gõ nhanh.
  const debouncedQuery = useDebouncedSearch(query, 200);
  // Đang ở chế độ tìm/lọc khi có từ khóa HOẶC đã chọn một tác giả cụ thể.
  const searching = debouncedQuery.trim().length > 0 || author !== ALL_AUTHORS;
  const results = useMemo(
    () => (searching ? searchDocs(documents, debouncedQuery, author) : []),
    [documents, debouncedQuery, author, searching],
  );
  // Map id → folder để kết quả tìm kiếm và chế độ Gần đây hiển thị tên folder.
  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  // Gom document/skill theo folderId một lần (O(n)) thay vì filter lại cho mỗi
  // folder tile mỗi lần render (O(số folder × số document)).
  const docsByFolder = useMemo(() => {
    const map = new Map<string, DocItem[]>();
    for (const d of documents) {
      if (!d.folderId) continue;
      const arr = map.get(d.folderId);
      if (arr) arr.push(d);
      else map.set(d.folderId, [d]);
    }
    return map;
  }, [documents]);
  const skillsByFolder = useMemo(() => {
    const map = new Map<string, SkillItem[]>();
    for (const s of skills) {
      if (!s.folderId) continue;
      const arr = map.get(s.folderId);
      if (arr) arr.push(s);
      else map.set(s.folderId, [s]);
    }
    return map;
  }, [skills]);
  const docsOf = (fid: string) => docsByFolder.get(fid) ?? [];
  const skillsOf = (fid: string) => skillsByFolder.get(fid) ?? [];

  const looseDocs = useMemo(
    () => documents.filter((d) => !d.folderId),
    [documents],
  );
  const rootFolders = useMemo(() => getRootFolders(folders), [folders]);
  const sortedFolders = useMemo(
    () => sortFoldersForHome(rootFolders, docsByFolder, skillsByFolder, sortBy, folders),
    [rootFolders, docsByFolder, skillsByFolder, sortBy, folders],
  );
  const sortedLooseDocs = useMemo(
    () => sortLooseDocsForHome(looseDocs, sortBy),
    [looseDocs, sortBy],
  );
  const recentFeed = useMemo(
    () => (viewMode === 'recent' ? buildRecentFeed(documents, skills, sortBy) : []),
    [viewMode, documents, skills, sortBy],
  );

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

  const switchViewMode = (nextMode: HomeViewMode) => {
    setViewMode(nextMode);
    // Nếu đang ở màn kết quả tìm kiếm mà người dùng chủ động bấm chuyển chế độ xem,
    // thoát chế độ lọc để hiển thị ngay chế độ xem vừa chọn.
    if (searching) {
      setQuery('');
      setAuthor(ALL_AUTHORS);
    }
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

  // ----- Kéo-thả file từ máy tính vào trang khi ở chế độ 'recent' -----
  const onPageDragOver = (e: DragEvent) => {
    if (viewMode !== 'recent') return;
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!fileDragOver) setFileDragOver(true);
  };
  const onPageDragLeave = (e: DragEvent) => {
    if (viewMode !== 'recent') return;
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFileDragOver(false);
    }
  };
  const onPageDrop = (e: DragEvent) => {
    if (viewMode !== 'recent') return;
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    setFileDragOver(false);
    void uploadFiles(e.dataTransfer.files, undefined);
  };

  const openFolder = (f: Folder) => navigate(`/docs/folder/${f.id}`);

  // Một ô tài liệu đứng riêng trên lưới (icon + nhãn), có thể kéo vào folder.
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
        {(d.isShared || (d.folderId && getSharedAncestors(folders, d.folderId).length > 0)) && (
          <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
        )}
      </span>
      <span className="tile-label">{d.title || '(không tiêu đề)'}</span>
    </Link>
  );

  // Một dòng mục trong danh sách phẳng của chế độ "Gần đây" (DocItem hoặc SkillItem).
  const renderRecentItem = (entry: HomeFeedItem) => {
    const { kind, item } = entry;
    const to =
      kind === 'skill' ? `/docs/skill/${item.id}` : `/docs/view/document/${item.id}`;
    const folder = item.folderId ? foldersById.get(item.folderId) : undefined;
    const isPinned = kind === 'doc' && Boolean(entry.item.isPinned);
    const titleText =
      item.title || (kind === 'skill' ? '(không tên)' : '(không tiêu đề)');
    const authorText = (item.author ?? '').trim();

    return (
      <li key={`${kind}-${item.id}`} className="doc-line home-recent-line">
        <Link to={to} className="doc-item">
          {kind === 'skill' ? (
            <span className="badge badge-skill">
              <span aria-hidden="true">{entry.item.icon || '🧩'}</span> skill
            </span>
          ) : (
            <span className={`badge badge-${entry.item.type}`}>
              {entry.item.type}
            </span>
          )}

          <span className="recent-main">
            <span className="recent-title-row">
              <span className="doc-title">{titleText}</span>
              {isPinned && (
                <span className="recent-pin-flag" title="Đã ghim">
                  <Pin size={13} aria-hidden="true" />
                  <span className="sr-only">Đã ghim</span>
                </span>
              )}
              {(item.isShared || (item.folderId && getSharedAncestors(folders, item.folderId).length > 0)) && (
                <span className="share-flag" title="Đang chia sẻ công khai">
                  <span aria-hidden="true">🔗</span>
                  <span className="sr-only">Đang chia sẻ công khai</span>
                </span>
              )}
            </span>
            {authorText && (
              <span className="recent-author muted">✍ {authorText}</span>
            )}
          </span>

          <span className="doc-dates muted">
            <span className="doc-date" title="Thời gian cập nhật gần nhất">
              Sửa: {formatDate(item.updatedAt)}
            </span>
            <span className="doc-date" title="Thời gian tạo">
              Tạo: {formatDate(item.createdAt)}
            </span>
          </span>
        </Link>

        {folder ? (
          <Link
            to={`/docs/folder/${folder.id}`}
            className="recent-folder-chip"
            title={`Mở folder ${folder.name}`}
            aria-label={`Mở folder ${folder.name}`}
          >
            <span aria-hidden="true">📁</span>
            <span className="recent-folder-name">{folder.name}</span>
          </Link>
        ) : (
          <span
            className="recent-folder-chip is-loose"
            title="Tài liệu đứng riêng (không thuộc folder)"
          >
            General
          </span>
        )}
      </li>
    );
  };

  const isAllEmpty =
    folders.length === 0 && documents.length === 0 && skills.length === 0;

  return (
    <div
      className={`container${fileDragOver ? ' file-drag-over' : ''}`}
      onDragOver={onPageDragOver}
      onDragLeave={onPageDragLeave}
      onDrop={onPageDrop}
    >
      {fileDragOver && (
        <div className="file-drop-banner">
          📄 Thả file để tải lên trang chủ (General)
        </div>
      )}

      <header className="app-header">
        <h1>📄 Tài liệu của tôi</h1>
        <div className="user-box">
          <AccountMenu />
        </div>
      </header>

      <div className="actions home-actions">
        <div className="actions-left">
          <NewDocMenu
            onCreate={create}
            onPdfCreated={(id) => navigate(`/docs/view/document/${id}`)}
          />
          {viewMode === 'recent' && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setCreatingFolder(true)}
            >
              <FolderPlus size={16} aria-hidden="true" /> Folder mới
            </button>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={() => navigate('/docs/upload')}
          >
            <Upload size={16} aria-hidden="true" /> Tải lên hàng loạt
          </button>
        </div>

        <div className="actions-right">
          {!searching && (
            <DropdownSelect<HomeSortBy>
              value={sortBy}
              onChange={setSortBy}
              options={HOME_SORT_OPTIONS}
              ariaLabel="Sắp xếp màn hình chính"
              align="end"
              minMenuWidth={210}
              triggerIcon={<ArrowUpDown size={15} />}
            />
          )}

          <DropdownSelect<HomeViewMode>
            value={viewMode}
            onChange={switchViewMode}
            options={HOME_VIEW_OPTIONS}
            ariaLabel="Chế độ xem trang chủ"
            align="end"
            minMenuWidth={248}
          />
        </div>
      </div>

      <div className="search-bar-wrap has-author">
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          type="search"
          className="search-input"
          placeholder="Tìm tài liệu trên tất cả folder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <DropdownSelect<string>
          className="search-author-dropdown"
          value={author}
          onChange={setAuthor}
          options={authorOptions}
          ariaLabel="Lọc theo tác giả"
          align="end"
          minMenuWidth={210}
          triggerIcon={<User size={15} />}
        />
        {searching && (
          <button
            type="button"
            className="search-clear"
            title="Xóa tìm kiếm"
            aria-label="Xóa tìm kiếm"
            onClick={() => {
              setQuery('');
              setAuthor(ALL_AUTHORS);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {loading ? (
        // Khung xương giữ chỗ các ô thư mục → bố cục không "nhảy" khi dữ liệu về
        <div className="home-grid" aria-busy="true" aria-label="Đang tải tài liệu">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="tile tile-skeleton" aria-hidden="true">
              <span className="folder-icon-box skeleton-block" />
              <span className="skeleton-line" />
            </div>
          ))}
        </div>
      ) : searching ? (
        <SearchResults
          results={results}
          query={query}
          author={author}
          foldersById={foldersById}
          showFolder
        />
      ) : isAllEmpty ? (
        <EmptyState
          icon={<FolderOpen size={40} aria-hidden="true" />}
          title="Chưa có tài liệu nào"
          description="Tạo ghi chú, tài liệu Markdown hoặc folder để bắt đầu."
          action={
            <button
              type="button"
              className="btn-icon primary"
              onClick={() => create('note')}
            >
              <Plus size={16} aria-hidden="true" /> New note
            </button>
          }
        />
      ) : viewMode === 'recent' ? (
        recentFeed.length === 0 ? (
          <EmptyState
            icon={<Clock size={40} aria-hidden="true" />}
            title="Chưa có tài liệu nào"
            description="Các folder hiện đang trống. Tạo ghi chú hoặc tải tài liệu lên để xem tại đây."
            action={
              <button
                type="button"
                className="btn-icon primary"
                onClick={() => create('note')}
              >
                <Plus size={16} aria-hidden="true" /> New note
              </button>
            }
          />
        ) : (
          <>
            <p className="search-count muted">
              Tổng cộng {recentFeed.length} mục
            </p>
            <ul className="doc-list home-recent-list" role="list">
              {recentFeed.map(renderRecentItem)}
            </ul>
          </>
        )
      ) : (
        <div className="home-grid">
          {/* Ô folder — bấm để mở trang chi tiết */}
          {sortedFolders.map((f) => {
            const descendantIds = getFolderDescendantIds(f.id, folders);
            // Số thư mục con = CẤP TRỰC TIẾP (khớp mục "Thư mục con (N)" bên trong
            // trang thư mục); số tài liệu = tổng cả cây (ghi rõ ở tooltip).
            const subCount = folders.filter((x) => x.parentId === f.id).length;
            const isSkill = f.viewType === 'skill';

            // Tính tổng số tệp (tài liệu hoặc skill) trong cả cây thư mục
            const allTreeIds = [f.id, ...descendantIds];
            const totalDocs = countAllDocsInTree(f.id, folders, docsByFolder);
            const totalSkills = isSkill
              ? allTreeIds.reduce(
                  (sum, fid) => sum + (skillsByFolder.get(fid)?.length ?? 0),
                  0,
                )
              : 0;
            const count = isSkill ? totalSkills : totalDocs;

            // Dữ liệu mẫu đổ vào lưới mini 3x3 (ưu tiên trực tiếp, nếu rỗng thì gom từ subfolder)
            const miniSkills = isSkill
              ? (skillsOf(f.id).length > 0
                  ? skillsOf(f.id)
                  : allTreeIds.flatMap((fid) => skillsOf(fid))
                ).slice(0, 9)
              : [];

            const miniDocs = !isSkill
              ? (docsOf(f.id).length > 0
                  ? docsOf(f.id)
                  : allTreeIds.flatMap((fid) => docsOf(fid))
                ).slice(0, 9)
              : [];

            return (
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
                title={`${f.name}${subCount > 0 ? ` — ${subCount} thư mục con` : ''} — ${count} ${isSkill ? 'skill' : 'tài liệu'} (tính cả bên trong thư mục con)`}
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
                  {count > 0 && (
                    <span className="folder-count" title={`${count} ${isSkill ? 'skill' : 'tệp'}`}>
                      {count}
                    </span>
                  )}
                  {subCount > 0 && (
                    <span
                      className="folder-sub-badge"
                      title={`${subCount} thư mục con trực tiếp`}
                    >
                      📁 {subCount}
                    </span>
                  )}
                  <span className="folder-mini">
                    {isSkill
                      ? miniSkills.map((s) => (
                          <span key={s.id} className="mini-skill" aria-hidden="true">
                            {s.icon || '🧩'}
                          </span>
                        ))
                      : miniDocs.map((d) =>
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
                <span className="tile-label">
                  <span className="tile-name">{f.name}</span>
                  {subCount > 0 && (
                    <span
                      className="tile-subfolder-count"
                      title={`${subCount} thư mục con trực tiếp`}
                    >
                      📁 {subCount} thư mục con
                    </span>
                  )}
                  {/* Luôn hiện số tài liệu (trước đây bị ẩn khi có thư mục con) */}
                  <span className="tile-doc-count muted">
                    {count} {isSkill ? 'skill' : 'tài liệu'}
                  </span>
                </span>
              </div>
            );
          })}

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
          {sortedLooseDocs.map(renderDoc)}
        </div>
      )}

      <CreateFolderModal
        open={creatingFolder}
        onCancel={() => setCreatingFolder(false)}
        onCreate={onCreateFolder}
      />

      {/* Footer bản quyền: chỉ ở cuối trang chủ, KHÔNG cố định đè lên nội dung */}
      <BottomNav />
    </div>
  );
}
