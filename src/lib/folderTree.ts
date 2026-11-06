import type { DocItem, Folder } from '../types';

/** Độ sâu tối đa khuyến nghị của cây thư mục (Root = cấp 1). */
export const MAX_FOLDER_DEPTH = 5;

/** Lấy danh sách thư mục gốc (không có parentId). */
export function getRootFolders(folders: readonly Folder[]): Folder[] {
  return folders.filter((f) => !f.parentId);
}

/**
 * Lấy danh sách thư mục con trực tiếp của một folderId.
 * Sắp xếp theo ưu tiên: ghim (isPinned) → order → createdAt.
 */
export function getSubfolders(
  parentId: string,
  folders: readonly Folder[],
): Folder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort(
      (a, b) =>
        Number(b.isPinned ?? false) - Number(a.isPinned ?? false) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/**
 * Lấy danh sách các thư mục tổ tiên từ Root đến cha trực tiếp của `folderId`.
 * Ví dụ: nếu C nằm trong B, B nằm trong A → trả về [A, B].
 * Dùng Set ngăn chặn vòng lặp vô hạn nếu dữ liệu bị lỗi chu trình.
 */
export function getFolderAncestors(
  folderId: string,
  folders: readonly Folder[],
): Folder[] {
  const map = new Map<string, Folder>(folders.map((f) => [f.id, f]));
  const ancestors: Folder[] = [];
  const visited = new Set<string>([folderId]);

  let current = map.get(folderId);
  while (current?.parentId) {
    if (visited.has(current.parentId)) {
      // Phát hiện vòng lặp dữ liệu, dừng lại ngay để tránh treo trình duyệt
      break;
    }
    visited.add(current.parentId);
    const parent = map.get(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
}

/**
 * Lấy chuỗi breadcrumb đầy đủ bao gồm từ Root đến chính thư mục hiện tại.
 * Ví dụ: [A, B, C].
 */
export function getFolderBreadcrumb(
  folderId: string,
  folders: readonly Folder[],
): Folder[] {
  const current = folders.find((f) => f.id === folderId);
  if (!current) return [];
  const ancestors = getFolderAncestors(folderId, folders);
  return [...ancestors, current];
}

/**
 * Lấy độ sâu hiện tại của một thư mục (Root = cấp 1, con trực tiếp = cấp 2,...).
 */
export function getFolderDepth(
  folderId: string,
  folders: readonly Folder[],
): number {
  return getFolderAncestors(folderId, folders).length + 1;
}

/**
 * Lấy toàn bộ ID của các thư mục con cháu (descendants) đệ quy.
 * Dùng khi xóa cả cây thư mục hoặc kiểm tra tính hợp lệ khi di chuyển.
 */
export function getFolderDescendantIds(
  folderId: string,
  folders: readonly Folder[],
): string[] {
  const result: string[] = [];
  const visited = new Set<string>([folderId]);
  const queue: string[] = [folderId];

  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const f of folders) {
      if (f.parentId === parent && !visited.has(f.id)) {
        visited.add(f.id);
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }

  return result;
}

/**
 * Tính chiều cao tối đa của cây con xuất phát từ `folderId` (chính nó = 1).
 */
export function getSubtreeHeight(
  folderId: string,
  folders: readonly Folder[],
): number {
  const children = folders.filter((f) => f.parentId === folderId);
  if (children.length === 0) return 1;
  let maxHeight = 0;
  for (const child of children) {
    const h = getSubtreeHeight(child.id, folders);
    if (h > maxHeight) maxHeight = h;
  }
  return maxHeight + 1;
}

/**
 * Kiểm tra xem thao tác di chuyển folder có hợp lệ không:
 *  - Không được chuyển vào chính nó (`targetParentId === sourceId`).
 *  - Không được chuyển vào bất kỳ con cháu nào của nó.
 *  - Chiều sâu sau khi chuyển không được vượt quá `MAX_FOLDER_DEPTH`.
 */
export function isValidMoveFolder(
  sourceId: string,
  targetParentId: string | undefined,
  folders: readonly Folder[],
): boolean {
  // Chuyển ra root (undefined/rỗng) luôn hợp lệ nếu source hiện có parent
  if (!targetParentId) {
    return true;
  }

  // Không thể làm con của chính nó
  if (sourceId === targetParentId) {
    return false;
  }

  // Thư mục đích phải tồn tại
  const target = folders.find((f) => f.id === targetParentId);
  if (!target) {
    return false;
  }

  // Không được chuyển vào con cháu của chính nó (chống vòng lặp)
  const descendants = getFolderDescendantIds(sourceId, folders);
  if (descendants.includes(targetParentId)) {
    return false;
  }

  // Kiểm tra độ sâu sau khi chuyển:
  // targetDepth + subtreeHeightOfSource <= MAX_FOLDER_DEPTH
  const targetDepth = getFolderDepth(targetParentId, folders);
  const sourceHeight = getSubtreeHeight(sourceId, folders);
  if (targetDepth + sourceHeight > MAX_FOLDER_DEPTH) {
    return false;
  }

  return true;
}

export interface FolderTreeOptionItem {
  value: string;
  label: string;
  depth: number;
  folder: Folder;
}

/**
 * Dựng danh sách phẳng theo thứ tự duyệt cây (DFS) có thụt lề trực quan,
 * dùng cho các Dropdown chọn folder.
 *
 * @param folders Danh sách toàn bộ folder
 * @param excludeId Tùy chọn ID folder cần loại trừ (loại cả nó và toàn bộ con cháu,
 *                  dùng khi chọn folder cha đích để tránh di chuyển vào con cháu).
 */
export function buildFolderTreeOptions(
  folders: readonly Folder[],
  excludeId?: string,
): FolderTreeOptionItem[] {
  const excludedSet = new Set<string>();
  if (excludeId) {
    excludedSet.add(excludeId);
    for (const dId of getFolderDescendantIds(excludeId, folders)) {
      excludedSet.add(dId);
    }
  }

  const validFolders = folders.filter((f) => !excludedSet.has(f.id));
  const subfoldersByParent = new Map<string, Folder[]>();

  for (const f of validFolders) {
    const pId = f.parentId ?? '';
    const list = subfoldersByParent.get(pId);
    if (list) list.push(f);
    else subfoldersByParent.set(pId, [f]);
  }

  // Sắp xếp các danh sách con theo order rồi createdAt
  for (const list of subfoldersByParent.values()) {
    list.sort(
      (a, b) =>
        Number(b.isPinned ?? false) - Number(a.isPinned ?? false) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }

  const result: FolderTreeOptionItem[] = [];

  function walk(parentId: string, depth: number) {
    const children = subfoldersByParent.get(parentId);
    if (!children) return;
    for (const child of children) {
      const indent = depth > 0 ? ' '.repeat((depth - 1) * 2) + '└─ ' : '';
      result.push({
        value: child.id,
        label: `${indent}${child.name}`,
        depth,
        folder: child,
      });
      walk(child.id, depth + 1);
    }
  }

  walk('', 0);
  return result;
}

/**
 * Đếm tổng số tài liệu của một folder bao gồm cả tất cả các sub-folder con cháu bên trong.
 */
export function countAllDocsInTree(
  folderId: string,
  folders: readonly Folder[],
  docsByFolder: ReadonlyMap<string, DocItem[]>,
): number {
  const allIds = [folderId, ...getFolderDescendantIds(folderId, folders)];
  let total = 0;
  for (const id of allIds) {
    total += docsByFolder.get(id)?.length ?? 0;
  }
  return total;
}
