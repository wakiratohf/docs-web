import type { DocItem, Folder, SkillItem } from '../types';
import { getFolderDescendantIds } from './folderTree';

/**
 * Chế độ xem trên màn hình Home (`DocsAllPage`):
 *  - 'folders' : Lưới Folder kiểu iOS + tài liệu đứng riêng (mặc định)
 *  - 'recent'  : Danh sách phẳng tất cả tài liệu & skill xuyên suốt mọi folder
 */
export type HomeViewMode = 'folders' | 'recent';

/**
 * Tiêu chí sắp xếp trên màn hình Home:
 *  - 'default' : Mặc định theo ngữ cảnh (Folder: ghim → order; Gần đây: ghim → mới sửa)
 *  - 'updated' : Ngày cập nhật mới nhất lên trước
 *  - 'created' : Ngày tạo mới nhất lên trước
 *  - 'name'    : Tên / tiêu đề A–Z (theo bảng chữ cái tiếng Việt)
 */
export type HomeSortBy = 'default' | 'updated' | 'created' | 'name';

/** Một mục trong danh sách phẳng của chế độ "Gần đây" (hỗ trợ cả DocItem và SkillItem). */
export type HomeFeedItem =
  | { kind: 'doc'; item: DocItem }
  | { kind: 'skill'; item: SkillItem };

/**
 * Tính mốc thời gian hoạt động mới nhất của một folder dựa trên `updatedAt`
 * lớn nhất của các tài liệu/skill bên trong (bao gồm cả các sub-folder con cháu nếu có).
 * Nếu folder trống, dùng `folder.createdAt`.
 */
export function getFolderLatestUpdatedAt(
  folder: Folder,
  docsByFolder: ReadonlyMap<string, DocItem[]>,
  skillsByFolder: ReadonlyMap<string, SkillItem[]>,
  allFolders?: readonly Folder[],
): string {
  let latest = '';
  const folderIds = allFolders
    ? [folder.id, ...getFolderDescendantIds(folder.id, allFolders)]
    : [folder.id];

  for (const fId of folderIds) {
    const docs = docsByFolder.get(fId);
    if (docs) {
      for (const d of docs) {
        const ts = d.updatedAt || d.createdAt;
        if (ts > latest) latest = ts;
      }
    }

    const skills = skillsByFolder.get(fId);
    if (skills) {
      for (const s of skills) {
        const ts = s.updatedAt || s.createdAt;
        if (ts > latest) latest = ts;
      }
    }
  }

  return latest || folder.createdAt;
}

/**
 * Sắp xếp danh sách folder cho chế độ lưới trên màn hình Home.
 * Folder được ghim (`isPinned`) luôn ưu tiên đứng đầu ở mọi tiêu chí.
 */
export function sortFoldersForHome(
  folders: readonly Folder[],
  docsByFolder: ReadonlyMap<string, DocItem[]>,
  skillsByFolder: ReadonlyMap<string, SkillItem[]>,
  sortBy: HomeSortBy,
  allFolders?: readonly Folder[],
): Folder[] {
  const latestMap =
    sortBy === 'updated'
      ? new Map(
          folders.map((f) => [
            f.id,
            getFolderLatestUpdatedAt(f, docsByFolder, skillsByFolder, allFolders),
          ]),
        )
      : null;

  return [...folders].sort((a, b) => {
    const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pinDiff !== 0) return pinDiff;

    if (sortBy === 'updated' && latestMap) {
      const lb = latestMap.get(b.id) ?? b.createdAt;
      const la = latestMap.get(a.id) ?? a.createdAt;
      return (
        lb.localeCompare(la) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt)
      );
    }

    if (sortBy === 'created') {
      return (
        b.createdAt.localeCompare(a.createdAt) ||
        a.order - b.order
      );
    }

    if (sortBy === 'name') {
      return (
        (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' }) ||
        a.order - b.order
      );
    }

    // 'default': giữ nguyên thứ tự order rồi createdAt như mặc định của kho lưu trữ
    return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  });
}

/** Sắp xếp các tài liệu đứng riêng (không thuộc folder nào) trên lưới Home. */
export function sortLooseDocsForHome(
  looseDocs: readonly DocItem[],
  sortBy: HomeSortBy,
): DocItem[] {
  return [...looseDocs].sort((a, b) => {
    if (sortBy === 'updated') {
      const tb = b.updatedAt || b.createdAt;
      const ta = a.updatedAt || a.createdAt;
      return tb.localeCompare(ta) || b.createdAt.localeCompare(a.createdAt);
    }

    if (sortBy === 'created') {
      return b.createdAt.localeCompare(a.createdAt) || a.order - b.order;
    }

    if (sortBy === 'name') {
      return (
        (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' }) ||
        a.order - b.order
      );
    }

    return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  });
}

function isPinnedFeedItem(entry: HomeFeedItem): boolean {
  return entry.kind === 'doc' ? Boolean(entry.item.isPinned) : false;
}

/**
 * Gộp toàn bộ `DocItem` và `SkillItem` thành danh sách phẳng cho chế độ xem
 * "Gần đây" trên Home, sắp xếp theo tiêu chí người dùng chọn.
 */
export function buildRecentFeed(
  documents: readonly DocItem[],
  skills: readonly SkillItem[],
  sortBy: HomeSortBy,
): HomeFeedItem[] {
  const combined: HomeFeedItem[] = [
    ...documents.map((item): HomeFeedItem => ({ kind: 'doc', item })),
    ...skills.map((item): HomeFeedItem => ({ kind: 'skill', item })),
  ];

  return combined.sort((a, b) => {
    if (sortBy === 'default') {
      const pinDiff = Number(isPinnedFeedItem(b)) - Number(isPinnedFeedItem(a));
      if (pinDiff !== 0) return pinDiff;

      const tb = b.item.updatedAt || b.item.createdAt;
      const ta = a.item.updatedAt || a.item.createdAt;
      return tb.localeCompare(ta) || b.item.createdAt.localeCompare(a.item.createdAt);
    }

    if (sortBy === 'updated') {
      const tb = b.item.updatedAt || b.item.createdAt;
      const ta = a.item.updatedAt || a.item.createdAt;
      return tb.localeCompare(ta) || b.item.createdAt.localeCompare(a.item.createdAt);
    }

    if (sortBy === 'created') {
      const tb = b.item.updatedAt || b.item.createdAt;
      const ta = a.item.updatedAt || a.item.createdAt;
      return b.item.createdAt.localeCompare(a.item.createdAt) || tb.localeCompare(ta);
    }

    // 'name'
    const tb = b.item.updatedAt || b.item.createdAt;
    const ta = a.item.updatedAt || a.item.createdAt;
    return (
      (a.item.title || '').localeCompare(b.item.title || '', 'vi', {
        sensitivity: 'base',
      }) || tb.localeCompare(ta)
    );
  });
}
