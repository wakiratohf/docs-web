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

// Tên folder mặc định mà web tạo trên Drive của người dùng để gom hết PDF vào
// cho gọn (thay vì rải thẳng ra "My Drive").
const APP_FOLDER_NAME = 'Docs Web';

// Nhớ lại folderId đã tìm/tạo trong phiên để khỏi hỏi Drive lại mỗi lần upload.
// Mất khi reload trang — không sao, lần upload đầu sẽ tìm lại.
let cachedAppFolderId: string | null = null;

/**
 * Bảo đảm có folder mặc định "Docs Web" trên Drive: tìm trước, chưa có thì tạo.
 * Trả về folderId để gắn làm cha (parents) cho file khi upload.
 *
 * Lưu ý: chỉ tìm trong các folder do app này tạo ('drive.file' chỉ thấy được
 * file/folder mà app từng đụng tới), chưa bị xóa (trashed=false).
 */
export async function ensureAppFolder(token: string): Promise<string> {
  if (cachedAppFolderId) return cachedAppFolderId;

  // Tìm folder cùng tên chưa bị xóa.
  const q = encodeURIComponent(
    `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (searchRes.ok) {
    const data = (await searchRes.json()) as { files?: { id?: string }[] };
    const found = data.files?.[0]?.id;
    if (found) {
      cachedAppFolderId = found;
      return found;
    }
  }

  // Chưa có → tạo mới.
  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    },
  );
  if (!createRes.ok) {
    throw new Error(
      `Tạo thư mục "${APP_FOLDER_NAME}" trên Drive thất bại (HTTP ${createRes.status}): ${await readDriveError(createRes)}`,
    );
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) throw new Error('Drive không trả về id thư mục');
  cachedAppFolderId = created.id;
  return created.id;
}

/**
 * Upload một file PDF lên Drive (multipart: metadata + nội dung nhị phân).
 * Mặc định bỏ vào folder "Docs Web" (tạo nếu chưa có) cho gọn; truyền
 * parentId rỗng để giữ hành vi cũ (đặt thẳng ở My Drive).
 * Trả về fileId của file vừa tạo.
 */
export async function uploadPdfToDrive(
  file: File,
  token: string,
  parentId?: string,
): Promise<string> {
  const metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
  } = { name: file.name, mimeType: 'application/pdf' };
  if (parentId) metadata.parents = [parentId];
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
    throw new Error(`Upload Drive thất bại (HTTP ${res.status}): ${await readDriveError(res)}`);
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
    throw new Error(`Đặt quyền công khai thất bại (HTTP ${res.status}): ${await readDriveError(res)}`);
  }
}

/**
 * Đọc thông điệp lỗi mà Google Drive API trả về trong body để biết NGUYÊN NHÂN
 * thật (vd: "Google Drive API has not been used in project … or it is disabled",
 * hoặc "insufficient authentication scopes"). Không đọc được thì trả chuỗi rỗng.
 */
async function readDriveError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? '';
  } catch {
    return '';
  }
}

/** URL iframe để nhúng xem PDF (không cần token nếu file đã công khai). */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
