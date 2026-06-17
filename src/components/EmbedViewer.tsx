import { Link2Off } from 'lucide-react';
import { toEmbedUrl } from '../lib/embed';

// Hiển thị (chỉ đọc) nội dung nhúng từ một link ngoài. `value` là URL gốc người
// dùng dán (DocItem.content khi type === 'embed'); toEmbedUrl tự đổi sang URL
// nhúng chuẩn. Dùng được cả với người xem ẩn danh trên /share/* (chỉ là iframe).
export default function EmbedViewer({ value }: { value: string }) {
  const { url } = toEmbedUrl(value);
  if (!url) {
    return (
      <p className="warn embed-empty">
        <Link2Off size={16} aria-hidden="true" />{' '}
        {value.trim() ? 'Link không hợp lệ (cần dạng http/https).' : 'Chưa có link nhúng.'}
      </p>
    );
  }
  return (
    <div className="embed-viewer">
      <iframe
        src={url}
        title="Nội dung nhúng"
        className="embed-frame"
        allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
