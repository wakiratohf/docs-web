// Đồng bộ TRỄ cấu trúc folder Google Drive cho khớp với folder web.
//
// Bối cảnh: mọi mutator của DocumentsContext là hàm đồng bộ và KHÔNG có Google
// access token (token cần popup OAuth = user gesture). Vì vậy khi user đổi folder
// PDF / đổi tên / xóa folder web, ta chỉ ghi DB + đánh dấu việc Drive đang chờ
// (cờ drivePendingSync / drivePendingRename, hoặc task trong driveSyncQueue).
// Module này gom các việc chờ đó và THỰC THI lên Drive khi banner xin được token.
//
// Nguyên tắc: web là nguồn sự thật, Drive chạy theo sau. Mọi thao tác idempotent
// (lặp lại vô hại): 404 = coi như xong, 403 = bỏ qua item (không phải file của
// app), 401 = token hết hạn → dừng sạch, giữ cờ còn lại cho lần sau.

import type { DocItem, Folder } from '../types';
import type { DriveDeleteTask } from '../context/DocumentsContext';
import {
  DriveHttpError,
  ensureAppFolder,
  ensureWebFolderDrive,
  moveDriveFile,
  renameDriveFolder,
  deleteDriveFolder,
  deleteFileFromDrive,
} from './googleDrive';

/** Các việc Drive đang chờ, gom từ state hiện tại (không cần token). */
export interface DrivePending {
  /** PDF đã đổi folder web, cần di chuyển file trên Drive. */
  pendingMoves: DocItem[];
  /** Folder web đã đổi tên, cần đổi tên folder Drive. */
  pendingRenames: Folder[];
  /** Folder web đã xóa, cần xóa folder Drive (từ hàng đợi). */
  deleteTasks: DriveDeleteTask[];
}

/** Các mutator (từ DocumentsContext) mà runDriveSync gọi để ghi kết quả về DB. */
export interface DriveSyncWriters {
  setFolderDriveId: (folderId: string, driveFolderId: string) => void;
  setDocDriveOwned: (id: string, owned: boolean) => void;
  clearDocPendingSync: (id: string) => void;
  clearFolderPendingRename: (id: string) => void;
  removeDriveSyncTask: (taskId: string) => void;
}

export interface DriveSyncResult {
  done: number;
  failed: number;
  firstError?: string;
}

/**
 * Gom danh sách việc đang chờ từ state hiện tại. Chạy thuần trên dữ liệu, không
 * gọi mạng — dùng để hiện số lượng trên banner.
 */
export function collectPending(
  documents: DocItem[],
  folders: Folder[],
  queue: DriveDeleteTask[],
): DrivePending {
  return {
    // driveOwned===false (dán-link) đã không bao giờ được gắn cờ, nhưng lọc lại
    // cho chắc; undefined (PDF cũ) vẫn nhận để tự phân loại lúc sync.
    pendingMoves: documents.filter(
      (d) =>
        d.type === 'pdf' &&
        d.drivePendingSync === true &&
        d.driveOwned !== false &&
        d.content.trim() !== '',
    ),
    pendingRenames: folders.filter(
      (f) => f.drivePendingRename === true && !!f.driveFolderId,
    ),
    deleteTasks: queue,
  };
}

/** Tổng số việc đang chờ (để hiện badge trên banner). */
export function pendingCount(p: DrivePending): number {
  return p.pendingMoves.length + p.pendingRenames.length + p.deleteTasks.length;
}

/** Lấy mã HTTP nếu là lỗi Drive đã biết, ngược lại null. */
function statusOf(err: unknown): number | null {
  return err instanceof DriveHttpError ? err.status : null;
}

/** Lỗi báo hiệu phải DỪNG cả vòng đồng bộ (token hết hạn). */
class StopSyncError extends Error {}

/**
 * Thực thi toàn bộ việc đang chờ lên Drive. CẦN token tươi (gọi sau user gesture).
 * Thứ tự: rename → move → delete. Mỗi item xong ghi DB ngay (tiến độ bền vững,
 * idempotent). Gặp 401 → dừng, giữ phần còn lại cho lần sau.
 */
