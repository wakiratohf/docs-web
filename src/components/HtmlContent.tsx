import DOMPurify from 'dompurify';

// Render nội dung có thể là HTML (note) ở chế độ chỉ đọc.
// ⚠️ Không đặt dangerouslySetInnerHTML cùng children JSX trên cùng một thẻ
// (bản production rút gọn sẽ crash với lỗi React #60) → tách hẳn 2 nhánh return.

// Note được tạo bởi bất kỳ user nào rồi có thể bật chia sẻ công khai (/share/*),
// nơi người xem ẩn danh không đăng nhập cũng thấy được → phải sanitize trước khi
// render để chặn XSS lưu trữ (script/onerror/javascript: nhúng trong content).
// Dùng instance riêng (không phải default export dùng chung) để không ảnh hưởng
// tới cách mermaid tự sanitize SVG sơ đồ bằng cùng gói dompurify.
const purifier = DOMPurify(window);

export default function HtmlContent({ value }: { value: string }) {
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);

  if (looksLikeHtml) {
    return (
      <div
        className="note-content readonly"
        dangerouslySetInnerHTML={{ __html: purifier.sanitize(value) }}
      />
    );
  }

  return (
    <div className="note-content readonly" style={{ whiteSpace: 'pre-wrap' }}>
      {value}
    </div>
  );
}
