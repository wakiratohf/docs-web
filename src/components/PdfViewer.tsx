import { FileX } from 'lucide-react';
import { drivePreviewUrl } from '../lib/googleDrive';

// Hiển thị PDF (chỉ đọc) bằng iframe preview của Google Drive. fileId chính là
// DocItem.content khi type === 'pdf'. File đã đặt công khai nên iframe chạy được
// cả với người xem ẩn danh trên /share/*.
export default function PdfViewer({ fileId }: { fileId: string }) {
  const id = fileId.trim();
  if (!id) {
    return (
      <p className="warn pdf-empty">
        <FileX size={16} aria-hidden="true" /> Chưa có file PDF.
      </p>
    );
  }
  return (
    <div className="pdf-viewer">
      <iframe
        src={drivePreviewUrl(id)}
        title="Xem PDF"
        className="pdf-frame"
        allow="autoplay"
      />
    </div>
  );
}
