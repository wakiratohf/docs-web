export type DocumentType = 'note' | 'markdown' | 'html' | 'pdf' | 'embed';

/**
 * Kiểu hiển thị tài liệu bên trong folder:
 *  - 'list'   : danh sách dọc (mặc định)
 *  - 'sticky' : lưới giấy nhớ màu
 *  - 'skill'  : marketplace skill AI — folder chứa SkillItem (KHÔNG phải DocItem),
 *               mỗi skill là một file nén tải lên Google Drive (xem SkillItem).
 */
export type FolderViewType = 'list' | 'sticky' | 'skill';

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
  /**
   * id folder Drive tương ứng (do app tạo) — KHÓA ÁNH XẠ CHÍNH giữa folder web và
   * folder Google Drive. Mọi PDF upload vào folder web này sẽ nằm trong folder
   * Drive mang id đó. undefined = folder web chưa từng được mirror lên Drive
   * (chưa upload PDF nào vào nó). Map theo id (không theo tên) để chịu được đổi
   * tên và hai folder web trùng tên. Xem lib/googleDrive.ts + lib/driveSync.ts.
   */
  driveFolderId?: string;
  /**
   * true = tên folder web đã đổi nhưng folder Drive tương ứng CHƯA đổi tên (vì
   * lúc đổi tên không có Google token). Banner đồng bộ sẽ PATCH lại tên Drive
   * rồi xóa cờ. Chỉ đặt khi folder đã có driveFolderId.
   */
  drivePendingRename?: boolean;
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
  /**
   * Chỉ dùng cho type='pdf'. true = file PDF do CHÍNH APP upload lên Drive nên
   * app đụng được (di chuyển/đổi tên/xóa) qua scope 'drive.file'. false/undefined
   * = PDF dán-link (file của người khác / không do app tạo) → KHÔNG bao giờ đụng
   * tới trên Drive. Chỉ PDF driveOwned mới tham gia đồng bộ folder.
   */
  driveOwned?: boolean;
  /**
   * Chỉ dùng cho type='pdf' driveOwned. true = folderId web đã đổi nhưng vị trí
   * file trên Drive CHƯA khớp (vì lúc move không có Google token). Banner đồng bộ
   * sẽ di chuyển file sang folder Drive đúng rồi xóa cờ. Xem lib/driveSync.ts.
   */
  drivePendingSync?: boolean;
}

/**
 * Một "skill" của AI (tập trung Claude), hiển thị dạng marketplace trong folder
 * có viewType='skill'. Đây là kiểu dữ liệu RIÊNG (không phải DocItem): mỗi skill
 * gồm phần metadata để dựng card + một file nén (.zip) lưu trên Google Drive cho
 * người dùng tải về.
 *
 * Lưu tại users/{uid}/skills/{id}; bản công khai (khi chia sẻ) tại
 * shared/skill/{id} = { skill, ownerId }, hoặc bên trong shared/f/{folderId}/skills
 * khi cả folder skill được chia sẻ.
 */
export interface SkillItem {
  id: string;
  /** Tên skill (hiển thị nổi bật trên card và trang chi tiết). */
  title: string;
  /** Mô tả ngắn một dòng (hiển thị dưới tên trên card marketplace). */
  description: string;
  /** Nội dung Markdown đầy đủ: hướng dẫn dùng / README (trang chi tiết). */
  content: string;
  /** Emoji đại diện hiển thị trên card; undefined = mặc định '🧩'. */
  icon?: string;
  /** Nhãn/danh mục để lọc & hiển thị (vd: 'Claude Code', 'Frontend'). */
  tags?: string[];
  /** Folder skill chứa skill này (luôn có — skill không đứng riêng ngoài folder). */
  folderId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/skill/{id} */
  isShared?: boolean;
  /** Tác giả đóng góp skill (tùy chọn). */
  author?: string;
  // --- File nén (.zip) trên Google Drive ---
  /**
   * Drive fileId của file nén. Với skill upload: file do app tạo, đã đặt công khai
   * "anyone with link" để tải về không cần token. Với skill dán-link: fileId trích
   * từ link Drive người dùng dán (file của họ, phải tự để công khai).
   */
  fileId: string;
  /** Tên file gốc (đặt tên gợi ý khi tải về). undefined với skill dán-link. */
  fileName?: string;
  /** Kích thước file (bytes) để hiển thị. undefined với skill dán-link. */
  fileSize?: number;
  /**
   * true = file nén do CHÍNH APP upload lên Drive (đụng được: xóa qua scope
   * 'drive.file'). false/undefined = dán-link (file của người khác) → KHÔNG đụng
   * tới trên Drive. Chỉ skill driveOwned mới đẩy việc xóa file vào hàng đợi Drive.
   */
  driveOwned?: boolean;
}
