/**
 * Quản lý lưu trữ cục bộ cho các highlight cá nhân trên trang xem chia sẻ công khai (/share/*).
 * Giúp người xem thông thường (ẩn danh / không phải chủ sở hữu) giữ lại được các highlight cá nhân
 * của mình khi F5 / tải lại trang mà không làm biến đổi tài liệu gốc của chủ sở hữu.
 *
 * Khi tác giả ghi đè hoặc sửa nội dung gốc trên server (baseContent thay đổi),
 * bản highlight cục bộ cũ không còn khớp nữa và sẽ tự động được dọn bỏ để hiển thị
 * nội dung mới nhất từ server.
 */

const STORAGE_PREFIX = 'docs_shared_hl_';
const BASE_STORAGE_PREFIX = 'docs_shared_hl_base_';

/**
 * Loại bỏ các đánh dấu cá nhân (highlight HTML/Markdown & trạng thái checkbox)
 * để kiểm tra tương thích với các bản cache cũ chưa lưu baseContent.
 */
function stripSharedAnnotations(text: string): string {
  let res = text;
  let prev = '';
  while (res !== prev) {
    prev = res;
    res = res.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
  }
  res = res.replace(/==(?:[a-z]+:)?([\s\S]*?)==/g, '$1');
  res = res.replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, '$1[ ]');
  return res;
}

export function getStoredSharedContent(docId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${docId}`);
  } catch {
    return null;
  }
}

export function getStoredSharedBaseContent(docId: string): string | null {
  try {
    return localStorage.getItem(`${BASE_STORAGE_PREFIX}${docId}`);
  } catch {
    return null;
  }
}

export function saveStoredSharedContent(
  docId: string,
  content: string,
  baseContent?: string,
): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docId}`, content);
    if (baseContent !== undefined) {
      localStorage.setItem(`${BASE_STORAGE_PREFIX}${docId}`, baseContent);
    }
  } catch {
    // Bỏ qua nếu localStorage bị đầy hoặc bị chặn ở chế độ ẩn danh
  }
}

export function clearStoredSharedContent(docId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${docId}`);
    localStorage.removeItem(`${BASE_STORAGE_PREFIX}${docId}`);
  } catch {
    //
  }
}

/**
 * Quyết định nội dung hiển thị cho người xem trên trang chia sẻ khi nhận dữ liệu từ server:
 * - Nếu chưa có cache cục bộ hoặc cache trùng bản server ⇒ dùng thẳng bản server.
 * - Nếu tác giả đã sửa/ghi đè nội dung gốc trên server (khác baseContent lúc tô sáng) ⇒
 *   xóa cache cũ và trả về nội dung mới nhất từ server.
 * - Nếu nội dung gốc trên server không đổi ⇒ giữ lại highlight cá nhân của người xem.
 */
export function resolveSharedContent(
  docId: string,
  serverContent: string,
): { content: string; hasLocalHighlights: boolean } {
  const cached = getStoredSharedContent(docId);
  if (!cached || cached === serverContent) {
    if (cached === serverContent) {
      clearStoredSharedContent(docId);
    }
    return { content: serverContent, hasLocalHighlights: false };
  }

  const cachedBase = getStoredSharedBaseContent(docId);
  if (cachedBase !== null) {
    if (cachedBase !== serverContent) {
      clearStoredSharedContent(docId);
      return { content: serverContent, hasLocalHighlights: false };
    }
    return { content: cached, hasLocalHighlights: true };
  }

  // Tương thích ngược cho bản cache cũ chưa lưu baseContent: so sánh phần văn bản gốc
  if (stripSharedAnnotations(cached) !== stripSharedAnnotations(serverContent)) {
    clearStoredSharedContent(docId);
    return { content: serverContent, hasLocalHighlights: false };
  }

  saveStoredSharedContent(docId, cached, serverContent);
  return { content: cached, hasLocalHighlights: true };
}
