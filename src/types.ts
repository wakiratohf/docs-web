export type DocumentType = 'note' | 'markdown';

export interface Folder {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/f/{id} */
  isShared?: boolean;
  /** true = folder được ghim, ưu tiên hiển thị trên cùng (tùy chọn cá nhân, không lộ ra bản công khai) */
  isPinned?: boolean;
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
}
