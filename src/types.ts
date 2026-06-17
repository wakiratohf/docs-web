export type DocumentType = 'note' | 'markdown' | 'html' | 'pdf' | 'embed';

/** Kiểu hiển thị tài liệu bên trong folder: danh sách dọc hay lưới sticky note. */
export type FolderViewType = 'list' | 'sticky';

/** Bảng màu cho sticky note (key, suy ra class CSS `sticky-${color}`). */
export type StickyColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'teal'
  | 'gray';

export interface Folder {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/f/{id} */
  isShared?: boolean;
  /** true = folder được ghim, ưu tiên hiển thị trên cùng (tùy chọn cá nhân, không lộ ra bản công khai) */
  isPinned?: boolean;
  /** Kiểu hiển thị tài liệu trong folder; undefined = 'list' (tương thích folder cũ) */
  viewType?: FolderViewType;
}

export interface DocItem {
  id: string;
  type: DocumentType;
  title: string;
  /**
   * note: chuỗi HTML (rich-text); markdown: chuỗi Markdown thuần;
   * html: chuỗi HTML thô do người dùng tự viết;
   * pdf: KHÔNG phải nội dung file mà là Drive fileId của PDF đã upload lên
   *      Google Drive (file công khai, xem qua iframe preview — xem lib/googleDrive.ts).
   * embed: URL GỐC do người dùng dán (YouTube, Google Slides/Docs, Drive, Figma…).
   *      Khi hiển thị, lib/embed.ts tự chuyển sang URL nhúng chuẩn để bỏ vào iframe.
   */
  content: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  /**
   * Tác giả của ghi chú. Mặc định là người đang đăng nhập lúc tạo (tên hiển thị,
   * không có thì lấy email), nhưng sửa được — note có thể do người khác đóng góp,
   * mình chỉ ghi lại. undefined/rỗng = chưa ghi tác giả.
   */
  author?: string;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/d/{id} */
  isShared?: boolean;
  /** true = ghi chú được ghim, ưu tiên hiển thị lên đầu trong folder (tùy chọn cá nhân, không lộ ra bản công khai) */
  isPinned?: boolean;
  /** undefined/rỗng = tài liệu đứng riêng (không folder); có giá trị = thuộc folder đó */
  folderId?: string;
  /** Màu sticky note; chỉ dùng khi folder ở kiểu 'sticky'. undefined = màu mặc định (vàng) */
  color?: StickyColor;
}
