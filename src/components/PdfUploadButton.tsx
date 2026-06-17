import { useRef, useState, type ChangeEvent } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import {
  getDriveAccessToken,
  uploadPdfToDrive,
  makeFilePublic,
} from '../lib/googleDrive';

// Nút tải PDF lên Google Drive rồi tạo một tài liệu type 'pdf' (content = fileId).
// Tái dùng ở trang chủ và trong folder. Mọi ghi dữ liệu đi qua mutator của
// DocumentsContext (addDocument/updateDocument), không tự gọi Firebase write.
//
// VÌ SAO TÁCH 2 BƯỚC (kết nối Drive rồi mới chọn file):
// signInWithPopup CHỈ được phép mở khi đang có "user gesture" trực tiếp (cú click
// nút). Nếu gọi popup bên trong sự kiện change của ô <input type=file> (tức sau khi
// đã chọn file), gesture đã bị tiêu thụ cho hộp thoại chọn file ⇒ trình duyệt chặn
// popup (auth/popup-blocked). Nên: lần bấm đầu xin token bằng popup (gesture trực
// tiếp), token giữ trong bộ nhớ ~50 phút; bấm lần sau mới mở hộp chọn file & upload.
export default function PdfUploadButton({
  folderId,
  onCreated,
}: {
  folderId?: string;
  onCreated?: (id: string) => void;
}) {
  const { addDocument, updateDocument } = useDocuments();
  const { toastSuccess, toastError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Token Drive còn hạn, giữ trong bộ nhớ (mất khi reload — Firebase không lưu).
  const tokenRef = useRef<{ value: string; exp: number } | null>(null);

  const hasFreshToken = () =>
    tokenRef.current != null && Date.now() < tokenRef.current.exp;

  const onClick = async () => {
    if (busy) return;
    // Đã có token còn hạn → mở hộp chọn file ngay trong cú click này (gesture trực tiếp).
    if (hasFreshToken()) {
      inputRef.current?.click();
      return;
    }
    // Chưa có token → xin bằng popup NGAY trong cú click (tránh popup-blocked).
    setBusy(true);
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        toastError('Không lấy được quyền Google Drive.');
        return;
      }
      // Access token của Google sống ~1 giờ; trừ hao còn 50 phút cho chắc.
      tokenRef.current = { value: token, exp: Date.now() + 50 * 60 * 1000 };
      toastSuccess('Đã kết nối Google Drive — bấm "New PDF" lần nữa để chọn file.');
    } catch (err) {
      console.error('[PdfUpload] kết nối Drive thất bại:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toastError(`Kết nối Drive thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset để lần sau chọn lại đúng file đó vẫn kích hoạt onChange.
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toastError('Chỉ nhận file PDF.');
      return;
    }
    const token = tokenRef.current?.value;
    if (!token) {
      toastError('Mất kết nối Drive — bấm "New PDF" để kết nối lại.');
      return;
    }
    setBusy(true);
    try {
      const fileId = await uploadPdfToDrive(file, token);
      await makeFilePublic(fileId, token);
      // Tạo tài liệu rồi lưu fileId vào content (bỏ đuôi .pdf cho tiêu đề gọn).
      const created = addDocument('pdf', file.name.replace(/\.pdf$/i, ''), folderId);
      if (!created) {
        toastError('Không tạo được tài liệu.');
        return;
      }
      updateDocument(created.id, { content: fileId });
      toastSuccess('Đã tải PDF lên.');
      onCreated?.(created.id);
    } catch (err) {
      // Lộ nguyên nhân thật để chẩn đoán (Drive API chưa bật, thiếu scope…).
      console.error('[PdfUpload] thất bại:', err);
      const msg = err instanceof Error ? err.message : String(err);
      // Token có thể đã hết hạn/bị thu hồi → buộc kết nối lại lần sau.
      tokenRef.current = null;
      toastError(`Tải PDF thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-icon primary"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? (
          <Loader2 className="spin" size={16} aria-hidden="true" />
        ) : (
          <FileUp size={16} aria-hidden="true" />
        )}{' '}
        {busy ? 'Đang tải…' : 'New PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={onPick}
      />
    </>
  );
}
