import { useEffect, useRef, useState } from 'react';
import { FileX, ExternalLink } from 'lucide-react';
import { drivePreviewUrl } from '../lib/googleDrive';
import Spinner from './Spinner';

const LOAD_TIMEOUT_MS = 10000;

// Hiển thị PDF (chỉ đọc) bằng iframe preview của Google Drive. fileId chính là
// DocItem.content khi type === 'pdf'. File đã đặt công khai nên iframe chạy được
// cả với người xem ẩn danh trên /share/*.
export default function PdfViewer({ fileId }: { fileId: string }) {
  const id = fileId.trim();
  const [loaded, setLoaded] = useState(false);
  // Iframe nhúng Drive là cross-origin nên không bắt được lỗi tải thật sự —
  // chỉ có thể đoán qua timeout: quá lâu chưa load xong thường là file bị thu
  // hồi quyền public hoặc id sai.
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    if (!id) return;
    timerRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id]);

  if (!id) {
    return (
      <p className="warn pdf-empty">
        <FileX size={16} aria-hidden="true" /> Chưa có file PDF.
      </p>
    );
  }

  const previewUrl = drivePreviewUrl(id);

  return (
    <div className="pdf-viewer">
      {!loaded && (
        <div className="pdf-loading">
          <Spinner label="Đang tải PDF…" />
          {timedOut && (
            <p className="warn pdf-timeout">
              Tải hơi lâu — file có thể đã bị thu hồi quyền xem công khai. Thử{' '}
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                mở trong tab mới <ExternalLink size={12} aria-hidden="true" />
              </a>
              .
            </p>
          )}
        </div>
      )}
      <iframe
        src={previewUrl}
        title="Xem PDF"
        className="pdf-frame"
        allow="autoplay"
        style={loaded ? undefined : { visibility: 'hidden', height: 0 }}
        onLoad={() => {
          setLoaded(true);
          if (timerRef.current) clearTimeout(timerRef.current);
        }}
      />
    </div>
  );
}
