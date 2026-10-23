import { useRef, useState, type RefObject } from 'react';
import { useToast } from '../context/ToastContext';
import { getDriveAccessToken } from '../lib/googleDrive';

// Access token Google sống ~1 giờ; trừ hao còn 50 phút cho chắc.
const TOKEN_TTL_MS = 50 * 60 * 1000;
const DEFAULT_EXPIRED_MSG = 'Phiên Drive đã hết hạn — bấm "Kết nối Google Drive" lại.';

export interface UseDriveUpload {
  hasToken: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  /** Gắn vào <input type="file" hidden>; pickFile() mở nó khi token còn hạn. */
  inputRef: RefObject<HTMLInputElement | null>;
  connectDrive: () => Promise<void>;
  /** Mở hộp chọn file nếu token còn hạn; nếu hết hạn thì báo lỗi và buộc kết nối lại. */
  pickFile: () => void;
  /** Trả token còn hạn, hoặc null kèm toast lỗi + buộc kết nối lại nếu hết hạn. */
  requireFreshToken: (expiredMessage?: string) => string | null;
  /**
   * Bọc một thao tác upload: kiểm token, set busy, bắt lỗi (toast + buộc kết
   * nối lại Drive), đảm bảo tắt busy dù thành công hay thất bại.
   */
  runUpload: (
    action: (token: string) => Promise<void>,
    errorPrefix: string,
  ) => Promise<void>;
}

// Dùng chung giữa AddPdfModal (upload PDF) và SkillEditModal (upload .zip):
// cả hai đều cần "kết nối Drive" (popup OAuth, giữ token ~50 phút trong bộ
// nhớ) rồi mới "chọn/kéo-thả file" để upload. Tách 2 bước vì popup OAuth chỉ
// mở được trong gesture trực tiếp của người dùng (xem comment ở AddPdfModal).
export function useDriveUpload(): UseDriveUpload {
  const { toastError } = useToast();
  const tokenRef = useRef<{ value: string; exp: number } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFreshToken = () =>
    tokenRef.current != null && Date.now() < tokenRef.current.exp;

  const invalidateToken = () => {
    tokenRef.current = null;
    setHasToken(false);
  };

  const connectDrive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        toastError('Không lấy được quyền Google Drive.');
        return;
      }
      tokenRef.current = { value: token, exp: Date.now() + TOKEN_TTL_MS };
      setHasToken(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useDriveUpload] kết nối Drive thất bại:', msg);
      toastError(`Kết nối Drive thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const requireFreshToken = (expiredMessage = DEFAULT_EXPIRED_MSG): string | null => {
    if (hasFreshToken()) return tokenRef.current!.value;
    invalidateToken();
    toastError(expiredMessage);
    return null;
  };

  const pickFile = () => {
    if (busy) return;
    if (!requireFreshToken()) return;
    inputRef.current?.click();
  };

  const runUpload = async (
    action: (token: string) => Promise<void>,
    errorPrefix: string,
  ) => {
    if (busy) return;
    const token = requireFreshToken('Mất kết nối Drive — bấm "Kết nối Google Drive" lại.');
    if (!token) return;
    setBusy(true);
    try {
      await action(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Lộ nguyên nhân thật để chẩn đoán (Drive API chưa bật, thiếu scope…).
      console.error(`[useDriveUpload] ${errorPrefix}:`, msg);
      // Token có thể đã hết hạn/bị thu hồi → buộc kết nối lại lần sau.
      invalidateToken();
      toastError(`${errorPrefix}: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return {
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
  };
}