export async function runDriveSync(
  token: string,
  pending: DrivePending,
  folders: Folder[],
  writers: DriveSyncWriters,
): Promise<DriveSyncResult> {
  let done = 0;
  let failed = 0;
  let firstError: string | undefined;

  // Nhớ folder Drive đã giải quyết trong LẦN CHẠY này, để nhiều file cùng dồn vào
  // một folder web mới chỉ tạo folder Drive một lần (folders là snapshot, không
  // tự cập nhật driveFolderId sau khi ta vừa tạo).
  const resolvedDrive = new Map<string, string>();

  const note = (err: unknown) => {
    failed += 1;
    if (!firstError) firstError = err instanceof Error ? err.message : String(err);
  };

  try {
    // 1) RENAME folder Drive theo tên web hiện tại.
    for (const f of pending.pendingRenames) {
      if (!f.driveFolderId) continue;
      try {
        await renameDriveFolder(token, f.driveFolderId, f.name);
        writers.clearFolderPendingRename(f.id);
        done += 1;
      } catch (err) {
        const s = statusOf(err);
        if (s === 401) throw new StopSyncError();
        // 404 = folder Drive đã không còn → không có gì để đổi tên, coi như xong.
        // 403 = không đụng được → bỏ qua, gỡ cờ để khỏi nагging mãi.
        if (s === 404 || s === 403) {
          writers.clearFolderPendingRename(f.id);
          if (s === 403) note(err);
          else done += 1;
        } else {
          note(err);
        }
      }
    }

    // 2) MOVE từng PDF tới folder Drive khớp folder web hiện tại.
    for (const d of pending.pendingMoves) {
      try {
        const target = await resolveTargetDrive(
          token,
          d.folderId,
          folders,
          resolvedDrive,
          writers,
        );
        await moveDriveFile(token, d.content, target);
        // Di chuyển được ⇒ chắc chắn file do app tạo.
        if (d.driveOwned !== true) writers.setDocDriveOwned(d.id, true);
        writers.clearDocPendingSync(d.id);
        done += 1;
      } catch (err) {
        const s = statusOf(err);
        if (s === 401) throw new StopSyncError();
        if (s === 403) {
          // Không phải file của app (dán-link cũ) → đánh dấu để lần sau bỏ qua.
          writers.setDocDriveOwned(d.id, false);
          writers.clearDocPendingSync(d.id);
          note(err);
        } else if (s === 404) {
          // File đã bị xóa trên Drive → hết việc, gỡ cờ.
          writers.clearDocPendingSync(d.id);
          done += 1;
        } else {
          note(err);
        }
      }
    }

    // 3) DELETE trên Drive (folder web đã xóa, hoặc file nén của skill đã xóa).
    for (const task of pending.deleteTasks) {
      try {
        if (task.kind === 'deleteFile') {
          // Xóa file lẻ (vd: file nén của skill). Thiếu fileId thì coi như xong.
          if (task.fileId) await deleteFileFromDrive(task.fileId, token);
        } else {
          // deleteFolder: thiếu driveFolderId thì không có gì để xóa.
          if (task.driveFolderId) await deleteDriveFolder(token, task.driveFolderId);
        }
        writers.removeDriveSyncTask(task.id);
        done += 1;
      } catch (err) {
        const s = statusOf(err);
        if (s === 401) throw new StopSyncError();
        // 403 = không xóa được (không phải của app) → bỏ task để khỏi kẹt mãi.
        writers.removeDriveSyncTask(task.id);
        note(err);
      }
    }
  } catch (err) {
    if (!(err instanceof StopSyncError)) throw err;
    // Token hết hạn: dừng sạch. Phần chưa làm vẫn còn cờ cho lần sau.
    if (!firstError) firstError = 'Phiên Google Drive đã hết hạn.';
  }

  return { done, failed, firstError };
}

/**
 * Suy ra folderId Drive đích cho một PDF theo folderId web hiện tại của nó:
 *  - không folder (General) → folder gốc "Docs Web".
 *  - có folder → folder Drive của folder web đó (tạo nếu chưa có, lưu lại id).
 * Dùng cache trong-lần-chạy để tránh tạo trùng khi nhiều file cùng folder.
 */
async function resolveTargetDrive(
  token: string,
  webFolderId: string | undefined,
  folders: Folder[],
  resolvedDrive: Map<string, string>,
  writers: DriveSyncWriters,
): Promise<string> {
  if (!webFolderId) return ensureAppFolder(token);

  const cached = resolvedDrive.get(webFolderId);
  if (cached) return cached;

  const folder = folders.find((f) => f.id === webFolderId);
  // Folder không còn (bị xóa song song) → đưa file về folder gốc cho an toàn.
  if (!folder) return ensureAppFolder(token);

  const driveId = await ensureWebFolderDrive(
    token,
    folder.name,
    folder.driveFolderId,
  );
  if (driveId !== folder.driveFolderId) {
    writers.setFolderDriveId(folder.id, driveId);
  }
  resolvedDrive.set(webFolderId, driveId);
  return driveId;
}
