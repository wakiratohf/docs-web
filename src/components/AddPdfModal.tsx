import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link2, FileUp, FolderOpen, Loader2, Info } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDriveUpload } from '../hooks/useDriveUpload';
import {
  APP_FOLDER_NAME,
  ensureAppFolder,
  ensureWebFolderDrive,
  uploadPdfToDrive,
  makeFilePublic,
  parseDriveFileId,
} from '../lib/googleDrive';

// Hộp thoại "Thêm PDF" với 2 hình thức (2 tab):
//  1. Dán link Drive  — không upload, chỉ trích fileId từ link đã có → lưu.
//  2. Upload file      — đẩy PDF lên Drive của người dùng (folder "Docs Web"),
//                        đặt công khai rồi lưu fileId. Giống luồng cũ.
//
// Mọi ghi dữ liệu đi qua mutator của DocumentsContext (addDocument/updateDocument),
// component KHÔNG tự gọi Firebase write.
//
// VÌ SAO TÁCH 2 BƯỚC Ở TAB UPLOAD (kết nối Drive rồi mới chọn file):
// signInWithPopup CHỈ mở được khi đang có "user gesture" trực tiếp (cú click). Nếu
// gọi popup bên trong sự kiện change của <input type=file> (sau khi đã chọn file),
// gesture đã bị tiêu thụ ⇒ trình duyệt chặn popup. Nên: bấm "Kết nối" xin token
// bằng popup (gesture trực tiếp), token giữ trong bộ nhớ ~50 phút; sau đó bấm
// "Chọn file" mới mở hộp chọn file & upload.

export interface AddPdfModalProps {
  open: boolean;
  // folderId của folder đang xem; bỏ trống = tạo tài liệu lẻ ở trang chủ.
  folderId?: string;
  onCancel: () => void;
  onCreated?: (id: string) => void;
}

type Tab = 'link' | 'upload';

