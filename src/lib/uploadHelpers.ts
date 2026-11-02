import type { DocumentType } from '../types';
import { htmlToMarkdown, isMeaningfulHtml } from './htmlToMarkdown';

// Một tài liệu sắp được tạo từ file: nội dung đã đọc xong, sẵn sàng ghi.
export interface UploadItem {
  type: DocumentType;
  title: string;
  content: string;
}

// Kích thước tối đa cho 1 file văn bản tải lên (8MB để an toàn với giới hạn 10MB của Firebase Realtime DB)
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

// Danh sách phần mở rộng nhị phân không thể lưu trực tiếp thành chuỗi văn bản trong Realtime DB
export const BINARY_EXTENSIONS = new Set([
  'pdf',
  'zip', 'tar', 'gz', '7z', 'rar',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
  'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg',
  'exe', 'dll', 'bin', 'iso', 'dmg',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);

export function isBinaryFileName(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

// Phần mở rộng file (đã hạ chữ thường) → suy ra loại tài liệu.
// .html/.htm/.xhtml là nội dung HTML ⇒ 'html' (giữ nguyên mã thô); còn lại coi như văn bản/Markdown thuần.
export function detectType(name: string): DocumentType {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return 'html';
  if (ext === 'pdf') return 'pdf';
  return 'markdown';
}

// Bỏ phần mở rộng để làm tiêu đề mặc định ("ghi-chu.md" → "ghi-chu").
export function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// Nếu file là một trang HTML đầy đủ (<html>/<body>) thì chỉ lấy phần thân,
// để khi render bằng dangerouslySetInnerHTML không dính thẻ head/title lạc lõng.
export function extractHtmlBody(raw: string): string {
  if (/<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    try {
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      return parsed.body?.innerHTML ?? raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

// Đọc nội dung text của các file rồi dựng thành UploadItem (chưa ghi vào DB).
// Không lưu file gốc — chỉ lấy nội dung văn bản bên trong.
export async function filesToItems(
  files: File[],
): Promise<UploadItem[]> {
  const contents = await Promise.all(files.map((f) => f.text()));
  return files.map((f, i) => {
    const type = detectType(f.name);
    let content = contents[i];
    const isHtmlExt = /\.(html|htm|xhtml)$/i.test(f.name);
    if (type === 'note') {
      content = extractHtmlBody(content);
    } else if (isHtmlExt && type === 'markdown' && isMeaningfulHtml(content)) {
      content = htmlToMarkdown(content);
    }
    return {
      type,
      title: stripExt(f.name),
      // note: chỉ lấy phần thân (rich-text là fragment). html: GIỮ NGUYÊN cả
      // file (head/style/link) để render độc lập trong iframe, không mất CSS.
      content,
    };
  });
}
