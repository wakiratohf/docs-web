import { useMemo, useState } from 'react';
import { RefreshCw, FolderSync, X } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { getDriveAccessToken } from '../lib/googleDrive';
import {
  collectPending,
  pendingCount,
  runDriveSync,
  type DriveSyncWriters,
} from '../lib/driveSync';

// Banner nhắc đồng bộ cấu trúc folder Google Drive cho khớp với folder web.
//
// Vì sao cần BANNER + nút bấm: mọi thao tác Drive cần access token, mà token chỉ
// xin được trong một "user gesture" (cú click) qua popup. Các mutator (đổi folder
// PDF, đổi tên/xóa folder) là hàm đồng bộ không có token nên chỉ đánh dấu việc
// chờ; người dùng bấm nút ở đây mới thực sự đẩy thay đổi lên Drive.
//
// Banner tự ẩn khi không còn việc chờ (số đếm = 0).
export default function DriveSyncBanner() {
  const {
    documents,
    folders,
    driveSyncQueue,
    setFolderDriveId,
    setDocDriveOwned,
    clearDocPendingSync,
    clearFolderPendingRename,
    removeDriveSyncTask,
  } = useDocuments();
  const { toastSuccess, toastError } = useToast();

  const [busy, setBusy] = useState(false);
  // Người dùng có thể tạm ẩn banner trong phiên (việc chờ vẫn còn, lần sau hiện lại).
  const [dismissed, setDismissed] = useState(false);

  const pending = useMemo(
    () => collectPending(documents, folders, driveSyncQueue),
    [documents, folders, driveSyncQueue],
  );
  const count = pendingCount(pending);

  if (count === 0 || dismissed) return null;

  const onSync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        toastError('Không lấy được quyền Google Drive.');
        return;
      }
      const writers: DriveSyncWriters = {
        setFolderDriveId,
        setDocDriveOwned,
        clearDocPendingSync,
        clearFolderPendingRename,
        removeDriveSyncTask,
      };
      const res = await runDriveSync(token, pending, folders, writers);
      if (res.failed === 0) {
        toastSuccess(`Đã đồng bộ Google Drive (${res.done} mục).`);
      } else if (res.done > 0) {
        toastError(
          `Đồng bộ xong ${res.done} mục, ${res.failed} mục lỗi: ${res.firstError ?? ''}`,
        );
      } else {
        toastError(`Đồng bộ thất bại: ${res.firstError ?? 'lỗi không rõ'}`);
      }
    } catch (err) {
      console.error('[DriveSync] lỗi:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toastError(`Đồng bộ Drive thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drive-sync-banner" role="status">
      <FolderSync size={18} aria-hidden="true" />
      <span className="drive-sync-text">
        Có <strong>{count}</strong> thay đổi folder chưa đồng bộ lên Google Drive.
      </span>
      <button
        type="button"
        className="primary drive-sync-btn"
        disabled={busy}
        onClick={onSync}
      >
        <RefreshCw
          size={15}
          aria-hidden="true"
          className={busy ? 'spin' : undefined}
        />
        {busy ? 'Đang đồng bộ…' : 'Đồng bộ Drive'}
      </button>
      <button
        type="button"
        className="drive-sync-close"
        aria-label="Ẩn nhắc đồng bộ"
        title="Ẩn (lần sau hiện lại)"
        disabled={busy}
        onClick={() => setDismissed(true)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
