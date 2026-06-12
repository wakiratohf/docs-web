export type DocumentType = 'note' | 'markdown';

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
  /** note: chuỗi HTML; markdown: chuỗi Markdown thuần */
  content: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/d/{id} */
  isShared?: boolean;
  /** undefined/rỗng = tài liệu đứng riêng (không folder); có giá trị = thuộc folder đó */
  folderId?: string;
  /** Màu sticky note; chỉ dùng khi folder ở kiểu 'sticky'. undefined = màu mặc định (vàng) */
  color?: StickyColor;
}
