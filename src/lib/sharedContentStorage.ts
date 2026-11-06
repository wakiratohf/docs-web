/**
 * Quản lý lưu trữ cục bộ cho các highlight cá nhân trên trang xem chia sẻ công khai (/share/*).
 * Giúp người xem thông thường (ẩn danh / không phải chủ sở hữu) giữ lại được các highlight cá nhân
 * của mình khi F5 / tải lại trang mà không làm biến đổi tài liệu gốc của chủ sở hữu.
 */

const STORAGE_PREFIX = 'docs_shared_hl_';

export function getStoredSharedContent(docId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${docId}`);
  } catch {
    return null;
  }
}

export function saveStoredSharedContent(docId: string, content: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docId}`, content);
  } catch {
    // Bỏ qua nếu localStorage bị đầy hoặc bị chặn ở chế độ ẩn danh
  }
}

export function clearStoredSharedContent(docId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${docId}`);
  } catch {
    //
  }
}
