import type { DocItem } from '../types';

/**
 * Gom danh sách tác giả đã từng dùng (distinct, đã trim, bỏ rỗng), sắp theo
 * bảng chữ cái tiếng Việt. Dùng để nạp sẵn gợi ý cho ô nhập tác giả — người
 * dùng chọn lại tác giả cũ hoặc gõ tên mới.
 */
export function collectAuthors(documents: DocItem[]): string[] {
  const set = new Set<string>();
  for (const d of documents) {
    const a = d.author?.trim();
    if (a) set.add(a);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}
