import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

// Tương tác với Google Drive để lưu & xem PDF mà KHÔNG dùng Firebase Storage.
//
// Cơ chế: PDF được upload lên Drive của chính người dùng (qua REST API), đặt
// quyền công khai "anyone with link" rồi chỉ lưu fileId vào Realtime Database.
// Việc XEM dùng iframe preview của Drive, không cần token (file đã công khai).
//
// Lưu ý quan trọng về token: Firebase KHÔNG lưu/làm mới access token của Google.
// signInWithPopup chỉ trả token ngay tại lần gọi đó; sau khi reload trang token
// mất. Vì vậy phải xin token tươi NGAY TRƯỚC mỗi lần upload (getDriveAccessToken).

/**
 * Lấy OAuth access token của Google (đã kèm scope drive.file) bằng cách mở popup
 * đăng nhập. Trả null nếu thiếu cấu hình Firebase hoặc không lấy được token.
 * Có thể ném lỗi nếu người dùng đóng popup / từ chối — nơi gọi nên bắt để báo toast.
 */
export async function getDriveAccessToken(): Promise<string | null> {
  if (!auth || !googleProvider) return null;
  const res = await signInWithPopup(auth, googleProvider);
  const cred = GoogleAuthProvider.credentialFromResult(res);
  return cred?.accessToken ?? null;
}

/**
 * Upload một file PDF lên Drive (multipart: metadata + nội dung nhị phân).
 * Trả về fileId của file vừa tạo.
 */
export async function uploadPdfToDrive(file: File, token: string): Promise<string> {
  const metadata = { name: file.name, mimeType: 'application/pdf' };
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload Drive thất bại (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Drive không trả về fileId');
  return data.id;
}

/**
 * Đặt quyền công khai cho file (ai có link đều xem được) để trang /share/*
 * (người xem ẩn danh) mở được qua iframe preview.
 */
export async function makeFilePublic(fileId: string, token: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
  );
  if (!res.ok) {
    throw new Error(`Đặt quyền công khai thất bại (HTTP ${res.status})`);
  }
}

/** URL iframe để nhúng xem PDF (không cần token nếu file đã công khai). */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
