import { get, ref, type Database } from 'firebase/database';
import type { Folder } from '../types';
import { getSharedAncestors } from './folderTree';

/**
 * Trang /share/* nằm NGOÀI DocumentsProvider nên khi chủ sở hữu tô sáng ngay trên
 * trang công khai, trang phải tự ghi Firebase. Để giữ "shared mirror" khớp, cần biết
 * MỌI folder tổ tiên đang chia sẻ chứa tài liệu → phải đọc cây folder riêng của chủ.
 *
 * Đọc một lần (không đọc lại mỗi lần tô sáng). Lỗi/không có dữ liệu ⇒ null để nơi gọi
 * rơi về cách đồng bộ dự phòng.
 */
export async function loadOwnerFolders(
  database: Database,
  uid: string,
): Promise<Folder[] | null> {
  try {
    const snap = await get(ref(database, `users/${uid}/folders`));
    const val = snap.val() as Record<string, Folder> | null;
    return val ? Object.values(val) : [];
  } catch {
    return null;
  }
}

/**
 * Dựng các đường dẫn shared/f/{sf}/documents/{docId}/content|updatedAt cho mọi folder
 * đang chia sẻ chứa tài liệu (chính folder của nó + tổ tiên).
 *
 * @param folders cây folder của chủ sở hữu; null = không đọc được ⇒ chỉ dùng fallback.
 * @param fallbackFolderIds folder đã biết chắc đang chia sẻ & chứa tài liệu (vd. folder
 *        công khai đang xem) — luôn được ghi, gộp không trùng với tổ tiên tính được.
 */
export function sharedFolderContentWrites(
  folders: readonly Folder[] | null,
  folderId: string | undefined,
  docId: string,
  content: string,
  now: string,
  fallbackFolderIds: readonly string[] = [],
): Record<string, unknown> {
  const ids = new Set<string>(fallbackFolderIds);
  if (folders) {
    for (const sf of getSharedAncestors(folders, folderId)) ids.add(sf.id);
  }
  const writes: Record<string, unknown> = {};
  for (const sfId of ids) {
    writes[`shared/f/${sfId}/documents/${docId}/content`] = content;
    writes[`shared/f/${sfId}/documents/${docId}/updatedAt`] = now;
  }
  return writes;
}
