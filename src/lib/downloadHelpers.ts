import type { DocItem } from '../types';

// Bỏ ký tự không hợp lệ trong tên file (cấm trên Windows/macOS), gộp khoảng
// trắng và cắt bớt cho gọn. Tiêu đề rỗng thì dùng tên mặc định.
function safeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim();
  return cleaned || 'tai-lieu';
}

// Thoát các ký tự đặc biệt khi nhúng tiêu đề vào thẻ <title>.
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c,
  );
}

// Bọc nội dung HTML (loại 'note', vốn chỉ là phần thân) thành một trang HTML
// hoàn chỉnh có charset UTF-8, để file tải về mở được độc lập trên trình duyệt.
function wrapHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title.trim() || 'Tài liệu');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

// Tải tài liệu về máy người xem: note → file .html, markdown → file .md.
// Dùng Blob + thẻ <a download> tạm rồi tự dọn dẹp (cách tải file thuần client).
export function downloadDocument(doc: DocItem): void {
  // note (rich-text) & html (mã thô) đều xuất .html; markdown ⇒ .md.
  const isHtmlFile = doc.type === 'note' || doc.type === 'html';
  const ext = isHtmlFile ? 'html' : 'md';
  const mime = isHtmlFile ? 'text/html' : 'text/markdown';
  // note là fragment ⇒ bọc thành trang đầy đủ. html đã là file hoàn chỉnh
  // (hoặc do người dùng tự viết) ⇒ giữ nguyên, không bọc lồng thêm lần nữa.
  const content =
    doc.type === 'note' ? wrapHtml(doc.title, doc.content) : doc.content;

  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(doc.title)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
