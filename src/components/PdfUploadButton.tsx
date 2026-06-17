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

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset để lần sau chọn lại đúng file đó vẫn kích hoạt onChange.
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toastError('Chỉ nhận file PDF.');
      return;
    }
    setBusy(true);
    try {
      // Xin token Drive tươi NGAY trước khi upload (Firebase không giữ token này).
      const token = await getDriveAccessToken();
      if (!token) {
        toastError('Không lấy được quyền Google Drive.');
        return;
      }
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
    } catch {
      toastError('Tải PDF thất bại — thử lại hoặc kiểm tra quyền Drive.');
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
        onClick={() => inputRef.current?.click()}
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