export default function AddPdfModal({
  open,
  folderId,
  onCancel,
  onCreated,
}: AddPdfModalProps) {
  const { addDocument, updateDocument, setFolderDriveId, folders } =
    useDocuments();
  const { toastSuccess, toastError } = useToast();

  // Folder web đang xem (nếu có) — quyết định folder Drive đích để mirror.
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  // Nhãn folder đích hiển thị cho người dùng: "Docs Web ▸ Tên" hoặc "Docs Web".
  const destLabel = folder ? `${APP_FOLDER_NAME} ▸ ${folder.name}` : APP_FOLDER_NAME;

  const [tab, setTab] = useState<Tab>('link');
  const [link, setLink] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  const {
    hasToken,
    busy,
    setBusy,
    dragOver,
    setDragOver,
    inputRef,
    connectDrive,
    pickFile,
    requireFreshToken,
    runUpload,
  } = useDriveUpload();

  // Mỗi lần mở lại: đặt về trạng thái sạch (token Drive giữ nguyên nếu còn hạn
  // — không cần kết nối lại nếu vừa đóng rồi mở lại modal).
  useEffect(() => {
    if (!open) return;
    setTab('link');
    setLink('');
    setLinkTitle('');
    setBusy(false);
    setDragOver(false);
  }, [open]);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  // --- Tab 1: dán link Drive -------------------------------------------------
  const submitLink = () => {
    if (busy) return;
    const fileId = parseDriveFileId(link);
    if (!fileId) {
      toastError('Link Google Drive không hợp lệ — hãy dán link xem/chia sẻ của file PDF.');
      return;
    }
    const title = linkTitle.trim() || 'Tài liệu PDF';
    const created = addDocument('pdf', title, folderId);
    if (!created) {
      toastError('Không tạo được tài liệu.');
      return;
    }
    // driveOwned=false: file dán-link không do app tạo → KHÔNG bao giờ đụng tới
    // trên Drive (di chuyển/đổi tên/xóa folder không áp dụng cho nó).
    updateDocument(created.id, { content: fileId, driveOwned: false });
    toastSuccess('Đã thêm PDF từ link Drive.');
    onCreated?.(created.id);
  };

  // --- Tab 2: upload file (kết nối Drive + chọn/kéo-thả: xem useDriveUpload) --

  // Người dùng chọn file qua hộp chọn file.
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset để lần sau chọn lại đúng file đó vẫn kích hoạt onChange.
    e.target.value = '';
    if (file) void uploadFile(file);
  };

  // Người dùng kéo & thả file vào vùng dropzone.
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    if (!requireFreshToken('Hãy bấm "Kết nối Google Drive" trước khi thả file.')) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  // Đẩy một file PDF lên Drive rồi tạo tài liệu — dùng chung cho cả chọn file và
  // kéo-thả.
  const uploadFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toastError('Chỉ nhận file PDF.');
      return;
    }
    await runUpload(async (token) => {
      // Tính folder Drive đích để MIRROR theo folder web: có folder → "Docs Web /
      // {tên folder}" (tạo nếu chưa có, lưu lại driveFolderId); General → thẳng
      // trong "Docs Web".
      let destFolderId: string;
      if (folder) {
        destFolderId = await ensureWebFolderDrive(
          token,
          folder.name,
          folder.driveFolderId,
        );
        // Lưu lại id folder Drive vào DB nếu vừa tạo mới (hoặc id cũ đã hỏng).
        if (destFolderId !== folder.driveFolderId) {
          setFolderDriveId(folder.id, destFolderId);
        }
      } else {
        destFolderId = await ensureAppFolder(token);
      }
      const fileId = await uploadPdfToDrive(file, token, destFolderId);
      await makeFilePublic(fileId, token);
      // Tạo tài liệu rồi lưu fileId vào content (bỏ đuôi .pdf cho tiêu đề gọn).
      const created = addDocument('pdf', file.name.replace(/\.pdf$/i, ''), folderId);
      if (!created) {
        toastError('Không tạo được tài liệu.');
        return;
      }
      // driveOwned=true: file do app upload → tham gia đồng bộ folder về sau.
      updateDocument(created.id, { content: fileId, driveOwned: true });
      toastSuccess('Đã tải PDF lên.');
      onCreated?.(created.id);
    }, 'Tải PDF thất bại');
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        ref={trapRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-pdf-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <h2 id="add-pdf-title" className="modal-title">
          Thêm PDF
        </h2>

        {/* Bộ chọn hình thức */}
        <div className="pdf-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'link'}
            className={`pdf-tab${tab === 'link' ? ' selected' : ''}`}
            onClick={() => setTab('link')}
          >
            <Link2 size={16} aria-hidden="true" /> Dán link Drive
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            className={`pdf-tab${tab === 'upload' ? ' selected' : ''}`}
            onClick={() => setTab('upload')}
          >
            <FileUp size={16} aria-hidden="true" /> Upload file
          </button>
        </div>

        {tab === 'link' ? (
          <>
            <label className="modal-field-label" htmlFor="add-pdf-link">
              Link Google Drive
            </label>
            <input
              id="add-pdf-link"
              className="modal-input"
              placeholder="https://drive.google.com/file/d/.../view"
              value={link}
              autoFocus
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitLink();
                }
              }}
            />
            <label className="modal-field-label" htmlFor="add-pdf-title-input">
              Tiêu đề
            </label>
            <input
              id="add-pdf-title-input"
              className="modal-input"
              placeholder="Tài liệu PDF"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitLink();
                }
              }}
            />
            <p className="pdf-hint">
              <Info size={14} aria-hidden="true" />
              <span>
                File phải để chế độ "Bất kỳ ai có liên kết đều xem được" thì người
                xem trang chia sẻ mới mở được PDF.
              </span>
            </p>

            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                Hủy
              </button>
              <button type="button" className="primary" onClick={submitLink}>
                Thêm
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Cho người dùng biết file upload sẽ nằm ở đâu trên Drive */}
            <div className="pdf-dest">
              <FolderOpen size={16} aria-hidden="true" />
              <span>
                File sẽ được lưu vào Google&nbsp;Drive của bạn, trong thư mục{' '}
                <strong>{destLabel}</strong>.
              </span>
            </div>

            {!hasToken ? (
              <button
                type="button"
                className="primary pdf-action-btn"
                disabled={busy}
                onClick={connectDrive}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <FileUp size={16} aria-hidden="true" />
                )}{' '}
                {busy ? 'Đang kết nối…' : 'Kết nối Google Drive'}
              </button>
            ) : (
              <div
                className={`pdf-dropzone${dragOver ? ' over' : ''}${busy ? ' busy' : ''}`}
                role="button"
                tabIndex={0}
                aria-disabled={busy}
                onClick={pickFile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickFile();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                {busy ? (
                  <Loader2 className="spin" size={22} aria-hidden="true" />
                ) : (
                  <FileUp size={22} aria-hidden="true" />
                )}
                <span className="pdf-dropzone-text">
                  {busy
                    ? 'Đang tải…'
                    : 'Kéo & thả file PDF vào đây, hoặc bấm để chọn'}
                </span>
              </div>
            )}

            <p className="pdf-hint">
              <Info size={14} aria-hidden="true" />
              <span>
                File sau khi tải lên được đặt công khai "Bất kỳ ai có liên kết" để
                trang chia sẻ xem được.
              </span>
            </p>

            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                Đóng
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={onPick}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
